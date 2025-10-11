// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { GeoJSON } from '../types/parcel';

// Standardized conversion constants
export const SVG_PER_FOOT = 12;
export const FEET_PER_SVG = 1 / SVG_PER_FOOT;
export const METERS_PER_FOOT = 0.3048;
export const FEET_PER_METER = 3.28084;

/**
 * Coordinate transformation utilities for deterministic engines
 * All functions work with standardized units to avoid magic numbers
 */
export class CoordinateTransform {
  /**
   * Convert Web Mercator (EPSG:3857) geometry to feet
   * @param geom3857 Geometry in Web Mercator projection (meters)
   * @returns Geometry with coordinates in feet
   */
  static toFeet(geom3857: GeoJSON.Geometry): GeoJSON.Geometry {
    if (!geom3857 || !geom3857.coordinates) {
      return geom3857;
    }

    const transformCoordinates = (coords: any): any => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          // Single coordinate pair [x, y]
          return [coords[0] * FEET_PER_METER, coords[1] * FEET_PER_METER];
        } else {
          // Array of coordinate pairs or nested arrays
          return coords.map(transformCoordinates);
        }
      }
      return coords;
    };

    return {
      ...geom3857,
      coordinates: transformCoordinates(geom3857.coordinates)
    };
  }

  /**
   * Convert feet geometry to SVG units
   * @param feetGeom Geometry with coordinates in feet
   * @returns Geometry with coordinates in SVG units
   */
  static toSVG(feetGeom: GeoJSON.Geometry): GeoJSON.Geometry {
    if (!feetGeom || !feetGeom.coordinates) {
      return feetGeom;
    }

    const transformCoordinates = (coords: any): any => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          // Single coordinate pair [x, y]
          return [coords[0] * SVG_PER_FOOT, coords[1] * SVG_PER_FOOT];
        } else {
          // Array of coordinate pairs or nested arrays
          return coords.map(transformCoordinates);
        }
      }
      return coords;
    };

    return {
      ...feetGeom,
      coordinates: transformCoordinates(feetGeom.coordinates)
    };
  }

  /**
   * Convert SVG geometry to Web Mercator (EPSG:3857)
   * @param svgGeom Geometry with coordinates in SVG units
   * @returns Geometry with coordinates in Web Mercator meters
   */
  static to3857(svgGeom: GeoJSON.Geometry): GeoJSON.Geometry {
    if (!svgGeom || !svgGeom.coordinates) {
      return svgGeom;
    }

    const transformCoordinates = (coords: any): any => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          // Single coordinate pair [x, y]
          return [coords[0] * FEET_PER_SVG * METERS_PER_FOOT, coords[1] * FEET_PER_SVG * METERS_PER_FOOT];
        } else {
          // Array of coordinate pairs or nested arrays
          return coords.map(transformCoordinates);
        }
      }
      return coords;
    };

    return {
      ...svgGeom,
      coordinates: transformCoordinates(svgGeom.coordinates)
    };
  }

  /**
   * Convert Web Mercator coordinates to feet
   * @param coords Array of [x, y] coordinate pairs in meters
   * @returns Array of [x, y] coordinate pairs in feet
   */
  static webMercatorToFeet(coords: number[][]): number[][] {
    return coords.map(([x, y]) => [x * FEET_PER_METER, y * FEET_PER_METER]);
  }

  /**
   * Convert feet coordinates to SVG units
   * @param coords Array of [x, y] coordinate pairs in feet
   * @returns Array of [x, y] coordinate pairs in SVG units
   */
  static feetToSVG(coords: number[][]): number[][] {
    return coords.map(([x, y]) => [x * SVG_PER_FOOT, y * SVG_PER_FOOT]);
  }

  /**
   * Convert SVG coordinates to feet
   * @param coords Array of [x, y] coordinate pairs in SVG units
   * @returns Array of [x, y] coordinate pairs in feet
   */
  static svgToFeet(coords: number[][]): number[][] {
    return coords.map(([x, y]) => [x * FEET_PER_SVG, y * FEET_PER_SVG]);
  }

  /**
   * Calculate bounds from coordinate array
   * @param coords Array of [x, y] coordinate pairs
   * @returns Bounding box object
   */
  static calculateBounds(coords: number[][]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    if (coords.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return coords.reduce(
      (acc, [x, y]) => ({
        minX: Math.min(acc.minX, x),
        minY: Math.min(acc.minY, y),
        maxX: Math.max(acc.maxX, x),
        maxY: Math.max(acc.maxY, y)
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
  }

  /**
   * Normalize coordinates to start at (0,0)
   * @param coords Array of [x, y] coordinate pairs
   * @param bounds Optional bounds object (will be calculated if not provided)
   * @returns Object with normalized coordinates and bounds
   */
  static normalizeCoordinates(
    coords: number[][],
    bounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): {
    coords: number[][];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  } {
    const calculatedBounds = bounds || this.calculateBounds(coords);
    
    const normalizedCoords = coords.map(([x, y]) => [
      x - calculatedBounds.minX,
      y - calculatedBounds.minY
    ]);

    return {
      coords: normalizedCoords,
      bounds: {
        minX: 0,
        minY: 0,
        maxX: calculatedBounds.maxX - calculatedBounds.minX,
        maxY: calculatedBounds.maxY - calculatedBounds.minY
      }
    };
  }

  /**
   * Calculate polygon perimeter
   * @param coords Array of [x, y] coordinate pairs
   * @param unit Unit of measurement ('feet', 'meters', 'svg')
   * @returns Perimeter in specified units
   */
  static calculatePolygonPerimeter(coords: number[][], unit: 'feet' | 'meters' | 'svg' = 'feet'): number {
    if (coords.length < 3) return 0;

    let perimeter = 0;
    for (let i = 0; i < coords.length; i++) {
      const current = coords[i];
      const next = coords[(i + 1) % coords.length];
      
      const dx = next[0] - current[0];
      const dy = next[1] - current[1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    // Convert to appropriate units
    switch (unit) {
      case 'meters':
        return perimeter * METERS_PER_FOOT;
      case 'svg':
        return perimeter * SVG_PER_FOOT;
      case 'feet':
      default:
        return perimeter;
    }
  }

  /**
   * Calculate polygon area using shoelace formula
   * @param coords Array of [x, y] coordinate pairs
   * @param unit Unit of measurement ('feet', 'meters', 'svg')
   * @returns Area in specified units squared
   */
  static calculatePolygonArea(coords: number[][], unit: 'feet' | 'meters' | 'svg' = 'feet'): number {
    if (coords.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const current = coords[i];
      const next = coords[(i + 1) % coords.length];
      area += current[0] * next[1] - next[0] * current[1];
    }
    area = Math.abs(area) / 2;

    // Convert to appropriate units
    switch (unit) {
      case 'meters':
        return area * METERS_PER_FOOT * METERS_PER_FOOT;
      case 'svg':
        return area * SVG_PER_FOOT * SVG_PER_FOOT;
      case 'feet':
      default:
        return area;
    }
  }

  /**
   * Convert meters to feet
   * @param meters Value in meters
   * @returns Value in feet
   */
  static metersToFeet(meters: number): number {
    return meters * FEET_PER_METER;
  }

  /**
   * Convert feet to meters
   * @param feet Value in feet
   * @returns Value in meters
   */
  static feetToMeters(feet: number): number {
    return feet * METERS_PER_FOOT;
  }

  /**
   * Convert feet to SVG units
   * @param feet Value in feet
   * @returns Value in SVG units
   */
  static feetToSVGUnits(feet: number): number {
    return feet * SVG_PER_FOOT;
  }

  /**
   * Convert SVG units to feet
   * @param svgUnits Value in SVG units
   * @returns Value in feet
   */
  static svgUnitsToFeet(svgUnits: number): number {
    return svgUnits * FEET_PER_SVG;
  }
}

// Export convenience functions for backward compatibility
export const {
  toFeet,
  toSVG,
  to3857,
  webMercatorToFeet,
  feetToSVG,
  svgToFeet,
  calculateBounds,
  normalizeCoordinates,
  calculatePolygonPerimeter,
  calculatePolygonArea,
  metersToFeet,
  feetToMeters,
  feetToSVGUnits,
  svgUnitsToFeet
} = CoordinateTransform;