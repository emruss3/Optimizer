import { useState, useCallback, useMemo } from 'react';
import { SitePlanEngine, SitePlanConfiguration, SitePlanResult } from '../services/sitePlanEngine';
import { RegridZoningData } from '../types/zoning';

export function useSitePlanDesigner(zoningData: RegridZoningData | null, lotSize: number) {
  const [configuration, setConfiguration] = useState<SitePlanConfiguration>({
    targetUnits: 20,
    unitMix: {
      studio: 0.2,
      oneBedroom: 0.4,
      twoBedroom: 0.3,
      threeBedroom: 0.1
    },
    buildingType: 'residential',
    parkingType: 'surface',
    amenitySpace: 2000,
    openSpaceRatio: 0.15
  });

  const [sitePlanResult, setSitePlanResult] = useState<SitePlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create site plan engine instance
  const engine = useMemo(() => {
    if (!zoningData || !lotSize) return null;
    return new SitePlanEngine(zoningData, lotSize);
  }, [zoningData, lotSize]);

  // Generate site plan
  const generateSitePlan = useCallback(async () => {
    if (!engine) {
      setError('Site plan engine not available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = engine.generateSitePlan(configuration);
      setSitePlanResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Site plan generation failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [engine, configuration]);

  // Update configuration
  const updateConfiguration = useCallback((updates: Partial<SitePlanConfiguration>) => {
    setConfiguration(prev => ({ ...prev, ...updates }));
  }, []);

  // Update unit mix
  const updateUnitMix = useCallback((unitType: keyof typeof configuration.unitMix, percentage: number) => {
    setConfiguration(prev => ({
      ...prev,
      unitMix: {
        ...prev.unitMix,
        [unitType]: percentage
      }
    }));
  }, []);

  // Auto-generate site plan when configuration changes
  const autoGenerate = useCallback(() => {
    if (engine && configuration.targetUnits > 0) {
      generateSitePlan();
    }
  }, [engine, configuration, generateSitePlan]);

  // Get constraint summary
  const getConstraintSummary = useCallback(() => {
    if (!zoningData) return null;

    return {
      maxFAR: zoningData.max_far || 0,
      maxHeight: zoningData.max_building_height_ft || 0,
      maxCoverage: zoningData.max_coverage_pct || 0,
      maxDensity: zoningData.max_density_du_per_acre || 0,
      minSetbacks: {
        front: zoningData.min_front_setback_ft || 0,
        rear: zoningData.min_rear_setback_ft || 0,
        side: zoningData.min_side_setback_ft || 0
      }
    };
  }, [zoningData]);

  // Get feasibility status
  const getFeasibilityStatus = useCallback(() => {
    if (!sitePlanResult) return 'unknown';

    if (sitePlanResult.isFeasible) {
      if (sitePlanResult.violations.length === 0 && sitePlanResult.warnings.length === 0) {
        return 'excellent';
      } else if (sitePlanResult.warnings.length <= 2) {
        return 'good';
      } else {
        return 'acceptable';
      }
    } else {
      return 'infeasible';
    }
  }, [sitePlanResult]);

  // Get optimization score
  const getOptimizationScore = useCallback(() => {
    if (!sitePlanResult) return 0;

    const massing = sitePlanResult.buildingMassing;
    const farScore = massing.constraintAnalysis.farUtilization;
    const heightScore = massing.constraintAnalysis.heightUtilization;
    const coverageScore = massing.constraintAnalysis.coverageUtilization;

    return (farScore + heightScore + coverageScore) / 3;
  }, [sitePlanResult]);

  // Get financial summary
  const getFinancialSummary = useCallback(() => {
    if (!sitePlanResult) return null;

    const { financialImpact, buildingMassing } = sitePlanResult;
    
    return {
      totalCost: financialImpact.additionalCost,
      totalRevenue: financialImpact.additionalRevenue,
      netImpact: financialImpact.netImpact,
      costPerUnit: financialImpact.costPerUnit,
      revenuePerUnit: financialImpact.revenuePerUnit,
      costPerSqFt: financialImpact.additionalCost / buildingMassing.totalGSF,
      revenuePerSqFt: financialImpact.additionalRevenue / buildingMassing.totalGSF
    };
  }, [sitePlanResult]);

  // Get parking summary
  const getParkingSummary = useCallback(() => {
    if (!sitePlanResult) return null;

    const { parkingAnalysis } = sitePlanResult;
    
    return {
      requiredSpaces: parkingAnalysis.requiredSpaces,
      costPerSpace: parkingAnalysis.costPerSpace,
      totalCost: parkingAnalysis.totalParkingCost,
      efficiency: parkingAnalysis.parkingEfficiency,
      type: configuration.parkingType
    };
  }, [sitePlanResult, configuration.parkingType]);

  // Validate configuration
  const validateConfiguration = useCallback(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check unit mix totals
    const totalMix = Object.values(configuration.unitMix).reduce((sum, val) => sum + val, 0);
    if (Math.abs(totalMix - 1.0) > 0.01) {
      errors.push('Unit mix percentages must total 100%');
    }

    // Check target units
    if (configuration.targetUnits <= 0) {
      errors.push('Target units must be greater than 0');
    }

    // Check amenity space
    if (configuration.amenitySpace < 0) {
      errors.push('Amenity space cannot be negative');
    }

    // Check open space ratio
    if (configuration.openSpaceRatio < 0 || configuration.openSpaceRatio > 1) {
      errors.push('Open space ratio must be between 0% and 100%');
    }

    return { errors, warnings };
  }, [configuration]);

  // Get recommended configurations
  const getRecommendedConfigurations = useCallback(() => {
    if (!zoningData || !lotSize) return [];

    const recommendations = [];

    // High-density residential
    if (zoningData.max_density_du_per_acre && zoningData.max_density_du_per_acre > 20) {
      recommendations.push({
        name: 'High-Density Residential',
        description: 'Maximize density with efficient unit mix',
        configuration: {
          targetUnits: Math.floor((lotSize / 43560) * zoningData.max_density_du_per_acre * 0.9),
          unitMix: { studio: 0.3, oneBedroom: 0.5, twoBedroom: 0.2, threeBedroom: 0.0 },
          buildingType: 'residential' as const,
          parkingType: 'garage' as const,
          amenitySpace: 3000,
          openSpaceRatio: 0.20
        }
      });
    }

    // Mixed-use development
    if (zoningData.zoning_type === 'Mixed-Use' || zoningData.zoning_type === 'Commercial') {
      recommendations.push({
        name: 'Mixed-Use Development',
        description: 'Combine residential and commercial uses',
        configuration: {
          targetUnits: Math.floor((lotSize / 43560) * 15), // 15 DU/acre
          unitMix: { studio: 0.2, oneBedroom: 0.4, twoBedroom: 0.3, threeBedroom: 0.1 },
          buildingType: 'mixed-use' as const,
          parkingType: 'garage' as const,
          amenitySpace: 4000,
          openSpaceRatio: 0.15
        }
      });
    }

    // Luxury residential
    recommendations.push({
      name: 'Luxury Residential',
      description: 'Premium units with extensive amenities',
      configuration: {
        targetUnits: Math.floor((lotSize / 43560) * 8), // 8 DU/acre
        unitMix: { studio: 0.1, oneBedroom: 0.3, twoBedroom: 0.4, threeBedroom: 0.2 },
        buildingType: 'residential' as const,
        parkingType: 'underground' as const,
        amenitySpace: 5000,
        openSpaceRatio: 0.25
      }
    });

    return recommendations;
  }, [zoningData, lotSize]);

  return {
    // State
    configuration,
    sitePlanResult,
    loading,
    error,

    // Actions
    generateSitePlan,
    updateConfiguration,
    updateUnitMix,
    autoGenerate,

    // Computed values
    getConstraintSummary,
    getFeasibilityStatus,
    getOptimizationScore,
    getFinancialSummary,
    getParkingSummary,
    validateConfiguration,
    getRecommendedConfigurations,

    // Status flags
    isEngineAvailable: !!engine,
    hasSitePlan: !!sitePlanResult,
    isFeasible: sitePlanResult?.isFeasible || false
  };
}




