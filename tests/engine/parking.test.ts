import { describe, it, expect } from 'vitest';
import { generateParking } from '../../src/engine/parking';

describe('Parking Engine', () => {
  const sampleBuildableArea = {
    type: 'Polygon' as const,
    coordinates: [[
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 0]
    ]]
  };

  const sampleConfig = {
    targetRatio: 1.5,
    stallWidthFt: 9,
    stallDepthFt: 18,
    aisleWidthFt: 12,
    adaPct: 5,
    evPct: 10,
    layoutAngle: 0
  };

  describe('generateParking', () => {
    it('should generate parking stalls within buildable area', () => {
      const result = generateParking(sampleBuildableArea, sampleConfig, 20);
      
      expect(result.stalls).toHaveLength(20);
      expect(result.features).toHaveLength(20);
      expect(result.metrics.totalStalls).toBe(20);
    });

    it('should respect target stall count', () => {
      const result = generateParking(sampleBuildableArea, sampleConfig, 50);
      
      // Should not exceed available space
      expect(result.metrics.totalStalls).toBeLessThanOrEqual(50);
    });

    it('should generate ADA and EV stalls according to percentages', () => {
      const result = generateParking(sampleBuildableArea, sampleConfig, 100);
      
      const adaStalls = result.stalls.filter(stall => stall.type === 'ada');
      const evStalls = result.stalls.filter(stall => stall.type === 'ev');
      
      expect(adaStalls.length).toBeGreaterThan(0);
      expect(evStalls.length).toBeGreaterThan(0);
      
      // Check percentages are within ±5% tolerance
      const adaPct = (adaStalls.length / result.stalls.length) * 100;
      const evPct = (evStalls.length / result.stalls.length) * 100;
      
      expect(adaPct).toBeGreaterThanOrEqual(4); // 5% - 1%
      expect(adaPct).toBeLessThanOrEqual(6); // 5% + 1%
      expect(evPct).toBeGreaterThanOrEqual(9); // 10% - 1%
      expect(evPct).toBeLessThanOrEqual(11); // 10% + 1%
    });

    it('should not generate overlapping stalls', () => {
      const result = generateParking(sampleBuildableArea, sampleConfig, 20);
      
      // Check for overlaps
      for (let i = 0; i < result.stalls.length; i++) {
        for (let j = i + 1; j < result.stalls.length; j++) {
          const stall1 = result.stalls[i];
          const stall2 = result.stalls[j];
          
          const overlap = !(
            stall1.x + stall1.width/2 < stall2.x - stall2.width/2 ||
            stall1.x - stall1.width/2 > stall2.x + stall2.width/2 ||
            stall1.y + stall1.height/2 < stall2.y - stall2.height/2 ||
            stall1.y - stall1.height/2 > stall2.y + stall2.height/2
          );
          
          expect(overlap).toBe(false);
        }
      }
    });

    it('should calculate utilization percentage correctly', () => {
      const result = generateParking(sampleBuildableArea, sampleConfig, 20);
      
      expect(result.metrics.utilizationPct).toBeGreaterThan(0);
      expect(result.metrics.utilizationPct).toBeLessThanOrEqual(100);
    });
  });
});
