// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { Element } from '../types/element';

export interface ImperviousCalculation {
  total_impervious_sqft: number;
  impervious_percentage: number;
  breakdown: {
    buildings: number;
    parking: number;
    drives: number;
    other: number;
  };
}

/**
 * Calculate impervious coverage from canvas features
 */
export class ImperviousCalculator {
  /**
   * Calculate impervious percentage from elements on canvas
   */
  static calculateImpervious(
    elements: Element[],
    totalSiteAreaSqft: number
  ): ImperviousCalculation {
    let buildings = 0;
    let parking = 0;
    let drives = 0;
    let other = 0;

    elements.forEach(element => {
      const area = this.calculateElementArea(element);
      
      switch (element.type) {
        case 'building':
          buildings += area;
          break;
        case 'parking':
          parking += area;
          break;
        case 'driveway':
        case 'road':
          drives += area;
          break;
        case 'greenspace':
        case 'landscape':
          // These are typically pervious
          break;
        default:
          // Check if element has impervious properties
          if (element.properties?.impervious !== false) {
            other += area;
          }
          break;
      }
    });

    const total_impervious_sqft = buildings + parking + drives + other;
    const impervious_percentage = totalSiteAreaSqft > 0 
      ? (total_impervious_sqft / totalSiteAreaSqft) * 100 
      : 0;

    return {
      total_impervious_sqft: Math.round(total_impervious_sqft),
      impervious_percentage: Math.round(impervious_percentage * 100) / 100,
      breakdown: {
        buildings: Math.round(buildings),
        parking: Math.round(parking),
        drives: Math.round(drives),
        other: Math.round(other)
      }
    };
  }

  /**
   * Calculate area of an element using shoelace formula
   */
  private static calculateElementArea(element: Element): number {
    if (!element.vertices || element.vertices.length < 3) {
      return 0;
    }

    // Convert SVG units to feet (assuming 12 SVG units = 1 foot)
    const coords = element.vertices.map(v => [v.x / 12, v.y / 12]);
    
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const current = coords[i];
      const next = coords[(i + 1) % coords.length];
      area += current[0] * next[1] - next[0] * current[1];
    }
    
    return Math.abs(area) / 2; // Return area in square feet
  }

  /**
   * Calculate building coverage percentage
   */
  static calculateBuildingCoverage(
    elements: Element[],
    totalSiteAreaSqft: number
  ): {
    building_footprint_sqft: number;
    coverage_percentage: number;
  } {
    const buildingElements = elements.filter(el => el.type === 'building');
    const building_footprint_sqft = buildingElements.reduce(
      (sum, element) => sum + this.calculateElementArea(element), 
      0
    );
    
    const coverage_percentage = totalSiteAreaSqft > 0 
      ? (building_footprint_sqft / totalSiteAreaSqft) * 100 
      : 0;

    return {
      building_footprint_sqft: Math.round(building_footprint_sqft),
      coverage_percentage: Math.round(coverage_percentage * 100) / 100
    };
  }

  /**
   * Calculate open space percentage
   */
  static calculateOpenSpace(
    elements: Element[],
    totalSiteAreaSqft: number
  ): {
    open_space_sqft: number;
    open_space_percentage: number;
  } {
    const openSpaceElements = elements.filter(el => 
      el.type === 'greenspace' || 
      el.type === 'landscape' ||
      el.properties?.name?.toLowerCase().includes('open space')
    );
    
    const open_space_sqft = openSpaceElements.reduce(
      (sum, element) => sum + this.calculateElementArea(element), 
      0
    );
    
    const open_space_percentage = totalSiteAreaSqft > 0 
      ? (open_space_sqft / totalSiteAreaSqft) * 100 
      : 0;

    return {
      open_space_sqft: Math.round(open_space_sqft),
      open_space_percentage: Math.round(open_space_percentage * 100) / 100
    };
  }

  /**
   * Calculate landscaped area percentage
   */
  static calculateLandscapedArea(
    elements: Element[],
    totalSiteAreaSqft: number
  ): {
    landscaped_sqft: number;
    landscaped_percentage: number;
  } {
    const landscapedElements = elements.filter(el => 
      el.type === 'landscape' ||
      el.properties?.name?.toLowerCase().includes('landscape') ||
      el.properties?.name?.toLowerCase().includes('planting')
    );
    
    const landscaped_sqft = landscapedElements.reduce(
      (sum, element) => sum + this.calculateElementArea(element), 
      0
    );
    
    const landscaped_percentage = totalSiteAreaSqft > 0 
      ? (landscaped_sqft / totalSiteAreaSqft) * 100 
      : 0;

    return {
      landscaped_sqft: Math.round(landscaped_sqft),
      landscaped_percentage: Math.round(landscaped_percentage * 100) / 100
    };
  }

  /**
   * Check compliance with zoning requirements
   */
  static checkCompliance(
    elements: Element[],
    totalSiteAreaSqft: number,
    zoning: {
      max_coverage_pct?: number;
      max_impervious_coverage_pct?: number;
      min_landscaped_space_pct?: number;
      min_open_space_pct?: number;
    }
  ): {
    coverage: { compliant: boolean; current: number; max: number };
    impervious: { compliant: boolean; current: number; max: number };
    landscaped: { compliant: boolean; current: number; min: number };
    open_space: { compliant: boolean; current: number; min: number };
  } {
    const buildingCoverage = this.calculateBuildingCoverage(elements, totalSiteAreaSqft);
    const impervious = this.calculateImpervious(elements, totalSiteAreaSqft);
    const landscaped = this.calculateLandscapedArea(elements, totalSiteAreaSqft);
    const openSpace = this.calculateOpenSpace(elements, totalSiteAreaSqft);

    return {
      coverage: {
        compliant: !zoning.max_coverage_pct || buildingCoverage.coverage_percentage <= zoning.max_coverage_pct,
        current: buildingCoverage.coverage_percentage,
        max: zoning.max_coverage_pct || 100
      },
      impervious: {
        compliant: !zoning.max_impervious_coverage_pct || impervious.impervious_percentage <= zoning.max_impervious_coverage_pct,
        current: impervious.impervious_percentage,
        max: zoning.max_impervious_coverage_pct || 100
      },
      landscaped: {
        compliant: !zoning.min_landscaped_space_pct || landscaped.landscaped_percentage >= zoning.min_landscaped_space_pct,
        current: landscaped.landscaped_percentage,
        min: zoning.min_landscaped_space_pct || 0
      },
      open_space: {
        compliant: !zoning.min_open_space_pct || openSpace.open_space_percentage >= zoning.min_open_space_pct,
        current: openSpace.open_space_percentage,
        min: zoning.min_open_space_pct || 0
      }
    };
  }
}
