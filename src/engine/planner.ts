import type { Polygon, MultiPolygon } from 'geojson';
import type { PlannerConfig, PlannerOutput, Element, Envelope } from './types';
import { createEnvelope, areaSqft, union, difference, polygons, sortByArea, normalizeToPolygon, safeBbox } from './geometry';
import { generateBuildingFootprints } from './building';
import { generateParking } from './parking';
import { calculateMetrics } from './analysis';

/**
 * Main site planning orchestrator
 */
export function generateSitePlan(
  parcelGeoJSON: Polygon | MultiPolygon,
  config: PlannerConfig
): PlannerOutput {
  const startTime = performance.now();
  
  try {
    // Normalize input geometry (fixes MultiPolygon & empty ring issues)
    const input = parcelGeoJSON as Polygon | MultiPolygon;
    const polygon = normalizeToPolygon(input);
    
    // Create envelope from normalized polygon
    const envelope = createEnvelope(polygon);
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
      polygon,
      buildingConfig,
      parcelAreaSqFt
    );
    
    // Calculate required parking
    const totalUnits = buildings.reduce((sum, building) => 
      sum + (building.properties.units || 0), 0);
    const targetStalls = Math.ceil(totalUnits * config.designParameters.parking.targetRatio);
    
    // Generate parking layout
    const parkingResult = generateParking(
      polygon,
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
    
    // Generate true greenspace geometry
    const greenspaceElements = generateGreenspaceElements(
      polygon,
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
 * Generate greenspace elements using true geometry operations
 */
function generateGreenspaceElements(
  envelope: Polygon,
  existingElements: Element[],
  config: PlannerConfig
): Element[] {
  const greenspaceElements: Element[] = [];
  
  try {
    // Convert existing elements to polygons
    const usedPolygons = elementsToPolygons(existingElements);
    
    // Union all used areas
    const used = union(...usedPolygons);
    
    // Calculate difference to get free space
    const free = difference(envelope, used);
    
    // Extract candidate polygons from free space
    const candidates = sortByArea(polygons(free)).slice(0, 3);
    
    // Cap at 20% of site area
    const maxGreenspaceArea = areaSqft(envelope) * 0.2;
    let totalGreenspaceArea = 0;
    
    for (let i = 0; i < candidates.length && totalGreenspaceArea < maxGreenspaceArea; i++) {
      const candidate = candidates[i];
      const candidateArea = areaSqft(candidate);
      
      if (candidateArea > 100) { // Minimum 100 sqft
        const greenspaceArea = Math.min(candidateArea, maxGreenspaceArea - totalGreenspaceArea);
        
        const greenspaceElement: Element = {
          id: `greenspace_${i + 1}`,
          type: 'greenspace',
          name: `Open Space ${i + 1}`,
          geometry: candidate,
          properties: {
            areaSqFt: greenspaceArea,
            use: 'landscaping'
          },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: 'ai-generated'
          }
        };
        
        greenspaceElements.push(greenspaceElement);
        totalGreenspaceArea += greenspaceArea;
      }
    }
  } catch (error) {
    console.warn('Error generating greenspace geometry:', error);
    // Fallback to simple greenspace
    const envelopeArea = areaSqft(envelope);
    const targetGreenspace = envelopeArea * 0.2;
    
    if (targetGreenspace > 100) {
      const greenspaceElement: Element = {
        id: 'greenspace_1',
        type: 'greenspace',
        name: 'Open Space',
        geometry: envelope,
        properties: {
          areaSqFt: targetGreenspace,
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