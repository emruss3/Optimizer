// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { generateMassing, MassingPreset, MassingResult } from '../massing/generateMassing';
import { generateParking, ParkingParams, ParkingResult } from '../parking/generateParking';
import { GeoJSON } from '../types/parcel';

export type SchemeParams = {
  orientationDeg: number;
  parkingAngle: 0 | 45 | 60 | 90;
  barCount: number;
  barLenFt: number;
  floors: number;
  padElevationFt?: number;
};

export type SchemeScore = {
  parking_achieved: number;    // 0-1, based on parking ratio achieved
  nrsf: number;               // Net Rentable Square Feet
  cut_fill_cost: number;      // Cost penalty for site work
  violations: number;         // Zoning/regulation violations
  total_score: number;        // Weighted combination of all factors
};

export type Scheme = {
  id: string;
  params: SchemeParams;
  massing: MassingResult;
  parking: ParkingResult[];
  score: SchemeScore;
  thumbnail?: string; // Base64 encoded thumbnail
  created_at: Date;
};

export type ParetoSet = {
  schemes: Scheme[];
  dominated_count: number;
  total_evaluated: number;
};

/**
 * Scheme store for managing and optimizing development schemes
 * Implements pareto optimization for multi-objective decision making
 */
export class SchemeStore {
  private schemes: Map<string, Scheme> = new Map();
  private paretoSet: Scheme[] = [];

  /**
   * Enumerate schemes based on base parameters
   */
  static enumerateSchemes(base: Partial<SchemeParams>): SchemeParams[] {
    const schemes: SchemeParams[] = [];

    // Define parameter ranges
    const orientations = [0, 15, 30, 45, 60, 75, 90];
    const parkingAngles: Array<0 | 45 | 60 | 90> = [0, 45, 60, 90];
    const barCounts = [1, 2, 3, 4, 5];
    const barLengths = [100, 150, 200, 250, 300];
    const floorCounts = [1, 2, 3, 4, 5, 6, 8, 10];

    // Generate combinations (limit to reasonable number)
    for (const orientation of orientations) {
      for (const parkingAngle of parkingAngles) {
        for (const barCount of barCounts) {
          for (const barLen of barLengths) {
            for (const floors of floorCounts) {
              schemes.push({
                orientationDeg: orientation,
                parkingAngle,
                barCount,
                barLenFt: barLen,
                floors,
                padElevationFt: base.padElevationFt || 0
              });
            }
          }
        }
      }
    }

    // Limit to reasonable number of schemes (sample if too many)
    if (schemes.length > 1000) {
      return this.sampleSchemes(schemes, 1000);
    }

    return schemes;
  }

  /**
   * Sample schemes to limit total count
   */
  private static sampleSchemes(schemes: SchemeParams[], maxCount: number): SchemeParams[] {
    const step = Math.floor(schemes.length / maxCount);
    return schemes.filter((_, index) => index % step === 0).slice(0, maxCount);
  }

  /**
   * Score a scheme based on multiple criteria
   */
  static score(scheme: Scheme): SchemeScore {
    const { massing, parking } = scheme;
    
    // Calculate parking achievement (0-1)
    const parking_achieved = this.calculateParkingAchievement(parking);
    
    // NRSF score (normalized)
    const nrsf = massing.kpis.nrsf;
    
    // Cut/fill cost (simplified calculation)
    const cut_fill_cost = this.calculateCutFillCost(scheme.params, massing);
    
    // Violations penalty
    const violations = this.calculateViolations(scheme.params, massing);
    
    // Weighted total score
    const weights = {
      parking: 0.3,
      nrsf: 0.4,
      cost: 0.2,
      violations: 0.1
    };
    
    const total_score = 
      parking_achieved * weights.parking +
      (nrsf / 100000) * weights.nrsf + // Normalize NRSF
      (1 - cut_fill_cost / 1000000) * weights.cost + // Invert cost (lower is better)
      (1 - violations) * weights.violations; // Invert violations (lower is better)

    return {
      parking_achieved,
      nrsf,
      cut_fill_cost,
      violations,
      total_score: Math.max(0, Math.min(1, total_score))
    };
  }

  /**
   * Calculate parking achievement score
   */
  private static calculateParkingAchievement(parking: ParkingResult[]): number {
    if (parking.length === 0) return 0;
    
    // Use the best parking result
    const bestParking = parking.reduce((best, current) => 
      current.kpis.efficiency > best.kpis.efficiency ? current : best
    );
    
    // Normalize efficiency (assume 10 stalls per 1000 sq ft is good)
    return Math.min(1, bestParking.kpis.efficiency / 10);
  }

  /**
   * Calculate cut/fill cost
   */
  private static calculateCutFillCost(params: SchemeParams, massing: MassingResult): number {
    // Simplified calculation based on building area and elevation
    const buildingArea = massing.kpis.nrsf / massing.kpis.floors;
    const elevationCost = (params.padElevationFt || 0) * buildingArea * 5; // $5 per sq ft per foot
    const siteWorkCost = buildingArea * 2; // $2 per sq ft for basic site work
    
    return elevationCost + siteWorkCost;
  }

  /**
   * Calculate violations penalty
   */
  private static calculateViolations(params: SchemeParams, massing: MassingResult): number {
    let violations = 0;
    
    // FAR violation (assume max FAR of 2.0)
    if (massing.kpis.far > 2.0) {
      violations += (massing.kpis.far - 2.0) * 0.5;
    }
    
    // Coverage violation (assume max coverage of 0.8)
    if (massing.kpis.coverage > 0.8) {
      violations += (massing.kpis.coverage - 0.8) * 0.5;
    }
    
    // Height violation (assume max height of 120 ft)
    const maxHeight = massing.kpis.floors * 12; // 12 ft per floor
    if (maxHeight > 120) {
      violations += (maxHeight - 120) / 120;
    }
    
    return Math.min(1, violations); // Cap at 1.0
  }

  /**
   * Find pareto optimal set
   */
  static pareto(schemes: Scheme[]): ParetoSet {
    if (schemes.length === 0) {
      return { schemes: [], dominated_count: 0, total_evaluated: 0 };
    }

    const paretoSet: Scheme[] = [];
    let dominatedCount = 0;

    for (const scheme of schemes) {
      let isDominated = false;
      
      // Check if this scheme is dominated by any existing pareto scheme
      for (const paretoScheme of paretoSet) {
        if (this.isDominated(scheme, paretoScheme)) {
          isDominated = true;
          break;
        }
      }
      
      if (!isDominated) {
        // Remove any existing pareto schemes that are dominated by this one
        const newParetoSet = paretoSet.filter(paretoScheme => 
          !this.isDominated(paretoScheme, scheme)
        );
        
        newParetoSet.push(scheme);
        paretoSet.length = 0;
        paretoSet.push(...newParetoSet);
      } else {
        dominatedCount++;
      }
    }

    return {
      schemes: paretoSet,
      dominated_count: dominatedCount,
      total_evaluated: schemes.length
    };
  }

  /**
   * Check if scheme A is dominated by scheme B
   */
  private static isDominated(schemeA: Scheme, schemeB: Scheme): boolean {
    const scoreA = schemeA.score;
    const scoreB = schemeB.score;
    
    // A is dominated by B if B is better in all objectives
    return (
      scoreB.parking_achieved >= scoreA.parking_achieved &&
      scoreB.nrsf >= scoreA.nrsf &&
      scoreB.cut_fill_cost <= scoreA.cut_fill_cost &&
      scoreB.violations <= scoreA.violations &&
      (scoreB.parking_achieved > scoreA.parking_achieved ||
       scoreB.nrsf > scoreA.nrsf ||
       scoreB.cut_fill_cost < scoreA.cut_fill_cost ||
       scoreB.violations < scoreA.violations)
    );
  }

  /**
   * Generate a complete scheme
   */
  async generateScheme(
    params: SchemeParams,
    buildablePolygon: GeoJSON.Polygon,
    massingPreset: MassingPreset,
    parkingParams: ParkingParams
  ): Promise<Scheme> {
    const id = this.generateSchemeId(params);
    
    // Generate massing
    const massing = generateMassing(buildablePolygon, massingPreset);
    
    // Generate parking for each angle
    const parking = generateParking(buildablePolygon, {
      ...parkingParams,
      angles: [params.parkingAngle]
    });
    
    // Create scheme
    const scheme: Scheme = {
      id,
      params,
      massing,
      parking,
      score: { parking_achieved: 0, nrsf: 0, cut_fill_cost: 0, violations: 0, total_score: 0 },
      created_at: new Date()
    };
    
    // Score the scheme
    scheme.score = SchemeStore.score(scheme);
    
    return scheme;
  }

  /**
   * Generate unique scheme ID
   */
  private generateSchemeId(params: SchemeParams): string {
    return `scheme_${params.orientationDeg}_${params.parkingAngle}_${params.barCount}_${params.barLenFt}_${params.floors}`;
  }

  /**
   * Store a scheme
   */
  storeScheme(scheme: Scheme): void {
    this.schemes.set(scheme.id, scheme);
  }

  /**
   * Get a scheme by ID
   */
  getScheme(id: string): Scheme | undefined {
    return this.schemes.get(id);
  }

  /**
   * Get all schemes
   */
  getAllSchemes(): Scheme[] {
    return Array.from(this.schemes.values());
  }

  /**
   * Update pareto set
   */
  updateParetoSet(): void {
    const allSchemes = this.getAllSchemes();
    const paretoResult = SchemeStore.pareto(allSchemes);
    this.paretoSet = paretoResult.schemes;
  }

  /**
   * Get pareto optimal schemes
   */
  getParetoSet(): Scheme[] {
    return this.paretoSet;
  }

  /**
   * Clear all schemes
   */
  clear(): void {
    this.schemes.clear();
    this.paretoSet = [];
  }

  /**
   * Get scheme statistics
   */
  getStatistics(): {
    total_schemes: number;
    pareto_schemes: number;
    best_score: number;
    avg_score: number;
  } {
    const allSchemes = this.getAllSchemes();
    const scores = allSchemes.map(s => s.score.total_score);
    
    return {
      total_schemes: allSchemes.length,
      pareto_schemes: this.paretoSet.length,
      best_score: scores.length > 0 ? Math.max(...scores) : 0,
      avg_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    };
  }
}

// Export convenience functions
export const enumerateSchemes = SchemeStore.enumerateSchemes;
export const score = SchemeStore.score;
export const pareto = SchemeStore.pareto;