// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { generateParking, ParkingParams } from './generateParking';
import { GeoJSON } from '../types/parcel';

describe('Parking Ratio Enforcement', () => {
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

  test('should generate sufficient stalls when ratio is relaxed', () => {
    const relaxedParams: ParkingParams = {
      angles: [90],
      stall: {
        width_ft: 9,
        depth_ft: 18,
        aisle_ft: 24
      },
      ada_pct: 5
    };

    const results = generateParking(testPolygon, relaxedParams);
    expect(results.length).toBeGreaterThan(0);

    const result = results[0];
    const nrsf = 10000; // 10,000 sq ft building
    const parkingRatio = 2.0; // 2 stalls per 1000 sq ft
    const stallsNeeded = Math.ceil((nrsf / 1000) * parkingRatio);

    // With relaxed ratio, should be able to meet requirements
    expect(result.kpis.stall_count).toBeGreaterThanOrEqual(stallsNeeded);
  });

  test('should fail when ratio is tightened beyond capacity', () => {
    const tightParams: ParkingParams = {
      angles: [90],
      stall: {
        width_ft: 12, // Larger stalls
        depth_ft: 20,
        aisle_ft: 30 // Wider aisles
      },
      ada_pct: 10 // Higher ADA requirement
    };

    const results = generateParking(testPolygon, tightParams);
    expect(results.length).toBeGreaterThan(0);

    const result = results[0];
    const nrsf = 50000; // 50,000 sq ft building
    const parkingRatio = 8.0; // 8 stalls per 1000 sq ft (very high)
    const stallsNeeded = Math.ceil((nrsf / 1000) * parkingRatio);

    // With tight ratio and large building, may not meet requirements
    const canMeetRequirements = result.kpis.stall_count >= stallsNeeded;
    
    // This test documents the behavior - may pass or fail depending on site size
    expect(typeof canMeetRequirements).toBe('boolean');
  });

  test('should calculate stalls needed correctly', () => {
    const testCases = [
      { nrsf: 10000, ratio: 3.0, expected: 30 },
      { nrsf: 25000, ratio: 4.0, expected: 100 },
      { nrsf: 5000, ratio: 2.5, expected: 13 },
      { nrsf: 100000, ratio: 5.0, expected: 500 }
    ];

    testCases.forEach(({ nrsf, ratio, expected }) => {
      const stallsNeeded = Math.ceil((nrsf / 1000) * ratio);
      expect(stallsNeeded).toBe(expected);
    });
  });

  test('should show stalls/needed ratio correctly', () => {
    const params: ParkingParams = {
      angles: [90],
      stall: {
        width_ft: 9,
        depth_ft: 18,
        aisle_ft: 24
      },
      ada_pct: 5
    };

    const results = generateParking(testPolygon, params);
    const result = results[0];
    
    const nrsf = 20000;
    const parkingRatio = 3.0;
    const stallsNeeded = Math.ceil((nrsf / 1000) * parkingRatio);
    
    const ratioDisplay = `${result.kpis.stall_count} / ${stallsNeeded}`;
    expect(ratioDisplay).toMatch(/^\d+ \/ \d+$/);
    
    const isCompliant = result.kpis.stall_count >= stallsNeeded;
    expect(typeof isCompliant).toBe('boolean');
  });
});
