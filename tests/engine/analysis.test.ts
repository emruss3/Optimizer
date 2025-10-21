import { describe, it, expect } from 'vitest';
import { 
  calculateMetrics, 
  calculateBuildingEfficiency, 
  calculateFinancialMetrics, 
  calculateEnvironmentalMetrics,
  generateComplianceReport 
} from '../../src/engine/analysis';
import type { Element, PlannerConfig } from '../../src/engine/types';

describe('analysis', () => {
  const sampleElements: Element[] = [
    {
      id: 'building-1',
      type: 'building',
      name: 'Building 1',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]
      },
      properties: { 
        areaSqFt: 10000, 
        units: 10, 
        heightFt: 50, 
        stories: 5 
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'ai-generated'
      }
    },
    {
      id: 'parking-1',
      type: 'parking',
      name: 'Parking Area',
      geometry: {
        type: 'Polygon',
        coordinates: [[[100, 0], [200, 0], [200, 50], [100, 50], [100, 0]]]
      },
      properties: { 
        areaSqFt: 5000, 
        parkingSpaces: 15 
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'ai-generated'
      }
    },
    {
      id: 'greenspace-1',
      type: 'greenspace',
      name: 'Green Space',
      geometry: {
        type: 'Polygon',
        coordinates: [[[100, 50], [200, 50], [200, 100], [100, 100], [100, 50]]]
      },
      properties: { 
        areaSqFt: 5000 
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'ai-generated'
      }
    }
  ];

  const config: PlannerConfig = {
    parcelId: 'test-parcel',
    buildableArea: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [200, 0], [200, 100], [0, 100], [0, 0]]]
      },
      properties: { areaSqFt: 20000 }
    },
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

  describe('calculateMetrics', () => {
    it('should calculate basic site metrics', () => {
      const metrics = calculateMetrics(sampleElements, 20000, config);
      
      expect(metrics.totalBuiltSF).toBe(10000);
      expect(metrics.siteCoveragePct).toBe(50); // 10000 / 20000 * 100
      expect(metrics.achievedFAR).toBe(0.5); // 10000 / 20000
      expect(metrics.parkingRatio).toBe(1.5); // 15 stalls / 10 units
      expect(metrics.openSpacePct).toBe(25); // 5000 / 20000 * 100
    });

    it('should detect zoning violations', () => {
      const highFARConfig = { ...config, zoning: { ...config.zoning, maxFar: 0.3 } };
      const metrics = calculateMetrics(sampleElements, 20000, highFARConfig);
      
      expect(metrics.zoningCompliant).toBe(false);
      expect(metrics.violations.some(v => v.includes('FAR'))).toBe(true);
    });

    it('should detect coverage violations', () => {
      const lowCoverageConfig = { ...config, zoning: { ...config.zoning, maxCoveragePct: 30 } };
      const metrics = calculateMetrics(sampleElements, 20000, lowCoverageConfig);
      
      expect(metrics.zoningCompliant).toBe(false);
      expect(metrics.violations.some(v => v.includes('coverage'))).toBe(true);
    });

    it('should detect parking violations', () => {
      const highParkingConfig = { ...config, zoning: { ...config.zoning, minParkingRatio: 2.0 } };
      const metrics = calculateMetrics(sampleElements, 20000, highParkingConfig);
      
      expect(metrics.zoningCompliant).toBe(false);
      expect(metrics.violations.some(v => v.includes('parking'))).toBe(true);
    });

    it('should generate warnings for low performance', () => {
      const lowTargetConfig = { 
        ...config, 
        designParameters: { 
          ...config.designParameters, 
          targetFAR: 2.0,
          targetCoveragePct: 80
        } 
      };
      const metrics = calculateMetrics(sampleElements, 20000, lowTargetConfig);
      
      expect(metrics.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('calculateBuildingEfficiency', () => {
    it('should calculate building efficiency metrics', () => {
      const efficiency = calculateBuildingEfficiency(sampleElements);
      
      expect(efficiency.avgUnitSize).toBe(1000); // 10000 sqft / 10 units
      expect(efficiency.buildingEfficiency).toBeCloseTo(0.8, 1); // (10 * 800) / 10000
      expect(efficiency.parkingEfficiency).toBe(1.5); // 15 stalls / 10 units
    });

    it('should handle empty elements', () => {
      const efficiency = calculateBuildingEfficiency([]);
      
      expect(efficiency.avgUnitSize).toBe(0);
      expect(efficiency.buildingEfficiency).toBe(0);
      expect(efficiency.parkingEfficiency).toBe(0);
    });
  });

  describe('calculateFinancialMetrics', () => {
    it('should calculate financial metrics with default values', () => {
      const financial = calculateFinancialMetrics(sampleElements, 20000);
      
      expect(financial.totalValue).toBe(2000000); // 10000 * 200
      expect(financial.totalRevenue).toBe(240000); // 10000 * 2.0 * 12
      expect(financial.totalCost).toBe(1500000); // 10000 * 150
      expect(financial.netValue).toBe(500000); // 2000000 - 1500000
      expect(financial.valuePerAcre).toBeCloseTo(1098901, 0); // (500000 / 20000) * 43560
    });

    it('should calculate financial metrics with custom market data', () => {
      const marketData = {
        pricePerSqFt: 300,
        rentPerSqFt: 3.0,
        constructionCostPerSqFt: 200
      };
      
      const financial = calculateFinancialMetrics(sampleElements, 20000, marketData);
      
      expect(financial.totalValue).toBe(3000000); // 10000 * 300
      expect(financial.totalRevenue).toBe(360000); // 10000 * 3.0 * 12
      expect(financial.totalCost).toBe(2000000); // 10000 * 200
      expect(financial.netValue).toBe(1000000); // 3000000 - 2000000
    });
  });

  describe('calculateEnvironmentalMetrics', () => {
    it('should calculate environmental metrics', () => {
      const environmental = calculateEnvironmentalMetrics(sampleElements);
      
      expect(environmental.totalGreenspace).toBe(5000);
      expect(environmental.treeCount).toBe(50); // 5000 / 100
      expect(environmental.permeableArea).toBe(4000); // 5000 * 0.8
    });

    it('should handle no greenspace', () => {
      const noGreenspace = sampleElements.filter(el => el.type !== 'greenspace');
      const environmental = calculateEnvironmentalMetrics(noGreenspace);
      
      expect(environmental.totalGreenspace).toBe(0);
      expect(environmental.treeCount).toBe(0);
      expect(environmental.permeableArea).toBe(0);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliant report for good metrics', () => {
      const goodMetrics = {
        totalBuiltSF: 10000,
        siteCoveragePct: 50,
        achievedFAR: 1.5,
        parkingRatio: 1.5,
        openSpacePct: 25,
        zoningCompliant: true,
        violations: [],
        warnings: []
      };
      
      const report = generateComplianceReport(goodMetrics, config);
      
      expect(report.overallScore).toBeGreaterThanOrEqual(80);
      expect(report.complianceStatus).toBe('compliant');
      expect(report.recommendations).toHaveLength(0);
    });

    it('should generate warning report for poor metrics', () => {
      const poorMetrics = {
        totalBuiltSF: 5000,
        siteCoveragePct: 25,
        achievedFAR: 0.75,
        parkingRatio: 0.5,
        openSpacePct: 10,
        zoningCompliant: false,
        violations: ['Low parking ratio'],
        warnings: ['Low FAR performance']
      };
      
      const report = generateComplianceReport(poorMetrics, config);
      
      expect(report.overallScore).toBeLessThan(80);
      expect(report.complianceStatus).toBe('warning');
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate non-compliant report for violations', () => {
      const violationMetrics = {
        totalBuiltSF: 15000,
        siteCoveragePct: 75,
        achievedFAR: 2.5,
        parkingRatio: 0.3,
        openSpacePct: 5,
        zoningCompliant: false,
        violations: ['FAR exceeds maximum', 'Coverage exceeds maximum', 'Parking ratio below minimum'],
        warnings: []
      };
      
      const report = generateComplianceReport(violationMetrics, config);
      
      expect(report.overallScore).toBeLessThan(60);
      expect(report.complianceStatus).toBe('non-compliant');
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('performance', () => {
    it('should calculate metrics within reasonable time', () => {
      const startTime = performance.now();
      calculateMetrics(sampleElements, 20000, config);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(10); // Should complete within 10ms
    });
  });
});
