import { describe, it, expect } from 'vitest';
import { areaSqft, contains, bbox, simplify, rotate } from '../../src/engine/geometry';

describe('Geometry Engine', () => {
  const samplePolygon = {
    type: 'Polygon' as const,
    coordinates: [[
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0]
    ]]
  };

  const samplePoint = {
    type: 'Point' as const,
    coordinates: [5, 5]
  };

  describe('areaSqft', () => {
    it('should calculate area of a square', () => {
      const area = areaSqft(samplePolygon);
      expect(area).toBe(100);
    });

    it('should calculate area of a rectangle', () => {
      const rectangle = {
        type: 'Polygon' as const,
        coordinates: [[
          [0, 0],
          [20, 0],
          [20, 10],
          [0, 10],
          [0, 0]
        ]]
      };
      const area = areaSqft(rectangle);
      expect(area).toBe(200);
    });
  });

  describe('contains', () => {
    it('should return true for point inside polygon', () => {
      const result = contains(samplePolygon, samplePoint);
      expect(result).toBe(true);
    });

    it('should return false for point outside polygon', () => {
      const outsidePoint = {
        type: 'Point' as const,
        coordinates: [15, 15]
      };
      const result = contains(samplePolygon, outsidePoint);
      expect(result).toBe(false);
    });

    it('should return false for point on edge', () => {
      const edgePoint = {
        type: 'Point' as const,
        coordinates: [0, 5]
      };
      const result = contains(samplePolygon, edgePoint);
      expect(result).toBe(false);
    });
  });

  describe('bbox', () => {
    it('should calculate bounding box correctly', () => {
      const bounds = bbox(samplePolygon);
      expect(bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: 10,
        maxY: 10
      });
    });
  });

  describe('simplify', () => {
    it('should simplify polygon by removing redundant vertices', () => {
      const complexPolygon = {
        type: 'Polygon' as const,
        coordinates: [[
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
          [5, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0]
        ]]
      };
      
      const simplified = simplify(complexPolygon, 0.5);
      expect(simplified.coordinates[0].length).toBeLessThan(complexPolygon.coordinates[0].length);
    });
  });

  describe('rotate', () => {
    it('should rotate polygon around centroid', () => {
      const rotated = rotate(samplePolygon, 90);
      expect(rotated.coordinates[0]).toHaveLength(5);
    });
  });
});
