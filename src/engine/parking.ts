import * as turf from '@turf/turf';
import type { Element, Vertex, ParkingConfig, ParkingResult, SitePlanConfig } from './types';
import { 
  verticesToGeoJSON, 
  geoJSONToVertices, 
  calculatePolygonArea, 
  isPointInPolygon,
  createRectangle,
  doPolygonsOverlap,
  analyzeGeometry
} from './geometry';

/**
 * Generate intelligent parking layout using heuristic placement
 */
export function generateIntelligentParking(
  buildableArea: Element,
  config: ParkingConfig,
  existingElements: Element[] = []
): ParkingResult {
  console.log(`🚗 Generating ${config.targetStalls} parking stalls with intelligent layout`);
  
  const stalls: Element[] = [];
  const buildableVertices = buildableArea.vertices;
  const buildableGeoJSON = verticesToGeoJSON(buildableVertices);
  const buildablePolygon = turf.polygon(buildableGeoJSON.coordinates);
  
  // Calculate available area
  const totalArea = calculatePolygonArea(buildableVertices);
  const requiredArea = config.targetStalls * config.stallWidth * config.stallDepth;
  
  if (requiredArea > totalArea * 0.8) {
    console.warn('Insufficient area for target parking stalls');
    return {
      stalls: [],
      metrics: {
        totalStalls: 0,
        adaStalls: 0,
        evStalls: 0,
        utilization: 0,
        overlapCount: 0
      }
    };
  }
  
  // Generate parking using edge-following + center filling
  const edgeStalls = generateEdgeParking(buildablePolygon, config);
  const centerStalls = generateCenterParking(buildablePolygon, config, edgeStalls);
  
  // Combine and validate
  const allStalls = [...edgeStalls, ...centerStalls];
  const validStalls = validateStallPlacement(allStalls, buildablePolygon, existingElements);
  
  // Apply ADA and EV requirements
  const finalStalls = applyAccessibilityRequirements(validStalls, config);
  
  // Calculate metrics
  const metrics = calculateParkingMetrics(finalStalls, config, totalArea);
  
  return {
    stalls: finalStalls,
    metrics
  };
}

/**
 * Generate parking along edges of buildable area
 */
function generateEdgeParking(
  buildablePolygon: turf.Feature<turf.Polygon>,
  config: ParkingConfig
): Element[] {
  const stalls: Element[] = [];
  const bbox = turf.bbox(buildablePolygon);
  const [minX, minY, maxX, maxY] = bbox;
  
  // Edge-following algorithm
  const edgeOffset = config.stallDepth + 5; // Distance from edge
  
  // Top edge
  const topStalls = generateEdgeRow(
    { x: minX + edgeOffset, y: maxY - edgeOffset },
    { x: maxX - edgeOffset, y: maxY - edgeOffset },
    config,
    'top'
  );
  stalls.push(...topStalls);
  
  // Bottom edge
  const bottomStalls = generateEdgeRow(
    { x: minX + edgeOffset, y: minY + edgeOffset },
    { x: maxX - edgeOffset, y: minY + edgeOffset },
    config,
    'bottom'
  );
  stalls.push(...bottomStalls);
  
  // Left edge
  const leftStalls = generateEdgeRow(
    { x: minX + edgeOffset, y: minY + edgeOffset },
    { x: minX + edgeOffset, y: maxY - edgeOffset },
    config,
    'left'
  );
  stalls.push(...leftStalls);
  
  // Right edge
  const rightStalls = generateEdgeRow(
    { x: maxX - edgeOffset, y: minY + edgeOffset },
    { x: maxX - edgeOffset, y: maxY - edgeOffset },
    config,
    'right'
  );
  stalls.push(...rightStalls);
  
  return stalls;
}

/**
 * Generate a row of parking stalls along an edge
 */
function generateEdgeRow(
  start: { x: number; y: number },
  end: { x: number; y: number },
  config: ParkingConfig,
  edge: string
): Element[] {
  const stalls: Element[] = [];
  const distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
  const stallSpacing = config.stallWidth + 2; // 2ft gap between stalls
  const numStalls = Math.floor(distance / stallSpacing);
  
  for (let i = 0; i < numStalls; i++) {
    const t = i / numStalls;
    const centerX = start.x + t * (end.x - start.x);
    const centerY = start.y + t * (end.y - start.y);
    
    // Create stall rectangle
    const stallVertices = createRectangle(
      { x: centerX, y: centerY },
      config.stallWidth,
      config.stallDepth,
      `stall_${edge}_${i}`
    );
    
    // Rotate based on edge orientation
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
    const rotatedVertices = rotateVertices(stallVertices, { x: centerX, y: centerY }, angle);
    
    stalls.push({
      id: `parking_${edge}_${i}`,
      type: 'parking',
      vertices: rotatedVertices,
      properties: {
        name: `Parking Stall ${i + 1}`,
        area: config.stallWidth * config.stallDepth,
        stallType: 'standard'
      }
    });
  }
  
  return stalls;
}

/**
 * Generate parking in center areas
 */
function generateCenterParking(
  buildablePolygon: turf.Feature<turf.Polygon>,
  config: ParkingConfig,
  existingStalls: Element[]
): Element[] {
  const stalls: Element[] = [];
  const bbox = turf.bbox(buildablePolygon);
  const [minX, minY, maxX, maxY] = bbox;
  
  // Grid-based center filling
  const gridSize = config.stallWidth + config.aisleWidth;
  const startX = minX + gridSize;
  const startY = minY + gridSize;
  const endX = maxX - gridSize;
  const endY = maxY - gridSize;
  
  for (let x = startX; x < endX; x += gridSize) {
    for (let y = startY; y < endY; y += gridSize) {
      const center = { x, y };
      
      // Check if this position conflicts with existing stalls
      const conflicts = existingStalls.some(stall => 
        doPolygonsOverlap(stall.vertices, createRectangle(center, config.stallWidth, config.stallDepth))
      );
      
      if (!conflicts) {
        const stallVertices = createRectangle(center, config.stallWidth, config.stallDepth, `center_${x}_${y}`);
        
        // Check if stall is within buildable area
        const stallGeoJSON = verticesToGeoJSON(stallVertices);
        const stallPolygon = turf.polygon(stallGeoJSON.coordinates);
        
        if (turf.booleanIntersects(stallPolygon, buildablePolygon)) {
          stalls.push({
            id: `parking_center_${x}_${y}`,
            type: 'parking',
            vertices: stallVertices,
            properties: {
              name: `Center Parking`,
              area: config.stallWidth * config.stallDepth,
              stallType: 'standard'
            }
          });
        }
      }
    }
  }
  
  return stalls;
}

/**
 * Validate stall placement
 */
function validateStallPlacement(
  stalls: Element[],
  buildablePolygon: turf.Feature<turf.Polygon>,
  existingElements: Element[]
): Element[] {
  const validStalls: Element[] = [];
  let overlapCount = 0;
  
  for (const stall of stalls) {
    let isValid = true;
    
    // Check if stall is within buildable area
    const stallGeoJSON = verticesToGeoJSON(stall.vertices);
    const stallPolygon = turf.polygon(stallGeoJSON.coordinates);
    
    if (!turf.booleanIntersects(stallPolygon, buildablePolygon)) {
      isValid = false;
    }
    
    // Check for overlaps with other stalls
    for (const otherStall of [...validStalls, ...existingElements]) {
      if (doPolygonsOverlap(stall.vertices, otherStall.vertices)) {
        overlapCount++;
        isValid = false;
        break;
      }
    }
    
    if (isValid) {
      validStalls.push(stall);
    }
  }
  
  console.log(`Validated ${validStalls.length}/${stalls.length} stalls, ${overlapCount} overlaps removed`);
  return validStalls;
}

/**
 * Apply ADA and EV requirements
 */
function applyAccessibilityRequirements(stalls: Element[], config: ParkingConfig): Element[] {
  const totalStalls = stalls.length;
  const adaCount = Math.max(1, Math.floor(totalStalls * config.adaRatio));
  const evCount = Math.floor(totalStalls * config.evRatio);
  
  // Sort stalls by position (prioritize accessible locations)
  const sortedStalls = [...stalls].sort((a, b) => {
    const aCenter = analyzeGeometry(a.vertices).centroid;
    const bCenter = analyzeGeometry(b.vertices).centroid;
    return aCenter.x - bCenter.x; // Sort by x position
  });
  
  // Apply ADA requirements
  for (let i = 0; i < Math.min(adaCount, sortedStalls.length); i++) {
    sortedStalls[i].properties.stallType = 'handicap';
    sortedStalls[i].properties.name = `ADA Parking ${i + 1}`;
  }
  
  // Apply EV requirements
  let evAssigned = 0;
  for (let i = adaCount; i < sortedStalls.length && evAssigned < evCount; i++) {
    sortedStalls[i].properties.stallType = 'ev';
    sortedStalls[i].properties.name = `EV Parking ${evAssigned + 1}`;
    evAssigned++;
  }
  
  return sortedStalls;
}

/**
 * Calculate parking metrics
 */
function calculateParkingMetrics(
  stalls: Element[],
  config: ParkingConfig,
  totalArea: number
) {
  const totalStalls = stalls.length;
  const adaStalls = stalls.filter(s => s.properties.stallType === 'handicap').length;
  const evStalls = stalls.filter(s => s.properties.stallType === 'ev').length;
  
  const usedArea = stalls.reduce((sum, stall) => sum + (stall.properties.area || 0), 0);
  const utilization = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
  
  return {
    totalStalls,
    adaStalls,
    evStalls,
    utilization,
    overlapCount: 0 // This would be calculated during validation
  };
}

/**
 * Rotate vertices around center point (helper function)
 */
function rotateVertices(
  vertices: Vertex[],
  center: { x: number; y: number },
  angleDegrees: number
): Vertex[] {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  
  return vertices.map(vertex => {
    const dx = vertex.x - center.x;
    const dy = vertex.y - center.y;
    
    return {
      ...vertex,
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  });
}

/**
 * Generate parking for specific building types
 */
export function generateBuildingSpecificParking(
  buildingType: string,
  buildingArea: number,
  config: ParkingConfig
): ParkingResult {
  // Different parking requirements based on building type
  const requirements = getParkingRequirements(buildingType);
  const adjustedConfig = {
    ...config,
    targetStalls: Math.ceil(buildingArea * requirements.ratio)
  };
  
  // Create a simple rectangular buildable area for demonstration
  const buildableArea: Element = {
    id: 'buildable_area',
    type: 'greenspace',
    vertices: createRectangle({ x: 0, y: 0 }, 200, 200, 'buildable'),
    properties: { name: 'Buildable Area' }
  };
  
  return generateIntelligentParking(buildableArea, adjustedConfig);
}

/**
 * Get parking requirements for building types
 */
function getParkingRequirements(buildingType: string): { ratio: number; description: string } {
  const requirements: Record<string, { ratio: number; description: string }> = {
    'residential': { ratio: 1.5, description: '1.5 spaces per unit' },
    'office': { ratio: 0.33, description: '1 space per 3 employees' },
    'retail': { ratio: 0.1, description: '1 space per 10 sq ft' },
    'industrial': { ratio: 0.05, description: '1 space per 20 sq ft' },
    'hotel': { ratio: 0.8, description: '0.8 spaces per room' },
    'restaurant': { ratio: 0.2, description: '1 space per 5 sq ft' }
  };
  
  return requirements[buildingType] || { ratio: 0.1, description: 'Default parking ratio' };
}

/**
 * Optimize parking layout for maximum efficiency
 */
export function optimizeParkingLayout(
  initialStalls: Element[],
  buildableArea: Element,
  config: ParkingConfig
): ParkingResult {
  console.log('🔧 Optimizing parking layout for maximum efficiency');
  
  // This would implement more sophisticated optimization algorithms
  // For now, return the initial layout
  const metrics = calculateParkingMetrics(initialStalls, config, calculatePolygonArea(buildableArea.vertices));
  
  return {
    stalls: initialStalls,
    metrics
  };
}
