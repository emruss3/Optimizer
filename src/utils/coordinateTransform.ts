// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import proj4 from 'proj4';
import * as turf from '@turf/turf';

// Define coordinate systems
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

// Constants
export const FEET_PER_METER = 3.28084;
export const METERS_PER_FOOT = 0.3048;
export const DEFAULT_GRID_SIZE = 12;

// Types
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CoordinateSystem {
  type: 'webmercator' | 'wgs84' | 'svg' | 'feet';
  units: 'meters' | 'degrees' | 'pixels' | 'feet';
}

/**
 * Centralized coordinate transformation utilities
 * Consolidates all CRS/units logic from across the codebase
 */
export class CoordinateTransform {
  // Constants
  static readonly FEET_PER_METER = FEET_PER_METER;
  static readonly METERS_PER_FOOT = METERS_PER_FOOT;
  static readonly DEFAULT_GRID_SIZE = DEFAULT_GRID_SIZE;

  // =====================================================
  // UNIT CONVERSIONS
  // =====================================================

  /**
   * Convert meters to feet
   */
  static metersToFeet(meters: number): number {
    return meters * this.FEET_PER_METER;
  }

  /**
   * Convert feet to meters
   */
  static feetToMeters(feet: number): number {
    return feet * this.METERS_PER_FOOT;
  }

  /**
   * Convert square meters to square feet
   */
  static squareMetersToSquareFeet(sqMeters: number): number {
    return sqMeters * (this.FEET_PER_METER ** 2);
  }

  /**
   * Convert square feet to square meters
   */
  static squareFeetToSquareMeters(sqFeet: number): number {
    return sqFeet * (this.METERS_PER_FOOT ** 2);
  }

  // =====================================================
  // COORDINATE SYSTEM TRANSFORMATIONS
  // =====================================================

  /**
   * Project GeoJSON geometry from WGS84 (EPSG:4326) to Web Mercator (EPSG:3857)
   */
  static projectTo3857(geom: any): any {
    if (!geom || !geom.type) {
      throw new Error('Invalid GeoJSON geometry provided');
    }

    // Handle different geometry types
    if (geom.type === 'Feature') {
      return turf.feature(this.projectTo3857(geom.geometry), geom.properties);
    }

    if (geom.type === 'FeatureCollection') {
      return turf.featureCollection(
        (geom as any).features.map((feature: any) => 
          this.projectTo3857(feature)
        )
      );
    }

    // Project coordinates based on geometry type
    const projectCoords = (coords: any): any => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          // Single coordinate pair [lng, lat]
          const [lng, lat] = coords;
          const [x, y] = proj4('EPSG:4326', 'EPSG:3857', [lng, lat]);
          return [x, y];
        } else {
          // Array of coordinates
          return coords.map(projectCoords);
        }
      }
      return coords;
    };

    const projectedGeom = {
      ...geom,
      coordinates: projectCoords((geom as any).coordinates)
    };

    return projectedGeom;
  }

  /**
   * Project GeoJSON geometry from Web Mercator (EPSG:3857) to WGS84 (EPSG:4326)
   */
  static projectTo4326(geom: any): any {
    if (!geom || !geom.type) {
      throw new Error('Invalid GeoJSON geometry provided');
    }

    // Handle different geometry types
    if (geom.type === 'Feature') {
      return turf.feature(this.projectTo4326(geom.geometry), geom.properties);
    }

    if (geom.type === 'FeatureCollection') {
      return turf.featureCollection(
        (geom as any).features.map((feature: any) => 
          this.projectTo4326(feature)
        )
      );
    }

    // Project coordinates based on geometry type
    const projectCoords = (coords: any): any => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          // Single coordinate pair [x, y]
          const [x, y] = coords;
          const [lng, lat] = proj4('EPSG:3857', 'EPSG:4326', [x, y]);
          return [lng, lat];
        } else {
          // Array of coordinates
          return coords.map(projectCoords);
        }
      }
      return coords;
    };

    const projectedGeom = {
      ...geom,
      coordinates: projectCoords((geom as any).coordinates)
    };

    return projectedGeom;
  }

  // =====================================================
  // WEB MERCATOR TO FEET CONVERSIONS
  // =====================================================

  /**
   * Convert Web Mercator coordinates (meters) to feet
   */
  static webMercatorToFeet(coords: number[][]): number[][] {
    return coords.map(coord => [
      this.metersToFeet(coord[0]),
      this.metersToFeet(coord[1])
    ]);
  }

  /**
   * Convert feet coordinates to Web Mercator (meters)
   */
  static feetToWebMercator(coords: number[][]): number[][] {
    return coords.map(coord => [
      this.feetToMeters(coord[0]),
      this.feetToMeters(coord[1])
    ]);
  }

  // =====================================================
  // SVG COORDINATE TRANSFORMATIONS
  // =====================================================

  /**
   * Convert SVG coordinate to feet
   */
  static svgToFeet(svgCoord: number, gridSize: number = this.DEFAULT_GRID_SIZE): number {
    return svgCoord / gridSize;
  }

  /**
   * Convert feet coordinate to SVG
   */
  static feetToSVG(feetCoord: number, gridSize: number = this.DEFAULT_GRID_SIZE): number {
    return feetCoord * gridSize;
  }

  /**
   * Convert SVG coordinates array to feet
   */
  static svgCoordsToFeet(coords: number[][], gridSize: number = this.DEFAULT_GRID_SIZE): number[][] {
    return coords.map(coord => [
      this.svgToFeet(coord[0], gridSize),
      this.svgToFeet(coord[1], gridSize)
    ]);
  }

  /**
   * Convert feet coordinates array to SVG
   */
  static feetCoordsToSVG(coords: number[][], gridSize: number = this.DEFAULT_GRID_SIZE): number[][] {
    return coords.map(coord => [
      this.feetToSVG(coord[0], gridSize),
      this.feetToSVG(coord[1], gridSize)
    ]);
  }

  // =====================================================
  // BOUNDING BOX OPERATIONS
  // =====================================================

  /**
   * Calculate bounding box from coordinates
   */
  static calculateBounds(coords: number[][]): Bounds {
    return coords.reduce(
      (acc, coord) => ({
        minX: Math.min(acc.minX, coord[0]),
        minY: Math.min(acc.minY, coord[1]),
        maxX: Math.max(acc.maxX, coord[0]),
        maxY: Math.max(acc.maxY, coord[1])
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
  }

  /**
   * Transform bounding box between coordinate systems
   */
  static transformBounds(bounds: Bounds, fromSystem: 'webmercator' | 'feet' | 'svg', toSystem: 'feet' | 'svg', gridSize: number = this.DEFAULT_GRID_SIZE): Bounds {
    if (fromSystem === toSystem) return bounds;

    switch (`${fromSystem}-${toSystem}`) {
      case 'webmercator-feet':
        return {
          minX: this.metersToFeet(bounds.minX),
          minY: this.metersToFeet(bounds.minY),
          maxX: this.metersToFeet(bounds.maxX),
          maxY: this.metersToFeet(bounds.maxY)
        };
      
      case 'feet-svg':
        return {
          minX: this.feetToSVG(bounds.minX, gridSize),
          minY: this.feetToSVG(bounds.minY, gridSize),
          maxX: this.feetToSVG(bounds.maxX, gridSize),
          maxY: this.feetToSVG(bounds.maxY, gridSize)
        };
      
      case 'svg-feet':
        return {
          minX: this.svgToFeet(bounds.minX, gridSize),
          minY: this.svgToFeet(bounds.minY, gridSize),
          maxX: this.svgToFeet(bounds.maxX, gridSize),
          maxY: this.svgToFeet(bounds.maxY, gridSize)
        };
      
      default:
        throw new Error(`Unsupported coordinate system transformation: ${fromSystem} to ${toSystem}`);
    }
  }

  /**
   * Normalize coordinates to start at (0,0)
   */
  static normalizeCoordinates(coords: number[][], bounds?: Bounds): { coords: number[][], bounds: Bounds } {
    const calculatedBounds = bounds || this.calculateBounds(coords);
    
    const normalizedCoords = coords.map(coord => [
      coord[0] - calculatedBounds.minX,
      coord[1] - calculatedBounds.minY
    ]);

    return {
      coords: normalizedCoords,
      bounds: calculatedBounds
    };
  }

  // =====================================================
  // GRID SNAPPING UTILITIES
  // =====================================================

  /**
   * Snap coordinate to grid
   */
  static snapToGrid(coord: number, gridSize: number = this.DEFAULT_GRID_SIZE): number {
    return Math.round(coord / gridSize) * gridSize;
  }

  /**
   * Snap coordinates array to grid
   */
  static snapCoordsToGrid(coords: number[][], gridSize: number = this.DEFAULT_GRID_SIZE): number[][] {
    return coords.map(coord => [
      this.snapToGrid(coord[0], gridSize),
      this.snapToGrid(coord[1], gridSize)
    ]);
  }

  // =====================================================
  // GEOMETRY CALCULATIONS
  // =====================================================

  /**
   * Calculate polygon area in square feet
   */
  static calculatePolygonArea(coords: number[][], fromSystem: 'webmercator' | 'feet' | 'svg' = 'feet', gridSize: number = this.DEFAULT_GRID_SIZE): number {
    let coordsInFeet: number[][];

    switch (fromSystem) {
      case 'webmercator':
        coordsInFeet = this.webMercatorToFeet(coords);
        break;
      case 'svg':
        coordsInFeet = this.svgCoordsToFeet(coords, gridSize);
        break;
      case 'feet':
      default:
        coordsInFeet = coords;
        break;
    }

    // Use shoelace formula for polygon area
    let area = 0;
    for (let i = 0; i < coordsInFeet.length; i++) {
      const j = (i + 1) % coordsInFeet.length;
      area += coordsInFeet[i][0] * coordsInFeet[j][1];
      area -= coordsInFeet[j][0] * coordsInFeet[i][1];
    }
    return Math.abs(area) / 2;
  }

  /**
   * Calculate polygon perimeter in feet
   */
  static calculatePolygonPerimeter(coords: number[][], fromSystem: 'webmercator' | 'feet' | 'svg' = 'feet', gridSize: number = this.DEFAULT_GRID_SIZE): number {
    let coordsInFeet: number[][];

    switch (fromSystem) {
      case 'webmercator':
        coordsInFeet = this.webMercatorToFeet(coords);
        break;
      case 'svg':
        coordsInFeet = this.svgCoordsToFeet(coords, gridSize);
        break;
      case 'feet':
      default:
        coordsInFeet = coords;
        break;
    }

    let perimeter = 0;
    for (let i = 0; i < coordsInFeet.length; i++) {
      const j = (i + 1) % coordsInFeet.length;
      const dx = coordsInFeet[j][0] - coordsInFeet[i][0];
      const dy = coordsInFeet[j][1] - coordsInFeet[i][1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }

  // =====================================================
  // BATCH TRANSFORMATIONS
  // =====================================================

  /**
   * Transform coordinates between systems
   */
  static transformCoordinates(
    coords: number[][], 
    fromSystem: 'webmercator' | 'wgs84' | 'svg' | 'feet', 
    toSystem: 'webmercator' | 'wgs84' | 'svg' | 'feet',
    gridSize: number = this.DEFAULT_GRID_SIZE
  ): number[][] {
    if (fromSystem === toSystem) return coords;

    // Convert to feet as intermediate system
    let coordsInFeet: number[][];
    
    switch (fromSystem) {
      case 'webmercator':
        coordsInFeet = this.webMercatorToFeet(coords);
        break;
      case 'wgs84':
        // First project to web mercator, then to feet
        const projected = coords.map(coord => proj4('EPSG:4326', 'EPSG:3857', coord));
        coordsInFeet = this.webMercatorToFeet(projected);
        break;
      case 'svg':
        coordsInFeet = this.svgCoordsToFeet(coords, gridSize);
        break;
      case 'feet':
      default:
        coordsInFeet = coords;
        break;
    }

    // Convert from feet to target system
    switch (toSystem) {
      case 'webmercator':
        return this.feetToWebMercator(coordsInFeet);
      case 'wgs84':
        const webMercator = this.feetToWebMercator(coordsInFeet);
        return webMercator.map(coord => proj4('EPSG:3857', 'EPSG:4326', coord));
      case 'svg':
        return this.feetCoordsToSVG(coordsInFeet, gridSize);
      case 'feet':
      default:
        return coordsInFeet;
    }
  }
}

// =====================================================
// LEGACY FUNCTION EXPORTS (for backward compatibility)
// =====================================================

/**
 * @deprecated Use CoordinateTransform.metersToFeet instead
 */
export const toFeetFromMeters = CoordinateTransform.metersToFeet;

/**
 * @deprecated Use CoordinateTransform.feetToMeters instead
 */
export const toMetersFromFeet = CoordinateTransform.feetToMeters;

/**
 * @deprecated Use CoordinateTransform.projectTo3857 instead
 */
export const projectTo3857 = CoordinateTransform.projectTo3857;

/**
 * @deprecated Use CoordinateTransform.projectTo4326 instead
 */
export const projectTo4326 = CoordinateTransform.projectTo4326;

/**
 * @deprecated Use CoordinateTransform.svgToFeet instead
 */
export const svgToFeet = CoordinateTransform.svgToFeet;

/**
 * @deprecated Use CoordinateTransform.feetToSVG instead
 */
export const feetToSVG = CoordinateTransform.feetToSVG;

// Constants are already exported at the top of the file