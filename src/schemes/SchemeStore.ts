// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { ParkingResult } from '../parking/generateParking';
import { MassingResult } from '../massing/generateMassing';

// Types
export interface SchemeConfiguration {
  orientation: 'north-south' | 'east-west' | 'optimal';
  parkingAngle: 90 | 60 | 45 | 0;
  barCount: number;
  barLength: number;
  floors: number;
  parkingRatio: number; // 0-1
  buildingCoverage: number; // 0-1
}

export interface SchemeMetrics {
  totalNRSF: number;
  totalParkingStalls: number;
  parkingRatio: number;
  buildingCoverage: number;
  far: number;
  efficiency: number; // NRSF per parking stall
  costPerSF: number; // Estimated
  revenuePerSF: number; // Estimated
  netPresentValue: number;
  internalRateOfReturn: number;
  paybackPeriod: number;
}

export interface Scheme {
  id: string;
  name: string;
  configuration: SchemeConfiguration;
  massing: MassingResult;
  parking: ParkingResult;
  metrics: SchemeMetrics;
  thumbnail?: string; // Base64 encoded image
  rank: number;
  paretoOptimal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SchemeComparison {
  schemes: Scheme[];
  paretoFront: Scheme[];
  bestByMetric: {
    highestNRSF: Scheme;
    highestEfficiency: Scheme;
    highestNPV: Scheme;
    highestIRR: Scheme;
    lowestPayback: Scheme;
  };
}

export interface SchemeFilters {
  minNRSF?: number;
  maxNRSF?: number;
  minParkingStalls?: number;
  maxParkingStalls?: number;
  minEfficiency?: number;
  maxEfficiency?: number;
  minNPV?: number;
  maxNPV?: number;
  minIRR?: number;
  maxIRR?: number;
  maxPaybackPeriod?: number;
  paretoOptimalOnly?: boolean;
}

/**
 * Scheme store for enumeration and pareto optimization
 * Manages multiple development schemes and their comparisons
 */
export class SchemeStore {
  private schemes: Map<string, Scheme> = new Map();
  private paretoFront: Scheme[] = [];
  private nextId = 1;

  /**
   * Add a new scheme to the store
   */
  addScheme(
    configuration: SchemeConfiguration,
    massing: MassingResult,
    parking: ParkingResult,
    name?: string
  ): Scheme {
    const id = `scheme_${this.nextId++}`;
    const schemeName = name || this.generateSchemeName(configuration);
    
    const metrics = this.calculateSchemeMetrics(massing, parking, configuration);
    const rank = this.calculateSchemeRank(metrics);

    const scheme: Scheme = {
      id,
      name: schemeName,
      configuration,
      massing,
      parking,
      metrics,
      rank,
      paretoOptimal: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.schemes.set(id, scheme);
    this.updateParetoFront();
    this.updateSchemeRanks();

    console.log('✅ Scheme added:', {
      id: scheme.id,
      name: scheme.name,
      rank: scheme.rank,
      paretoOptimal: scheme.paretoOptimal
    });

    return scheme;
  }

  /**
   * Get all schemes
   */
  getAllSchemes(): Scheme[] {
    return Array.from(this.schemes.values()).sort((a, b) => a.rank - b.rank);
  }

  /**
   * Get schemes by filters
   */
  getSchemesByFilters(filters: SchemeFilters): Scheme[] {
    let schemes = this.getAllSchemes();

    if (filters.paretoOptimalOnly) {
      schemes = schemes.filter(s => s.paretoOptimal);
    }

    if (filters.minNRSF !== undefined) {
      schemes = schemes.filter(s => s.metrics.totalNRSF >= filters.minNRSF!);
    }

    if (filters.maxNRSF !== undefined) {
      schemes = schemes.filter(s => s.metrics.totalNRSF <= filters.maxNRSF!);
    }

    if (filters.minParkingStalls !== undefined) {
      schemes = schemes.filter(s => s.metrics.totalParkingStalls >= filters.minParkingStalls!);
    }

    if (filters.maxParkingStalls !== undefined) {
      schemes = schemes.filter(s => s.metrics.totalParkingStalls <= filters.maxParkingStalls!);
    }

    if (filters.minEfficiency !== undefined) {
      schemes = schemes.filter(s => s.metrics.efficiency >= filters.minEfficiency!);
    }

    if (filters.maxEfficiency !== undefined) {
      schemes = schemes.filter(s => s.metrics.efficiency <= filters.maxEfficiency!);
    }

    if (filters.minNPV !== undefined) {
      schemes = schemes.filter(s => s.metrics.netPresentValue >= filters.minNPV!);
    }

    if (filters.maxNPV !== undefined) {
      schemes = schemes.filter(s => s.metrics.netPresentValue <= filters.maxNPV!);
    }

    if (filters.minIRR !== undefined) {
      schemes = schemes.filter(s => s.metrics.internalRateOfReturn >= filters.minIRR!);
    }

    if (filters.maxIRR !== undefined) {
      schemes = schemes.filter(s => s.metrics.internalRateOfReturn <= filters.maxIRR!);
    }

    if (filters.maxPaybackPeriod !== undefined) {
      schemes = schemes.filter(s => s.metrics.paybackPeriod <= filters.maxPaybackPeriod!);
    }

    return schemes;
  }

  /**
   * Get scheme by ID
   */
  getScheme(id: string): Scheme | undefined {
    return this.schemes.get(id);
  }

  /**
   * Get pareto optimal schemes
   */
  getParetoOptimalSchemes(): Scheme[] {
    return this.paretoFront;
  }

  /**
   * Get scheme comparison
   */
  getSchemeComparison(): SchemeComparison {
    const allSchemes = this.getAllSchemes();
    const paretoFront = this.getParetoOptimalSchemes();

    const bestByMetric = {
      highestNRSF: allSchemes.reduce((best, current) => 
        current.metrics.totalNRSF > best.metrics.totalNRSF ? current : best
      ),
      highestEfficiency: allSchemes.reduce((best, current) => 
        current.metrics.efficiency > best.metrics.efficiency ? current : best
      ),
      highestNPV: allSchemes.reduce((best, current) => 
        current.metrics.netPresentValue > best.metrics.netPresentValue ? current : best
      ),
      highestIRR: allSchemes.reduce((best, current) => 
        current.metrics.internalRateOfReturn > best.metrics.internalRateOfReturn ? current : best
      ),
      lowestPayback: allSchemes.reduce((best, current) => 
        current.metrics.paybackPeriod < best.metrics.paybackPeriod ? current : best
      )
    };

    return {
      schemes: allSchemes,
      paretoFront,
      bestByMetric
    };
  }

  /**
   * Update scheme
   */
  updateScheme(id: string, updates: Partial<Scheme>): Scheme | null {
    const scheme = this.schemes.get(id);
    if (!scheme) return null;

    const updatedScheme = {
      ...scheme,
      ...updates,
      updatedAt: new Date()
    };

    this.schemes.set(id, updatedScheme);
    this.updateParetoFront();
    this.updateSchemeRanks();

    return updatedScheme;
  }

  /**
   * Delete scheme
   */
  deleteScheme(id: string): boolean {
    const deleted = this.schemes.delete(id);
    if (deleted) {
      this.updateParetoFront();
      this.updateSchemeRanks();
    }
    return deleted;
  }

  /**
   * Clear all schemes
   */
  clearSchemes(): void {
    this.schemes.clear();
    this.paretoFront = [];
    this.nextId = 1;
  }

  /**
   * Generate similar schemes based on an existing scheme
   */
  generateSimilarSchemes(baseScheme: Scheme, count: number = 5): Scheme[] {
    const similarSchemes: Scheme[] = [];
    const baseConfig = baseScheme.configuration;

    // Generate variations
    const orientations: SchemeConfiguration['orientation'][] = ['north-south', 'east-west', 'optimal'];
    const parkingAngles: SchemeConfiguration['parkingAngle'][] = [90, 60, 45, 0];
    const barCounts = [baseConfig.barCount - 1, baseConfig.barCount, baseConfig.barCount + 1].filter(n => n > 0);
    const barLengths = [baseConfig.barLength - 10, baseConfig.barLength, baseConfig.barLength + 10].filter(l => l > 0);
    const floors = [baseConfig.floors - 1, baseConfig.floors, baseConfig.floors + 1].filter(f => f > 0);

    let generated = 0;
    for (const orientation of orientations) {
      for (const parkingAngle of parkingAngles) {
        for (const barCount of barCounts) {
          for (const barLength of barLengths) {
            for (const floor of floors) {
              if (generated >= count) break;

              const config: SchemeConfiguration = {
                ...baseConfig,
                orientation,
                parkingAngle,
                barCount,
                barLength,
                floors: floor
              };

              // Create a placeholder scheme (in real implementation, would regenerate massing/parking)
              const similarScheme = this.createPlaceholderScheme(config, `Similar to ${baseScheme.name}`);
              similarSchemes.push(similarScheme);
              generated++;
            }
            if (generated >= count) break;
          }
          if (generated >= count) break;
        }
        if (generated >= count) break;
      }
      if (generated >= count) break;
    }

    return similarSchemes;
  }

  /**
   * Calculate scheme metrics
   */
  private calculateSchemeMetrics(
    massing: MassingResult,
    parking: ParkingResult,
    config: SchemeConfiguration
  ): SchemeMetrics {
    const totalNRSF = massing.kpis.totalNRSF;
    const totalParkingStalls = parking.kpis.totalStalls;
    const parkingRatio = totalParkingStalls / (totalNRSF / 1000); // stalls per 1000 SF
    const buildingCoverage = massing.kpis.coverage;
    const far = massing.kpis.far;
    const efficiency = totalNRSF / totalParkingStalls;

    // Simplified financial calculations
    const costPerSF = this.estimateCostPerSF(config);
    const revenuePerSF = this.estimateRevenuePerSF(config);
    const netPresentValue = this.calculateNPV(totalNRSF, costPerSF, revenuePerSF);
    const internalRateOfReturn = this.calculateIRR(totalNRSF, costPerSF, revenuePerSF);
    const paybackPeriod = this.calculatePaybackPeriod(totalNRSF, costPerSF, revenuePerSF);

    return {
      totalNRSF,
      totalParkingStalls,
      parkingRatio,
      buildingCoverage,
      far,
      efficiency,
      costPerSF,
      revenuePerSF,
      netPresentValue,
      internalRateOfReturn,
      paybackPeriod
    };
  }

  /**
   * Calculate scheme rank based on multiple criteria
   */
  private calculateSchemeRank(metrics: SchemeMetrics): number {
    // Weighted scoring system
    const weights = {
      efficiency: 0.3,
      npv: 0.25,
      irr: 0.2,
      coverage: 0.15,
      parkingRatio: 0.1
    };

    // Normalize metrics (simplified)
    const normalizedEfficiency = Math.min(metrics.efficiency / 1000, 1); // Cap at 1000 SF per stall
    const normalizedNPV = Math.max(0, Math.min(metrics.netPresentValue / 10000000, 1)); // Cap at $10M
    const normalizedIRR = Math.min(metrics.internalRateOfReturn, 0.3) / 0.3; // Cap at 30%
    const normalizedCoverage = metrics.buildingCoverage;
    const normalizedParkingRatio = Math.min(metrics.parkingRatio / 5, 1); // Cap at 5 stalls per 1000 SF

    const score = 
      normalizedEfficiency * weights.efficiency +
      normalizedNPV * weights.npv +
      normalizedIRR * weights.irr +
      normalizedCoverage * weights.coverage +
      normalizedParkingRatio * weights.parkingRatio;

    return Math.round(score * 100); // Convert to 0-100 scale
  }

  /**
   * Update pareto front
   */
  private updateParetoFront(): void {
    const schemes = Array.from(this.schemes.values());
    this.paretoFront = [];

    for (const scheme of schemes) {
      let isParetoOptimal = true;

      for (const otherScheme of schemes) {
        if (scheme.id === otherScheme.id) continue;

        // Check if other scheme dominates this one
        if (this.dominates(otherScheme, scheme)) {
          isParetoOptimal = false;
          break;
        }
      }

      if (isParetoOptimal) {
        this.paretoFront.push(scheme);
      }
    }

    // Update pareto optimal flags
    for (const scheme of schemes) {
      scheme.paretoOptimal = this.paretoFront.some(p => p.id === scheme.id);
    }
  }

  /**
   * Check if scheme A dominates scheme B
   */
  private dominates(schemeA: Scheme, schemeB: Scheme): boolean {
    const metricsA = schemeA.metrics;
    const metricsB = schemeB.metrics;

    // A dominates B if A is better in at least one metric and not worse in any
    const betterInAtLeastOne = 
      metricsA.totalNRSF > metricsB.totalNRSF ||
      metricsA.efficiency > metricsB.efficiency ||
      metricsA.netPresentValue > metricsB.netPresentValue ||
      metricsA.internalRateOfReturn > metricsB.internalRateOfReturn ||
      metricsA.paybackPeriod < metricsB.paybackPeriod;

    const notWorseInAny = 
      metricsA.totalNRSF >= metricsB.totalNRSF &&
      metricsA.efficiency >= metricsB.efficiency &&
      metricsA.netPresentValue >= metricsB.netPresentValue &&
      metricsA.internalRateOfReturn >= metricsB.internalRateOfReturn &&
      metricsA.paybackPeriod <= metricsB.paybackPeriod;

    return betterInAtLeastOne && notWorseInAny;
  }

  /**
   * Update scheme ranks
   */
  private updateSchemeRanks(): void {
    const schemes = Array.from(this.schemes.values());
    schemes.sort((a, b) => b.rank - a.rank); // Sort by rank descending

    // Update ranks based on position
    schemes.forEach((scheme, index) => {
      scheme.rank = index + 1;
    });
  }

  /**
   * Generate scheme name
   */
  private generateSchemeName(config: SchemeConfiguration): string {
    const orientation = config.orientation.replace('-', ' ').toUpperCase();
    const parking = `${config.parkingAngle}°`;
    const bars = `${config.barCount} bars`;
    const floors = `${config.floors}F`;
    
    return `${orientation} ${parking} ${bars} ${floors}`;
  }

  /**
   * Create placeholder scheme for similar scheme generation
   */
  private createPlaceholderScheme(config: SchemeConfiguration, name: string): Scheme {
    const id = `scheme_${this.nextId++}`;
    
    // Create placeholder massing and parking results
    const massing: MassingResult = {
      bars: [],
      kpis: {
        totalNRSF: config.barCount * config.barLength * 20 * config.floors, // Rough estimate
        totalGSF: 0,
        far: 0,
        coverage: config.buildingCoverage,
        averageHeight: config.floors * 10,
        totalFloors: config.barCount * config.floors,
        efficiency: 0.85,
        courtCompliance: true,
        setbackCompliance: true
      },
      geometry: { type: 'FeatureCollection', features: [] }
    };

    const parking: ParkingResult = {
      stalls: [],
      aisles: [],
      kpis: {
        totalStalls: Math.ceil(massing.kpis.totalNRSF / 1000 * config.parkingRatio),
        standardStalls: 0,
        compactStalls: 0,
        adaStalls: 0,
        motorcycleStalls: 0,
        totalArea: 0,
        efficiency: 0,
        adaCompliance: true,
        driveContinuity: true
      },
      geometry: { type: 'FeatureCollection', features: [] }
    };

    const metrics = this.calculateSchemeMetrics(massing, parking, config);
    const rank = this.calculateSchemeRank(metrics);

    return {
      id,
      name,
      configuration: config,
      massing,
      parking,
      metrics,
      rank,
      paretoOptimal: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  // Financial calculation helpers
  private estimateCostPerSF(config: SchemeConfiguration): number {
    // Simplified cost estimation
    const baseCost = 200; // $200/SF base
    const heightMultiplier = 1 + (config.floors - 1) * 0.1; // 10% increase per floor
    const complexityMultiplier = config.parkingAngle === 0 ? 1.1 : 1.0; // Parallel parking costs more
    
    return baseCost * heightMultiplier * complexityMultiplier;
  }

  private estimateRevenuePerSF(config: SchemeConfiguration): number {
    // Simplified revenue estimation
    const baseRevenue = 300; // $300/SF base
    const heightMultiplier = 1 + (config.floors - 1) * 0.05; // 5% increase per floor
    const efficiencyMultiplier = config.buildingCoverage > 0.7 ? 1.1 : 1.0;
    
    return baseRevenue * heightMultiplier * efficiencyMultiplier;
  }

  private calculateNPV(totalNRSF: number, costPerSF: number, revenuePerSF: number): number {
    const totalCost = totalNRSF * costPerSF;
    const annualRevenue = totalNRSF * revenuePerSF * 0.1; // 10% of revenue annually
    const discountRate = 0.08; // 8% discount rate
    const years = 10;
    
    let npv = -totalCost;
    for (let year = 1; year <= years; year++) {
      npv += annualRevenue / Math.pow(1 + discountRate, year);
    }
    
    return npv;
  }

  private calculateIRR(totalNRSF: number, costPerSF: number, revenuePerSF: number): number {
    const totalCost = totalNRSF * costPerSF;
    const annualRevenue = totalNRSF * revenuePerSF * 0.1;
    
    // Simplified IRR calculation
    return annualRevenue / totalCost;
  }

  private calculatePaybackPeriod(totalNRSF: number, costPerSF: number, revenuePerSF: number): number {
    const totalCost = totalNRSF * costPerSF;
    const annualRevenue = totalNRSF * revenuePerSF * 0.1;
    
    return totalCost / annualRevenue;
  }
}

// Export singleton instance
export const schemeStore = new SchemeStore();
