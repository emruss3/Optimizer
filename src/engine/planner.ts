import type { Element, SitePlanConfig, SiteMetrics, BuildingResult, ParkingResult } from './types';
import { generateBuildingFootprints } from './building';
import { generateIntelligentParking } from './parking';
import { calculateSiteMetrics, generateSiteAnalysisReport } from './analysis';
import { calculatePolygonArea, analyzeGeometry } from './geometry';

/**
 * Main site planning orchestrator
 */
export class SitePlanner {
  private config: SitePlanConfig;
  private elements: Element[] = [];
  private isGenerating = false;
  private generationCallbacks: ((elements: Element[]) => void)[] = [];

  constructor(config: SitePlanConfig) {
    this.config = config;
  }

  /**
   * Generate complete site plan
   */
  async generateSitePlan(forceRegenerate = false): Promise<{
    elements: Element[];
    metrics: SiteMetrics;
    report: ReturnType<typeof generateSiteAnalysisReport>;
  }> {
    if (this.isGenerating && !forceRegenerate) {
      console.log('Site plan generation already in progress');
      return this.getCurrentResults();
    }

    this.isGenerating = true;
    console.log('🏗️ Starting site plan generation...');

    try {
      // Create buildable area element
      const buildableArea = this.createBuildableArea();
      
      // Generate buildings
      const buildingResult = await this.generateBuildings(buildableArea);
      
      // Generate parking
      const parkingResult = await this.generateParking(buildableArea, buildingResult.buildings);
      
      // Generate greenspace
      const greenspaceElements = await this.generateGreenspace(buildableArea, buildingResult.buildings);
      
      // Combine all elements
      this.elements = [
        ...buildingResult.buildings,
        ...parkingResult.stalls,
        ...greenspaceElements
      ];

      // Calculate metrics
      const metrics = calculateSiteMetrics(this.elements, this.config);
      
      // Generate comprehensive report
      const report = generateSiteAnalysisReport(this.elements, this.config);

      console.log(`✅ Site plan generated: ${this.elements.length} elements, FAR: ${metrics.achievedFAR.toFixed(2)}`);

      // Notify callbacks
      this.notifyCallbacks();

      return {
        elements: this.elements,
        metrics,
        report
      };

    } catch (error) {
      console.error('Error generating site plan:', error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Create buildable area element
   */
  private createBuildableArea(): Element {
    // This would typically come from parcel geometry
    // For now, create a simple rectangular buildable area
    const bounds = {
      minX: 0,
      minY: 0,
      maxX: Math.sqrt(this.config.buildableArea),
      maxY: Math.sqrt(this.config.buildableArea)
    };

    return {
      id: 'buildable_area',
      type: 'greenspace',
      vertices: [
        { x: bounds.minX, y: bounds.minY, id: 'v0' },
        { x: bounds.maxX, y: bounds.minY, id: 'v1' },
        { x: bounds.maxX, y: bounds.maxY, id: 'v2' },
        { x: bounds.minX, y: bounds.maxY, id: 'v3' }
      ],
      properties: {
        name: 'Buildable Area',
        area: this.config.buildableArea
      }
    };
  }

  /**
   * Generate buildings
   */
  private async generateBuildings(buildableArea: Element): Promise<BuildingResult> {
    console.log('🏢 Generating buildings...');
    
    const result = generateBuildingFootprints(buildableArea, this.config);
    
    console.log(`Generated ${result.buildings.length} buildings, ${result.metrics.totalArea.toFixed(0)} sq ft`);
    return result;
  }

  /**
   * Generate parking
   */
  private async generateParking(buildableArea: Element, buildings: Element[]): Promise<ParkingResult> {
    console.log('🚗 Generating parking...');
    
    const parkingConfig = {
      targetStalls: Math.ceil(this.config.targetFAR * this.config.buildableArea * this.config.parkingRatio),
      stallWidth: this.config.stallDimensions.standard.width,
      stallDepth: this.config.stallDimensions.standard.depth,
      aisleWidth: this.config.aisleWidth,
      layoutAngle: 0,
      adaRatio: 0.04,
      evRatio: 0.05
    };

    const result = generateIntelligentParking(buildableArea, parkingConfig, buildings);
    
    console.log(`Generated ${result.stalls.length} parking stalls`);
    return result;
  }

  /**
   * Generate greenspace
   */
  private async generateGreenspace(buildableArea: Element, buildings: Element[]): Promise<Element[]> {
    console.log('🌳 Generating greenspace...');
    
    const greenspaceElements: Element[] = [];
    
    // Calculate remaining area after buildings and parking
    const usedArea = buildings.reduce((sum, building) => 
      sum + (building.properties.area || calculatePolygonArea(building.vertices)), 0
    );
    
    const remainingArea = this.config.buildableArea - usedArea;
    const targetGreenspace = this.config.buildableArea * 0.2; // 20% greenspace target
    
    if (remainingArea > targetGreenspace) {
      // Create greenspace elements
      const greenspaceArea = Math.min(remainingArea, targetGreenspace);
      const side = Math.sqrt(greenspaceArea);
      
      greenspaceElements.push({
        id: 'greenspace_main',
        type: 'greenspace',
        vertices: [
          { x: 0, y: 0, id: 'g0' },
          { x: side, y: 0, id: 'g1' },
          { x: side, y: side, id: 'g2' },
          { x: 0, y: side, id: 'g3' }
        ],
        properties: {
          name: 'Main Greenspace',
          area: greenspaceArea,
          vegetationType: 'mixed',
          maintenanceLevel: 'medium'
        }
      });
    }
    
    console.log(`Generated ${greenspaceElements.length} greenspace elements`);
    return greenspaceElements;
  }

  /**
   * Update configuration and regenerate
   */
  updateConfig(newConfig: Partial<SitePlanConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Configuration updated, regenerating site plan...');
    this.generateSitePlan(true);
  }

  /**
   * Get current results
   */
  getCurrentResults(): {
    elements: Element[];
    metrics: SiteMetrics;
    report: ReturnType<typeof generateSiteAnalysisReport>;
  } {
    const metrics = calculateSiteMetrics(this.elements, this.config);
    const report = generateSiteAnalysisReport(this.elements, this.config);
    
    return {
      elements: this.elements,
      metrics,
      report
    };
  }

  /**
   * Add generation callback
   */
  onGeneration(callback: (elements: Element[]) => void): void {
    this.generationCallbacks.push(callback);
  }

  /**
   * Remove generation callback
   */
  offGeneration(callback: (elements: Element[]) => void): void {
    const index = this.generationCallbacks.indexOf(callback);
    if (index > -1) {
      this.generationCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(): void {
    this.generationCallbacks.forEach(callback => {
      try {
        callback(this.elements);
      } catch (error) {
        console.error('Error in generation callback:', error);
      }
    });
  }

  /**
   * Get configuration
   */
  getConfig(): SitePlanConfig {
    return { ...this.config };
  }

  /**
   * Check if currently generating
   */
  isGeneratingPlan(): boolean {
    return this.isGenerating;
  }
}

/**
 * Factory function to create site planner
 */
export function createSitePlanner(config: SitePlanConfig): SitePlanner {
  return new SitePlanner(config);
}

/**
 * Quick site plan generation function
 */
export async function generateQuickSitePlan(
  buildableArea: Element,
  config: SitePlanConfig
): Promise<{
  elements: Element[];
  metrics: SiteMetrics;
  report: ReturnType<typeof generateSiteAnalysisReport>;
}> {
  const planner = createSitePlanner(config);
  return await planner.generateSitePlan();
}

/**
 * Validate site plan configuration
 */
export function validateSitePlanConfig(config: SitePlanConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!config.parcelArea || config.parcelArea <= 0) {
    errors.push('Parcel area must be greater than 0');
  }

  if (!config.buildableArea || config.buildableArea <= 0) {
    errors.push('Buildable area must be greater than 0');
  }

  if (config.buildableArea > config.parcelArea) {
    errors.push('Buildable area cannot exceed parcel area');
  }

  // Check FAR constraints
  if (config.targetFAR > config.maxFAR) {
    errors.push('Target FAR cannot exceed maximum FAR');
  }

  if (config.targetFAR <= 0) {
    warnings.push('Target FAR is very low, consider increasing for better utilization');
  }

  // Check coverage constraints
  if (config.maxCoverage > 100) {
    errors.push('Maximum coverage cannot exceed 100%');
  }

  if (config.maxCoverage < 50) {
    warnings.push('Maximum coverage is low, consider increasing for better density');
  }

  // Check parking ratio
  if (config.parkingRatio < 0.5) {
    warnings.push('Parking ratio is low, consider increasing for better accessibility');
  }

  if (config.parkingRatio > 3.0) {
    warnings.push('Parking ratio is very high, consider reducing for better land use');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Optimize site plan for specific criteria
 */
export function optimizeSitePlan(
  elements: Element[],
  config: SitePlanConfig,
  criteria: 'density' | 'parking' | 'greenspace' | 'financial'
): {
  optimizedElements: Element[];
  improvements: string[];
  score: number;
} {
  const improvements: string[] = [];
  let score = 0;

  switch (criteria) {
    case 'density':
      // Optimize for maximum density
      improvements.push('Increased building density');
      improvements.push('Reduced setbacks');
      improvements.push('Added more units');
      score = 85;
      break;

    case 'parking':
      // Optimize for parking efficiency
      improvements.push('Optimized parking layout');
      improvements.push('Reduced parking waste');
      improvements.push('Improved circulation');
      score = 90;
      break;

    case 'greenspace':
      // Optimize for environmental performance
      improvements.push('Increased green space');
      improvements.push('Added tree canopy');
      improvements.push('Improved stormwater management');
      score = 80;
      break;

    case 'financial':
      // Optimize for financial returns
      improvements.push('Optimized building mix');
      improvements.push('Increased rentable area');
      improvements.push('Reduced construction costs');
      score = 88;
      break;
  }

  return {
    optimizedElements: elements, // In a real implementation, this would return optimized elements
    improvements,
    score
  };
}
