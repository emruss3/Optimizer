import { RegridZoningData } from '../types/zoning';
import { BuildingMassing, SitePlanVisualization, BuildingFootprint, OpenSpaceArea, ParkingArea } from '../types/project';

export interface SitePlanConstraints {
  maxFAR: number;
  maxHeight: number;
  maxCoverage: number;
  minFrontSetback: number;
  minRearSetback: number;
  minSideSetback: number;
  minLotArea: number;
  minLotWidth: number;
  maxDensity: number;
  minLandscapedSpace: number;
  minOpenSpace: number;
}

export interface ParkingRequirements {
  residential: {
    studio: number;
    oneBedroom: number;
    twoBedroom: number;
    threeBedroom: number;
  };
  commercial: {
    office: number;
    retail: number;
    restaurant: number;
  };
  visitor: number;
  accessible: number;
}

export interface SitePlanConfiguration {
  targetUnits: number;
  unitMix: {
    studio: number;
    oneBedroom: number;
    twoBedroom: number;
    threeBedroom: number;
  };
  buildingType: 'residential' | 'commercial' | 'mixed-use';
  parkingType: 'surface' | 'garage' | 'underground';
  amenitySpace: number; // sq ft
  openSpaceRatio: number; // percentage
}

export interface SitePlanResult {
  isFeasible: boolean;
  violations: string[];
  warnings: string[];
  buildingMassing: BuildingMassing;
  sitePlan: SitePlanVisualization;
  parkingAnalysis: ParkingAnalysis;
  financialImpact: FinancialImpact;
  recommendations: string[];
}

export interface ParkingAnalysis {
  requiredSpaces: number;
  providedSpaces: number;
  deficit: number;
  surplus: number;
  costPerSpace: number;
  totalParkingCost: number;
  parkingEfficiency: number; // spaces per 1000 sq ft
}

export interface FinancialImpact {
  additionalCost: number;
  additionalRevenue: number;
  netImpact: number;
  costPerUnit: number;
  revenuePerUnit: number;
}

export class SitePlanEngine {
  private zoningData: RegridZoningData;
  private lotSize: number; // sq ft
  private lotWidth: number; // ft
  private lotDepth: number; // ft

  constructor(zoningData: RegridZoningData, lotSize: number, lotWidth?: number, lotDepth?: number) {
    this.zoningData = zoningData;
    this.lotSize = lotSize;
    this.lotWidth = lotWidth || Math.sqrt(lotSize); // Assume square if not provided
    this.lotDepth = lotDepth || Math.sqrt(lotSize);
  }

  /**
   * Generate optimal site plan based on constraints and requirements
   */
  generateSitePlan(config: SitePlanConfiguration): SitePlanResult {
    const constraints = this.extractConstraints();
    const violations: string[] = [];
    const warnings: string[] = [];

    // 1. Validate basic feasibility
    this.validateBasicFeasibility(config, constraints, violations, warnings);

    // 2. Calculate optimal building massing
    const buildingMassing = this.calculateOptimalMassing(config, constraints);

    // 3. Generate site plan visualization
    const sitePlan = this.generateSitePlanVisualization(buildingMassing, config);

    // 4. Analyze parking requirements
    const parkingAnalysis = this.analyzeParkingRequirements(config, buildingMassing);

    // 5. Calculate financial impact
    const financialImpact = this.calculateFinancialImpact(buildingMassing, parkingAnalysis, config);

    // 6. Generate recommendations
    const recommendations = this.generateRecommendations(buildingMassing, parkingAnalysis, constraints);

    return {
      isFeasible: violations.length === 0,
      violations,
      warnings,
      buildingMassing,
      sitePlan,
      parkingAnalysis,
      financialImpact,
      recommendations
    };
  }

  /**
   * Extract zoning constraints from zoning data
   */
  private extractConstraints(): SitePlanConstraints {
    return {
      maxFAR: this.zoningData.max_far || 0,
      maxHeight: this.zoningData.max_building_height_ft || 0,
      maxCoverage: this.zoningData.max_coverage_pct || 0,
      minFrontSetback: this.zoningData.min_front_setback_ft || 0,
      minRearSetback: this.zoningData.min_rear_setback_ft || 0,
      minSideSetback: this.zoningData.min_side_setback_ft || 0,
      minLotArea: this.zoningData.min_lot_area_sq_ft || 0,
      minLotWidth: this.zoningData.min_lot_width_ft || 0,
      maxDensity: this.zoningData.max_density_du_per_acre || 0,
      minLandscapedSpace: this.zoningData.min_landscaped_space_pct || 0,
      minOpenSpace: this.zoningData.min_open_space_pct || 0
    };
  }

  /**
   * Validate basic feasibility of the proposed configuration
   */
  private validateBasicFeasibility(
    config: SitePlanConfiguration, 
    constraints: SitePlanConstraints, 
    violations: string[], 
    warnings: string[]
  ): void {
    // Check lot size requirements
    if (constraints.minLotArea > 0 && this.lotSize < constraints.minLotArea) {
      violations.push(`Lot size (${this.lotSize.toLocaleString()} sq ft) is below minimum required (${constraints.minLotArea.toLocaleString()} sq ft)`);
    }

    if (constraints.minLotWidth > 0 && this.lotWidth < constraints.minLotWidth) {
      violations.push(`Lot width (${this.lotWidth} ft) is below minimum required (${constraints.minLotWidth} ft)`);
    }

    // Check density requirements
    if (constraints.maxDensity > 0) {
      const proposedDensity = (config.targetUnits / (this.lotSize / 43560));
      if (proposedDensity > constraints.maxDensity) {
        violations.push(`Proposed density (${proposedDensity.toFixed(1)} DU/acre) exceeds maximum allowed (${constraints.maxDensity} DU/acre)`);
      }
    }

    // Check if configuration is realistic
    if (config.targetUnits > 0) {
      const avgUnitSize = this.getAverageUnitSize(config.unitMix);
      const totalGSF = config.targetUnits * avgUnitSize;
      const requiredFAR = totalGSF / this.lotSize;
      
      if (constraints.maxFAR > 0 && requiredFAR > constraints.maxFAR) {
        violations.push(`Required FAR (${requiredFAR.toFixed(2)}) exceeds maximum allowed (${constraints.maxFAR})`);
      }
    }
  }

  /**
   * Calculate optimal building massing
   */
  private calculateOptimalMassing(config: SitePlanConfiguration, constraints: SitePlanConstraints): BuildingMassing {
    const avgUnitSize = this.getAverageUnitSize(config.unitMix);
    const totalGSF = config.targetUnits * avgUnitSize;
    
    // Calculate maximum buildable area considering setbacks
    const buildableWidth = this.lotWidth - constraints.minFrontSetback - constraints.minRearSetback;
    const buildableDepth = this.lotDepth - (constraints.minSideSetback * 2);
    const maxFootprint = buildableWidth * buildableDepth;
    
    // Apply coverage constraint
    const maxCoverageArea = this.lotSize * (constraints.maxCoverage / 100);
    const effectiveFootprint = Math.min(maxFootprint, maxCoverageArea);
    
    // Calculate optimal height
    const requiredHeight = totalGSF / effectiveFootprint;
    const maxHeight = constraints.maxHeight > 0 ? constraints.maxHeight : 100; // Default 100 ft
    const optimalHeight = Math.min(requiredHeight, maxHeight);
    
    // Calculate stories (assuming 10 ft per story)
    const stories = Math.floor(optimalHeight / 10);
    const actualHeight = stories * 10;
    
    // Calculate actual GSF
    const actualGSF = effectiveFootprint * stories;
    const actualFAR = actualGSF / this.lotSize;
    
    // Calculate open space
    const requiredOpenSpace = this.lotSize * (constraints.minOpenSpace / 100);
    const actualOpenSpace = this.lotSize - effectiveFootprint;
    
    return {
      footprint: effectiveFootprint,
      totalGSF: actualGSF,
      height: actualHeight,
      stories,
      units: config.targetUnits,
      coverage: (effectiveFootprint / this.lotSize) * 100,
      far: actualFAR,
      buildableArea: effectiveFootprint,
      openSpaceArea: actualOpenSpace,
      amenitySpace: config.amenitySpace,
      averageUnitSize: avgUnitSize,
      constraintAnalysis: {
        farUtilization: constraints.maxFAR > 0 ? (actualFAR / constraints.maxFAR) * 100 : 0,
        heightUtilization: constraints.maxHeight > 0 ? (actualHeight / constraints.maxHeight) * 100 : 0,
        coverageUtilization: constraints.maxCoverage > 0 ? (effectiveFootprint / maxCoverageArea) * 100 : 0,
        limitingFactor: this.getLimitingFactor(constraints, actualFAR, actualHeight, effectiveFootprint, maxCoverageArea)
      }
    };
  }

  /**
   * Generate site plan visualization
   */
  private generateSitePlanVisualization(massing: BuildingMassing, config: SitePlanConfiguration): SitePlanVisualization {
    const buildings: BuildingFootprint[] = [];
    const openSpaces: OpenSpaceArea[] = [];
    const parkingAreas: ParkingArea[] = [];

    // Create main building footprint
    const buildingFootprint: BuildingFootprint = {
      id: 'main-building',
      coordinates: this.generateBuildingCoordinates(massing.footprint),
      height: massing.height,
      stories: massing.stories,
      use: config.buildingType,
      units: massing.units,
      gsf: massing.totalGSF
    };
    buildings.push(buildingFootprint);

    // Create open spaces
    const openSpace: OpenSpaceArea = {
      id: 'main-open-space',
      coordinates: this.generateOpenSpaceCoordinates(massing.footprint),
      type: 'garden',
      amenities: ['landscaping', 'seating', 'walkways']
    };
    openSpaces.push(openSpace);

    // Create parking areas
    const parkingAnalysis = this.analyzeParkingRequirements(config, massing);
    if (parkingAnalysis.requiredSpaces > 0) {
      const parkingArea: ParkingArea = {
        id: 'main-parking',
        coordinates: this.generateParkingCoordinates(parkingAnalysis.requiredSpaces),
        type: config.parkingType,
        spaces: parkingAnalysis.requiredSpaces,
        accessPoint: [this.lotWidth / 2, this.lotDepth]
      };
      parkingAreas.push(parkingArea);
    }

    return {
      buildings,
      openSpaces,
      parkingAreas,
      utilities: [],
      circulation: []
    };
  }

  /**
   * Analyze parking requirements
   */
  private analyzeParkingRequirements(config: SitePlanConfiguration, massing: BuildingMassing): ParkingAnalysis {
    const requirements = this.getParkingRequirements(config.buildingType);
    let requiredSpaces = 0;

    if (config.buildingType === 'residential' || config.buildingType === 'mixed-use') {
      // Calculate residential parking
      requiredSpaces += config.unitMix.studio * requirements.residential.studio;
      requiredSpaces += config.unitMix.oneBedroom * requirements.residential.oneBedroom;
      requiredSpaces += config.unitMix.twoBedroom * requirements.residential.twoBedroom;
      requiredSpaces += config.unitMix.threeBedroom * requirements.residential.threeBedroom;
      
      // Add visitor parking (typically 0.25 spaces per unit)
      requiredSpaces += Math.ceil(config.targetUnits * 0.25);
    }

    if (config.buildingType === 'commercial' || config.buildingType === 'mixed-use') {
      // Calculate commercial parking (simplified)
      const commercialGSF = massing.totalGSF * 0.3; // Assume 30% commercial
      requiredSpaces += Math.ceil(commercialGSF / 1000 * 3); // 3 spaces per 1000 sq ft
    }

    // Add accessible parking (typically 2% of total)
    const accessibleSpaces = Math.ceil(requiredSpaces * 0.02);
    requiredSpaces += accessibleSpaces;

    const costPerSpace = this.getParkingCostPerSpace(config.parkingType);
    const totalParkingCost = requiredSpaces * costPerSpace;
    const parkingEfficiency = (requiredSpaces / (massing.totalGSF / 1000)) * 100;

    return {
      requiredSpaces,
      providedSpaces: requiredSpaces, // Assume we can provide all required
      deficit: 0,
      surplus: 0,
      costPerSpace,
      totalParkingCost,
      parkingEfficiency
    };
  }

  /**
   * Calculate financial impact of site plan
   */
  private calculateFinancialImpact(
    massing: BuildingMassing, 
    parkingAnalysis: ParkingAnalysis, 
    config: SitePlanConfiguration
  ): FinancialImpact {
    // Construction costs
    const hardCostPerSqFt = this.getHardCostPerSqFt(config.buildingType);
    const softCostPercentage = 0.25;
    const contingencyPercentage = 0.10;

    const hardCosts = massing.totalGSF * hardCostPerSqFt;
    const softCosts = hardCosts * softCostPercentage;
    const contingency = (hardCosts + softCosts) * contingencyPercentage;
    const totalConstructionCost = hardCosts + softCosts + contingency;

    // Additional costs
    const additionalCost = parkingAnalysis.totalParkingCost + (config.amenitySpace * 200); // $200/sq ft for amenities

    // Revenue calculation
    const revenuePerSqFt = this.getRevenuePerSqFt(config.buildingType);
    const additionalRevenue = massing.totalGSF * revenuePerSqFt;

    const netImpact = additionalRevenue - additionalCost;
    const costPerUnit = additionalCost / config.targetUnits;
    const revenuePerUnit = (massing.totalGSF * revenuePerSqFt) / config.targetUnits;

    return {
      additionalCost,
      additionalRevenue,
      netImpact,
      costPerUnit,
      revenuePerUnit
    };
  }

  /**
   * Generate recommendations for optimization
   */
  private generateRecommendations(
    massing: BuildingMassing, 
    parkingAnalysis: ParkingAnalysis, 
    constraints: SitePlanConstraints
  ): string[] {
    const recommendations: string[] = [];

    // FAR utilization
    if (massing.constraintAnalysis.farUtilization < 80) {
      recommendations.push(`Consider increasing building height to better utilize FAR (currently ${massing.constraintAnalysis.farUtilization.toFixed(1)}%)`);
    }

    // Height utilization
    if (massing.constraintAnalysis.heightUtilization < 80) {
      recommendations.push(`Consider increasing building height to better utilize height allowance (currently ${massing.constraintAnalysis.heightUtilization.toFixed(1)}%)`);
    }

    // Coverage utilization
    if (massing.constraintAnalysis.coverageUtilization < 80) {
      recommendations.push(`Consider increasing building footprint to better utilize coverage allowance (currently ${massing.constraintAnalysis.coverageUtilization.toFixed(1)}%)`);
    }

    // Parking efficiency
    if (parkingAnalysis.parkingEfficiency > 4) {
      recommendations.push(`Consider reducing parking requirements or using more efficient parking solutions (currently ${parkingAnalysis.parkingEfficiency.toFixed(1)} spaces per 1000 sq ft)`);
    }

    // Open space
    if (massing.openSpaceArea < this.lotSize * 0.15) {
      recommendations.push('Consider increasing open space to improve marketability and resident satisfaction');
    }

    return recommendations;
  }

  // Helper methods
  private getAverageUnitSize(unitMix: Record<string, number>): number {
    const totalUnits = unitMix.studio + unitMix.oneBedroom + unitMix.twoBedroom + unitMix.threeBedroom;
    if (totalUnits === 0) return 800; // Default

    const weightedSize = (
      unitMix.studio * 500 +
      unitMix.oneBedroom * 700 +
      unitMix.twoBedroom * 1000 +
      unitMix.threeBedroom * 1300
    ) / totalUnits;

    return weightedSize;
  }

  private getLimitingFactor(constraints: SitePlanConstraints, far: number, height: number, footprint: number, maxCoverage: number): string {
    const farUtilization = constraints.maxFAR > 0 ? far / constraints.maxFAR : 1;
    const heightUtilization = constraints.maxHeight > 0 ? height / constraints.maxHeight : 1;
    const coverageUtilization = constraints.maxCoverage > 0 ? footprint / maxCoverage : 1;

    if (farUtilization >= 0.95) return 'FAR';
    if (heightUtilization >= 0.95) return 'Height';
    if (coverageUtilization >= 0.95) return 'Coverage';
    return 'None';
  }

  private getParkingRequirements(buildingType: string): ParkingRequirements {
    return {
      residential: {
        studio: 0.5,
        oneBedroom: 1.0,
        twoBedroom: 1.5,
        threeBedroom: 2.0
      },
      commercial: {
        office: 3.0,
        retail: 4.0,
        restaurant: 10.0
      },
      visitor: 0.25,
      accessible: 0.02
    };
  }

  private getParkingCostPerSpace(parkingType: string): number {
    switch (parkingType) {
      case 'surface': return 5000;
      case 'garage': return 25000;
      case 'underground': return 40000;
      default: return 15000;
    }
  }

  private getHardCostPerSqFt(buildingType: string): number {
    switch (buildingType) {
      case 'residential': return 200;
      case 'commercial': return 250;
      case 'mixed-use': return 225;
      default: return 200;
    }
  }

  private getRevenuePerSqFt(buildingType: string): number {
    switch (buildingType) {
      case 'residential': return 400;
      case 'commercial': return 300;
      case 'mixed-use': return 350;
      default: return 350;
    }
  }

  private generateBuildingCoordinates(footprint: number): number[][] {
    // Simplified coordinate generation - in real implementation, this would be more sophisticated
    const side = Math.sqrt(footprint);
    return [
      [0, 0],
      [side, 0],
      [side, side],
      [0, side],
      [0, 0]
    ];
  }

  private generateOpenSpaceCoordinates(buildingFootprint: number): number[][] {
    // Generate coordinates for open space areas
    return [
      [0, 0],
      [this.lotWidth, 0],
      [this.lotWidth, this.lotDepth],
      [0, this.lotDepth],
      [0, 0]
    ];
  }

  private generateParkingCoordinates(spaces: number): number[][] {
    // Generate coordinates for parking areas
    const spacesPerRow = 10;
    const rows = Math.ceil(spaces / spacesPerRow);
    const parkingWidth = spacesPerRow * 9; // 9 ft per space
    const parkingDepth = rows * 18; // 18 ft per row

    return [
      [0, 0],
      [parkingWidth, 0],
      [parkingWidth, parkingDepth],
      [0, parkingDepth],
      [0, 0]
    ];
  }
}




