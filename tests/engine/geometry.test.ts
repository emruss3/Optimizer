import { describe, it, expect } from 'vitest';
import { 
  calculatePolygonArea, 
  calculatePolygonBounds, 
  calculatePolygonCentroid, 
  isPointInPolygon, 
  doPolygonsOverlap, 
  analyzeGeometry,
  selectLargestRing
} from '../../src/engine/geometry';

describe('geometry', () => {
  const squareVertices = [
    [0, 0], [10, 0], [10, 10], [0, 10]
  ];

  const triangleVertices = [
    [0, 0], [5, 10], [10, 0]
  ];

  describe('calculatePolygonArea', () => {
    it('should calculate area of a square', () => {
      const area = calculatePolygonArea(squareVertices);
      expect(area).toBe(100);
    });

    it('should calculate area of a triangle', () => {
      const area = calculatePolygonArea(triangleVertices);
      expect(area).toBe(50);
    });

    it('should return 0 for empty vertices', () => {
      const area = calculatePolygonArea([]);
      expect(area).toBe(0);
    });

    it('should return 0 for less than 3 vertices', () => {
      const area = calculatePolygonArea([[0, 0], [1, 1]]);
      expect(area).toBe(0);
    });
  });

  describe('calculatePolygonBounds', () => {
    it('should calculate correct bounds for square', () => {
      const bounds = calculatePolygonBounds(squareVertices);
      expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    });

    it('should handle empty vertices', () => {
      const bounds = calculatePolygonBounds([]);
      expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });
  });

  describe('calculatePolygonCentroid', () => {
    it('should calculate centroid of square', () => {
      const centroid = calculatePolygonCentroid(squareVertices);
      expect(centroid).toEqual([5, 5]);
    });

    it('should handle empty vertices', () => {
      const centroid = calculatePolygonCentroid([]);
      expect(centroid).toEqual([0, 0]);
    });
  });

  describe('isPointInPolygon', () => {
    it('should identify points inside square', () => {
      expect(isPointInPolygon([5, 5], squareVertices)).toBe(true);
      expect(isPointInPolygon([1, 1], squareVertices)).toBe(true);
      expect(isPointInPolygon([9, 9], squareVertices)).toBe(true);
    });

    it('should identify points outside square', () => {
      expect(isPointInPolygon([15, 15], squareVertices)).toBe(false);
      expect(isPointInPolygon([-1, -1], squareVertices)).toBe(false);
      expect(isPointInPolygon([5, 15], squareVertices)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isPointInPolygon([0, 0], squareVertices)).toBe(true); // Corner
      expect(isPointInPolygon([10, 10], squareVertices)).toBe(true); // Corner
    });
  });

  describe('doPolygonsOverlap', () => {
    const square1 = [[0, 0], [5, 0], [5, 5], [0, 5]];
    const square2 = [[3, 3], [8, 3], [8, 8], [3, 8]];
    const square3 = [[10, 10], [15, 10], [15, 15], [10, 15]];

    it('should detect overlapping polygons', () => {
      expect(doPolygonsOverlap(square1, square2)).toBe(true);
    });

    it('should detect non-overlapping polygons', () => {
      expect(doPolygonsOverlap(square1, square3)).toBe(false);
    });

    it('should be symmetric', () => {
      expect(doPolygonsOverlap(square1, square2)).toBe(doPolygonsOverlap(square2, square1));
    });
  });

  describe('analyzeGeometry', () => {
    it('should analyze square geometry', () => {
      const analysis = analyzeGeometry(squareVertices);
      
      expect(analysis.area).toBe(100);
      expect(analysis.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
      expect(analysis.centroid).toEqual([5, 5]);
      expect(analysis.aspectRatio).toBe(1);
      expect(analysis.isConvex).toBe(true);
      expect(analysis.perimeter).toBeCloseTo(40, 1);
    });

    it('should analyze triangle geometry', () => {
      const analysis = analyzeGeometry(triangleVertices);
      
      expect(analysis.area).toBe(50);
      expect(analysis.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
      expect(analysis.centroid).toEqual([5, 3.33]);
      expect(analysis.isConvex).toBe(true);
    });
  });

  describe('concave polygons', () => {
    const concaveVertices = [
      [0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]
    ];

    it('should calculate area of concave polygon', () => {
      const area = calculatePolygonArea(concaveVertices);
      expect(area).toBeGreaterThan(0);
      expect(area).toBeLessThan(100); // Should be less than 10x10 square
    });

    it('should detect points inside concave polygon', () => {
      expect(isPointInPolygon([2, 2], concaveVertices)).toBe(true);
      expect(isPointInPolygon([7, 7], concaveVertices)).toBe(false);
      expect(isPointInPolygon([8, 2], concaveVertices)).toBe(false);
    });

    it('should analyze concave geometry properties', () => {
      const analysis = analyzeGeometry(concaveVertices);
      expect(analysis.isConvex).toBe(false);
      expect(analysis.area).toBeGreaterThan(0);
      expect(analysis.perimeter).toBeGreaterThan(0);
    });
  });

  describe('MultiPolygon fallback', () => {
    const multiPolygon = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]], // 25 sqft
        [[[10, 10], [15, 10], [15, 15], [10, 15], [10, 10]]] // 25 sqft
      ]
    };

    it('should select largest ring from MultiPolygon', () => {
      const largest = selectLargestRing(multiPolygon);
      expect(largest.type).toBe('Polygon');
      expect(largest.coordinates).toBeDefined();
    });

    it('should handle single polygon', () => {
      const singlePolygon = {
        type: 'Polygon' as const,
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
      };
      const result = selectLargestRing(singlePolygon);
      expect(result).toBe(singlePolygon);
    });
  });
});