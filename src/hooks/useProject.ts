import { useState, useCallback, useMemo } from 'react';
import { ProjectState, SelectedParcel, SiteplanConfig, BuildingMassing } from '../types/project';
import { supabase } from '../lib/supabase';

// Debounce utility
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

const DEFAULT_SITEPLAN_CONFIG: SiteplanConfig = {
  targetFAR: 2.0,
  targetHeight: 45,
  buildingSetbacks: {
    front: 25,
    rear: 20,
    side: 10
  },
  targetCoverage: 40,
  buildingType: 'residential',
  unitsPerAcre: 20,
  parkingRatio: 1.2
};

export function useProject() {
  const [project, setProject] = useState<ProjectState | null>(null);

  // Debounced save function
  const saveProject = useMemo(() => {
    if (!supabase) return () => {};
    return debounce(async (patch: Partial<ProjectState>) => {
      if (project?.id) {
        await supabase.from('projects').upsert({ id: project.id, ...patch });
      }
    }, 500);
  }, [project?.id]);

  const createProject = useCallback((name: string) => {
    const newProject: ProjectState = {
      id: `project_${Date.now()}`,
      name,
      parcels: [],
      totalAcreage: 0,
      totalSqft: 0,
      totalLandValue: 0,
      avgFAR: 0,
      maxUnits: 0,
      buildableArea: 0,
      siteplanConfig: { ...DEFAULT_SITEPLAN_CONFIG },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setProject(newProject);
    return newProject;
  }, []);

  const addParcel = useCallback((parcel: any) => {
    if (!project) return;

    const selectedParcel: SelectedParcel = {
      id: parcel.ogc_fid || parcel.id,
      parcelnumb: parcel.parcelnumb || parcel.parcelnumb_no_formatting,
      address: parcel.address || 'Address not available',
      deededacreage: parcel.deededacreage || parcel.gisacre || 0,
      sqft: parcel.sqft || (parcel.gisacre * 43560) || 0,
      zoning: parcel.zoning || 'Unknown',
      geometry: parcel.geometry,
      landval: parcel.landval,
      parval: parcel.parval,
      lat: parcel.lat,
      lon: parcel.lon,
      // Enhanced zoning constraints from actual data or defaults
      max_far: getZoningConstraint(parcel.zoning, 'far'),
      max_height_ft: getZoningConstraint(parcel.zoning, 'height'),
      max_coverage_pct: getZoningConstraint(parcel.zoning, 'coverage'),
      min_front_setback_ft: getZoningConstraint(parcel.zoning, 'front_setback'),
      min_rear_setback_ft: getZoningConstraint(parcel.zoning, 'rear_setback'),
      min_side_setback_ft: getZoningConstraint(parcel.zoning, 'side_setback'),
      // Additional attributes for better planning
      slope: parcel.slope || 'flat',
      flood_zone: parcel.fema_flood_zone,
      soil_type: parcel.soil_type || 'unknown',
      access_points: estimateAccessPoints(parcel),
      utilities: estimateUtilities(parcel)
    };

    // Check if parcel is already in project
    const existingIndex = project.parcels.findIndex(p => p.id === selectedParcel.id);
    if (existingIndex >= 0) return;

    setProject(prev => {
      if (!prev) return null;
      const updatedParcels = [...prev.parcels, selectedParcel];
      return {
        ...prev,
        parcels: updatedParcels,
        totalAcreage: updatedParcels.reduce((sum, p) => sum + p.deededacreage, 0),
        totalSqft: updatedParcels.reduce((sum, p) => sum + p.sqft, 0),
        totalLandValue: updatedParcels.reduce((sum, p) => sum + (p.landval || 0), 0),
        buildableArea: calculateBuildableArea(updatedParcels),
        updatedAt: new Date()
      };
    });
  }, [project]);

  const removeParcel = useCallback((parcelId: string) => {
    if (!project) return;

    setProject(prev => {
      if (!prev) return null;
      const updatedParcels = prev.parcels.filter(p => p.id !== parcelId);
      return {
        ...prev,
        parcels: updatedParcels,
        totalAcreage: updatedParcels.reduce((sum, p) => sum + p.deededacreage, 0),
        totalSqft: updatedParcels.reduce((sum, p) => sum + p.sqft, 0),
        totalLandValue: updatedParcels.reduce((sum, p) => sum + (p.landval || 0), 0),
        buildableArea: calculateBuildableArea(updatedParcels),
        updatedAt: new Date()
      };
    });
  }, [project]);

  const updateSiteplanConfig = useCallback((config: Partial<SiteplanConfig>) => {
    if (!project) return;

    setProject(prev => {
      if (!prev) return null;
      return {
        ...prev,
        siteplanConfig: { ...prev.siteplanConfig, ...config },
        updatedAt: new Date()
      };
    });
  }, [project]);

  const calculateMassing = useMemo((): BuildingMassing | null => {
    if (!project || project.parcels.length === 0) return null;

    const config = project.siteplanConfig;
    const parcels = project.parcels;
    
    // Calculate the most restrictive constraints across all parcels
    const constraints = {
      maxFAR: Math.min(...parcels.map(p => p.max_far || 3.0)),
      maxHeight: Math.min(...parcels.map(p => p.max_height_ft || 45)),
      maxCoverage: Math.min(...parcels.map(p => p.max_coverage_pct || 40)),
      setbacks: {
        front: Math.max(...parcels.map(p => p.min_front_setback_ft || 25)),
        rear: Math.max(...parcels.map(p => p.min_rear_setback_ft || 20)),
        side: Math.max(...parcels.map(p => p.min_side_setback_ft || 10))
      }
    };

    // Use user config or zoning constraints, whichever is more restrictive
    const effectiveFAR = Math.min(config.targetFAR, constraints.maxFAR);
    const effectiveHeight = Math.min(config.targetHeight, constraints.maxHeight);
    const effectiveCoverage = Math.min(config.targetCoverage, constraints.maxCoverage);
    
    // Enhanced buildable area calculation
    const totalSqft = project.totalSqft; // Always in square feet
    const buildableArea = calculateDetailedBuildableArea(parcels, constraints.setbacks);
    
    // Calculate footprint based on coverage and buildable area
    const footprint = buildableArea * (effectiveCoverage / 100);
    
    // Calculate total GSF based on FAR
    const maxGSFFromFAR = totalSqft * effectiveFAR;
    
    // Calculate stories and actual dimensions
    const storiesFromHeight = Math.floor(effectiveHeight / 12); // 12ft per story
    const maxGSFFromHeight = footprint * storiesFromHeight;
    
    // Use the more restrictive of FAR or height limit
    const actualGSF = Math.min(maxGSFFromFAR, maxGSFFromHeight);
    const actualStories = Math.ceil(actualGSF / footprint);
    const actualHeight = actualStories * 12;
    const actualFAR = actualGSF / totalSqft;
    
    // Calculate units for residential
    let units = 0;
    let averageUnitSize = 0;
    if (config.buildingType === 'residential') {
      if (config.unitsPerAcre) {
        units = Math.floor(project.totalAcreage * config.unitsPerAcre);
        averageUnitSize = actualGSF / units;
      } else {
        // Default unit size based on building type
        averageUnitSize = getDefaultUnitSize(parcels[0]?.zoning);
        units = Math.floor(actualGSF / averageUnitSize);
      }
    }
    
    // Calculate parking requirement
    const parkingSpaces = config.parkingRatio ? Math.ceil(units * config.parkingRatio) : 0;
    const parkingArea = parkingSpaces * 300; // 300 sqft per space including circulation
    
    // Calculate open space and amenities
    const openSpaceRequired = Math.max(totalSqft * 0.15, units * 100); // 15% or 100 sqft per unit
    const amenitySpace = config.buildingType === 'residential' ? Math.max(2000, units * 50) : 0;
    
    // Financial projections
    const estimatedConstructionCost = calculateConstructionCost(actualGSF, config.buildingType);
    const estimatedSaleValue = calculateSaleValue(actualGSF, units, parcels[0]?.zoning);
    
    return {
      footprint,
      totalGSF: actualGSF,
      height: actualHeight,
      stories: actualStories,
      units,
      parkingSpaces,
      coverage: (footprint / totalSqft) * 100,
      far: actualFAR,
      // Enhanced metrics
      buildableArea,
      openSpaceArea: openSpaceRequired,
      parkingArea,
      amenitySpace,
      averageUnitSize,
      constructionCost: estimatedConstructionCost,
      estimatedValue: estimatedSaleValue,
      roiProjection: estimatedSaleValue > 0 ? ((estimatedSaleValue - estimatedConstructionCost - project.totalLandValue) / (estimatedConstructionCost + project.totalLandValue)) * 100 : 0,
      // Constraint analysis
      constraintAnalysis: {
        farUtilization: (actualFAR / constraints.maxFAR) * 100,
        heightUtilization: (actualHeight / constraints.maxHeight) * 100,
        coverageUtilization: ((footprint / totalSqft) * 100) / constraints.maxCoverage * 100,
        limitingFactor: getLimitingFactor(actualGSF, maxGSFFromFAR, maxGSFFromHeight, footprint, buildableArea)
      }
    };
  }, [project]);

  return {
    project,
    createProject,
    addParcel,
    removeParcel,
    updateSiteplanConfig,
    calculateMassing,
    clearProject: () => setProject(null)
  };
}

// Enhanced helper functions
function getZoningConstraint(zoning: string, type: string): number {
  if (!zoning) return getDefaultConstraint(type);
  
  // Nashville-specific zoning constraints
  const zoningRules: Record<string, Record<string, number>> = {
    // Residential Single-Family
    'RS5': { far: 0.4, height: 35, coverage: 25, front_setback: 30, rear_setback: 25, side_setback: 15 },
    'RS7.5': { far: 0.35, height: 35, coverage: 25, front_setback: 30, rear_setback: 25, side_setback: 15 },
    'RS10': { far: 0.3, height: 35, coverage: 25, front_setback: 30, rear_setback: 25, side_setback: 15 },
    'RS15': { far: 0.25, height: 35, coverage: 20, front_setback: 35, rear_setback: 30, side_setback: 20 },
    'RS20': { far: 0.2, height: 35, coverage: 20, front_setback: 35, rear_setback: 30, side_setback: 20 },
    'RS30': { far: 0.15, height: 35, coverage: 15, front_setback: 40, rear_setback: 35, side_setback: 25 },
    'RS40': { far: 0.12, height: 35, coverage: 15, front_setback: 40, rear_setback: 35, side_setback: 25 },
    
    // Multi-Family Residential
    'R6': { far: 1.5, height: 45, coverage: 40, front_setback: 25, rear_setback: 20, side_setback: 10 },
    'R8': { far: 2.0, height: 45, coverage: 45, front_setback: 25, rear_setback: 20, side_setback: 10 },
    'R10': { far: 2.5, height: 60, coverage: 50, front_setback: 25, rear_setback: 20, side_setback: 10 },
    'R15': { far: 3.0, height: 60, coverage: 55, front_setback: 20, rear_setback: 20, side_setback: 10 },
    'R20': { far: 3.5, height: 75, coverage: 60, front_setback: 20, rear_setback: 20, side_setback: 10 },
    'R30': { far: 4.0, height: 75, coverage: 65, front_setback: 20, rear_setback: 20, side_setback: 10 },
    
    // Residential Mixed-Use
    'RM2': { far: 2.0, height: 45, coverage: 50, front_setback: 15, rear_setback: 15, side_setback: 5 },
    'RM4': { far: 2.5, height: 60, coverage: 55, front_setback: 15, rear_setback: 15, side_setback: 5 },
    'RM6': { far: 3.0, height: 60, coverage: 60, front_setback: 15, rear_setback: 15, side_setback: 5 },
    'RM9': { far: 3.5, height: 75, coverage: 65, front_setback: 10, rear_setback: 15, side_setback: 5 },
    'RM15': { far: 4.0, height: 90, coverage: 70, front_setback: 10, rear_setback: 15, side_setback: 5 },
    'RM20': { far: 5.0, height: 105, coverage: 75, front_setback: 10, rear_setback: 15, side_setback: 5 },
    'RM40': { far: 6.0, height: 120, coverage: 80, front_setback: 10, rear_setback: 15, side_setback: 5 },
    'RM60': { far: 7.0, height: 150, coverage: 85, front_setback: 10, rear_setback: 15, side_setback: 5 },
    'RM80': { far: 8.0, height: 200, coverage: 85, front_setback: 10, rear_setback: 15, side_setback: 5 },
    
    // Commercial
    'CN': { far: 2.0, height: 45, coverage: 60, front_setback: 15, rear_setback: 10, side_setback: 5 },
    'CR': { far: 2.5, height: 60, coverage: 70, front_setback: 10, rear_setback: 10, side_setback: 5 },
    'CS': { far: 3.0, height: 75, coverage: 75, front_setback: 10, rear_setback: 10, side_setback: 5 },
    'CA': { far: 4.0, height: 90, coverage: 80, front_setback: 5, rear_setback: 10, side_setback: 0 },
    'CL': { far: 5.0, height: 120, coverage: 85, front_setback: 5, rear_setback: 10, side_setback: 0 },
    'CC': { far: 6.0, height: 200, coverage: 90, front_setback: 0, rear_setback: 10, side_setback: 0 },
    
    // Mixed-Use
    'MUL': { far: 4.0, height: 90, coverage: 75, front_setback: 10, rear_setback: 15, side_setback: 5 },
    'MUN': { far: 5.0, height: 120, coverage: 80, front_setback: 5, rear_setback: 15, side_setback: 5 },
    'MUG': { far: 8.0, height: 200, coverage: 85, front_setback: 0, rear_setback: 15, side_setback: 0 },
    
    // Industrial
    'IWD': { far: 2.0, height: 60, coverage: 70, front_setback: 20, rear_setback: 20, side_setback: 15 },
    'IG': { far: 3.0, height: 75, coverage: 80, front_setback: 15, rear_setback: 20, side_setback: 10 },
    'IR': { far: 4.0, height: 100, coverage: 85, front_setback: 10, rear_setback: 20, side_setback: 10 }
  };
  
  return zoningRules[zoning]?.[type] || getDefaultConstraint(type);
}

function getDefaultConstraint(type: string): number {
  const defaults: Record<string, number> = {
    far: 2.0,
    height: 45,
    coverage: 40,
    front_setback: 25,
    rear_setback: 20,
    side_setback: 10
  };
  return defaults[type] || 0;
}

function calculateBuildableArea(parcels: SelectedParcel[]): number {
  return parcels.reduce((total, parcel) => {
    const setbacks = {
      front: parcel.min_front_setback_ft || 25,
      rear: parcel.min_rear_setback_ft || 20,
      side: parcel.min_side_setback_ft || 10
    };
    
    // Rough approximation: assume square lot for setback calculation
    const sideLength = Math.sqrt(parcel.sqft);
    const buildableWidth = Math.max(0, sideLength - (setbacks.side * 2));
    const buildableDepth = Math.max(0, sideLength - setbacks.front - setbacks.rear);
    
    return total + (buildableWidth * buildableDepth);
  }, 0);
}

function calculateDetailedBuildableArea(parcels: SelectedParcel[], setbacks: any): number {
  return parcels.reduce((total, parcel) => {
    // More sophisticated calculation would use actual parcel geometry
    // For now, use rectangular approximation
    const sideLength = Math.sqrt(parcel.sqft);
    const buildableWidth = Math.max(0, sideLength - (setbacks.side * 2));
    const buildableDepth = Math.max(0, sideLength - setbacks.front - setbacks.rear);
    
    // Account for slope and other constraints
    const slopeReduction = parcel.slope === 'steep' ? 0.8 : parcel.slope === 'moderate' ? 0.9 : 1.0;
    const floodReduction = parcel.flood_zone && parcel.flood_zone !== 'X' ? 0.9 : 1.0;
    
    return total + (buildableWidth * buildableDepth * slopeReduction * floodReduction);
  }, 0);
}

function estimateAccessPoints(parcel: any): number {
  // Estimate number of street access points based on parcel characteristics
  if (parcel.sqft > 50000) return 2; // Large parcels likely have multiple access points
  if (parcel.sqft > 20000) return 1.5; // Medium parcels might have corner access
  return 1; // Small parcels typically have single access
}

function estimateUtilities(parcel: any): string[] {
  // Estimate available utilities based on location and zoning
  const utilities = ['electricity', 'water'];
  
  if (parcel.zoning && !parcel.zoning.startsWith('AG')) {
    utilities.push('sewer', 'gas');
  }
  
  if (parcel.city && parcel.city.toLowerCase() === 'nashville') {
    utilities.push('fiber');
  }
  
  return utilities;
}

function getDefaultUnitSize(zoning: string): number {
  if (!zoning) return 1200;
  
  if (zoning.startsWith('RS')) return 2000; // Single family
  if (zoning.startsWith('R6') || zoning.startsWith('R8')) return 900; // Small multi-family
  if (zoning.startsWith('R')) return 1100; // Larger multi-family
  if (zoning.includes('RM')) return 1000; // Mixed residential
  
  return 1200; // Default
}

function calculateConstructionCost(gsf: number, buildingType: string): number {
  const costPerSF: Record<string, number> = {
    residential: 180,
    commercial: 220,
    'mixed-use': 200
  };
  
  const baseCost = gsf * (costPerSF[buildingType] || 180);
  
  // Add soft costs (20%) and contingency (10%)
  return baseCost * 1.3;
}

function calculateSaleValue(gsf: number, units: number, zoning: string): number {
  if (units > 0) {
    // Residential - value per unit
    const pricePerUnit = getMarketPricePerUnit(zoning);
    return units * pricePerUnit;
  } else {
    // Commercial - value per square foot
    const pricePerSF = getMarketPricePerSF(zoning);
    return gsf * pricePerSF;
  }
}

function getMarketPricePerUnit(zoning: string): number {
  // Nashville market pricing estimates
  if (zoning?.startsWith('R6') || zoning?.startsWith('R8')) return 250000; // Affordable multi-family
  if (zoning?.startsWith('R')) return 320000; // Market rate multi-family
  if (zoning?.includes('RM')) return 380000; // Mixed residential
  return 300000; // Default
}

function getMarketPricePerSF(zoning: string): number {
  // Commercial pricing per square foot
  if (zoning?.startsWith('C')) return 250;
  if (zoning?.includes('MU')) return 280;
  return 200; // Default
}

function getLimitingFactor(actualGSF: number, maxGSFFromFAR: number, maxGSFFromHeight: number, footprint: number, buildableArea: number): string {
  if (actualGSF >= maxGSFFromFAR * 0.95) return 'FAR Limit';
  if (actualGSF >= maxGSFFromHeight * 0.95) return 'Height Limit';
  if (footprint >= buildableArea * 0.95) return 'Setback Constraints';
  return 'Design Choice';
}