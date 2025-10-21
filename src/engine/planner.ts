import type { Polygon } from 'geojson';
import type { PlannerConfig, PlannerOutput, Element, Envelope } from './types';
import { createEnvelope, areaSqft } from './geometry';
import { generateBuildingFootprints } from './building';
import { generateParking } from './parking';
import { calculateMetrics } from './analysis';

/**
 * Main site planning orchestrator
 */
export function generateSitePlan(
  parcelGeoJSON: Polygon,
  config: PlannerConfig
): PlannerOutput {
  const startTime = performance.now();
  
  try {
    // Create envelope from parcel geometry
    const envelope = createEnvelope(parcelGeoJSON);
    const parcelAreaSqFt = envelope.areaSqFt;
    
    // Generate building footprints
    const buildingConfig = {
      targetFAR: config.designParameters.targetFAR,
      targetCoveragePct: config.designParameters.targetCoveragePct || 50,
      typology: config.designParameters.buildingTypology,
      numBuildings: config.designParameters.numBuildings,
      maxHeightFt: config.zoning.maxFar ? Math.floor(config.zoning.maxFar * 10) : undefined,
      minHeightFt: 20
    };
    
    const buildings = generateBuildingFootprints(
      envelope.geometry,
      buildingConfig,
      parcelAreaSqFt
    );
    
    // Calculate required parking
    const totalUnits = buildings.reduce((sum, building) => 
      sum + (building.properties.units || 0), 0);
    const targetStalls = Math.ceil(totalUnits * config.designParameters.parking.targetRatio);
    
    // Generate parking layout
    const parkingResult = generateParking(
      envelope.geometry,
      config.designParameters.parking,
      targetStalls
    );
    
    // Combine all elements
    const allElements: Element[] = [
      ...buildings,
      ...parkingResult.features
    ];
    
    // Calculate metrics
    const metrics = calculateMetrics(allElements, parcelAreaSqFt, config);
    
    // Add greenspace elements if needed
    const greenspaceElements = generateGreenspaceElements(
      envelope.geometry,
      allElements,
      config
    );
    
    allElements.push(...greenspaceElements);
    
    const processingTime = performance.now() - startTime;
    
    return {
      elements: allElements,
      metrics,
      envelope,
      processingTime
    };
    
  } catch (error) {
    console.error('Error in generateSitePlan:', error);
    
    const processingTime = performance.now() - startTime;
    
    return {
      elements: [],
      metrics: {
        totalBuiltSF: 0,
        siteCoveragePct: 0,
        achievedFAR: 0,
        parkingRatio: 0,
        openSpacePct: 0,
        zoningCompliant: false,
        violations: ['Site plan generation failed'],
        warnings: []
      },
      envelope: createEnvelope(parcelGeoJSON),
      processingTime
    };
  }
}

/**
 * Generate greenspace elements
 */
function generateGreenspaceElements(
  envelope: Polygon,
  existingElements: Element[],
  config: PlannerConfig
): Element[] {
  const greenspaceElements: Element[] = [];
  
  // Calculate remaining area for greenspace
  const totalUsedArea = existingElements.reduce((sum, element) => 
    sum + (element.properties.areaSqFt || 0), 0);
  const envelopeArea = areaSqft(envelope);
  const remainingArea = envelopeArea - totalUsedArea;
  
  // Target 20% greenspace minimum
  const targetGreenspace = envelopeArea * 0.2;
  
  if (remainingArea > targetGreenspace) {
    // Create a simple greenspace element
    const greenspaceElement: Element = {
      id: 'greenspace_1',
      type: 'greenspace',
      name: 'Open Space',
      geometry: envelope, // Simplified - would need proper calculation
      properties: {
        areaSqFt: Math.min(remainingArea, targetGreenspace),
        use: 'landscaping'
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'ai-generated'
      }
    };
    
    greenspaceElements.push(greenspaceElement);
  }
  
  return greenspaceElements;
}

/**
 * Optimize site plan for better performance
 */
export function optimizeSitePlan(
  initialPlan: PlannerOutput,
  config: PlannerConfig
): PlannerOutput {
  // Simple optimization: try to improve building placement
  const optimizedBuildings = optimizeBuildingPlacement(
    initialPlan.elements.filter(el => el.type === 'building'),
    initialPlan.envelope.geometry,
    config
  );
  
  // Recalculate metrics with optimized buildings
  const allElements = [
    ...optimizedBuildings,
    ...initialPlan.elements.filter(el => el.type !== 'building')
  ];
  
  const metrics = calculateMetrics(allElements, initialPlan.envelope.areaSqFt, config);
  
  return {
    ...initialPlan,
    elements: allElements,
    metrics
  };
}

/**
 * Validate site plan against constraints
 */
export function validateSitePlan(
  plan: PlannerOutput,
  config: PlannerConfig
): {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  score: number;
} {
  const violations: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  
  // Check zoning compliance
  if (!plan.metrics.zoningCompliant) {
    violations.push(...plan.metrics.violations);
    score -= plan.metrics.violations.length * 20;
  }
  
  // Check performance targets
  if (plan.metrics.achievedFAR < config.designParameters.targetFAR * 0.9) {
    warnings.push(`FAR ${plan.metrics.achievedFAR.toFixed(2)} below target ${config.designParameters.targetFAR}`);
    score -= 10;
  }
  
  if (plan.metrics.siteCoveragePct < (config.designParameters.targetCoveragePct || 50) * 0.9) {
    warnings.push(`Coverage ${plan.metrics.siteCoveragePct.toFixed(1)}% below target ${config.designParameters.targetCoveragePct || 50}%`);
    score -= 10;
  }
  
  // Check processing time
  if (plan.processingTime > 300) {
    warnings.push(`Processing time ${plan.processingTime.toFixed(0)}ms exceeds 300ms target`);
    score -= 5;
  }
  
  return {
    isValid: violations.length === 0,
    violations,
    warnings,
    score: Math.max(0, score)
  };
}

/**
 * Generate multiple site plan alternatives
 */
export function generateAlternatives(
  parcelGeoJSON: Polygon,
  baseConfig: PlannerConfig,
  variations: Partial<PlannerConfig>[]
): PlannerOutput[] {
  const alternatives: PlannerOutput[] = [];
  
  for (const variation of variations) {
    const config = { ...baseConfig, ...variation };
    const plan = generateSitePlan(parcelGeoJSON, config);
    alternatives.push(plan);
  }
  
  return alternatives;
}

// Helper function for building optimization
function optimizeBuildingPlacement(
  buildings: Element[],
  envelope: Polygon,
  config: PlannerConfig
): Element[] {
  // Simple optimization: sort by area and adjust positions
  return buildings.sort((a, b) => (b.properties.areaSqFt || 0) - (a.properties.areaSqFt || 0));
}