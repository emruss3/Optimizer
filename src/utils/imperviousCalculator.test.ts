// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { ImperviousCalculator } from './imperviousCalculator';
import { Element } from '../types/element';

describe('ImperviousCalculator', () => {
  const mockElements: Element[] = [
    {
      id: 'building1',
      type: 'building',
      vertices: [
        { id: '1', x: 0, y: 0 },
        { id: '2', x: 100, y: 0 },
        { id: '3', x: 100, y: 50 },
        { id: '4', x: 0, y: 50 }
      ],
      properties: { area: 5000 }
    },
    {
      id: 'parking1',
      type: 'parking',
      vertices: [
        { id: '1', x: 0, y: 50 },
        { id: '2', x: 50, y: 50 },
        { id: '3', x: 50, y: 100 },
        { id: '4', x: 0, y: 100 }
      ],
      properties: { area: 2500 }
    },
    {
      id: 'greenspace1',
      type: 'greenspace',
      vertices: [
        { id: '1', x: 50, y: 0 },
        { id: '2', x: 100, y: 0 },
        { id: '3', x: 100, y: 50 },
        { id: '4', x: 50, y: 50 }
      ],
      properties: { area: 2500, impervious: false }
    }
  ];

  const totalSiteAreaSqft = 10000;

  describe('calculateBuildingCoverage', () => {
    test('should calculate building coverage correctly', () => {
      const result = ImperviousCalculator.calculateBuildingCoverage(mockElements, totalSiteAreaSqft);
      
      expect(result.building_footprint_sqft).toBeGreaterThan(0);
      expect(result.coverage_percentage).toBeGreaterThan(0);
      expect(result.coverage_percentage).toBeLessThanOrEqual(100);
    });

    test('should pass coverage compliance when under max', () => {
      const zoning = { max_coverage_pct: 60 };
      const compliance = ImperviousCalculator.checkCompliance(mockElements, totalSiteAreaSqft, zoning);
      
      expect(compliance.coverage.compliant).toBe(true);
      expect(compliance.coverage.current).toBeLessThanOrEqual(zoning.max_coverage_pct);
    });

    test('should fail coverage compliance when over max', () => {
      // Create a large building that exceeds coverage
      const largeBuilding: Element = {
        id: 'large-building',
        type: 'building',
        vertices: [
          { id: '1', x: 0, y: 0 },
          { id: '2', x: 1000, y: 0 },
          { id: '3', x: 1000, y: 1000 },
          { id: '4', x: 0, y: 1000 }
        ],
        properties: { area: 1000000 }
      };

      const elementsWithLargeBuilding = [largeBuilding];
      const zoning = { max_coverage_pct: 50 };
      const compliance = ImperviousCalculator.checkCompliance(elementsWithLargeBuilding, totalSiteAreaSqft, zoning);
      
      expect(compliance.coverage.compliant).toBe(false);
      expect(compliance.coverage.current).toBeGreaterThan(zoning.max_coverage_pct);
    });
  });

  describe('calculateImpervious', () => {
    test('should calculate impervious coverage correctly', () => {
      const result = ImperviousCalculator.calculateImpervious(mockElements, totalSiteAreaSqft);
      
      expect(result.total_impervious_sqft).toBeGreaterThan(0);
      expect(result.impervious_percentage).toBeGreaterThan(0);
      expect(result.impervious_percentage).toBeLessThanOrEqual(100);
      expect(result.breakdown.buildings).toBeGreaterThan(0);
      expect(result.breakdown.parking).toBeGreaterThan(0);
    });

    test('should exclude greenspace from impervious calculation', () => {
      const result = ImperviousCalculator.calculateImpervious(mockElements, totalSiteAreaSqft);
      
      // Greenspace should not contribute to impervious coverage
      expect(result.breakdown.buildings + result.breakdown.parking).toBe(result.total_impervious_sqft);
    });
  });

  describe('calculateOpenSpace', () => {
    test('should calculate open space correctly', () => {
      const result = ImperviousCalculator.calculateOpenSpace(mockElements, totalSiteAreaSqft);
      
      expect(result.open_space_sqft).toBeGreaterThan(0);
      expect(result.open_space_percentage).toBeGreaterThan(0);
      expect(result.open_space_percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('checkCompliance', () => {
    test('should check all compliance metrics', () => {
      const zoning = {
        max_coverage_pct: 50,
        max_impervious_coverage_pct: 70,
        min_landscaped_space_pct: 20,
        min_open_space_pct: 15
      };

      const compliance = ImperviousCalculator.checkCompliance(mockElements, totalSiteAreaSqft, zoning);
      
      expect(compliance.coverage).toBeDefined();
      expect(compliance.impervious).toBeDefined();
      expect(compliance.landscaped).toBeDefined();
      expect(compliance.open_space).toBeDefined();
      
      expect(compliance.coverage.compliant).toBeDefined();
      expect(compliance.impervious.compliant).toBeDefined();
      expect(compliance.landscaped.compliant).toBeDefined();
      expect(compliance.open_space.compliant).toBeDefined();
    });
  });
});
