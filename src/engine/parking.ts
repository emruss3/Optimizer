import type { Polygon } from 'geojson';
import type { Element, PlannerConfig, ParkingMetrics } from './types';
import { areaSqft, contains, bbox } from './geometry';

export interface ParkingConfig {
  targetRatio: number; // stalls per unit
  stallWidthFt: number;
  stallDepthFt: number;
  aisleWidthFt: number;
  adaPct: number; // percentage of ADA stalls
  evPct: number; // percentage of EV stalls
  layoutAngle?: number; // in degrees
}

export interface ParkingStall {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  type: 'standard' | 'ada' | 'ev';
}

/**
 * Generate parking layout within buildable area
 */
export function generateParking(
  buildableArea: Polygon,
  config: ParkingConfig,
  targetStalls: number
): { stalls: ParkingStall[]; features: Element[]; metrics: ParkingMetrics } {
  const bounds = bbox(buildableArea);
  const area = areaSqft(buildableArea);
  
  // Calculate stall dimensions
  const stallWidth = config.stallWidthFt;
  const stallDepth = config.stallDepthFt;
  const aisleWidth = config.aisleWidthFt;
  
  // Calculate how many stalls we can fit
  const stallsPerRow = Math.floor((bounds.maxX - bounds.minX) / (stallWidth + aisleWidth));
  const rows = Math.floor((bounds.maxY - bounds.minY) / stallDepth);
  const maxStalls = stallsPerRow * rows;
  
  const actualStalls = Math.min(targetStalls, maxStalls);
  
  // Generate stall positions
  const stalls: ParkingStall[] = [];
  const features: Element[] = [];
  
  let stallCount = 0;
  let adaCount = 0;
  let evCount = 0;
  
  for (let row = 0; row < rows && stallCount < actualStalls; row++) {
    for (let col = 0; col < stallsPerRow && stallCount < actualStalls; col++) {
      const x = bounds.minX + col * (stallWidth + aisleWidth) + stallWidth / 2;
      const y = bounds.minY + row * stallDepth + stallDepth / 2;
      
      // Check if stall center is within buildable area
      if (contains(buildableArea, { type: 'Point', coordinates: [x, y] })) {
        // Determine stall type
        let type: 'standard' | 'ada' | 'ev' = 'standard';
        if (adaCount < Math.floor(actualStalls * config.adaPct / 100)) {
          type = 'ada';
          adaCount++;
        } else if (evCount < Math.floor(actualStalls * config.evPct / 100)) {
          type = 'ev';
          evCount++;
        }
        
        const stall: ParkingStall = {
          id: `stall_${stallCount}`,
          x,
          y,
          width: stallWidth,
          height: stallDepth,
          angle: config.layoutAngle || 0,
          type
        };
        
        stalls.push(stall);
        
        // Create parking element
        const parkingElement: Element = {
          id: `parking_${stallCount}`,
          type: 'parking',
          name: `Parking Stall ${stallCount + 1}`,
          geometry: createStallGeometry(stall),
          properties: {
            areaSqFt: stallWidth * stallDepth,
            parkingSpaces: 1,
            stallType: type,
            adaCompliant: type === 'ada',
            evReady: type === 'ev'
          },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: 'ai-generated'
          }
        };
        
        features.push(parkingElement);
        stallCount++;
      }
    }
  }
  
  // Calculate metrics
  const metrics: ParkingMetrics = {
    totalStalls: stallCount,
    adaStalls: adaCount,
    evStalls: evCount,
    utilizationPct: (stallCount / targetStalls) * 100,
    overlapCount: 0 // TODO: implement overlap detection
  };
  
  return { stalls, features, metrics };
}

/**
 * Create geometry for a parking stall
 */
function createStallGeometry(stall: ParkingStall): Polygon {
  const halfWidth = stall.width / 2;
  const halfHeight = stall.height / 2;
  
  // Create rectangle corners
  const corners = [
    [stall.x - halfWidth, stall.y - halfHeight],
    [stall.x + halfWidth, stall.y - halfHeight],
    [stall.x + halfWidth, stall.y + halfHeight],
    [stall.x - halfWidth, stall.y + halfHeight],
    [stall.x - halfWidth, stall.y - halfHeight] // Close polygon
  ];
  
  return {
    type: 'Polygon',
    coordinates: [corners]
  };
}

/**
 * Calculate parking ratio for a given configuration
 */
export function calculateParkingRatio(
  totalUnits: number,
  totalSqFt: number,
  config: ParkingConfig
): number {
  // Calculate based on units or square footage
  const stallsPerUnit = config.targetRatio;
  const stallsPerSqFt = config.targetRatio / 1000; // Assume 1000 sqft per unit
  
  const unitBasedStalls = totalUnits * stallsPerUnit;
  const sqftBasedStalls = totalSqFt * stallsPerSqFt;
  
  return Math.max(unitBasedStalls, sqftBasedStalls);
}

/**
 * Optimize parking layout for maximum efficiency
 */
export function optimizeParkingLayout(
  buildableArea: Polygon,
  config: ParkingConfig,
  targetStalls: number
): { stalls: ParkingStall[]; features: Element[]; metrics: ParkingMetrics } {
  // Try different layout angles to maximize stall count
  const angles = [0, 15, 30, 45, 60, 75, 90];
  let bestResult = { stalls: [], features: [], metrics: { totalStalls: 0 } as ParkingMetrics };
  
  for (const angle of angles) {
    const testConfig = { ...config, layoutAngle: angle };
    const result = generateParking(buildableArea, testConfig, targetStalls);
    
    if (result.metrics.totalStalls > bestResult.metrics.totalStalls) {
      bestResult = result;
    }
  }
  
  return bestResult;
}

/**
 * Check for parking stall overlaps
 */
export function detectOverlaps(stalls: ParkingStall[]): number {
  let overlapCount = 0;
  
  for (let i = 0; i < stalls.length; i++) {
    for (let j = i + 1; j < stalls.length; j++) {
      if (stallsOverlap(stalls[i], stalls[j])) {
        overlapCount++;
      }
    }
  }
  
  return overlapCount;
}

/**
 * Generate intelligent parking layout (worker interface)
 */
export function generateIntelligentParking(
  buildableArea: Element,
  config: any,
  existingElements: Element[]
): { stalls: ParkingStall[]; features: Element[]; metrics: ParkingMetrics } {
  // Convert Element to Polygon for processing
  const polygon = buildableArea.geometry;
  
  // Extract parking config from the config object
  const parkingConfig: ParkingConfig = {
    targetRatio: config.parking?.targetRatio || 1.5,
    stallWidthFt: config.parking?.stallWidthFt || 9,
    stallDepthFt: config.parking?.stallDepthFt || 18,
    aisleWidthFt: config.parking?.aisleWidthFt || 24,
    adaPct: config.parking?.adaPct || 5,
    evPct: config.parking?.evPct || 10,
    layoutAngle: config.parking?.layoutAngle || 0
  };
  
  // Calculate target stalls based on units or area
  const totalUnits = existingElements
    .filter(el => el.type === 'building')
    .reduce((sum, building) => sum + (building.properties.units || 0), 0);
  
  const targetStalls = Math.ceil(totalUnits * parkingConfig.targetRatio);
  
  return generateParking(polygon, parkingConfig, targetStalls);
}

/**
 * Check if two parking stalls overlap
 */
function stallsOverlap(stall1: ParkingStall, stall2: ParkingStall): boolean {
  const bounds1 = {
    minX: stall1.x - stall1.width / 2,
    minY: stall1.y - stall1.height / 2,
    maxX: stall1.x + stall1.width / 2,
    maxY: stall1.y + stall1.height / 2
  };
  
  const bounds2 = {
    minX: stall2.x - stall2.width / 2,
    minY: stall2.y - stall2.height / 2,
    maxX: stall2.x + stall2.width / 2,
    maxY: stall2.y + stall2.height / 2
  };
  
  return !(bounds1.maxX < bounds2.minX || 
           bounds1.minX > bounds2.maxX || 
           bounds1.maxY < bounds2.minY || 
           bounds1.minY > bounds2.maxY);
}