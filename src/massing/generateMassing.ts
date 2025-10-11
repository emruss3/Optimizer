// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { GeoJSON } from '../types/parcel';
import { CoordinateTransform } from '../utils/coordinateTransform';

export type MassingPreset = {
  barDepthFt: number;      // e.g., 60–70
  minCourtFt: number;
  maxBarLenFt: number;
  floorToFloorFt: number;
  maxHeightFt?: number;    // from zoning
  targetFAR?: number;
};

export type MassingKPI = {
  nrsf: number;           // Net Rentable Square Feet
  far: number;            // Floor Area Ratio
  coverage: number;       // Building coverage ratio
  floors: number;         // Number of floors
  building_count: number; // Number of buildings
  court_count: number;    // Number of courtyards
  efficiency: number;     // NRSF per 1000 sq ft of site
};

export type MassingResult = {
  features: GeoJSON.FeatureCollection;
  kpis: MassingKPI;
  bars: MassingBar[];
  courts: MassingCourt[];
};

export type MassingBar = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  floors: number;
  height: number;
  angle: number;
  nrsf: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type MassingCourt = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Deterministic massing generator with intelligent layout optimization
 * Generates building bars and courtyards based on buildable polygon and parameters
 */
export class MassingGenerator {
  private static readonly DEFAULT_BAR_DEPTH = 65; // feet
  private static readonly DEFAULT_MIN_COURT = 20; // feet
  private static readonly DEFAULT_MAX_BAR_LEN = 200; // feet
  private static readonly DEFAULT_FLOOR_TO_FLOOR = 12; // feet
  private static readonly MIN_BAR_WIDTH = 30; // feet
  private static readonly MIN_COURT_SIZE = 15; // feet

  /**
   * Generate massing layout for given buildable polygon
   */
  static generateMassing(
    buildableFeetPolygon: GeoJSON.Polygon,
    preset: MassingPreset
  ): MassingResult {
    // Extract polygon coordinates in feet
    const coords = this.extractPolygonCoordinates(buildableFeetPolygon);
    if (coords.length < 3) {
      return this.createEmptyResult();
    }

    // Calculate polygon bounds and area
    const bounds = CoordinateTransform.calculateBounds(coords);
    const siteArea = CoordinateTransform.calculatePolygonArea(coords, 'feet');

    // Find optimal orientation for bars
    const orientation = this.findOptimalOrientation(coords, bounds, preset);
    
    // Generate building bars
    const bars = this.generateBars(coords, bounds, preset, orientation);
    
    // Generate courtyards in remaining space
    const courts = this.generateCourts(coords, bars, preset);
    
    // Calculate KPIs
    const kpis = this.calculateKPIs(bars, courts, siteArea, preset);
    
    // Create GeoJSON features
    const features = this.createGeoJSONFeatures(bars, courts);

    return {
      features,
      kpis,
      bars,
      courts
    };
  }

  /**
   * Find optimal orientation for building bars
   */
  private static findOptimalOrientation(
    coords: number[][],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    preset: MassingPreset
  ): number {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    // Try orientations at 15-degree increments
    const orientations = [0, 15, 30, 45, 60, 75, 90];
    let bestOrientation = 0;
    let bestScore = 0;

    for (const angle of orientations) {
      const score = this.evaluateOrientation(coords, bounds, preset, angle);
      if (score > bestScore) {
        bestScore = score;
        bestOrientation = angle;
      }
    }

    return bestOrientation;
  }

  /**
   * Evaluate orientation score
   */
  private static evaluateOrientation(
    coords: number[][],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    preset: MassingPreset,
    angle: number
  ): number {
    // Simple scoring based on how well bars fit
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const effectiveWidth = Math.abs(bounds.maxX - bounds.minX) * cos + 
                          Math.abs(bounds.maxY - bounds.minY) * sin;
    const effectiveHeight = Math.abs(bounds.maxX - bounds.minX) * sin + 
                           Math.abs(bounds.maxY - bounds.minY) * cos;

    // Score based on how many bars can fit
    const barsThatFit = Math.floor(effectiveWidth / preset.maxBarLenFt) * 
                       Math.floor(effectiveHeight / preset.barDepthFt);
    
    return barsThatFit;
  }

  /**
   * Generate building bars
   */
  private static generateBars(
    coords: number[][],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    preset: MassingPreset,
    orientation: number
  ): MassingBar[] {
    const bars: MassingBar[] = [];
    const radians = (orientation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Calculate grid spacing
    const barSpacing = preset.barDepthFt + preset.minCourtFt;
    const maxBarsPerRow = Math.floor((bounds.maxX - bounds.minX) / preset.maxBarLenFt);
    const maxRows = Math.floor((bounds.maxY - bounds.minY) / barSpacing);

    // Generate bars in grid pattern
    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col < maxBarsPerRow; col++) {
        const x = bounds.minX + col * preset.maxBarLenFt + preset.maxBarLenFt / 2;
        const y = bounds.minY + row * barSpacing + preset.barDepthFt / 2;

        // Check if bar center is within polygon
        if (this.isPointInPolygon([x, y], coords)) {
          const bar = this.createBar(
            x, y, preset, orientation, coords
          );
          
          if (bar && this.isBarValid(bar, coords)) {
            bars.push(bar);
          }
        }
      }
    }

    return bars;
  }

  /**
   * Create a building bar
   */
  private static createBar(
    centerX: number,
    centerY: number,
    preset: MassingPreset,
    orientation: number,
    polygonCoords: number[][]
  ): MassingBar | null {
    const { barDepthFt, maxBarLenFt, floorToFloorFt, maxHeightFt } = preset;
    
    // Calculate bar dimensions
    const width = Math.min(maxBarLenFt, this.calculateMaxBarLength(centerX, centerY, polygonCoords, orientation));
    const depth = barDepthFt;
    
    if (width < this.MIN_BAR_WIDTH) {
      return null;
    }

    // Calculate number of floors based on height limit or FAR
    let floors = 1;
    if (maxHeightFt) {
      floors = Math.floor(maxHeightFt / floorToFloorFt);
    } else if (preset.targetFAR) {
      // Calculate floors based on target FAR
      const siteArea = CoordinateTransform.calculatePolygonArea(polygonCoords, 'feet');
      const targetBuildingArea = siteArea * preset.targetFAR;
      const barArea = width * depth;
      floors = Math.floor(targetBuildingArea / barArea);
    }

    floors = Math.max(1, Math.min(floors, 20)); // Reasonable limits

    const height = floors * floorToFloorFt;
    const nrsf = width * depth * floors;

    // Calculate bounds
    const radians = (orientation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    const bounds = {
      minX: centerX - halfWidth * cos + halfDepth * sin,
      minY: centerY - halfWidth * sin - halfDepth * cos,
      maxX: centerX + halfWidth * cos - halfDepth * sin,
      maxY: centerY + halfWidth * sin + halfDepth * cos
    };

    return {
      id: `bar_${centerX}_${centerY}`,
      x: centerX,
      y: centerY,
      width,
      depth,
      floors,
      height,
      angle: orientation,
      nrsf,
      bounds
    };
  }

  /**
   * Calculate maximum bar length that fits in polygon
   */
  private static calculateMaxBarLength(
    centerX: number,
    centerY: number,
    polygonCoords: number[][],
    orientation: number
  ): number {
    const radians = (orientation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Test different lengths
    for (let length = 200; length >= 30; length -= 10) {
      const halfLength = length / 2;
      const testPoints = [
        [centerX - halfLength * cos, centerY - halfLength * sin],
        [centerX + halfLength * cos, centerY + halfLength * sin]
      ];

      if (testPoints.every(point => this.isPointInPolygon(point, polygonCoords))) {
        return length;
      }
    }

    return 30; // Minimum length
  }

  /**
   * Check if bar is valid (within polygon)
   */
  private static isBarValid(bar: MassingBar, polygonCoords: number[][]): boolean {
    // Check if all corners are within polygon
    const corners = [
      [bar.bounds.minX, bar.bounds.minY],
      [bar.bounds.maxX, bar.bounds.minY],
      [bar.bounds.maxX, bar.bounds.maxY],
      [bar.bounds.minX, bar.bounds.maxY]
    ];

    return corners.every(corner => this.isPointInPolygon(corner, polygonCoords));
  }

  /**
   * Generate courtyards in remaining space
   */
  private static generateCourts(
    coords: number[][],
    bars: MassingBar[],
    preset: MassingPreset
  ): MassingCourt[] {
    const courts: MassingCourt[] = [];
    const bounds = CoordinateTransform.calculateBounds(coords);
    
    // Simple courtyard generation - can be enhanced
    const courtSize = Math.max(preset.minCourtFt, this.MIN_COURT_SIZE);
    const step = courtSize;

    for (let x = bounds.minX; x <= bounds.maxX - courtSize; x += step) {
      for (let y = bounds.minY; y <= bounds.maxY - courtSize; y += step) {
        const court = {
          id: `court_${x}_${y}`,
          x: x + courtSize / 2,
          y: y + courtSize / 2,
          width: courtSize,
          depth: courtSize,
          bounds: {
            minX: x,
            minY: y,
            maxX: x + courtSize,
            maxY: y + courtSize
          }
        };

        // Check if court is within polygon and doesn't overlap with bars
        if (this.isCourtValid(court, coords, bars)) {
          courts.push(court);
        }
      }
    }

    return courts;
  }

  /**
   * Check if court is valid
   */
  private static isCourtValid(
    court: MassingCourt,
    polygonCoords: number[][],
    bars: MassingBar[]
  ): boolean {
    // Check if court is within polygon
    const corners = [
      [court.bounds.minX, court.bounds.minY],
      [court.bounds.maxX, court.bounds.minY],
      [court.bounds.maxX, court.bounds.maxY],
      [court.bounds.minX, court.bounds.maxY]
    ];

    const withinPolygon = corners.every(corner => this.isPointInPolygon(corner, polygonCoords));
    if (!withinPolygon) return false;

    // Check if court doesn't overlap with bars
    const overlapsWithBar = bars.some(bar => this.rectanglesOverlap(court.bounds, bar.bounds));
    return !overlapsWithBar;
  }

  /**
   * Check if two rectangles overlap
   */
  private static rectanglesOverlap(
    rect1: { minX: number; minY: number; maxX: number; maxY: number },
    rect2: { minX: number; minY: number; maxX: number; maxY: number }
  ): boolean {
    return !(rect1.maxX < rect2.minX || rect2.maxX < rect1.minX || 
             rect1.maxY < rect2.minY || rect2.maxY < rect1.minY);
  }

  /**
   * Calculate KPIs for massing layout
   */
  private static calculateKPIs(
    bars: MassingBar[],
    courts: MassingCourt[],
    siteArea: number,
    preset: MassingPreset
  ): MassingKPI {
    const totalNRSF = bars.reduce((sum, bar) => sum + bar.nrsf, 0);
    const totalBuildingArea = bars.reduce((sum, bar) => sum + (bar.width * bar.depth), 0);
    const totalCourtArea = courts.reduce((sum, court) => sum + (court.width * court.depth), 0);
    
    const far = siteArea > 0 ? totalNRSF / siteArea : 0;
    const coverage = siteArea > 0 ? totalBuildingArea / siteArea : 0;
    const efficiency = siteArea > 0 ? (totalNRSF / siteArea) * 1000 : 0;
    
    const floors = bars.length > 0 ? bars.reduce((sum, bar) => sum + bar.floors, 0) / bars.length : 0;
    const building_count = bars.length;
    const court_count = courts.length;

    return {
      nrsf: Math.round(totalNRSF),
      far: Math.round(far * 1000) / 1000,
      coverage: Math.round(coverage * 1000) / 1000,
      floors: Math.round(floors * 10) / 10,
      building_count,
      court_count,
      efficiency: Math.round(efficiency)
    };
  }

  /**
   * Create GeoJSON features from bars and courts
   */
  private static createGeoJSONFeatures(
    bars: MassingBar[],
    courts: MassingCourt[]
  ): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];

    // Add bar features
    bars.forEach(bar => {
      const coords = this.createBarCoordinates(bar);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        },
        properties: {
          id: bar.id,
          type: 'building_bar',
          floors: bar.floors,
          height: bar.height,
          nrsf: bar.nrsf,
          angle: bar.angle
        }
      });
    });

    // Add court features
    courts.forEach(court => {
      const coords = this.createCourtCoordinates(court);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        },
        properties: {
          id: court.id,
          type: 'courtyard',
          area: court.width * court.depth
        }
      });
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Create coordinates for a building bar
   */
  private static createBarCoordinates(bar: MassingBar): number[][] {
    const { x, y, width, depth, angle } = bar;
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    const corners = [
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth]
    ];

    return corners.map(([dx, dy]) => [
      x + dx * cos - dy * sin,
      y + dx * sin + dy * cos
    ]);
  }

  /**
   * Create coordinates for a courtyard
   */
  private static createCourtCoordinates(court: MassingCourt): number[][] {
    const { x, y, width, depth } = court;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    return [
      [x - halfWidth, y - halfDepth],
      [x + halfWidth, y - halfDepth],
      [x + halfWidth, y + halfDepth],
      [x - halfWidth, y + halfDepth],
      [x - halfWidth, y - halfDepth]
    ];
  }

  /**
   * Extract coordinates from polygon
   */
  private static extractPolygonCoordinates(polygon: GeoJSON.Polygon): number[][] {
    if (!polygon.coordinates || polygon.coordinates.length === 0) {
      return [];
    }
    return polygon.coordinates[0] as number[][];
  }

  /**
   * Check if point is inside polygon using ray casting algorithm
   */
  private static isPointInPolygon(point: number[], polygon: number[][]): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Create empty result
   */
  private static createEmptyResult(): MassingResult {
    return {
      features: { type: 'FeatureCollection', features: [] },
      kpis: {
        nrsf: 0,
        far: 0,
        coverage: 0,
        floors: 0,
        building_count: 0,
        court_count: 0,
        efficiency: 0
      },
      bars: [],
      courts: []
    };
  }
}

/**
 * Main function to generate massing layouts
 */
export function generateMassing(
  buildableFeetPolygon: GeoJSON.Polygon,
  preset: MassingPreset
): MassingResult {
  return MassingGenerator.generateMassing(buildableFeetPolygon, preset);
}