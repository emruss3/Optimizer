// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { generateMassing, MassingPreset } from './generateMassing';
import { GeoJSON } from '../types/parcel';

describe('MassingGenerator', () => {
  // Simple rectangle polygon for testing
  const testPolygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[
      [0, 0],
      [300, 0],
      [300, 200],
      [0, 200],
      [0, 0]
    ]]
  };

  const defaultPreset: MassingPreset = {
    barDepthFt: 65,
    minCourtFt: 20,
    maxBarLenFt: 200,
    floorToFloorFt: 12,
    maxHeightFt: 120,
    targetFAR: 1.5
  };

  test('should generate massing for simple rectangle', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    expect(result).toBeDefined();
    expect(result.features.type).toBe('FeatureCollection');
    expect(result.kpis).toBeDefined();
    expect(result.bars).toBeDefined();
    expect(result.courts).toBeDefined();
  });

  test('should return nonzero NRSF', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    expect(result.kpis.nrsf).toBeGreaterThan(0);
    expect(result.kpis.building_count).toBeGreaterThan(0);
  });

  test('should have coverage less than 1.0', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    expect(result.kpis.coverage).toBeGreaterThan(0);
    expect(result.kpis.coverage).toBeLessThan(1.0);
  });

  test('should respect height limits', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    if (result.bars.length > 0) {
      const maxHeight = Math.max(...result.bars.map(bar => bar.height));
      expect(maxHeight).toBeLessThanOrEqual(defaultPreset.maxHeightFt! + 12); // Allow one floor tolerance
    }
  });

  test('should generate valid GeoJSON features', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    expect(result.features.features).toBeDefined();
    expect(result.features.features.length).toBeGreaterThan(0);
    
    result.features.features.forEach(feature => {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).toBeDefined();
      expect(feature.properties).toBeDefined();
      
      if (feature.properties.type === 'building_bar') {
        expect(feature.properties.floors).toBeGreaterThan(0);
        expect(feature.properties.nrsf).toBeGreaterThan(0);
      }
    });
  });

  test('should handle empty polygon gracefully', () => {
    const emptyPolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[]]
    };
    
    const result = generateMassing(emptyPolygon, defaultPreset);
    
    expect(result.kpis.nrsf).toBe(0);
    expect(result.kpis.building_count).toBe(0);
    expect(result.bars).toEqual([]);
    expect(result.courts).toEqual([]);
  });

  test('should calculate FAR correctly', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    // FAR should be reasonable (between 0 and 3.0)
    expect(result.kpis.far).toBeGreaterThan(0);
    expect(result.kpis.far).toBeLessThan(3.0);
  });

  test('should generate bars with valid dimensions', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    result.bars.forEach(bar => {
      expect(bar.width).toBeGreaterThan(0);
      expect(bar.depth).toBeGreaterThan(0);
      expect(bar.floors).toBeGreaterThan(0);
      expect(bar.height).toBeGreaterThan(0);
      expect(bar.nrsf).toBeGreaterThan(0);
      expect(bar.nrsf).toBe(bar.width * bar.depth * bar.floors);
    });
  });

  test('should generate courts with valid dimensions', () => {
    const result = generateMassing(testPolygon, defaultPreset);
    
    result.courts.forEach(court => {
      expect(court.width).toBeGreaterThan(0);
      expect(court.depth).toBeGreaterThan(0);
      expect(court.width).toBeGreaterThanOrEqual(defaultPreset.minCourtFt);
      expect(court.depth).toBeGreaterThanOrEqual(defaultPreset.minCourtFt);
    });
  });
});
