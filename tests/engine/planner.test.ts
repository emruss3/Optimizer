import { describe, it, expect } from 'vitest';
import { generateSitePlan } from '../../src/engine/planner';
import type { PlannerConfig } from '../../src/engine/types';

describe('Planner Engine', () => {
  const sampleParcel = {
    type: 'Polygon' as const,
    coordinates: [[
      [0, 0],
      [200, 0],
      [200, 200],
      [0, 200],
      [0, 0]
    ]]
  };

  const sampleConfig: PlannerConfig = {
    parcelId: 'test_parcel',
    buildableArea: sampleParcel,
    zoning: {
      frontSetbackFt: 20,
      sideSetbackFt: 10,
      rearSetbackFt: 20,
      maxFar: 2.0,
      maxCoveragePct: 60,
      minParkingRatio: 1.0
    },
    designParameters: {
      targetFAR: 1.5,
      targetCoveragePct: 50,
      parking: {
        targetRatio: 1.5,
        stallWidthFt: 9,
        stallDepthFt: 18,
        aisleWidthFt: 12,
        adaPct: 5,
        evPct: 10,
        layoutAngle: 0
      },
      buildingTypology: 'bar',
      numBuildings: 2
    }
  };

  describe('generateSitePlan', () => {
    it('should generate site plan within processing time limit', async () => {
      const startTime = performance.now();
      const result = generateSitePlan(sampleParcel, sampleConfig);
      const processingTime = performance.now() - startTime;
      
      expect(processingTime).toBeLessThan(300); // 300ms limit
      expect(result.processingTime).toBeLessThan(300);
    });

    it('should generate buildings and parking elements', () => {
      const result = generateSitePlan(sampleParcel, sampleConfig);
      
      expect(result.elements.length).toBeGreaterThan(0);
      
      const buildings = result.elements.filter(el => el.type === 'building');
      const parking = result.elements.filter(el => el.type === 'parking');
      
      expect(buildings.length).toBeGreaterThan(0);
      expect(parking.length).toBeGreaterThan(0);
    });

    it('should converge FAR within tolerance', () => {
      const result = generateSitePlan(sampleParcel, sampleConfig);
      
      const targetFAR = sampleConfig.designParameters.targetFAR;
      const achievedFAR = result.metrics.achievedFAR;
      
      // Should be within 20% of target
      const tolerance = targetFAR * 0.2;
      expect(achievedFAR).toBeGreaterThanOrEqual(targetFAR - tolerance);
      expect(achievedFAR).toBeLessThanOrEqual(targetFAR + tolerance);
    });

    it('should converge coverage within tolerance', () => {
      const result = generateSitePlan(sampleParcel, sampleConfig);
      
      const targetCoverage = sampleConfig.designParameters.targetCoveragePct;
      const achievedCoverage = result.metrics.siteCoveragePct;
      
      // Should be within 20% of target
      const tolerance = targetCoverage * 0.2;
      expect(achievedCoverage).toBeGreaterThanOrEqual(targetCoverage - tolerance);
      expect(achievedCoverage).toBeLessThanOrEqual(targetCoverage + tolerance);
    });

    it('should respect zoning constraints', () => {
      const result = generateSitePlan(sampleParcel, sampleConfig);
      
      // Check FAR constraint
      if (sampleConfig.zoning.maxFar) {
        expect(result.metrics.achievedFAR).toBeLessThanOrEqual(sampleConfig.zoning.maxFar);
      }
      
      // Check coverage constraint
      if (sampleConfig.zoning.maxCoveragePct) {
        expect(result.metrics.siteCoveragePct).toBeLessThanOrEqual(sampleConfig.zoning.maxCoveragePct);
      }
    });

    it('should generate valid envelope', () => {
      const result = generateSitePlan(sampleParcel, sampleConfig);
      
      expect(result.envelope).toBeDefined();
      expect(result.envelope.geometry).toBeDefined();
      expect(result.envelope.areaSqFt).toBeGreaterThan(0);
      expect(result.envelope.bounds).toBeDefined();
    });

    it('should handle invalid input gracefully', () => {
      const invalidParcel = {
        type: 'Polygon' as const,
        coordinates: [[]] // Empty polygon
      };
      
      const result = generateSitePlan(invalidParcel, sampleConfig);
      
      expect(result.elements).toHaveLength(0);
      expect(result.metrics.zoningCompliant).toBe(false);
      expect(result.metrics.violations.length).toBeGreaterThan(0);
    });
  });
});
