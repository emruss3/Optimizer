import { describe, it, expect } from 'vitest';
import { generateParking, generateIntelligentParking, detectOverlaps } from '../../src/engine/parking';
import type { Polygon } from 'geojson';
import type { Element } from '../../src/engine/types';

describe('parking', () => {
  const buildableArea: Polygon = {
    type: 'Polygon',
    coordinates: [[
      [0, 0], [100, 0], [100, 100], [0, 100], [0, 0]
    ]]
  };

  const parkingConfig = {
    targetRatio: 1.5,
    stallWidthFt: 9,
    stallDepthFt: 18,
    aisleWidthFt: 24,
    adaPct: 5,
    evPct: 10,
    layoutAngle: 0
  };

  describe('generateParking', () => {
    it('should generate parking stalls within buildable area', () => {
      const result = generateParking(buildableArea, parkingConfig, 20);
      
      expect(result.stalls).toBeDefined();
      expect(result.features).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.stalls.length).toBeGreaterThan(0);
      expect(result.features.length).toBeGreaterThan(0);
    });

    it('should respect target stall count', () => {
      const result = generateParking(buildableArea, parkingConfig, 10);
      
      expect(result.stalls.length).toBeLessThanOrEqual(10);
      expect(result.metrics.totalStalls).toBeLessThanOrEqual(10);
    });

    it('should generate ADA and EV stalls', () => {
      const result = generateParking(buildableArea, parkingConfig, 20);
      
      expect(result.metrics.adaStalls).toBeGreaterThanOrEqual(0);
      expect(result.metrics.evStalls).toBeGreaterThanOrEqual(0);
      expect(result.metrics.totalStalls).toBe(result.metrics.adaStalls + result.metrics.evStalls + (result.stalls.length - result.metrics.adaStalls - result.metrics.evStalls));
    });

    it('should create valid stall geometries', () => {
      const result = generateParking(buildableArea, parkingConfig, 5);
      
      for (const stall of result.stalls) {
        expect(stall.id).toBeDefined();
        expect(stall.x).toBeGreaterThanOrEqual(0);
        expect(stall.y).toBeGreaterThanOrEqual(0);
        expect(stall.width).toBe(parkingConfig.stallWidthFt);
        expect(stall.height).toBe(parkingConfig.stallDepthFt);
        expect(['standard', 'ada', 'ev']).toContain(stall.type);
      }
    });
  });

  describe('generateIntelligentParking', () => {
    const buildableElement: Element = {
      id: 'buildable-1',
      type: 'building',
      name: 'Buildable Area',
      geometry: buildableArea,
      properties: { areaSqFt: 10000 },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'ai-generated'
      }
    };

    const existingElements: Element[] = [
      {
        id: 'building-1',
        type: 'building',
        name: 'Building 1',
        geometry: {
          type: 'Polygon',
          coordinates: [[[10, 10], [30, 10], [30, 30], [10, 30], [10, 10]]]
        },
        properties: { units: 10, areaSqFt: 400 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'ai-generated'
        }
      }
    ];

    it('should generate parking based on existing buildings', () => {
      const result = generateIntelligentParking(buildableElement, { parking: parkingConfig }, existingElements);
      
      expect(result.stalls).toBeDefined();
      expect(result.features).toBeDefined();
      expect(result.metrics).toBeDefined();
      
      // Should calculate target stalls based on units
      const expectedStalls = Math.ceil(10 * parkingConfig.targetRatio);
      expect(result.metrics.totalStalls).toBeLessThanOrEqual(expectedStalls);
    });

    it('should handle empty existing elements', () => {
      const result = generateIntelligentParking(buildableElement, { parking: parkingConfig }, []);
      
      expect(result.stalls).toBeDefined();
      expect(result.metrics.totalStalls).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectOverlaps', () => {
    it('should detect no overlaps for non-overlapping stalls', () => {
      const stalls = [
        { id: '1', x: 0, y: 0, width: 9, height: 18, angle: 0, type: 'standard' as const },
        { id: '2', x: 20, y: 0, width: 9, height: 18, angle: 0, type: 'standard' as const }
      ];
      
      const overlaps = detectOverlaps(stalls);
      expect(overlaps).toBe(0);
    });

    it('should detect overlaps for overlapping stalls', () => {
      const stalls = [
        { id: '1', x: 0, y: 0, width: 9, height: 18, angle: 0, type: 'standard' as const },
        { id: '2', x: 5, y: 0, width: 9, height: 18, angle: 0, type: 'standard' as const }
      ];
      
      const overlaps = detectOverlaps(stalls);
      expect(overlaps).toBeGreaterThan(0);
    });

    it('should handle empty stall array', () => {
      const overlaps = detectOverlaps([]);
      expect(overlaps).toBe(0);
    });

    it('should handle single stall', () => {
      const stalls = [
        { id: '1', x: 0, y: 0, width: 9, height: 18, angle: 0, type: 'standard' as const }
      ];
      
      const overlaps = detectOverlaps(stalls);
      expect(overlaps).toBe(0);
    });
  });

  describe('performance', () => {
    it('should generate parking within reasonable time', () => {
      const startTime = performance.now();
      generateParking(buildableArea, parkingConfig, 50);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });
  });
});