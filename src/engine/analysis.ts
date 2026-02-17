import type { Element, SiteMetrics, PlannerConfig } from './types';
import type { Polygon } from 'geojson';
import { areaSqft } from './geometry';
import { gradeCost, createTestDEMSampler, type DEMSampler } from '../grading/gradePad';

/**
 * Generate site analysis report (worker interface)
 */
export function generateSiteAnalysisReport(
  elements: Element[],
  config: any,
  marketData?: any
): {
  metrics: SiteMetrics;
  efficiency: any;
  financial: any;
  environmental: any;
  compliance: any;
} {
  const parcelAreaSqFt = config.parcelAreaSqFt || 43560; // Default to 1 acre
  const metrics = calculateMetrics(elements, parcelAreaSqFt, config);
  const efficiency = calculateBuildingEfficiency(elements);
  const financial = calculateFinancialMetrics(elements, parcelAreaSqFt, marketData);
  const environmental = calculateEnvironmentalMetrics(elements);
  const compliance = generateComplianceReport(metrics, config);
  
  return {
    metrics,
    efficiency,
    financial,
    environmental,
    compliance
  };
}

/**
 * Calculate comprehensive site metrics
 */
export function calculateMetrics(
  elements: Element[],
  parcelAreaSqFt: number,
  config: PlannerConfig
): SiteMetrics {
  // Separate elements by type
  const buildings = elements.filter(el => el.type === 'building');
  const parking = elements.filter(el => el.type === 'parking');
  const greenspace = elements.filter(el => el.type === 'greenspace');
  
  // Calculate areas
  const totalBuiltSF = buildings.reduce((sum, building) => 
    sum + (building.properties.areaSqFt || 0), 0);
  
  const totalParkingArea = parking.reduce((sum, stall) => 
    sum + (stall.properties.areaSqFt || 0), 0);
  
  const totalGreenspaceArea = greenspace.reduce((sum, space) => 
    sum + (space.properties.areaSqFt || 0), 0);
  
  // Calculate metrics
  const siteCoveragePct = (totalBuiltSF / parcelAreaSqFt) * 100;
  const achievedFAR = totalBuiltSF / parcelAreaSqFt;
  const openSpacePct = (totalGreenspaceArea / parcelAreaSqFt) * 100;
  
  // Calculate parking ratio
  const totalUnits = buildings.reduce((sum, building) => 
    sum + (building.properties.units || 0), 0);
  const totalStalls = parking.reduce((sum, stall) => 
    sum + (stall.properties.parkingSpaces || 0), 0);
  
  const parkingRatio = totalUnits > 0 ? totalStalls / totalUnits : 0;
  
  // Check compliance
  const violations: string[] = [];
  const warnings: string[] = [];
  
  // Check FAR compliance
  if (config.zoning.maxFar && achievedFAR > config.zoning.maxFar) {
    violations.push(`FAR ${achievedFAR.toFixed(2)} exceeds maximum ${config.zoning.maxFar}`);
  }
  
  // Check coverage compliance
  if (config.zoning.maxCoveragePct && siteCoveragePct > config.zoning.maxCoveragePct) {
    violations.push(`Coverage ${siteCoveragePct.toFixed(1)}% exceeds maximum ${config.zoning.maxCoveragePct}%`);
  }
  
  // Check parking ratio
  if (config.zoning.minParkingRatio && parkingRatio < config.zoning.minParkingRatio) {
    violations.push(`Parking ratio ${parkingRatio.toFixed(2)} below minimum ${config.zoning.minParkingRatio}`);
  }
  
  // Check target FAR
  if (config.designParameters.targetFAR && achievedFAR < config.designParameters.targetFAR * 0.9) {
    warnings.push(`FAR ${achievedFAR.toFixed(2)} below target ${config.designParameters.targetFAR}`);
  }
  
  // Check target coverage
  if (config.designParameters.targetCoveragePct && siteCoveragePct < config.designParameters.targetCoveragePct * 0.9) {
    warnings.push(`Coverage ${siteCoveragePct.toFixed(1)}% below target ${config.designParameters.targetCoveragePct}%`);
  }
  
  return {
    totalBuiltSF,
    siteCoveragePct,
    achievedFAR,
    parkingRatio,
    openSpacePct,
    zoningCompliant: violations.length === 0,
    violations,
    warnings
  };
}

/**
 * Calculate building efficiency metrics
 */
export function calculateBuildingEfficiency(elements: Element[]): {
  avgUnitSize: number;
  buildingEfficiency: number;
  parkingEfficiency: number;
} {
  const buildings = elements.filter(el => el.type === 'building');
  const parking = elements.filter(el => el.type === 'parking');
  
  const totalUnits = buildings.reduce((sum, building) => 
    sum + (building.properties.units || 0), 0);
  const totalBuiltSF = buildings.reduce((sum, building) => 
    sum + (building.properties.areaSqFt || 0), 0);
  const totalStalls = parking.reduce((sum, stall) => 
    sum + (stall.properties.parkingSpaces || 0), 0);
  
  const avgUnitSize = totalUnits > 0 ? totalBuiltSF / totalUnits : 0;
  // Weighted average unit net size (from standard unit mix: 10% 450sf, 40% 650sf, 35% 900sf, 15% 1200sf)
  const WEIGHTED_AVG_UNIT_SF = 720;
  const buildingEfficiency = totalBuiltSF > 0 ? (totalUnits * WEIGHTED_AVG_UNIT_SF) / totalBuiltSF : 0;
  const parkingEfficiency = totalUnits > 0 ? totalStalls / totalUnits : 0;
  
  return {
    avgUnitSize,
    buildingEfficiency,
    parkingEfficiency
  };
}

/**
 * Calculate financial metrics
 */
export function calculateFinancialMetrics(
  elements: Element[],
  parcelAreaSqFt: number,
  marketData?: {
    pricePerSqFt?: number;
    rentPerSqFt?: number;
    constructionCostPerSqFt?: number;
  }
): {
  totalValue: number;
  totalRevenue: number;
  totalCost: number;
  netValue: number;
  valuePerAcre: number;
} {
  const buildings = elements.filter(el => el.type === 'building');
  const totalBuiltSF = buildings.reduce((sum, building) => 
    sum + (building.properties.areaSqFt || 0), 0);
  
  const pricePerSqFt = marketData?.pricePerSqFt || 200;
  const rentPerSqFt = marketData?.rentPerSqFt || 2.0;
  const constructionCostPerSqFt = marketData?.constructionCostPerSqFt || 150;
  
  const totalValue = totalBuiltSF * pricePerSqFt;
  const totalRevenue = totalBuiltSF * rentPerSqFt * 12; // Annual rent
  const totalCost = totalBuiltSF * constructionCostPerSqFt;
  const netValue = totalValue - totalCost;
  const valuePerAcre = (netValue / parcelAreaSqFt) * 43560; // Convert to per acre
  
  return {
    totalValue,
    totalRevenue,
    totalCost,
    netValue,
    valuePerAcre
  };
}

/**
 * Calculate environmental metrics
 */
export function calculateEnvironmentalMetrics(elements: Element[]): {
  totalGreenspace: number;
  greenspacePct: number;
  treeCount: number;
  permeableArea: number;
} {
  const greenspace = elements.filter(el => el.type === 'greenspace');
  const totalGreenspace = greenspace.reduce((sum, space) => 
    sum + (space.properties.areaSqFt || 0), 0);
  
  // Estimate tree count (1 tree per 100 sqft of greenspace)
  const treeCount = Math.floor(totalGreenspace / 100);
  
  // Assume 80% of greenspace is permeable
  const permeableArea = totalGreenspace * 0.8;
  
  return {
    totalGreenspace,
    greenspacePct: 0, // Will be calculated by caller with parcel area
    treeCount,
    permeableArea
  };
}

/**
 * Generate compliance report
 */
export function generateComplianceReport(
  metrics: SiteMetrics,
  config: PlannerConfig
): {
  overallScore: number;
  complianceStatus: 'compliant' | 'non-compliant' | 'warning';
  recommendations: string[];
} {
  let score = 100;
  const recommendations: string[] = [];
  
  // Deduct points for violations
  score -= metrics.violations.length * 20;
  
  // Deduct points for warnings
  score -= metrics.warnings.length * 5;
  
  // Check FAR performance
  if (metrics.achievedFAR < config.designParameters.targetFAR * 0.8) {
    score -= 15;
    recommendations.push('Consider increasing building density to meet FAR target');
  }
  
  // Check coverage performance
  if (metrics.siteCoveragePct < (config.designParameters.targetCoveragePct || 50) * 0.8) {
    score -= 10;
    recommendations.push('Consider increasing building footprint to meet coverage target');
  }
  
  // Check parking adequacy
  if (metrics.parkingRatio < (config.zoning.minParkingRatio || 1.0)) {
    score -= 20;
    recommendations.push('Increase parking to meet minimum requirements');
  }
  
  // Check open space
  if (metrics.openSpacePct < 20) {
    score -= 10;
    recommendations.push('Consider adding more open space for environmental benefits');
  }
  
  const complianceStatus = score >= 80 ? 'compliant' : 
                          score >= 60 ? 'warning' : 'non-compliant';
  
  return {
    overallScore: Math.max(0, score),
    complianceStatus,
    recommendations
  };
}

/**
 * Estimate earthwork (cut/fill) for a site plan
 */
export function estimateEarthwork(
  envelope: Polygon,
  config: PlannerConfig
): { cutCY: number; fillCY: number; netCY: number; totalCost: number } {
  // For now, use createTestDEMSampler or a stub DEM sampler.
  const dem = createTestDEMSampler(100, 0.01);
  const padElevationFt = config.designParameters.padElevationFt ?? 100;
  const result = gradeCost(envelope, dem, { padElevationFt });
  return {
    cutCY: result.cutCY,
    fillCY: result.fillCY,
    netCY: result.netCY,
    totalCost: result.totalCost
  };
}