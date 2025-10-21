import { describe, it, expect } from 'vitest';
import { generateBuildingFootprints, validateBuildingPlacement } from '../../src/engine/building';
import type { Polygon } from 'geojson';
import type { Element } from '../../src/engine/types';

describe('building', () => {
  const envelope: Polygon = {
    type: 'Polygon',
    coordinates: [[
      [0, 0], [200, 0], [200, 200], [0, 200], [0, 0]
    ]]
  };

  const buildableElement: Element = {
    id: 'buildable-1',
    type: 'building',
    name: 'Buildable Area',
    geometry: envelope,
    properties: { areaSqFt: 40000 },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'ai-generated'
    }
  };

  const buildingConfig = {
    targetFAR: 1.5,
    targetCoveragePct: 50,
    typology: 'bar',
    numBuildings: 2,
    maxHeightFt: 100,
    minHeightFt: 20
  };

  describe('generateBuildingFootprints', () => {
    it('should generate buildings within envelope', () => {
      const buildings = generateBuildingFootprints(buildableElement, buildingConfig);
      
      expect(buildings).toBeDefined();
      expect(buildings.length).toBeGreaterThan(0);
      expect(buildings.length).toBeLessThanOrEqual(buildingConfig.numBuildings);
    });

    it('should set proper units and areaSqFt', () => {
      const buildings = generateBuildingFootprints(buildableElement, buildingConfig);
      
      for (const building of buildings) {
        expect(building.properties.areaSqFt).toBeDefined();
        expect(building.properties.areaSqFt).toBeGreaterThan(0);
        expect(building.properties.units).toBeDefined();
        expect(building.properties.units).toBeGreaterThan(0);
        expect(building.properties.heightFt).toBeDefined();
        expect(building.properties.stories).toBeDefined();
        expect(building.properties.use).toBeDefined();
        expect(building.properties.color).toBeDefined();
      }
    });

    it('should respect target FAR', () => {
      const buildings = generateBuildingFootprints(buildableElement, buildingConfig);
      
      const totalBuiltSF = buildings.reduce((sum, building) => 
        sum + (building.properties.areaSqFt || 0), 0);
      
      const achievedFAR = totalBuiltSF / 40000; // 40000 sqft parcel
      expect(achievedFAR).toBeCloseTo(buildingConfig.targetFAR, 0.5);
    });

    it('should respect coverage percentage', () => {
      const buildings = generateBuildingFootprints(buildableElement, buildingConfig);
      
      const totalFootprintArea = buildings.reduce((sum, building) => 
        sum + (building.properties.areaSqFt || 0), 0);
      
      const coveragePct = (totalFootprintArea / 40000) * 100;
      expect(coveragePct).toBeLessThanOrEqual(buildingConfig.targetCoveragePct);
    });

    it('should respect height constraints', () => {
      const buildings = generateBuildingFootprints(buildableElement, buildingConfig);
      
      for (const building of buildings) {
        const height = building.properties.heightFt || 0;
        expect(height).toBeGreaterThanOrEqual(buildingConfig.minHeightFt);
        expect(height).toBeLessThanOrEqual(buildingConfig.maxHeightFt);
      }
    });

    it('should create valid building geometries', () => {
      const buildings = generateBuildingFootprints(buildableElement, buildingConfig);
      
      for (const building of buildings) {
        expect(building.geometry.type).toBe('Polygon');
        expect(building.geometry.coordinates).toBeDefined();
        expect(building.geometry.coordinates[0].length).toBeGreaterThanOrEqual(4);
        
        // Check that polygon is closed
        const coords = building.geometry.coordinates[0];
        const first = coords[0];
        const last = coords[coords.length - 1];
        expect(first[0]).toBe(last[0]);
        expect(first[1]).toBe(last[1]);
      }
    });

    it('should handle different typologies', () => {
      const typologies = ['bar', 'L-shape', 'podium', 'custom'];
      
      for (const typology of typologies) {
        const config = { ...buildingConfig, typology };
        const buildings = generateBuildingFootprints(buildableElement, config);
        
        expect(buildings.length).toBeGreaterThan(0);
        
        for (const building of buildings) {
          expect(building.properties.use).toBeDefined();
          expect(building.properties.color).toBeDefined();
        }
      }
    });
  });

  describe('validateBuildingPlacement', () => {
    const sampleBuildings: Element[] = [
      {
        id: 'building-1',
        type: 'building',
        name: 'Building 1',
        geometry: {
          type: 'Polygon',
          coordinates: [[[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]]]
        },
        properties: { 
          areaSqFt: 1600, 
          units: 2, 
          heightFt: 30, 
          stories: 3 
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'ai-generated'
        }
      }
    ];

    it('should validate compliant buildings', () => {
      const result = validateBuildingPlacement(
        sampleBuildings, 
        envelope, 
        buildingConfig, 
        40000
      );
      
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect FAR violations', () => {
      const highFARConfig = { ...buildingConfig, targetFAR: 0.1 };
      const result = validateBuildingPlacement(
        sampleBuildings, 
        envelope, 
        highFARConfig, 
        40000
      );
      
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('FAR'))).toBe(true);
    });

    it('should detect coverage violations', () => {
      const highCoverageConfig = { ...buildingConfig, targetCoveragePct: 10 };
      const result = validateBuildingPlacement(
        sampleBuildings, 
        envelope, 
        highCoverageConfig, 
        40000
      );
      
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('coverage'))).toBe(true);
    });

    it('should detect height violations', () => {
      const lowHeightConfig = { ...buildingConfig, maxHeightFt: 20 };
      const result = validateBuildingPlacement(
        sampleBuildings, 
        envelope, 
        lowHeightConfig, 
        40000
      );
      
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('height'))).toBe(true);
    });
  });

  describe('performance', () => {
    it('should generate buildings within reasonable time', () => {
      const startTime = performance.now();
      generateBuildingFootprints(buildableElement, buildingConfig);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(50); // Should complete within 50ms
    });
  });
});
