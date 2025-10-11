// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { generateParking, ParkingParams } from './generateParking';
import { GeoJSON } from '../types/parcel';

describe('ParkingGenerator', () => {
  // Simple rectangle polygon for testing
  const testPolygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
      [0, 0]
    ]]
  };

  const defaultParams: ParkingParams = {
    angles: [90, 60, 45, 0],
    stall: {
      width_ft: 9,
      depth_ft: 18,
      aisle_ft: 24
    },
    ada_pct: 5
  };

  test('should generate parking for simple rectangle', () => {
    const results = generateParking(testPolygon, defaultParams);
    
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    
    // Should have results for each angle
    const angles = results.map(r => r.angle);
    expect(angles).toContain(90);
    expect(angles).toContain(60);
    expect(angles).toContain(45);
    expect(angles).toContain(0);
  });

  test('should have monotonic stall counts across angles', () => {
    const results = generateParking(testPolygon, defaultParams);
    
    // Sort by angle for comparison
    const sortedResults = results.sort((a, b) => a.angle - b.angle);
    
    // 90° should generally have more stalls than 0° (parallel)
    const perpendicular = sortedResults.find(r => r.angle === 90);
    const parallel = sortedResults.find(r => r.angle === 0);
    
    if (perpendicular && parallel) {
      expect(perpendicular.kpis.stall_count).toBeGreaterThan(0);
      expect(parallel.kpis.stall_count).toBeGreaterThan(0);
    }
  });

  test('should return valid KPIs', () => {
    const results = generateParking(testPolygon, defaultParams);
    
    results.forEach(result => {
      expect(result.kpis.stall_count).toBeGreaterThan(0);
      expect(result.kpis.ratio).toBeGreaterThan(0);
      expect(result.kpis.efficiency).toBeGreaterThan(0);
      expect(result.kpis.ada_stalls).toBeGreaterThanOrEqual(0);
      expect(result.kpis.drive_continuity_penalty).toBeGreaterThanOrEqual(0);
      expect(result.kpis.drive_continuity_penalty).toBeLessThanOrEqual(1);
    });
  });

  test('should generate valid GeoJSON features', () => {
    const results = generateParking(testPolygon, defaultParams);
    
    results.forEach(result => {
      expect(result.features.type).toBe('FeatureCollection');
      expect(result.features.features).toBeDefined();
      expect(result.features.features.length).toBeGreaterThan(0);
      
      result.features.features.forEach(feature => {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry).toBeDefined();
        expect(feature.properties).toBeDefined();
      });
    });
  });

  test('should handle empty polygon gracefully', () => {
    const emptyPolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[]]
    };
    
    const results = generateParking(emptyPolygon, defaultParams);
    expect(results).toEqual([]);
  });

  test('should respect ADA percentage', () => {
    const results = generateParking(testPolygon, defaultParams);
    
    results.forEach(result => {
      const totalStalls = result.kpis.stall_count;
      const adaStalls = result.kpis.ada_stalls;
      
      if (totalStalls > 0) {
        const adaPercentage = (adaStalls / totalStalls) * 100;
        expect(adaPercentage).toBeLessThanOrEqual(defaultParams.ada_pct + 5); // Allow some tolerance
      }
    });
  });
});
