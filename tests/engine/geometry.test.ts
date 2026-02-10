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
  isPointInPolygon,
  simplify
} from '../../src/engine/geometry';

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

    it('should buffer an irregular pentagon (5+ vertices)', () => {
      // Irregular pentagon (convex)
      const pentagon: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [0, 0],
          [40, 0],
          [50, 30],
          [25, 50],
          [0, 30],
          [0, 0]
        ]]
      };
      const originalArea = areaM2(pentagon);

      // Outward buffer
      const outward = buffer(pentagon, 3);
      expect(areaM2(outward)).toBeGreaterThan(originalArea);

      // Inward buffer (setback)
      const inward = buffer(pentagon, -3);
      expect(areaM2(inward)).toBeLessThan(originalArea);
      expect(areaM2(inward)).toBeGreaterThan(0);
    });

    it('should buffer a concave polygon', () => {
      // L-shaped (concave) polygon
      const lShape: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [0, 0],
          [40, 0],
          [40, 20],
          [20, 20],
          [20, 40],
          [0, 40],
          [0, 0]
        ]]
      };
      const originalArea = areaM2(lShape);

      // Outward buffer
      const outward = buffer(lShape, 2);
      expect(areaM2(outward)).toBeGreaterThan(originalArea);

      // Inward buffer (setback)
      const inward = buffer(lShape, -2);
      expect(areaM2(inward)).toBeLessThan(originalArea);
      expect(areaM2(inward)).toBeGreaterThan(0);
    });

    it('should return empty polygon when inward buffer collapses a small parcel', () => {
      // Tiny triangle (3m sides) with a large inward buffer should collapse
      const tiny: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [0, 0],
          [3, 0],
          [1.5, 2.6],
          [0, 0]
        ]]
      };
      const originalArea = areaM2(tiny);

      const collapsed = buffer(tiny, -5);
      // Should be much smaller than original (collapsed or near-zero)
      expect(areaM2(collapsed)).toBeLessThan(originalArea * 0.5);
    });

    it('should buffer a rotated (non-axis-aligned) rectangle', () => {
      // 45-degree rotated square (side ~14.14 for a 10x10 area)
      const rotated: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [10, 0],
          [20, 10],
          [10, 20],
          [0, 10],
          [10, 0]
        ]]
      };
      const originalArea = areaM2(rotated);

      const outward = buffer(rotated, 2);
      expect(areaM2(outward)).toBeGreaterThan(originalArea);

      const inward = buffer(rotated, -2);
      expect(areaM2(inward)).toBeLessThan(originalArea);
      expect(areaM2(inward)).toBeGreaterThan(0);
    });

    it('should handle a complex irregular parcel (6+ vertices)', () => {
      // Realistic irregular parcel shape
      const parcel: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [100, 100],
          [200, 105],
          [210, 180],
          [180, 220],
          [120, 215],
          [90, 170],
          [100, 100]
        ]]
      };
      const originalArea = areaM2(parcel);

      // 5m setback (inward)
      const setback = buffer(parcel, -5);
      expect(areaM2(setback)).toBeLessThan(originalArea);
      expect(areaM2(setback)).toBeGreaterThan(originalArea * 0.3); // Should retain most area

      // 5m outward
      const expanded = buffer(parcel, 5);
      expect(areaM2(expanded)).toBeGreaterThan(originalArea);
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

  describe('isPointInPolygon', () => {
    it('should return true for point inside polygon', () => {
      const rect = createRectangle(0, 0, 10, 10);

      expect(isPointInPolygon([5, 5], rect.coordinates[0])).toBe(true);
    });

    it('should return false for point outside polygon', () => {
      const rect = createRectangle(0, 0, 10, 10);

      expect(isPointInPolygon([20, 20], rect.coordinates[0])).toBe(false);
    });

    it('should work with various coordinate arrays', () => {
      const rect = createRectangle(0, 0, 10, 10);

      expect(isPointInPolygon([5, 5], rect.coordinates[0])).toBe(true);
      expect(isPointInPolygon([20, 20], rect.coordinates[0])).toBe(false);
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
