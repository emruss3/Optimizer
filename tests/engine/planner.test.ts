import { describe, it, expect } from 'vitest';
import { generateSitePlan } from '../../src/engine/planner';
import type { Polygon, MultiPolygon } from 'geojson';
import type { PlannerConfig } from '../../src/engine/types';

describe('planner', () => {
  const sampleParcel: Polygon = {
    type: 'Polygon',
    coordinates: [[
      [0, 0], [200, 0], [200, 200], [0, 200], [0, 0]
    ]]
  };

  const sampleMultiPolygon: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]],
      [[[150, 150], [200, 150], [200, 200], [150, 200], [150, 150]]]
    ]
  };

  const baseConfig: PlannerConfig = {
    parcelId: 'test-parcel',
    buildableArea: sampleParcel,
    zoning: {
      frontSetbackFt: 10,
      sideSetbackFt: 5,
      rearSetbackFt: 10,
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
        aisleWidthFt: 24,
        adaPct: 5,
        evPct: 10,
        layoutAngle: 0
      },
      buildingTypology: 'bar',
      numBuildings: 1
    }
  };

  describe('end-to-end timing', () => {
    it('should complete within 300ms', () => {
      const startTime = performance.now();
      const result = generateSitePlan(sampleParcel, baseConfig);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(300);
      expect(result.processingTime).toBeLessThan(300);
    });
  });

  describe('determinism', () => {
    it('should produce stable metrics when re-running same config', () => {
      const result1 = generateSitePlan(sampleParcel, baseConfig);
      const result2 = generateSitePlan(sampleParcel, baseConfig);
      
      // Metrics should be stable (within small tolerance for floating point)
      expect(result1.metrics.achievedFAR).toBeCloseTo(result2.metrics.achievedFAR, 2);
      expect(result1.metrics.siteCoveragePct).toBeCloseTo(result2.metrics.siteCoveragePct, 1);
      expect(result1.metrics.parkingRatio).toBeCloseTo(result2.metrics.parkingRatio, 1);
      expect(result1.metrics.totalBuiltSF).toBeCloseTo(result2.metrics.totalBuiltSF, 100);
    });

    it('should produce consistent element counts', () => {
      const result1 = generateSitePlan(sampleParcel, baseConfig);
      const result2 = generateSitePlan(sampleParcel, baseConfig);
      
      const buildings1 = result1.elements.filter(e => e.type === 'building');
      const buildings2 = result2.elements.filter(e => e.type === 'building');
      const parking1 = result1.elements.filter(e => e.type === 'parking');
      const parking2 = result2.elements.filter(e => e.type === 'parking');
      
      expect(buildings1.length).toBe(buildings2.length);
      expect(parking1.length).toBe(parking2.length);
    });
  });

  describe('MultiPolygon handling', () => {
    it('should handle MultiPolygon by selecting largest ring', () => {
      const result = generateSitePlan(sampleMultiPolygon, baseConfig);
      
      expect(result.elements.length).toBeGreaterThan(0);
      expect(result.metrics.totalBuiltSF).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(300);
    });
  });

  describe('greenspace generation', () => {
    it('should generate greenspace elements', () => {
      const result = generateSitePlan(sampleParcel, baseConfig);
      
      const greenspace = result.elements.filter(e => e.type === 'greenspace');
      expect(greenspace.length).toBeGreaterThan(0);
      
      // Check that greenspace has proper properties
      for (const space of greenspace) {
        expect(space.properties.areaSqFt).toBeGreaterThan(0);
        expect(space.properties.use).toBe('landscaping');
      }
    });

    it('should cap greenspace at 20% of site area', () => {
      const result = generateSitePlan(sampleParcel, baseConfig);
      
      const totalGreenspace = result.elements
        .filter(e => e.type === 'greenspace')
        .reduce((sum, space) => sum + (space.properties.areaSqFt || 0), 0);
      
      const siteArea = 200 * 200; // 200x200 parcel
      const maxGreenspace = siteArea * 0.2;
      
      expect(totalGreenspace).toBeLessThanOrEqual(maxGreenspace);
    });
  });

  describe('error handling', () => {
    it('should handle invalid parcel geometry gracefully', () => {
      const invalidParcel: Polygon = {
        type: 'Polygon',
        coordinates: [] // Empty coordinates
      };
      
      const result = generateSitePlan(invalidParcel, baseConfig);
      
      expect(result.elements).toHaveLength(0);
      expect(result.metrics.violations).toContain('Site plan generation failed');
      expect(result.metrics.zoningCompliant).toBe(false);
    });
  });

  describe('performance under load', () => {
    it('should handle multiple rapid calls', () => {
      const startTime = performance.now();
      
      const promises = Array.from({ length: 5 }, () => 
        generateSitePlan(sampleParcel, baseConfig)
      );
      
      const results = Promise.all(promises);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // All 5 should complete within 1s
    });
  });
});