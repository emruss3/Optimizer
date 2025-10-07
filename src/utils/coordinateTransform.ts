/**
 * Centralized Coordinate Transformation Utilities
 * 
 * This module provides all coordinate transformation functions used across
 * the site planner components, consolidating scattered transformation logic
 * into a single, maintainable location.
 */

// Constants for coordinate transformations
export const COORDINATE_CONSTANTS = {
  FEET_PER_METER: 3.28084,
  METERS_PER_FOOT: 0.3048,
  DEFAULT_GRID_SIZE: 12,
  SVG_UNITS_PER_FOOT: 12, // 12 SVG units = 1 foot
} as const;

/**
 * Coordinate transformation utilities
 */
export class CoordinateTransform {
  /**
   * Convert meters to feet
   */
  static metersToFeet(meters: number): number {
    return meters * COORDINATE_CONSTANTS.FEET_PER_METER;
  }

  /**
   * Convert feet to meters
   */
  static feetToMeters(feet: number): number {
    return feet * COORDINATE_CONSTANTS.METERS_PER_FOOT;
  }

  /**
   * Convert SVG units to feet
   * @param svgCoord SVG coordinate value
   * @param gridSize Grid size (default: 12 SVG units per foot)
   */
  static svgToFeet(svgCoord: number, gridSize: number = COORDINATE_CONSTANTS.DEFAULT_GRID_SIZE): number {
    return svgCoord / gridSize;
  }

  /**
   * Convert feet to SVG units
   * @param feetCoord Feet coordinate value
   * @param gridSize Grid size (default: 12 SVG units per foot)
   */
  static feetToSVG(feetCoord: number, gridSize: number = COORDINATE_CONSTANTS.DEFAULT_GRID_SIZE): number {
    return feetCoord * gridSize;
  }

  /**
   * Convert Web Mercator meters to feet
   * @param meters Web Mercator coordinate in meters
   */
  static webMercatorMetersToFeet(meters: number): number {
    return this.metersToFeet(meters);
  }

  /**
   * Convert feet to Web Mercator meters
   * @param feet Feet coordinate value
   */
  static feetToWebMercatorMeters(feet: number): number {
    return this.feetToMeters(feet);
  }

  /**
   * Transform coordinate arrays from Web Mercator meters to feet
   * @param coords Array of [x, y] coordinates in Web Mercator meters
   */
  static webMercatorCoordsToFeet(coords: number[][]): number[][] {
    return coords.map(([x, y]) => [
      this.webMercatorMetersToFeet(x),
      this.webMercatorMetersToFeet(y)
    ]);
  }

  /**
   * Transform coordinate arrays from feet to Web Mercator meters
   * @param coords Array of [x, y] coordinates in feet
   */
  static feetCoordsToWebMercator(coords: number[][]): number[][] {
    return coords.map(([x, y]) => [
      this.feetToWebMercatorMeters(x),
      this.feetToWebMercatorMeters(y)
    ]);
  }

  /**
   * Transform coordinate arrays from SVG units to feet
   * @param coords Array of [x, y] coordinates in SVG units
   * @param gridSize Grid size (default: 12 SVG units per foot)
   */
  static svgCoordsToFeet(coords: number[][], gridSize: number = COORDINATE_CONSTANTS.DEFAULT_GRID_SIZE): number[][] {
    return coords.map(([x, y]) => [
      this.svgToFeet(x, gridSize),
      this.svgToFeet(y, gridSize)
    ]);
  }

  /**
   * Transform coordinate arrays from feet to SVG units
   * @param coords Array of [x, y] coordinates in feet
   * @param gridSize Grid size (default: 12 SVG units per foot)
   */
  static feetCoordsToSVG(coords: number[][], gridSize: number = COORDINATE_CONSTANTS.DEFAULT_GRID_SIZE): number[][] {
    return coords.map(([x, y]) => [
      this.feetToSVG(x, gridSize),
      this.feetToSVG(y, gridSize)
    ]);
  }

  /**
   * Calculate bounds from coordinate array
   * @param coords Array of [x, y] coordinates
   */
  static calculateBounds(coords: number[][]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    if (coords.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    const bounds = coords.reduce(
      (acc, [x, y]) => ({
        minX: Math.min(acc.minX, x),
        minY: Math.min(acc.minY, y),
        maxX: Math.max(acc.maxX, x),
        maxY: Math.max(acc.maxY, y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    return {
      ...bounds,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    };
  }

  /**
   * Normalize coordinates to start at (0, 0)
   * @param coords Array of [x, y] coordinates
   */
  static normalizeCoordinates(coords: number[][]): number[][] {
    if (coords.length === 0) return coords;
    
    const bounds = this.calculateBounds(coords);
    return coords.map(([x, y]) => [
      x - bounds.minX,
      y - bounds.minY
    ]);
  }

  /**
   * Calculate area of a polygon from coordinates
   * @param coords Array of [x, y] coordinates forming a closed polygon
   */
  static calculatePolygonArea(coords: number[][]): number {
    if (coords.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      area += coords[i][0] * coords[j][1];
      area -= coords[j][0] * coords[i][1];
    }
    return Math.abs(area) / 2;
  }

  /**
   * Calculate perimeter of a polygon from coordinates
   * @param coords Array of [x, y] coordinates forming a closed polygon
   */
  static calculatePolygonPerimeter(coords: number[][]): number {
    if (coords.length < 2) return 0;
    
    let perimeter = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      const dx = coords[j][0] - coords[i][0];
      const dy = coords[j][1] - coords[i][1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }

  /**
   * Snap coordinate to grid
   * @param coord Coordinate value
   * @param gridSize Grid size
   * @param enabled Whether snapping is enabled
   */
  static snapToGrid(coord: number, gridSize: number, enabled: boolean = true): number {
    if (!enabled) return coord;
    return Math.round(coord / gridSize) * gridSize;
  }

  /**
   * Snap coordinate array to grid
   * @param coords Array of [x, y] coordinates
   * @param gridSize Grid size
   * @param enabled Whether snapping is enabled
   */
  static snapCoordsToGrid(
    coords: number[][], 
    gridSize: number, 
    enabled: boolean = true
  ): number[][] {
    if (!enabled) return coords;
    return coords.map(([x, y]) => [
      this.snapToGrid(x, gridSize, enabled),
      this.snapToGrid(y, gridSize, enabled)
    ]);
  }
}

/**
 * Legacy function exports for backward compatibility
 * These maintain the same interface as the original functions
 */

/**
 * @deprecated Use CoordinateTransform.svgToFeet instead
 */
export const svgToFeet = (svgCoord: number, gridSize: number = COORDINATE_CONSTANTS.DEFAULT_GRID_SIZE): number => {
  return CoordinateTransform.svgToFeet(svgCoord, gridSize);
};

/**
 * @deprecated Use CoordinateTransform.feetToSVG instead
 */
export const feetToSVG = (feetCoord: number, gridSize: number = COORDINATE_CONSTANTS.DEFAULT_GRID_SIZE): number => {
  return CoordinateTransform.feetToSVG(feetCoord, gridSize);
};

/**
 * @deprecated Use CoordinateTransform.metersToFeet instead
 */
export const metersToFeet = (meters: number): number => {
  return CoordinateTransform.metersToFeet(meters);
};

/**
 * @deprecated Use CoordinateTransform.feetToMeters instead
 */
export const feetToMeters = (feet: number): number => {
  return CoordinateTransform.feetToMeters(feet);
};

/**
 * @deprecated Use CoordinateTransform.snapToGrid instead
 */
export const snapToGrid = (value: number, gridSize: number, enabled: boolean = true): number => {
  return CoordinateTransform.snapToGrid(value, gridSize, enabled);
};

/**
 * @deprecated Use CoordinateTransform.calculatePolygonArea instead
 */
export const calculatePolygonArea = (coords: number[][]): number => {
  return CoordinateTransform.calculatePolygonArea(coords);
};

/**
 * @deprecated Use CoordinateTransform.calculatePolygonPerimeter instead
 */
export const calculatePolygonPerimeter = (coords: number[][]): number => {
  return CoordinateTransform.calculatePolygonPerimeter(coords);
};

export default CoordinateTransform;
