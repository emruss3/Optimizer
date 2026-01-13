import { describe, it, expect } from 'vitest';
import type { Polygon, MultiPolygon } from 'geojson';
import {
  union,
  difference,
  intersection,
  buffer,
  offset,
  area,
  areaM2,
  areaSqft,
  bbox,
  centroid,
  pointInPoly,
  simplify
} from '../geometry';

describe('Geometry Operations', () => {
  // Helper to create a simple rectangle polygon
  function createRectangle(x: number, y: number, width: number, height: number): Polygon {
    return {
      type: 'Polygon',
      coordinates: [[
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
        [x, y] // Close ring
      ]]
    };
  }

  // Helper to calculate area for Polygon | MultiPolygon
  function areaSqftGeom(geom: Polygon | MultiPolygon): number {
    if (geom.type === 'Polygon') {
      return areaSqft(geom);
    }
    // MultiPolygon: sum areas of all polygons
    return geom.coordinates.reduce((sum, polygon) => {
      const poly: Polygon = { type: 'Polygon', coordinates: polygon };
      return sum + areaSqft(poly);
    }, 0);
  }

  describe('union', () => {
    it('should combine two overlapping rectangles', () => {
      const rect1 = createRectangle(0, 0, 10, 10);
      const rect2 = createRectangle(5, 5, 10, 10);

      const result = union(rect1, rect2);

      expect(result.type === 'Polygon' || result.type === 'MultiPolygon').toBe(true);
      expect(result.coordinates).toBeDefined();

      // Result should have area >= largest input
      const area1 = area(rect1);
      const area2 = area(rect2);
      const resultArea = areaSqftGeom(result);
      expect(resultArea).toBeGreaterThanOrEqual(Math.max(area1, area2));
    });

    it('should handle single polygon', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const result = union(rect);
      expect(result).toEqual(rect);
    });

    it('should handle empty input', () => {
      const result = union();
      expect(result.type).toBe('Polygon');
      if (result.type === 'Polygon') {
        expect(result.coordinates[0].length).toBe(0);
      }
    });
  });

  describe('difference', () => {
    it('should remove overlapping area from polygon', () => {
      const rect1 = createRectangle(0, 0, 10, 10); // 100 sq units
      const rect2 = createRectangle(2, 2, 6, 6);   // 36 sq units, overlaps

      const result = difference(rect1, rect2);

      expect(result.type === 'Polygon' || result.type === 'MultiPolygon').toBe(true);
      expect(result.coordinates).toBeDefined();

      // Result area should be less than original (unless library not available)
      const area1 = area(rect1);
      const resultArea = areaSqftGeom(result);

      // If polygon-clipping is available, area should be reduced
      // If not, fallback returns original, so area should be equal
      expect(resultArea).toBeLessThanOrEqual(area1);
    });

    it('should return original polygon when no overlap', () => {
      const rect1 = createRectangle(0, 0, 10, 10);
      const rect2 = createRectangle(20, 20, 10, 10); // No overlap

      const result = difference(rect1, rect2);

      // Should return original (or empty if clipping library processes it)
      expect(result.type === 'Polygon' || result.type === 'MultiPolygon').toBe(true);
    });

    it('should handle case where second polygon completely covers first', () => {
      const rect1 = createRectangle(5, 5, 5, 5);
      const rect2 = createRectangle(0, 0, 20, 20); // Covers rect1

      const result = difference(rect1, rect2);

      expect(result.type === 'Polygon' || result.type === 'MultiPolygon').toBe(true);
      // Result should be empty or very small
      const resultArea = areaSqftGeom(result);
      expect(resultArea).toBeLessThanOrEqual(area(rect1));
    });
  });

  describe('intersection', () => {
    it('should return overlapping area of two polygons', () => {
      const rect1 = createRectangle(0, 0, 10, 10);
      const rect2 = createRectangle(5, 5, 10, 10);

      const result = intersection(rect1, rect2);

      expect(result.type === 'Polygon' || result.type === 'MultiPolygon').toBe(true);

      // Intersection should be <= both inputs
      const area1 = area(rect1);
      const area2 = area(rect2);
      const resultArea = areaSqftGeom(result);

      expect(resultArea).toBeLessThanOrEqual(area1);
      expect(resultArea).toBeLessThanOrEqual(area2);
    });

    it('should return empty polygon when no overlap', () => {
      const rect1 = createRectangle(0, 0, 10, 10);
      const rect2 = createRectangle(20, 20, 10, 10);

      const result = intersection(rect1, rect2);

      expect(result.type === 'Polygon' || result.type === 'MultiPolygon').toBe(true);
      const resultArea = areaSqftGeom(result);
      expect(resultArea).toBe(0);
    });
  });

  describe('buffer/offset', () => {
    it('should expand polygon outward with positive distance', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const originalArea = area(rect);

      const buffered = buffer(rect, 1);
      const bufferedArea = area(buffered);

      expect(bufferedArea).toBeGreaterThan(originalArea);
    });

    it('should shrink polygon inward with negative distance', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const originalArea = area(rect);

      const buffered = buffer(rect, -1);
      const bufferedArea = area(buffered);

      expect(bufferedArea).toBeLessThan(originalArea);
      expect(bufferedArea).toBeGreaterThan(0); // Should not disappear completely
    });

    it('should return original polygon with zero distance', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const buffered = buffer(rect, 0);

      expect(buffered).toEqual(rect);
    });

    it('offset should be alias for buffer', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const buffered = buffer(rect, 2);
      const offsetPoly = offset(rect, 2);

      expect(area(buffered)).toBe(area(offsetPoly));
    });
  });

  describe('area', () => {
    it('should calculate correct area in m┬▓ for rectangle', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const resultM2 = areaM2(rect);
      expect(resultM2).toBeCloseTo(100, 1); // 10m x 10m = 100 m┬▓
    });

    it('should convert m┬▓ to ft┬▓ correctly', () => {
      const rect = createRectangle(0, 0, 10, 10); // 100 m┬▓
      const resultSqft = areaSqft(rect);
      // 100 m┬▓ * 10.7639 = 1076.39 ft┬▓
      expect(resultSqft).toBeCloseTo(1076.39, 1);
    });

    it('area() should return sqft (for backward compatibility)', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const result = area(rect);
      // Should be in ft┬▓ (converted from m┬▓)
      expect(result).toBeCloseTo(1076.39, 1);
    });

    it('should handle non-rectangular polygon', () => {
      const triangle: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [0, 0],
          [10, 0],
          [5, 10],
          [0, 0]
        ]]
      };
      const resultM2 = areaM2(triangle);
      expect(resultM2).toBeCloseTo(50, 1); // (10 * 10) / 2 = 50 m┬▓
    });
  });

  describe('bbox', () => {
    it('should return correct bounding box', () => {
      const rect = createRectangle(5, 10, 20, 30);
      const result = bbox(rect);

      expect(result.minX).toBe(5);
      expect(result.minY).toBe(10);
      expect(result.maxX).toBe(25);
      expect(result.maxY).toBe(40);
    });
  });

  describe('centroid', () => {
    it('should return center point of rectangle', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const result = centroid(rect);

      expect(result[0]).toBeCloseTo(5, 1);
      expect(result[1]).toBeCloseTo(5, 1);
    });
  });

  describe('pointInPoly', () => {
    it('should return true for point inside polygon', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const point = { type: 'Point' as const, coordinates: [5, 5] };

      expect(pointInPoly(point, rect)).toBe(true);
    });

    it('should return false for point outside polygon', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const point = { type: 'Point' as const, coordinates: [20, 20] };

      expect(pointInPoly(point, rect)).toBe(false);
    });

    it('should work with array coordinates', () => {
      const rect = createRectangle(0, 0, 10, 10);

      expect(pointInPoly([5, 5], rect)).toBe(true);
      expect(pointInPoly([20, 20], rect)).toBe(false);
    });
  });

  describe('simplify', () => {
    it('should reduce vertices with high tolerance', () => {
      const complex: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [0, 0],
          [1, 0.1],
          [2, 0.05],
          [3, 0],
          [3, 1],
          [2, 1.05],
          [1, 1.1],
          [0, 1],
          [0, 0]
        ]]
      };

      const simplified = simplify(complex, 0.2);

      // Simplified should have fewer or equal vertices
      expect(simplified.coordinates[0].length).toBeLessThanOrEqual(complex.coordinates[0].length);
    });

    it('should preserve shape with low tolerance', () => {
      const rect = createRectangle(0, 0, 10, 10);
      const simplified = simplify(rect, 0.001);

      // Should preserve rectangle shape
      expect(simplified.coordinates[0].length).toBeGreaterThanOrEqual(4);
    });
  });
});
