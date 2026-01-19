// Highest and Best Use Analysis Service
import { RegridZoningData } from '../types/zoning';
import { SelectedParcel } from '../types/parcel';

export interface HBUAlternative {
  use: string;
  density: number; // units/acre or FAR
  height: number; // stories
  estimatedValue: number;
  developmentCost: number;
  netPresentValue: number;
  internalRateOfReturn: number;
  paybackPeriod: number;
  confidence: number; // 0-100
  constraints: string[];
  marketFactors: string[];
}

export interface HBUAnalysis {
  recommendedUse: 'residential' | 'commercial' | 'mixed-use' | 'industrial';
  confidence: number; // 0-100
  alternatives: HBUAlternative[];
  constraints: ZoningConstraint[];
  marketFactors: MarketFactor[];
  financialProjections: FinancialProjection[];
  analysisDate: Date;
  analyst: string;
}

export interface ZoningConstraint {
  type: 'setback' | 'height' | 'coverage' | 'far' | 'density' | 'land_use';
  description: string;
  value: number;
  unit: string;
  impact: 'limiting' | 'moderate' | 'minimal';
}

export interface MarketFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number; // 0-1
  description: string;
}

export interface FinancialProjection {
  year: number;
  revenue: number;
  expenses: number;
  netIncome: number;
  cashFlow: number;
  cumulativeCashFlow: number;
}

export class HBUAnalyzer {
  private marketData: Record<string, any> | undefined;
  private costData: Record<string, any> | undefined;

  constructor(marketData?: Record<string, any>, costData?: Record<string, any>) {
    this.marketData = marketData;
    this.costData = costData;
  }

  /**
   * Safely parse a number, handling null, undefined, and invalid values
   */
  private safeParseNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    
    const parsed = Number(value);
    if (isNaN(parsed) || !isFinite(parsed)) {
      return undefined;
    }
    
    // Filter out obviously invalid values (like -5555)
    if (parsed < 0 && Math.abs(parsed) > 1000) {
      return undefined;
    }
    
    return parsed;
  }

  /**
   * Analyze highest and best use for a parcel
   */
  async analyzeHBU(parcel: SelectedParcel): Promise<HBUAnalysis> {
    console.log('Raw parcel data received:', parcel);
    
    // Create zoning data from the parcel's enhanced fields with proper type conversion
    // Use flat fields first, then fallback to zoning_data if present
    const zoningDataObj = parcel.zoning_data || {};
    const zoningData: RegridZoningData = {
      zoning_id: parcel.zoning_id ?? zoningDataObj.zoning_id,
      zoning: parcel.zoning ?? zoningDataObj.zoning,
      zoning_description: parcel.zoning_description ?? zoningDataObj.zoning_description,
      zoning_type: parcel.zoning_type ?? zoningDataObj.zoning_type,
      zoning_subtype: parcel.zoning_subtype ?? zoningDataObj.zoning_subtype,
      zoning_objective: parcel.zoning_objective ?? zoningDataObj.zoning_objective,
      zoning_code_link: parcel.zoning_code_link ?? zoningDataObj.zoning_code_link,
      permitted_land_uses: parcel.permitted_land_uses ?? zoningDataObj.permitted_land_uses,
      permitted_land_uses_as_of_right: parcel.permitted_land_uses_as_of_right ?? zoningDataObj.permitted_land_uses_as_of_right,
      permitted_land_uses_conditional: parcel.permitted_land_uses_conditional ?? zoningDataObj.permitted_land_uses_conditional,
      min_lot_area_sq_ft: this.safeParseNumber(parcel.min_lot_area_sq_ft ?? zoningDataObj.min_lot_area_sq_ft),
      min_lot_width_ft: this.safeParseNumber(parcel.min_lot_width_ft ?? zoningDataObj.min_lot_width_ft),
      max_building_height_ft: this.safeParseNumber(parcel.max_height_ft ?? parcel.max_building_height_ft ?? zoningDataObj.max_building_height_ft),
      max_far: this.safeParseNumber(parcel.max_far ?? zoningDataObj.max_far),
      min_front_setback_ft: this.safeParseNumber(parcel.min_front_setback_ft ?? zoningDataObj.min_front_setback_ft),
      min_rear_setback_ft: this.safeParseNumber(parcel.min_rear_setback_ft ?? zoningDataObj.min_rear_setback_ft),
      min_side_setback_ft: this.safeParseNumber(parcel.min_side_setback_ft ?? zoningDataObj.min_side_setback_ft),
      max_coverage_pct: this.safeParseNumber(parcel.max_coverage_pct ?? zoningDataObj.max_coverage_pct),
      max_impervious_coverage_pct: this.safeParseNumber(parcel.max_impervious_coverage_pct ?? zoningDataObj.max_impervious_coverage_pct),
      min_landscaped_space_pct: this.safeParseNumber(parcel.min_landscaped_space_pct ?? zoningDataObj.min_landscaped_space_pct),
      min_open_space_pct: this.safeParseNumber(parcel.min_open_space_pct ?? zoningDataObj.min_open_space_pct),
      max_density_du_per_acre: this.safeParseNumber(parcel.max_density_du_per_acre ?? zoningDataObj.max_density_du_per_acre),
      zoning_data_date: parcel.zoning_data_date ?? zoningDataObj.zoning_data_date,
      municipality_id: parcel.municipality_id ?? zoningDataObj.municipality_id,
      municipality_name: parcel.municipality_name ?? zoningDataObj.municipality_name,
      geoid: parcel.geoid ?? zoningDataObj.geoid
    };

    console.log('Processed zoning data:', zoningData);

    // Provide fallback zoning data if none exists
    if (!zoningData.zoning && !zoningData.zoning_type) {
      console.warn('No zoning data found, using fallback analysis');
      zoningData.zoning = parcel.zoning || 'Unknown';
      zoningData.zoning_type = 'Residential'; // Default fallback
    }

    // 1. Identify feasible uses based on zoning
    const feasibleUses = this.identifyFeasibleUses(zoningData);
    console.log('Feasible uses identified:', feasibleUses);
    
    // Ensure we have at least one feasible use
    if (feasibleUses.length === 0) {
      console.warn('No feasible uses found, adding default residential use');
      feasibleUses.push('Single Family');
    }
    
    // 2. Analyze market conditions
    const marketFactors = await this.analyzeMarketFactors(parcel);
    console.log('Market factors analyzed:', marketFactors);
    
    // 3. Calculate financial projections for each use
    const alternatives = await this.calculateAlternatives(parcel, feasibleUses, zoningData);
    console.log('Alternatives calculated:', alternatives);
    
    // 4. Identify constraints
    const constraints = this.identifyConstraints(zoningData);
    
    // 5. Determine recommended use
    const recommendedUse = this.determineRecommendedUse(alternatives);
    
    // 6. Calculate confidence score
    const confidence = this.calculateConfidence(alternatives, marketFactors);

    return {
      recommendedUse,
      confidence,
      alternatives,
      constraints,
      marketFactors,
      financialProjections: this.generateFinancialProjections(recommendedUse, alternatives),
      analysisDate: new Date(),
      analyst: 'System'
    };
  }

  /**
   * Identify feasible uses based on zoning regulations
   */
  private identifyFeasibleUses(zoningData: RegridZoningData): string[] {
    const feasibleUses: string[] = [];
    
    // Check permitted land uses from enhanced zoning data
    if (zoningData.permitted_land_uses) {
      try {
        // Handle different data formats
        if (typeof zoningData.permitted_land_uses === 'object') {
          Object.keys(zoningData.permitted_land_uses).forEach(category => {
            const uses = zoningData.permitted_land_uses![category];
            // Ensure uses is an array
            if (Array.isArray(uses)) {
              uses.forEach(use => {
                if (this.isFeasibleUse(use, zoningData)) {
                  feasibleUses.push(use);
                }
              });
            } else if (typeof uses === 'string') {
              // Handle case where uses is a string
              if (this.isFeasibleUse(uses, zoningData)) {
                feasibleUses.push(uses);
              }
            }
          });
        } else if (typeof zoningData.permitted_land_uses === 'string') {
          // Handle case where permitted_land_uses is a string
          const uses = zoningData.permitted_land_uses.split(',').map(u => u.trim());
          uses.forEach(use => {
            if (this.isFeasibleUse(use, zoningData)) {
              feasibleUses.push(use);
            }
          });
        }
      } catch (error) {
        console.warn('Error processing permitted_land_uses:', error);
      }
    }

    // Add uses based on zoning type and subtype
    if (zoningData.zoning_type) {
      const typeUses = this.getUsesByZoningType(zoningData.zoning_type);
      feasibleUses.push(...typeUses);
      
      // Add subtype-specific uses
      if (zoningData.zoning_subtype) {
        const subtypeUses = this.getUsesByZoningSubtype(zoningData.zoning_subtype);
        feasibleUses.push(...subtypeUses);
      }
    }

    // Add uses based on zoning objective if available
    if (zoningData.zoning_objective) {
      const objectiveUses = this.getUsesByZoningObjective(zoningData.zoning_objective);
      feasibleUses.push(...objectiveUses);
    }

    return [...new Set(feasibleUses)]; // Remove duplicates
  }

  /**
   * Check if a use is feasible given zoning constraints
   */
  private isFeasibleUse(use: string, zoningData: RegridZoningData): boolean {
    // Check density constraints
    const maxDensity = zoningData.max_density_du_per_acre || 0;
    const requiredDensity = this.getRequiredDensity(use);
    
    if (requiredDensity > maxDensity && maxDensity > 0) {
      return false;
    }

    // Check FAR constraints
    const maxFAR = zoningData.max_far || 0;
    const requiredFAR = this.getRequiredFAR(use);
    
    if (requiredFAR > maxFAR && maxFAR > 0) {
      return false;
    }

    // Check height constraints
    const maxHeight = zoningData.max_building_height_ft || 0;
    const requiredHeight = this.getRequiredHeight(use);
    
    if (requiredHeight > maxHeight && maxHeight > 0) {
      return false;
    }

    return true;
  }

  /**
   * Get uses by zoning type
   */
  private getUsesByZoningType(zoningType: string): string[] {
    const useMap: Record<string, string[]> = {
      'Residential': ['Single Family', 'Multi-Family', 'Townhouse', 'Apartment'],
      'Commercial': ['Retail', 'Office', 'Restaurant', 'Hotel'],
      'Industrial': ['Warehouse', 'Manufacturing', 'Distribution'],
      'Mixed-Use': ['Mixed-Use Residential', 'Mixed-Use Commercial'],
      'Agricultural': ['Farming', 'Ranch', 'Vineyard'],
      'Special Purpose': ['Institutional', 'Recreation', 'Open Space']
    };

    return useMap[zoningType] || [];
  }

  /**
   * Get uses by zoning subtype
   */
  private getUsesByZoningSubtype(zoningSubtype: string): string[] {
    const subtypeMap: Record<string, string[]> = {
      'Single Family': ['Single Family', 'Townhouse'],
      'Multi-Family': ['Multi-Family', 'Apartment'],
      'Mixed-Use Residential': ['Mixed-Use Residential', 'Apartment', 'Retail'],
      'Mixed-Use Commercial': ['Mixed-Use Commercial', 'Office', 'Retail'],
      'High-Density Residential': ['Apartment', 'Multi-Family'],
      'Low-Density Residential': ['Single Family', 'Townhouse'],
      'Office': ['Office', 'Professional Services'],
      'Retail': ['Retail', 'Restaurant', 'Service'],
      'Industrial': ['Warehouse', 'Manufacturing', 'Distribution']
    };

    return subtypeMap[zoningSubtype] || [];
  }

  /**
   * Get uses by zoning objective
   */
  private getUsesByZoningObjective(zoningObjective: string): string[] {
    const objectiveMap: Record<string, string[]> = {
      'Residential Development': ['Single Family', 'Multi-Family', 'Apartment'],
      'Commercial Development': ['Retail', 'Office', 'Restaurant'],
      'Mixed-Use Development': ['Mixed-Use Residential', 'Mixed-Use Commercial'],
      'Industrial Development': ['Warehouse', 'Manufacturing'],
      'Transit-Oriented Development': ['Mixed-Use Residential', 'Mixed-Use Commercial'],
      'Affordable Housing': ['Multi-Family', 'Apartment'],
      'Urban Infill': ['Mixed-Use Residential', 'Mixed-Use Commercial']
    };

    return objectiveMap[zoningObjective] || [];
  }

  /**
   * Get required density for a use type
   */
  private getRequiredDensity(use: string): number {
    const densityMap: Record<string, number> = {
      'Single Family': 2,
      'Multi-Family': 20,
      'Townhouse': 15,
      'Apartment': 30,
      'Retail': 0,
      'Office': 0,
      'Warehouse': 0
    };

    return densityMap[use] || 0;
  }

  /**
   * Get required FAR for a use type
   */
  private getRequiredFAR(use: string): number {
    const farMap: Record<string, number> = {
      'Single Family': 0.3,
      'Multi-Family': 2.0,
      'Townhouse': 1.5,
      'Apartment': 3.0,
      'Retail': 1.0,
      'Office': 2.5,
      'Warehouse': 1.5
    };

    return farMap[use] || 0;
  }

  /**
   * Get required height for a use type
   */
  private getRequiredHeight(use: string): number {
    const heightMap: Record<string, number> = {
      'Single Family': 35,
      'Multi-Family': 60,
      'Townhouse': 45,
      'Apartment': 90,
      'Retail': 30,
      'Office': 120,
      'Warehouse': 40
    };

    return heightMap[use] || 0;
  }

  /**
   * Analyze market factors affecting the parcel
   */
  private async analyzeMarketFactors(parcel: SelectedParcel): Promise<MarketFactor[]> {
    const factors: MarketFactor[] = [];

    // Location factors
    factors.push({
      factor: 'Location Desirability',
      impact: 'positive',
      weight: 0.3,
      description: 'Prime location with good access and amenities'
    });

    // Market conditions
    factors.push({
      factor: 'Market Demand',
      impact: 'positive',
      weight: 0.25,
      description: 'Strong demand for development in this area'
    });

    // Zoning flexibility
    if (zoningData.zoning_type === 'Mixed-Use') {
      factors.push({
        factor: 'Zoning Flexibility',
        impact: 'positive',
        weight: 0.2,
        description: 'Mixed-use zoning allows multiple development options'
      });
    }

    // Infrastructure
    factors.push({
      factor: 'Infrastructure',
      impact: 'positive',
      weight: 0.15,
      description: 'Good infrastructure and utilities available'
    });

    // Competition
    factors.push({
      factor: 'Market Competition',
      impact: 'neutral',
      weight: 0.1,
      description: 'Moderate competition in the market'
    });

    return factors;
  }

  /**
   * Calculate financial alternatives for each feasible use
   */
  private async calculateAlternatives(parcel: SelectedParcel, uses: string[], zoningData: RegridZoningData): Promise<HBUAlternative[]> {
    const alternatives: HBUAlternative[] = [];

    for (const use of uses) {
      const alternative = await this.calculateAlternative(parcel, use, zoningData);
      alternatives.push(alternative);
    }

    // Sort by NPV descending
    return alternatives.sort((a, b) => b.netPresentValue - a.netPresentValue);
  }

  /**
   * Calculate financial metrics for a specific use
   */
  private async calculateAlternative(parcel: SelectedParcel, use: string, zoningData: RegridZoningData): Promise<HBUAlternative> {
    const density = this.getRequiredDensity(use);
    const far = this.getRequiredFAR(use);
    const height = this.getRequiredHeight(use);

    // Calculate development metrics
    const lotSize = parcel.sqft || 0;
    const buildableArea = lotSize * far;
    const units = density > 0 ? Math.floor(lotSize / 43560 * density) : 0;

    // Estimate costs
    const landCost = parcel.parval || 0;
    const hardCosts = buildableArea * this.getCostPerSqFt(use);
    const softCosts = hardCosts * 0.25; // 25% of hard costs
    const contingency = (hardCosts + softCosts) * 0.1; // 10% contingency
    const totalCost = landCost + hardCosts + softCosts + contingency;

    // Estimate revenue
    const revenue = this.estimateRevenue(use, buildableArea, units);

    // Calculate returns
    const netPresentValue = revenue - totalCost;
    const internalRateOfReturn = this.calculateIRR(totalCost, revenue, 3); // 3 year hold
    const paybackPeriod = this.calculatePaybackPeriod(totalCost, revenue);

    return {
      use,
      density,
      height,
      estimatedValue: revenue,
      developmentCost: totalCost,
      netPresentValue,
      internalRateOfReturn,
      paybackPeriod,
      confidence: this.calculateUseConfidence(use, parcel, zoningData),
      constraints: this.identifyUseConstraints(use, zoningData),
      marketFactors: this.identifyUseMarketFactors(use, parcel)
    };
  }

  /**
   * Get cost per square foot for a use type
   */
  private getCostPerSqFt(use: string): number {
    const costMap: Record<string, number> = {
      'Single Family': 150,
      'Multi-Family': 200,
      'Townhouse': 180,
      'Apartment': 220,
      'Retail': 180,
      'Office': 250,
      'Warehouse': 120
    };

    return costMap[use] || 200;
  }

  /**
   * Estimate revenue for a use type
   */
  private estimateRevenue(use: string, buildableArea: number, units: number): number {
    const pricePerSqFt = this.getPricePerSqFt(use);
    const pricePerUnit = this.getPricePerUnit(use);

    if (units > 0) {
      return units * pricePerUnit;
    } else {
      return buildableArea * pricePerSqFt;
    }
  }

  /**
   * Get price per square foot for a use type
   */
  private getPricePerSqFt(use: string): number {
    const priceMap: Record<string, number> = {
      'Single Family': 300,
      'Multi-Family': 400,
      'Townhouse': 350,
      'Apartment': 450,
      'Retail': 200,
      'Office': 300,
      'Warehouse': 150
    };

    return priceMap[use] || 300;
  }

  /**
   * Get price per unit for a use type
   */
  private getPricePerUnit(use: string): number {
    const unitPriceMap: Record<string, number> = {
      'Single Family': 500000,
      'Multi-Family': 300000,
      'Townhouse': 400000,
      'Apartment': 250000
    };

    return unitPriceMap[use] || 300000;
  }

  /**
   * Calculate IRR
   */
  private calculateIRR(initialInvestment: number, finalValue: number, years: number): number {
    if (initialInvestment <= 0) return 0;
    return Math.pow(finalValue / initialInvestment, 1 / years) - 1;
  }

  /**
   * Calculate payback period
   */
  private calculatePaybackPeriod(initialInvestment: number, annualReturn: number): number {
    if (annualReturn <= 0) return Infinity;
    return initialInvestment / annualReturn;
  }

  /**
   * Calculate confidence score for a use
   */
  private calculateUseConfidence(use: string, parcel: SelectedParcel, zoningData: RegridZoningData): number {
    let confidence = 50; // Base confidence

    // Zoning match
    if (zoningData.zoning_type) {
      const typeMatch = this.getZoningTypeMatch(use, zoningData.zoning_type);
      confidence += typeMatch * 20;
    }

    // Market demand
    confidence += 15; // Assume good market demand

    // Location factors
    confidence += 10; // Assume good location

    // Data quality
    confidence += 5; // Assume good data quality

    return Math.min(confidence, 100);
  }

  /**
   * Get zoning type match score
   */
  private getZoningTypeMatch(use: string, zoningType: string): number {
    const matches: Record<string, string[]> = {
      'Residential': ['Single Family', 'Multi-Family', 'Townhouse', 'Apartment'],
      'Commercial': ['Retail', 'Office', 'Restaurant', 'Hotel'],
      'Industrial': ['Warehouse', 'Manufacturing'],
      'Mixed-Use': ['Mixed-Use Residential', 'Mixed-Use Commercial']
    };

    const typeUses = matches[zoningType] || [];
    return typeUses.includes(use) ? 1 : 0;
  }

  /**
   * Identify constraints for a use
   */
  private identifyUseConstraints(use: string, zoningData: RegridZoningData): string[] {
    const constraints: string[] = [];

    if (zoningData.max_density_du_per_acre && this.getRequiredDensity(use) > zoningData.max_density_du_per_acre) {
      constraints.push(`Density limit: ${zoningData.max_density_du_per_acre} DU/acre`);
    }

    if (zoningData.max_far && this.getRequiredFAR(use) > zoningData.max_far) {
      constraints.push(`FAR limit: ${zoningData.max_far}`);
    }

    if (zoningData.max_building_height_ft && this.getRequiredHeight(use) > zoningData.max_building_height_ft) {
      constraints.push(`Height limit: ${zoningData.max_building_height_ft} ft`);
    }

    return constraints;
  }

  /**
   * Identify market factors for a use
   */
  private identifyUseMarketFactors(use: string, parcel: SelectedParcel): string[] {
    const factors: string[] = [];

    factors.push('Strong market demand');
    factors.push('Good location access');
    factors.push('Adequate infrastructure');

    return factors;
  }

  /**
   * Identify zoning constraints
   */
  private identifyConstraints(zoningData: RegridZoningData): ZoningConstraint[] {
    const constraints: ZoningConstraint[] = [];

    if (zoningData.max_density_du_per_acre) {
      constraints.push({
        type: 'density',
        description: `Maximum density: ${zoningData.max_density_du_per_acre} DU/acre`,
        value: zoningData.max_density_du_per_acre,
        unit: 'DU/acre',
        impact: 'limiting'
      });
    }

    if (zoningData.max_far) {
      constraints.push({
        type: 'far',
        description: `Maximum FAR: ${zoningData.max_far}`,
        value: zoningData.max_far,
        unit: 'ratio',
        impact: 'limiting'
      });
    }

    if (zoningData.max_building_height_ft) {
      constraints.push({
        type: 'height',
        description: `Maximum height: ${zoningData.max_building_height_ft} ft`,
        value: zoningData.max_building_height_ft,
        unit: 'ft',
        impact: 'moderate'
      });
    }

    return constraints;
  }

  /**
   * Determine recommended use based on alternatives
   */
  private determineRecommendedUse(alternatives: HBUAlternative[]): 'residential' | 'commercial' | 'mixed-use' | 'industrial' {
    if (alternatives.length === 0) return 'residential';

    const best = alternatives[0];
    
    if (best.use.includes('Mixed-Use')) return 'mixed-use';
    if (best.use.includes('Residential') || best.use.includes('Family') || best.use.includes('Apartment')) return 'residential';
    if (best.use.includes('Commercial') || best.use.includes('Retail') || best.use.includes('Office')) return 'commercial';
    if (best.use.includes('Industrial') || best.use.includes('Warehouse') || best.use.includes('Manufacturing')) return 'industrial';
    
    return 'residential';
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(alternatives: HBUAlternative[], marketFactors: MarketFactor[]): number {
    if (alternatives.length === 0) return 0;

    const avgAlternativeConfidence = alternatives.reduce((sum, alt) => sum + alt.confidence, 0) / alternatives.length;
    const marketScore = marketFactors.reduce((sum, factor) => sum + (factor.weight * (factor.impact === 'positive' ? 1 : factor.impact === 'negative' ? -1 : 0)), 0);
    
    return Math.min(avgAlternativeConfidence + marketScore * 10, 100);
  }

  /**
   * Generate financial projections
   */
  private generateFinancialProjections(use: string, alternatives: HBUAlternative[]): FinancialProjection[] {
    const projections: FinancialProjection[] = [];
    const bestAlternative = alternatives[0];
    
    if (!bestAlternative) return projections;

    for (let year = 1; year <= 10; year++) {
      const revenue = bestAlternative.estimatedValue * (1 + 0.03) ** year; // 3% growth
      const expenses = bestAlternative.developmentCost * 0.05; // 5% of cost annually
      const netIncome = revenue - expenses;
      const cashFlow = netIncome;
      const cumulativeCashFlow = projections.length > 0 ? 
        projections[projections.length - 1].cumulativeCashFlow + cashFlow : cashFlow;

      projections.push({
        year,
        revenue,
        expenses,
        netIncome,
        cashFlow,
        cumulativeCashFlow
      });
    }

    return projections;
  }
}
