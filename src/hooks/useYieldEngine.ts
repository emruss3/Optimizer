import { useState, useMemo, useCallback } from 'react';
import { SelectedParcel, BuildingMassing, SiteplanConfig } from '../types/project';
import { supabase } from '../lib/supabase';
import { ParcelSet, toArray, setKey } from '../lib/parcelSet';

export interface AssemblageGeometry {
  geometry: any;
  totalAcres: number;
  totalSqft: number;
  zoningMix: Record<string, number>;
  boundaryCoordinates: string;
}

export interface UnifiedConstraints {
  maxFAR: number;
  maxHeight: number;
  maxCoverage: number;
  setbacks: {
    front: number;
    rear: number;
    side: number;
  };
  limitingFactor: string;
  buildableAreaSqft: number;
}

export interface YieldScenario {
  scenarioName: string;
  farUtilization: number;
  heightUtilization: number;
  coverageUtilization: number;
  estimatedUnits: number;
  estimatedIRR: number;
  estimatedROI: number;
  constraintAnalysis: any;
}

export function useYieldEngine() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResults, setOptimizationResults] = useState<YieldScenario[]>([]);
  const [assemblageMemo, setAssemblageMemo] = useState<Map<string, AssemblageGeometry>>(new Map());

  // Unified function: accepts either parcels[] or assemblageGeom
  const getAssemblageGeometry = useCallback(async (
    parcels?: SelectedParcel[],
    assemblageGeom?: AssemblageGeometry
  ): Promise<AssemblageGeometry | null> => {
    // Return provided geometry if available
    if (assemblageGeom) return assemblageGeom;
    
    if (!parcels || parcels.length === 0 || !supabase) return null;

    // Create cache key
    const parcelIds = parcels.map(p => p.id);
    const cacheKey = parcelIds.sort().join('|');
    
    // Check memo cache
    if (assemblageMemo.has(cacheKey)) {
      return assemblageMemo.get(cacheKey)!;
    }

    try {
      const { data, error } = await supabase
        .rpc('get_assemblage_geometry', { parcel_ids: parcelIds });

      if (error) throw error;

      const geometry: AssemblageGeometry = {
        geometry: data[0]?.geometry,
        totalAcres: data[0]?.total_acres || 0,
        totalSqft: data[0]?.total_sqft || 0,
        zoningMix: data[0]?.zoning_mix || {},
        boundaryCoordinates: data[0]?.boundary_coordinates || ''
      };

      // Cache result
      setAssemblageMemo(prev => new Map(prev).set(cacheKey, geometry));
      
      return geometry;
    } catch (error) {
      console.error('Error getting assemblage geometry:', error);
      return null;
    }
  }, [assemblageMemo]);

  const calculateUnifiedConstraints = useCallback(async (
    parcels: SelectedParcel[]
  ): Promise<UnifiedConstraints | null> => {
    if (!parcels.length || !supabase) return null;

    try {
      const parcelIds = parcels.map(p => p.id);
      const { data, error } = await supabase
        .rpc('calculate_unified_constraints', { parcel_ids: parcelIds });

      if (error) throw error;

      return {
        maxFAR: data[0]?.max_far || 3.0,
        maxHeight: data[0]?.max_height_ft || 45,
        maxCoverage: data[0]?.max_coverage_pct || 40,
        setbacks: data[0]?.setbacks || { front: 25, rear: 20, side: 10 },
        limitingFactor: data[0]?.limiting_factor || 'Unknown',
        buildableAreaSqft: data[0]?.buildable_area_sqft || 0
      };
    } catch (error) {
      console.error('Error calculating constraints:', error);
      return null;
    }
  }, []);

  const optimizeYieldScenarios = useCallback(async (
    parcels: SelectedParcel[],
    targetIRR: number = 15.0
  ): Promise<YieldScenario[]> => {
    if (!Array.isArray(parcels) || !parcels.length || !supabase) return [];

    setIsOptimizing(true);

    try {
      const parcelIds = parcels.map(p => p.id);
      const { data, error } = await supabase
        .rpc('optimize_yield_scenarios', { 
          parcel_ids: parcelIds, 
          target_irr: targetIRR 
        });

      if (error) throw error;

      const scenarios: YieldScenario[] = data?.map((item: any) => ({
        scenarioName: item.scenario_name,
        farUtilization: item.far_utilization,
        heightUtilization: item.height_utilization,
        coverageUtilization: item.coverage_utilization,
        estimatedUnits: item.estimated_units,
        estimatedIRR: item.estimated_irr,
        estimatedROI: item.estimated_roi,
        constraintAnalysis: item.constraint_analysis
      })) || [];

      setOptimizationResults(scenarios);
      return scenarios;

    } catch (error) {
      console.error('Error optimizing scenarios:', error);
      return [];
    } finally {
      setIsOptimizing(false);
    }
  }, []);

  // Calculate live massing for any parcel count
  const calculateLiveMassing = useCallback(async (
    parcels: SelectedParcel[],
    config: SiteplanConfig
  ): Promise<BuildingMassing | null> => {
    if (!parcels.length) return null;

    const [geometry, constraints] = await Promise.all([
      getAssemblageGeometry(parcels),
      calculateUnifiedConstraints(parcels)
    ]);

    if (!geometry || !constraints) return null;

    // Apply most restrictive constraints
    const effectiveFAR = Math.min(config.targetFAR, constraints.maxFAR);
    const effectiveHeight = Math.min(config.targetHeight, constraints.maxHeight);
    const effectiveCoverage = Math.min(config.targetCoverage, constraints.maxCoverage);

    // Calculate optimal footprint
    const footprint = Math.min(
      geometry.totalSqft * (effectiveCoverage / 100),
      constraints.buildableAreaSqft
    );

    // Calculate total GSF
    const maxGSFFromFAR = geometry.totalSqft * effectiveFAR;
    const storiesFromHeight = Math.floor(effectiveHeight / 12);
    const maxGSFFromHeight = footprint * storiesFromHeight;
    const actualGSF = Math.min(maxGSFFromFAR, maxGSFFromHeight);

    // Calculate derived metrics
    const actualStories = Math.ceil(actualGSF / footprint);
    const actualHeight = actualStories * 12;
    const actualFAR = actualGSF / geometry.totalSqft;
    const units = Math.floor(geometry.totalAcres * (config.unitsPerAcre || 25));
    const parkingSpaces = Math.ceil(units * (config.parkingRatio || 1.2));

    return {
      footprint,
      totalGSF: actualGSF,
      height: actualHeight,
      stories: actualStories,
      units,
      parkingSpaces,
      coverage: (footprint / geometry.totalSqft) * 100,
      far: actualFAR,
      buildableArea: constraints.buildableAreaSqft,
      openSpaceArea: Math.max(geometry.totalSqft * 0.15, units * 100),
      parkingArea: parkingSpaces * 300,
      amenitySpace: Math.max(2000, units * 50),
      averageUnitSize: actualGSF / units,
      constructionCost: actualGSF * 180 * 1.3,
      estimatedValue: units * 350000,
      roiProjection: calculateROI(actualGSF, units, geometry.totalAcres),
      constraintAnalysis: {
        farUtilization: (actualFAR / constraints.maxFAR) * 100,
        heightUtilization: (actualHeight / constraints.maxHeight) * 100,
        coverageUtilization: ((footprint / geometry.totalSqft) * 100) / constraints.maxCoverage * 100,
        limitingFactor: constraints.limitingFactor
      }
    };
  }, [getAssemblageGeometry, calculateUnifiedConstraints]);

  return {
    getAssemblageGeometry,
    calculateUnifiedConstraints,
    optimizeYieldScenarios,
    calculateLiveMassing,
    isOptimizing,
    optimizationResults,
    clearCache: () => setAssemblageMemo(new Map())
  };
}

function calculateROI(gsf: number, units: number, acres: number): number {
  const constructionCost = gsf * 180 * 1.3;
  const estimatedValue = units * 350000;
  const landCost = acres * 500000; // Estimate
  return ((estimatedValue - constructionCost - landCost) / (constructionCost + landCost)) * 100;
}