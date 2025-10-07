// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { scorePad, ScorePadResult } from './scorePad';

export interface MutatedPad {
  id: string;
  building_geometry: any; // GeoJSON geometry
  parking_geometry?: any; // GeoJSON geometry
  landscape_geometry?: any; // GeoJSON geometry
  score: number;
  coverage: number;
  far: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  mutation_type: 'jitter' | 'rotation' | 'scale' | 'position';
  parent_id: string;
}

export interface MutatePadsParams {
  parcel_id: string;
  topPads: Array<{
    id: string;
    building_geometry: any;
    parking_geometry?: any;
    landscape_geometry?: any;
    score: number;
    coverage: number;
    far: number;
    bounds: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  }>;
  mutationCount: number;
  jitterAmount: number;
  rotationRange: number;
  scaleRange: number;
  positionRange: number;
  zoning_requirements?: Record<string, any>;
}

/**
 * Apply jitter mutation to a rectangle
 */
function applyJitter(
  x: number,
  y: number,
  width: number,
  height: number,
  jitterAmount: number
): { x: number; y: number; width: number; height: number } {
  const jitterX = (Math.random() - 0.5) * jitterAmount;
  const jitterY = (Math.random() - 0.5) * jitterAmount;
  const jitterWidth = (Math.random() - 0.5) * jitterAmount;
  const jitterHeight = (Math.random() - 0.5) * jitterAmount;

  return {
    x: x + jitterX,
    y: y + jitterY,
    width: Math.max(width + jitterWidth, 10), // Minimum width
    height: Math.max(height + jitterHeight, 10) // Minimum height
  };
}

/**
 * Apply rotation mutation to a rectangle
 */
function applyRotation(
  x: number,
  y: number,
  width: number,
  height: number,
  rotationRange: number
): { x: number; y: number; width: number; height: number; rotation: number } {
  const rotation = (Math.random() - 0.5) * rotationRange;
  
  // For simplicity, we'll just return the original rectangle with rotation info
  // In a real implementation, you'd apply the rotation transformation
  return {
    x,
    y,
    width,
    height,
    rotation
  };
}

/**
 * Apply scale mutation to a rectangle
 */
function applyScale(
  x: number,
  y: number,
  width: number,
  height: number,
  scaleRange: number
): { x: number; y: number; width: number; height: number } {
  const scaleFactor = 1 + (Math.random() - 0.5) * scaleRange;
  const newWidth = width * scaleFactor;
  const newHeight = height * scaleFactor;
  
  // Keep center point fixed
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  
  return {
    x: centerX - newWidth / 2,
    y: centerY - newHeight / 2,
    width: newWidth,
    height: newHeight
  };
}

/**
 * Apply position mutation to a rectangle
 */
function applyPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  positionRange: number
): { x: number; y: number; width: number; height: number } {
  const deltaX = (Math.random() - 0.5) * positionRange;
  const deltaY = (Math.random() - 0.5) * positionRange;
  
  return {
    x: x + deltaX,
    y: y + deltaY,
    width,
    height
  };
}

/**
 * Convert rectangle to GeoJSON polygon
 */
function rectangleToGeoJSON(
  x: number,
  y: number,
  width: number,
  height: number
): any {
  return {
    type: 'Polygon',
    coordinates: [[
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y]
    ]]
  };
}

/**
 * Generate parking geometry for a building
 */
function generateParkingGeometry(
  buildingBounds: { x: number; y: number; width: number; height: number },
  parkingRatio: number = 0.3
): any {
  const buildingArea = buildingBounds.width * buildingBounds.height;
  const parkingArea = buildingArea * parkingRatio;
  
  const parkingWidth = Math.sqrt(parkingArea * 2);
  const parkingHeight = parkingArea / parkingWidth;
  
  const parkingX = buildingBounds.x + buildingBounds.width + 10;
  const parkingY = buildingBounds.y;
  
  return rectangleToGeoJSON(parkingX, parkingY, parkingWidth, parkingHeight);
}

/**
 * Mutate top performing pads to generate new variations
 */
export async function mutatePads(params: MutatePadsParams): Promise<MutatedPad[]> {
  const {
    parcel_id,
    topPads,
    mutationCount,
    jitterAmount,
    rotationRange,
    scaleRange,
    positionRange,
    zoning_requirements = {}
  } = params;

  const mutatedPads: MutatedPad[] = [];
  const mutationsPerPad = Math.ceil(mutationCount / topPads.length);

  for (const pad of topPads) {
    for (let i = 0; i < mutationsPerPad && mutatedPads.length < mutationCount; i++) {
      // Extract rectangle dimensions from bounds
      const x = pad.bounds.minX;
      const y = pad.bounds.minY;
      const width = pad.bounds.maxX - pad.bounds.minX;
      const height = pad.bounds.maxY - pad.bounds.minY;

      let mutatedRect: { x: number; y: number; width: number; height: number; rotation?: number };
      let mutationType: 'jitter' | 'rotation' | 'scale' | 'position';

      // Randomly choose mutation type
      const mutationTypeIndex = Math.floor(Math.random() * 4);
      switch (mutationTypeIndex) {
        case 0:
          mutatedRect = applyJitter(x, y, width, height, jitterAmount);
          mutationType = 'jitter';
          break;
        case 1:
          mutatedRect = applyRotation(x, y, width, height, rotationRange);
          mutationType = 'rotation';
          break;
        case 2:
          mutatedRect = applyScale(x, y, width, height, scaleRange);
          mutationType = 'scale';
          break;
        case 3:
          mutatedRect = applyPosition(x, y, width, height, positionRange);
          mutationType = 'position';
          break;
        default:
          mutatedRect = applyJitter(x, y, width, height, jitterAmount);
          mutationType = 'jitter';
      }

      // Create building geometry
      const buildingGeometry = rectangleToGeoJSON(
        mutatedRect.x,
        mutatedRect.y,
        mutatedRect.width,
        mutatedRect.height
      );

      // Create parking geometry
      const parkingGeometry = generateParkingGeometry(mutatedRect, 0.3);

      // Create landscape geometry (simplified)
      const landscapeGeometry = rectangleToGeoJSON(
        mutatedRect.x - 20,
        mutatedRect.y - 20,
        40,
        40
      );

      const mutatedPad: MutatedPad = {
        id: `mutated_${pad.id}_${i}`,
        building_geometry: buildingGeometry,
        parking_geometry: parkingGeometry,
        landscape_geometry: landscapeGeometry,
        score: 0, // Will be calculated
        coverage: 0, // Will be calculated
        far: 0, // Will be calculated
        bounds: {
          minX: mutatedRect.x,
          minY: mutatedRect.y,
          maxX: mutatedRect.x + mutatedRect.width,
          maxY: mutatedRect.y + mutatedRect.height
        },
        mutation_type: mutationType,
        parent_id: pad.id
      };

      mutatedPads.push(mutatedPad);
    }
  }

  return mutatedPads;
}

/**
 * Score mutated pads and return the best results
 */
export async function scoreMutatedPads(
  parcel_id: string,
  mutatedPads: MutatedPad[],
  zoning_requirements: Record<string, any> = {}
): Promise<Array<MutatedPad & { score: number; coverage: number; far: number }>> {
  const scoredPads = await Promise.allSettled(
    mutatedPads.map(async (pad) => {
      try {
        const scoreResult = await scorePad({
          parcel_id,
          building_geometry: pad.building_geometry,
          parking_geometry: pad.parking_geometry,
          landscape_geometry: pad.landscape_geometry,
          zoning_data: zoning_requirements
        });

        return {
          ...pad,
          score: scoreResult.score,
          coverage: scoreResult.coverage_ratio,
          far: scoreResult.far_ratio
        };
      } catch (error) {
        console.error(`Error scoring mutated pad ${pad.id}:`, error);
        return {
          ...pad,
          score: 0,
          coverage: 0,
          far: 0
        };
      }
    })
  );

  const validPads = scoredPads
    .filter((result): result is PromiseFulfilledResult<MutatedPad & { score: number; coverage: number; far: number }> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value);

  // Sort by score (highest first)
  return validPads.sort((a, b) => b.score - a.score);
}
