import type { Element, SiteMetrics, SitePlanConfig } from './types';
import { calculatePolygonArea, analyzeGeometry } from './geometry';

/**
 * Calculate comprehensive site metrics
 */
export function calculateSiteMetrics(
  elements: Element[],
  config: SitePlanConfig
): SiteMetrics {
  const buildings = elements.filter(e => e.type === 'building');
  const parking = elements.filter(e => e.type === 'parking');
  const greenspace = elements.filter(e => e.type === 'greenspace');
  
  // Calculate areas
  const totalBuiltSF = buildings.reduce((sum, building) => 
    sum + (building.properties.area || calculatePolygonArea(building.vertices)), 0
  );
  
  const totalParkingArea = parking.reduce((sum, stall) => 
    sum + (stall.properties.area || calculatePolygonArea(stall.vertices)), 0
  );
  
  const totalGreenspaceArea = greenspace.reduce((sum, space) => 
    sum + (space.properties.area || calculatePolygonArea(space.vertices)), 0
  );
  
  const totalSiteArea = config.parcelArea;
  const buildableArea = config.buildableArea;
  
  // Calculate metrics
  const siteCoverage = totalSiteArea > 0 ? (totalBuiltSF / totalSiteArea) * 100 : 0;
  const achievedFAR = totalSiteArea > 0 ? totalBuiltSF / totalSiteArea : 0;
  const parkingRatio = totalBuiltSF > 0 ? totalParkingArea / totalBuiltSF : 0;
  const openSpacePercent = totalSiteArea > 0 ? (totalGreenspaceArea / totalSiteArea) * 100 : 0;
  
  // Calculate utilization (how well the space is used)
  const usedArea = totalBuiltSF + totalParkingArea + totalGreenspaceArea;
  const utilization = buildableArea > 0 ? (usedArea / buildableArea) * 100 : 0;
  
  return {
    totalBuiltSF,
    siteCoverage,
    achievedFAR,
    parkingRatio,
    openSpacePercent,
    buildingCount: buildings.length,
    parkingStallCount: parking.length,
    utilization
  };
}

/**
 * Calculate zoning compliance
 */
export function calculateZoningCompliance(
  elements: Element[],
  config: SitePlanConfig
): {
  isCompliant: boolean;
  violations: string[];
  warnings: string[];
  score: number;
} {
  const metrics = calculateSiteMetrics(elements, config);
  const violations: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  
  // Check FAR compliance
  if (metrics.achievedFAR > config.maxFAR) {
    violations.push(`FAR exceeds maximum: ${metrics.achievedFAR.toFixed(2)} > ${config.maxFAR}`);
    score -= 30;
  } else if (metrics.achievedFAR < config.targetFAR * 0.8) {
    warnings.push(`FAR below target: ${metrics.achievedFAR.toFixed(2)} < ${config.targetFAR}`);
    score -= 10;
  }
  
  // Check coverage compliance
  if (metrics.siteCoverage > config.maxCoverage) {
    violations.push(`Site coverage exceeds maximum: ${metrics.siteCoverage.toFixed(1)}% > ${config.maxCoverage}%`);
    score -= 25;
  }
  
  // Check parking ratio
  const requiredParkingRatio = config.parkingRatio;
  if (metrics.parkingRatio < requiredParkingRatio * 0.9) {
    violations.push(`Insufficient parking: ${metrics.parkingRatio.toFixed(2)} < ${requiredParkingRatio}`);
    score -= 20;
  } else if (metrics.parkingRatio > requiredParkingRatio * 1.2) {
    warnings.push(`Excessive parking: ${metrics.parkingRatio.toFixed(2)} > ${requiredParkingRatio}`);
    score -= 5;
  }
  
  // Check building count
  if (metrics.buildingCount === 0) {
    violations.push('No buildings on site');
    score -= 50;
  }
  
  // Check open space
  if (metrics.openSpacePercent < 10) {
    warnings.push(`Low open space: ${metrics.openSpacePercent.toFixed(1)}% < 10%`);
    score -= 5;
  }
  
  return {
    isCompliant: violations.length === 0,
    violations,
    warnings,
    score: Math.max(0, score)
  };
}

/**
 * Calculate financial metrics
 */
export function calculateFinancialMetrics(
  elements: Element[],
  config: SitePlanConfig,
  marketData?: {
    pricePerSqft: number;
    constructionCostPerSqft: number;
    parkingValuePerStall: number;
  }
): {
  totalValue: number;
  constructionCost: number;
  netValue: number;
  valuePerAcre: number;
  roi: number;
} {
  const metrics = calculateSiteMetrics(elements, config);
  const buildings = elements.filter(e => e.type === 'building');
  const parking = elements.filter(e => e.type === 'parking');
  
  // Default market data if not provided
  const defaults = {
    pricePerSqft: 200,
    constructionCostPerSqft: 150,
    parkingValuePerStall: 5000
  };
  
  const market = marketData || defaults;
  
  // Calculate values
  const buildingValue = metrics.totalBuiltSF * market.pricePerSqft;
  const parkingValue = metrics.parkingStallCount * market.parkingValuePerStall;
  const totalValue = buildingValue + parkingValue;
  
  const constructionCost = metrics.totalBuiltSF * market.constructionCostPerSqft;
  const netValue = totalValue - constructionCost;
  
  const valuePerAcre = config.parcelArea > 0 ? totalValue / (config.parcelArea / 43560) : 0;
  const roi = constructionCost > 0 ? (netValue / constructionCost) * 100 : 0;
  
  return {
    totalValue,
    constructionCost,
    netValue,
    valuePerAcre,
    roi
  };
}

/**
 * Calculate environmental metrics
 */
export function calculateEnvironmentalMetrics(
  elements: Element[],
  config: SitePlanConfig
): {
  greenSpacePercent: number;
  treeCanopyPercent: number;
  imperviousSurfacePercent: number;
  stormwaterRunoff: number;
  carbonSequestration: number;
} {
  const metrics = calculateSiteMetrics(elements, config);
  const greenspace = elements.filter(e => e.type === 'greenspace');
  const buildings = elements.filter(e => e.type === 'building');
  const parking = elements.filter(e => e.type === 'parking');
  
  const totalSiteArea = config.parcelArea;
  const greenSpaceArea = greenspace.reduce((sum, space) => 
    sum + (space.properties.area || calculatePolygonArea(space.vertices)), 0
  );
  
  const buildingArea = buildings.reduce((sum, building) => 
    sum + (building.properties.area || calculatePolygonArea(building.vertices)), 0
  );
  
  const parkingArea = parking.reduce((sum, stall) => 
    sum + (stall.properties.area || calculatePolygonArea(stall.vertices)), 0
  );
  
  const greenSpacePercent = totalSiteArea > 0 ? (greenSpaceArea / totalSiteArea) * 100 : 0;
  const treeCanopyPercent = greenSpacePercent * 0.6; // Assume 60% of greenspace has tree canopy
  const imperviousSurfacePercent = totalSiteArea > 0 ? 
    ((buildingArea + parkingArea) / totalSiteArea) * 100 : 0;
  
  // Calculate stormwater runoff (simplified)
  const stormwaterRunoff = imperviousSurfacePercent * 0.9; // 90% runoff from impervious surfaces
  
  // Calculate carbon sequestration (simplified)
  const carbonSequestration = treeCanopyPercent * 0.5; // 0.5 tons per acre per year
  
  return {
    greenSpacePercent,
    treeCanopyPercent,
    imperviousSurfacePercent,
    stormwaterRunoff,
    carbonSequestration
  };
}

/**
 * Calculate accessibility metrics
 */
export function calculateAccessibilityMetrics(
  elements: Element[],
  config: SitePlanConfig
): {
  adaCompliance: number;
  walkabilityScore: number;
  connectivityIndex: number;
  universalDesignScore: number;
} {
  const parking = elements.filter(e => e.type === 'parking');
  const buildings = elements.filter(e => e.type === 'building');
  
  // Calculate ADA compliance
  const totalStalls = parking.length;
  const adaStalls = parking.filter(p => p.properties.stallType === 'handicap').length;
  const requiredAdaStalls = Math.max(1, Math.ceil(totalStalls * 0.04)); // 4% ADA requirement
  const adaCompliance = totalStalls > 0 ? Math.min(100, (adaStalls / requiredAdaStalls) * 100) : 100;
  
  // Calculate walkability score (simplified)
  const buildingCount = buildings.length;
  const walkabilityScore = Math.min(100, buildingCount * 20); // More buildings = better walkability
  
  // Calculate connectivity index (simplified)
  const connectivityIndex = Math.min(100, (buildingCount + parking.length) * 5);
  
  // Calculate universal design score
  const universalDesignScore = (adaCompliance + walkabilityScore + connectivityIndex) / 3;
  
  return {
    adaCompliance,
    walkabilityScore,
    connectivityIndex,
    universalDesignScore
  };
}

/**
 * Generate comprehensive site analysis report
 */
export function generateSiteAnalysisReport(
  elements: Element[],
  config: SitePlanConfig,
  marketData?: any
): {
  metrics: SiteMetrics;
  compliance: ReturnType<typeof calculateZoningCompliance>;
  financial: ReturnType<typeof calculateFinancialMetrics>;
  environmental: ReturnType<typeof calculateEnvironmentalMetrics>;
  accessibility: ReturnType<typeof calculateAccessibilityMetrics>;
  recommendations: string[];
} {
  const metrics = calculateSiteMetrics(elements, config);
  const compliance = calculateZoningCompliance(elements, config);
  const financial = calculateFinancialMetrics(elements, config, marketData);
  const environmental = calculateEnvironmentalMetrics(elements, config);
  const accessibility = calculateAccessibilityMetrics(elements, config);
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (compliance.violations.length > 0) {
    recommendations.push('Address zoning violations to ensure compliance');
  }
  
  if (metrics.achievedFAR < config.targetFAR * 0.9) {
    recommendations.push('Consider increasing building density to meet target FAR');
  }
  
  if (metrics.parkingRatio < config.parkingRatio * 0.9) {
    recommendations.push('Add more parking to meet requirements');
  }
  
  if (environmental.greenSpacePercent < 20) {
    recommendations.push('Increase green space to improve environmental performance');
  }
  
  if (accessibility.adaCompliance < 100) {
    recommendations.push('Add more ADA-compliant parking spaces');
  }
  
  if (financial.roi < 10) {
    recommendations.push('Consider optimizing building mix for better financial returns');
  }
  
  return {
    metrics,
    compliance,
    financial,
    environmental,
    accessibility,
    recommendations
  };
}

/**
 * Calculate density metrics
 */
export function calculateDensityMetrics(
  elements: Element[],
  config: SitePlanConfig
): {
  dwellingUnitsPerAcre: number;
  floorAreaRatio: number;
  buildingCoverage: number;
  openSpaceRatio: number;
  densityScore: number;
} {
  const metrics = calculateSiteMetrics(elements, config);
  const buildings = elements.filter(e => e.type === 'building');
  
  // Calculate dwelling units (simplified - assume 1 unit per 1000 sq ft)
  const totalUnits = buildings.reduce((sum, building) => {
    const area = building.properties.area || calculatePolygonArea(building.vertices);
    return sum + Math.floor(area / 1000);
  }, 0);
  
  const acres = config.parcelArea / 43560; // Convert sq ft to acres
  const dwellingUnitsPerAcre = acres > 0 ? totalUnits / acres : 0;
  
  const floorAreaRatio = metrics.achievedFAR;
  const buildingCoverage = metrics.siteCoverage;
  const openSpaceRatio = metrics.openSpacePercent / 100;
  
  // Calculate density score (0-100)
  const densityScore = Math.min(100, 
    (dwellingUnitsPerAcre * 2) + 
    (floorAreaRatio * 20) + 
    (buildingCoverage * 0.5)
  );
  
  return {
    dwellingUnitsPerAcre,
    floorAreaRatio,
    buildingCoverage,
    openSpaceRatio,
    densityScore
  };
}
