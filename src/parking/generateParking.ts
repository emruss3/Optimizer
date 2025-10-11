// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { GeoJSON } from '../types/parcel';
import { CoordinateTransform } from '../utils/coordinateTransform';

export type ParkingParams = {
  angles: Array<90 | 60 | 45 | 0>; // 0 = parallel
  stall: { 
    width_ft: number; 
    depth_ft: number; 
    aisle_ft: number; 
  };
  ada_pct: number;
  curbCuts?: GeoJSON.FeatureCollection; // optional mask
};

export type ParkingKPI = {
  stall_count: number;
  ratio: number;
  drive_continuity_penalty: number;
  ada_stalls: number;
  efficiency: number; // stalls per 1000 sq ft
};

export type ParkingResult = {
  features: GeoJSON.FeatureCollection;
  kpis: ParkingKPI;
  angle: number;
  modules: ParkingModule[];
};

export type ParkingModule = {
  id: string;
  angle: number;
  stalls: ParkingStall[];
  aisles: ParkingAisle[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type ParkingStall = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  angle: number;
  isADA: boolean;
  type: 'standard' | 'compact' | 'ada';
};

export type ParkingAisle = {
  id: string;
  coords: number[][];
  width: number;
};

/**
 * Deterministic parking generator with TestFit-like behavior
 * Generates parking layouts based on buildable polygon and parameters
 */
export class ParkingGenerator {
  private static readonly DEFAULT_STALL_WIDTH = 9; // feet
  private static readonly DEFAULT_STALL_DEPTH = 18; // feet
  private static readonly DEFAULT_AISLE_WIDTH = 24; // feet
  private static readonly MIN_MODULE_WIDTH = 50; // feet
  private static readonly MIN_MODULE_DEPTH = 30; // feet

  /**
   * Generate parking layout for given buildable polygon
   */
  static generateParking(
    buildableFeetPolygon: GeoJSON.Polygon,
    params: ParkingParams
  ): ParkingResult[] {
    const results: ParkingResult[] = [];

    // Extract polygon coordinates in feet
    const coords = this.extractPolygonCoordinates(buildableFeetPolygon);
    if (coords.length < 3) {
      return results;
    }

    // Calculate polygon bounds and area
    const bounds = CoordinateTransform.calculateBounds(coords);
    const area = CoordinateTransform.calculatePolygonArea(coords, 'feet');

    // Try each angle
    for (const angle of params.angles) {
      const result = this.generateParkingForAngle(
        coords,
        bounds,
        area,
        angle,
        params
      );
      
      if (result.stalls.length > 0) {
        results.push(result);
      }
    }

    // Sort by efficiency (stalls per 1000 sq ft)
    results.sort((a, b) => b.kpis.efficiency - a.kpis.efficiency);

    return results;
  }

  /**
   * Generate parking for a specific angle
   */
  private static generateParkingForAngle(
    polygonCoords: number[][],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    area: number,
    angle: number,
    params: ParkingParams
  ): ParkingResult {
    const modules: ParkingModule[] = [];
    const allStalls: ParkingStall[] = [];
    const allAisles: ParkingAisle[] = [];

    // Calculate module dimensions based on angle
    const moduleDims = this.calculateModuleDimensions(angle, params.stall);
    
    // Generate candidate module positions
    const candidatePositions = this.generateCandidatePositions(
      polygonCoords,
      bounds,
      moduleDims,
      angle
    );

    // Greedy placement of modules
    for (const position of candidatePositions) {
      const module = this.createParkingModule(
        position,
        moduleDims,
        angle,
        params,
        polygonCoords
      );

      if (module && this.isModuleValid(module, polygonCoords)) {
        modules.push(module);
        allStalls.push(...module.stalls);
        allAisles.push(...module.aisles);
      }
    }

    // Calculate KPIs
    const kpis = this.calculateKPIs(allStalls, area, params);

    // Create GeoJSON features
    const features = this.createGeoJSONFeatures(allStalls, allAisles);

    return {
      features,
      kpis,
      angle,
      modules
    };
  }

  /**
   * Calculate module dimensions based on angle and stall parameters
   */
  private static calculateModuleDimensions(
    angle: number,
    stall: ParkingParams['stall']
  ): { width: number; depth: number } {
    const { width_ft, depth_ft, aisle_ft } = stall;

    switch (angle) {
      case 90:
        // Perpendicular parking
        return {
          width: width_ft * 2 + aisle_ft,
          depth: depth_ft + aisle_ft
        };
      case 60:
        // Angled parking
        return {
          width: width_ft * 2 + aisle_ft,
          depth: depth_ft * 0.866 + aisle_ft // cos(30°) ≈ 0.866
        };
      case 45:
        // Angled parking
        return {
          width: width_ft * 2 + aisle_ft,
          depth: depth_ft * 0.707 + aisle_ft // cos(45°) ≈ 0.707
        };
      case 0:
        // Parallel parking
        return {
          width: width_ft + aisle_ft,
          depth: depth_ft + aisle_ft
        };
      default:
        return {
          width: width_ft * 2 + aisle_ft,
          depth: depth_ft + aisle_ft
        };
    }
  }

  /**
   * Generate candidate positions for parking modules
   */
  private static generateCandidatePositions(
    polygonCoords: number[][],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    moduleDims: { width: number; depth: number },
    angle: number
  ): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];
    const step = 20; // 20-foot grid

    // Generate grid positions within bounds
    for (let x = bounds.minX; x <= bounds.maxX - moduleDims.width; x += step) {
      for (let y = bounds.minY; y <= bounds.maxY - moduleDims.depth; y += step) {
        // Check if position is within polygon
        if (this.isPointInPolygon([x, y], polygonCoords)) {
          positions.push({ x, y });
        }
      }
    }

    return positions;
  }

  /**
   * Create a parking module at given position
   */
  private static createParkingModule(
    position: { x: number; y: number },
    moduleDims: { width: number; depth: number },
    angle: number,
    params: ParkingParams,
    polygonCoords: number[][]
  ): ParkingModule | null {
    const { x, y } = position;
    const { width, depth } = moduleDims;
    const { stall, ada_pct } = params;

    const stalls: ParkingStall[] = [];
    const aisles: ParkingAisle[] = [];

    // Calculate number of stalls that fit
    const stallsPerRow = Math.floor(width / stall.width_ft);
    const rows = Math.floor(depth / (stall.depth_ft + stall.aisle_ft));

    if (stallsPerRow < 1 || rows < 1) {
      return null;
    }

    // Generate stalls
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < stallsPerRow; col++) {
        const stallX = x + col * stall.width_ft;
        const stallY = y + row * (stall.depth_ft + stall.aisle_ft);
        
        const isADA = Math.random() < ada_pct / 100;
        
        stalls.push({
          id: `stall_${x}_${y}_${row}_${col}`,
          x: stallX,
          y: stallY,
          width: stall.width_ft,
          depth: stall.depth_ft,
          angle,
          isADA,
          type: isADA ? 'ada' : 'standard'
        });
      }
    }

    // Generate aisles
    for (let row = 0; row < rows - 1; row++) {
      const aisleY = y + (row + 1) * (stall.depth_ft + stall.aisle_ft) - stall.aisle_ft / 2;
      
      aisles.push({
        id: `aisle_${x}_${y}_${row}`,
        coords: [
          [x, aisleY],
          [x + width, aisleY]
        ],
        width: stall.aisle_ft
      });
    }

    return {
      id: `module_${x}_${y}`,
      angle,
      stalls,
      aisles,
      bounds: { minX: x, minY: y, maxX: x + width, maxY: y + depth }
    };
  }

  /**
   * Check if module is valid (within polygon and no overlaps)
   */
  private static isModuleValid(
    module: ParkingModule,
    polygonCoords: number[][]
  ): boolean {
    // Check if all corners are within polygon
    const corners = [
      [module.bounds.minX, module.bounds.minY],
      [module.bounds.maxX, module.bounds.minY],
      [module.bounds.maxX, module.bounds.maxY],
      [module.bounds.minX, module.bounds.maxY]
    ];

    return corners.every(corner => this.isPointInPolygon(corner, polygonCoords));
  }

  /**
   * Calculate KPIs for parking layout
   */
  private static calculateKPIs(
    stalls: ParkingStall[],
    area: number,
    params: ParkingParams
  ): ParkingKPI {
    const stall_count = stalls.length;
    const ada_stalls = stalls.filter(s => s.isADA).length;
    const ratio = area > 0 ? stall_count / (area / 1000) : 0; // stalls per 1000 sq ft
    const efficiency = area > 0 ? (stall_count / area) * 1000 : 0;
    
    // Simple drive continuity penalty (can be enhanced)
    const drive_continuity_penalty = this.calculateDriveContinuityPenalty(stalls);

    return {
      stall_count,
      ratio,
      drive_continuity_penalty,
      ada_stalls,
      efficiency
    };
  }

  /**
   * Calculate drive continuity penalty
   */
  private static calculateDriveContinuityPenalty(stalls: ParkingStall[]): number {
    // Simple implementation - can be enhanced with actual drive path analysis
    const isolatedStalls = stalls.filter(stall => {
      // Check if stall has neighbors within reasonable distance
      const hasNeighbors = stalls.some(other => 
        other.id !== stall.id &&
        Math.abs(other.x - stall.x) < 20 &&
        Math.abs(other.y - stall.y) < 20
      );
      return !hasNeighbors;
    });

    return isolatedStalls.length / stalls.length;
  }

  /**
   * Create GeoJSON features from stalls and aisles
   */
  private static createGeoJSONFeatures(
    stalls: ParkingStall[],
    aisles: ParkingAisle[]
  ): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];

    // Add stall features
    stalls.forEach(stall => {
      const coords = this.createStallCoordinates(stall);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        },
        properties: {
          id: stall.id,
          type: 'parking_stall',
          stall_type: stall.type,
          is_ada: stall.isADA,
          angle: stall.angle
        }
      });
    });

    // Add aisle features
    aisles.forEach(aisle => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: aisle.coords
        },
        properties: {
          id: aisle.id,
          type: 'parking_aisle',
          width: aisle.width
        }
      });
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Create coordinates for a parking stall
   */
  private static createStallCoordinates(stall: ParkingStall): number[][] {
    const { x, y, width, depth, angle } = stall;
    
    if (angle === 0) {
      // Parallel parking - simple rectangle
      return [
        [x, y],
        [x + width, y],
        [x + width, y + depth],
        [x, y + depth],
        [x, y]
      ];
    }

    // Angled parking - rotated rectangle
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const corners = [
      [0, 0],
      [width, 0],
      [width, depth],
      [0, depth]
    ];

    return corners.map(([dx, dy]) => [
      x + dx * cos - dy * sin,
      y + dx * sin + dy * cos
    ]);
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
}

/**
 * Main function to generate parking layouts
 */
export function generateParking(
  buildableFeetPolygon: GeoJSON.Polygon,
  params: ParkingParams
): ParkingResult[] {
  return ParkingGenerator.generateParking(buildableFeetPolygon, params);
}