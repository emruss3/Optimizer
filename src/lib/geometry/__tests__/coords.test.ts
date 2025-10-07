// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import * as turf from '@turf/turf';
import {
  projectTo3857,
  toFeetFromMeters,
  areaSqFt,
  lengthFt,
  toSvgSpace,
  fromSvgSpace,
  calculateBounds,
  validateGeometry,
  getGeometryType,
  createPoint,
  createPolygon,
  bufferGeometry
} from '../coords';

describe('Geometry Coordinate Utilities', () => {
  // Test data
  const testPoint = turf.point([-74.0059, 40.7128]); // NYC
  const testPolygon = turf.polygon([[
    [-74.0059, 40.7128],
    [-74.0049, 40.7128],
    [-74.0049, 40.7138],
    [-74.0059, 40.7138],
    [-74.0059, 40.7128]
  ]]);
  const testLineString = turf.lineString([
    [-74.0059, 40.7128],
    [-74.0049, 40.7128],
    [-74.0039, 40.7128]
  ]);

  describe('projectTo3857', () => {
    it('should project a point from WGS84 to Web Mercator', () => {
      const projected = projectTo3857(testPoint);
      
      expect(projected.type).toBe('Feature');
      expect((projected as any).geometry.type).toBe('Point');
      
      const coords = (projected as any).geometry.coordinates;
      expect(coords[0]).toBeCloseTo(-8238299.0, 0);
      expect(coords[1]).toBeCloseTo(4970071.579142423, 1);
    });

    it('should project a polygon from WGS84 to Web Mercator', () => {
      const projected = projectTo3857(testPolygon);
      
      expect(projected.type).toBe('Feature');
      expect((projected as any).geometry.type).toBe('Polygon');
      
      const coords = (projected as any).geometry.coordinates;
      expect(Array.isArray(coords)).toBe(true);
      expect(coords[0]).toHaveLength(5); // 5 points for closed polygon
    });

    it('should project a FeatureCollection', () => {
      const fc = turf.featureCollection([testPoint, testPolygon] as any);
      const projected = projectTo3857(fc);
      
      expect(projected.type).toBe('FeatureCollection');
      expect((projected as any).features).toHaveLength(2);
    });

    it('should handle invalid input', () => {
      expect(() => projectTo3857(null as any)).toThrow();
      expect(() => projectTo3857(undefined as any)).toThrow();
      expect(() => projectTo3857({} as any)).toThrow();
    });
  });

  describe('toFeetFromMeters', () => {
    it('should convert meters to feet correctly', () => {
      expect(toFeetFromMeters(1)).toBeCloseTo(3.28084, 5);
      expect(toFeetFromMeters(0)).toBe(0);
      expect(toFeetFromMeters(100)).toBeCloseTo(328.084, 3);
    });

    it('should handle negative values', () => {
      expect(toFeetFromMeters(-1)).toBeCloseTo(-3.28084, 5);
    });

    it('should handle decimal values', () => {
      expect(toFeetFromMeters(0.3048)).toBeCloseTo(1, 5);
    });
  });

  describe('areaSqFt', () => {
    it('should calculate area for a projected polygon', () => {
      const projected = projectTo3857(testPolygon);
      const area = areaSqFt(projected);
      
      expect(area).toBeGreaterThan(0);
      expect(typeof area).toBe('number');
    });

    it('should handle point geometry', () => {
      const projected = projectTo3857(testPoint);
      const area = areaSqFt(projected);
      
      expect(area).toBe(0);
    });

    it('should handle line string geometry', () => {
      const projected = projectTo3857(testLineString);
      const area = areaSqFt(projected);
      
      expect(area).toBe(0);
    });

    it('should throw error for invalid input', () => {
      expect(() => areaSqFt(null as any)).toThrow();
      expect(() => areaSqFt(undefined as any)).toThrow();
    });
  });

  describe('lengthFt', () => {
    it('should calculate length for a projected line string', () => {
      const projected = projectTo3857(testLineString);
      const length = lengthFt(projected);
      
      expect(length).toBeGreaterThan(0);
      expect(typeof length).toBe('number');
    });

    it('should handle polygon geometry', () => {
      const projected = projectTo3857(testPolygon);
      const length = lengthFt(projected);
      
      expect(length).toBeGreaterThan(0);
    });

    it('should handle point geometry', () => {
      const projected = projectTo3857(testPoint);
      const length = lengthFt(projected);
      
      expect(length).toBe(0);
    });

    it('should throw error for invalid input', () => {
      expect(() => lengthFt(null as any)).toThrow();
      expect(() => lengthFt(undefined as any)).toThrow();
    });
  });

  describe('toSvgSpace', () => {
    const viewBox = { origin: [-8242816, 4966144] as [number, number], scale: 0.001 };

    it('should convert projected geometry to SVG paths', () => {
      const projected = projectTo3857(testPolygon);
      const result = toSvgSpace(projected, viewBox);
      
      expect(result).toHaveProperty('paths');
      expect(result).toHaveProperty('bounds');
      expect(Array.isArray(result.paths)).toBe(true);
      expect(result.bounds).toHaveLength(4);
    });

    it('should generate correct SVG paths for polygon', () => {
      const projected = projectTo3857(testPolygon);
      const result = toSvgSpace(projected, viewBox);
      
      expect(result.paths.length).toBeGreaterThan(0);
      expect(result.paths[0]).toMatch(/^M\s+[\d.-]+\s+[\d.-]+/);
    });

    it('should handle point geometry', () => {
      const projected = projectTo3857(testPoint);
      const result = toSvgSpace(projected, viewBox);
      
      expect(result.paths.length).toBe(1);
      expect(result.paths[0]).toMatch(/^M\s+[\d.-]+\s+[\d.-]+$/);
    });

    it('should throw error for invalid input', () => {
      expect(() => toSvgSpace(null as any, viewBox)).toThrow();
      expect(() => toSvgSpace(testPolygon, null as any)).toThrow();
    });
  });

  describe('fromSvgSpace', () => {
    const viewBox = { origin: [-8242816, 4966144] as [number, number], scale: 0.001 };

    it('should convert SVG coordinates back to Web Mercator', () => {
      const [x, y] = fromSvgSpace(100, 200, viewBox);
      
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
    });

    it('should be inverse of toSvgSpace for points', () => {
      const projected = projectTo3857(testPoint);
      const coords = (projected as any).geometry.coordinates;
      const [originalX, originalY] = coords;
      
      const svgResult = toSvgSpace(projected, viewBox);
      const svgCoords = svgResult.paths[0].match(/M\s+([\d.-]+)\s+([\d.-]+)/);
      
      if (svgCoords) {
        const svgX = parseFloat(svgCoords[1]);
        const svgY = parseFloat(svgCoords[2]);
        const [backX, backY] = fromSvgSpace(svgX, svgY, viewBox);
        
        expect(backX).toBeCloseTo(originalX, 1);
        expect(backY).toBeCloseTo(originalY, 1);
      }
    });
  });

  describe('calculateBounds', () => {
    it('should calculate bounds for a polygon', () => {
      const projected = projectTo3857(testPolygon);
      const bounds = calculateBounds(projected);
      
      expect(bounds).toHaveLength(4);
      expect(bounds[0]).toBeLessThan(bounds[2]); // minX < maxX
      expect(bounds[1]).toBeLessThan(bounds[3]); // minY < maxY
    });

    it('should handle point geometry', () => {
      const projected = projectTo3857(testPoint);
      const bounds = calculateBounds(projected);
      
      expect(bounds[0]).toBe(bounds[2]); // minX = maxX
      expect(bounds[1]).toBe(bounds[3]); // minY = maxY
    });
  });

  describe('validateGeometry', () => {
    it('should validate correct geometry', () => {
      expect(validateGeometry(testPoint)).toBe(true);
      expect(validateGeometry(testPolygon)).toBe(true);
      expect(validateGeometry(testLineString)).toBe(true);
    });

    it('should reject invalid geometry', () => {
      const invalidGeom = { type: 'InvalidType', coordinates: [0, 0] }; // Invalid geometry type
      expect(validateGeometry(invalidGeom as any)).toBe(false);
    });
  });

  describe('getGeometryType', () => {
    it('should return correct geometry type', () => {
      expect(getGeometryType(testPoint)).toBe('Point');
      expect(getGeometryType(testPolygon)).toBe('Polygon');
      expect(getGeometryType(testLineString)).toBe('LineString');
    });

    it('should handle FeatureCollection', () => {
      const fc = turf.featureCollection([testPoint, testPolygon] as any);
      expect(getGeometryType(fc)).toBe('Point'); // First feature's type
    });
  });

  describe('createPoint', () => {
    it('should create a point feature', () => {
      const point = createPoint(-74.0059, 40.7128);
      
      expect(point.type).toBe('Feature');
      expect(point.geometry.type).toBe('Point');
      expect(point.geometry.coordinates).toEqual([-74.0059, 40.7128]);
    });
  });

  describe('createPolygon', () => {
    it('should create a polygon feature', () => {
      const coords = [[
        [-74.0059, 40.7128],
        [-74.0049, 40.7128],
        [-74.0049, 40.7138],
        [-74.0059, 40.7138],
        [-74.0059, 40.7128]
      ]];
      const polygon = createPolygon(coords);
      
      expect(polygon.type).toBe('Feature');
      expect(polygon.geometry.type).toBe('Polygon');
      expect(polygon.geometry.coordinates).toEqual(coords);
    });
  });

  describe('bufferGeometry', () => {
    it('should buffer a point geometry', () => {
      const buffered = bufferGeometry(testPoint, 100); // 100 feet buffer
      
      expect(buffered.type).toBe('Feature');
      expect((buffered as any).geometry.type).toBe('Polygon');
    });

    it('should buffer a polygon geometry', () => {
      const buffered = bufferGeometry(testPolygon, 50); // 50 feet buffer
      
      expect(buffered.type).toBe('Feature');
      expect((buffered as any).geometry.type).toBe('Polygon');
    });
  });

  describe('Integration Tests', () => {
    it('should work together for a complete workflow', () => {
      // Create a polygon
      const polygon = createPolygon([[
        [-74.0059, 40.7128],
        [-74.0049, 40.7128],
        [-74.0049, 40.7138],
        [-74.0059, 40.7138],
        [-74.0059, 40.7128]
      ]]);
      
      // Validate geometry
      expect(validateGeometry(polygon)).toBe(true);
      
      // Project to Web Mercator
      const projected = projectTo3857(polygon);
      expect(projected.type).toBe('Feature');
      
      // Calculate area
      const area = areaSqFt(projected);
      expect(area).toBeGreaterThan(0);
      
      // Calculate length
      const length = lengthFt(projected);
      expect(length).toBeGreaterThan(0);
      
      // Calculate bounds
      const bounds = calculateBounds(projected);
      expect(bounds).toHaveLength(4);
      
      // Convert to SVG space
      const viewBox = { origin: [bounds[0], bounds[1]] as [number, number], scale: 0.001 };
      const svgResult = toSvgSpace(projected, viewBox);
      expect(svgResult.paths.length).toBeGreaterThan(0);
      expect(svgResult.bounds).toHaveLength(4);
    });
  });
});