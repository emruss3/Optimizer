// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { getBuildableEnvelope, scorePad, ScorePadResult } from './scorePad';

export interface SeedPad {
  id: string;
  building_geometry: any; // GeoJSON geometry
  parking_geometry?: any; // GeoJSON geometry
  landscape_geometry?: any; // GeoJSON geometry
  score?: number;
  coverage?: number;
  far?: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface SeedPadsParams {
  parcel_id: string;
  count: number;
  front_setback_ft?: number;
  side_setback_ft?: number;
  rear_setback_ft?: number;
  min_building_width_ft?: number;
  max_building_width_ft?: number;
  min_building_depth_ft?: number;
  max_building_depth_ft?: number;
  parking_ratio?: number;
  zoning_requirements?: Record<string, any>;
}

/**
 * Generate a random rectangle within bounds
 */
function generateRandomRectangle(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  minWidth: number,
  maxWidth: number,
  minHeight: number,
  maxHeight: number
): { x: number; y: number; width: number; height: number } {
  const availableWidth = bounds.maxX - bounds.minX;
  const availableHeight = bounds.maxY - bounds.minY;
  
  // Ensure dimensions fit within bounds
  const maxAllowedWidth = Math.min(maxWidth, availableWidth);
  const maxAllowedHeight = Math.min(maxHeight, availableHeight);
  
  const width = Math.random() * (maxAllowedWidth - minWidth) + minWidth;
  const height = Math.random() * (maxAllowedHeight - minHeight) + minHeight;
  
  const x = bounds.minX + Math.random() * (availableWidth - width);
  const y = bounds.minY + Math.random() * (availableHeight - height);
  
  return { x, y, width, height };
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
 * Check if rectangle is valid (not too small, reasonable aspect ratio)
 */
function isValidRectangle(
  width: number,
  height: number,
  minArea: number = 1000 // 1000 sq ft minimum
): boolean {
  const area = width * height;
  const aspectRatio = Math.max(width, height) / Math.min(width, height);
  
  return area >= minArea && aspectRatio <= 5; // Max 5:1 aspect ratio
}

/**
 * Generate parking geometry for a building
 */
function generateParkingGeometry(
  buildingBounds: { x: number; y: number; width: number; height: number },
  parkingRatio: number = 0.3
): any {
  // Calculate parking area needed
  const buildingArea = buildingBounds.width * buildingBounds.height;
  const parkingArea = buildingArea * parkingRatio;
  
  // Create parking lot adjacent to building
  const parkingWidth = Math.sqrt(parkingArea * 2); // Assume 2:1 aspect ratio
  const parkingHeight = parkingArea / parkingWidth;
  
  // Position parking lot to the right of building
  const parkingX = buildingBounds.x + buildingBounds.width + 10; // 10ft gap
  const parkingY = buildingBounds.y;
  
  return rectangleToGeoJSON(parkingX, parkingY, parkingWidth, parkingHeight);
}

/**
 * Generate landscape geometry for remaining area
 */
function generateLandscapeGeometry(
  parcelBounds: { minX: number; minY: number; maxX: number; maxY: number },
  buildingGeometry: any,
  parkingGeometry?: any
): any {
  // This is a simplified approach - in practice, you'd use proper geometric operations
  // For now, we'll create a simple landscape area
  const landscapeWidth = (parcelBounds.maxX - parcelBounds.minX) * 0.1;
  const landscapeHeight = (parcelBounds.maxY - parcelBounds.minY) * 0.1;
  
  return rectangleToGeoJSON(
    parcelBounds.minX,
    parcelBounds.minY,
    landscapeWidth,
    landscapeHeight
  );
}

/**
 * Generate seed pads (random layouts) for a parcel
 */
export async function generateSeedPads(params: SeedPadsParams): Promise<SeedPad[]> {
  const {
    parcel_id,
    count,
    front_setback_ft = 20,
    side_setback_ft = 10,
    rear_setback_ft = 20,
    min_building_width_ft = 30,
    max_building_width_ft = 100,
    min_building_depth_ft = 30,
    max_building_depth_ft = 100,
    parking_ratio = 0.3,
    zoning_requirements = {}
  } = params;

  try {
    // Get buildable envelope
    const envelope = await getBuildableEnvelope(
      parcel_id,
      front_setback_ft,
      side_setback_ft,
      rear_setback_ft
    );

    if (!envelope || envelope.error) {
      throw new Error('Failed to get buildable envelope');
    }

    const buildableBounds = envelope.bounds;
    const parcelBounds = {
      minX: buildableBounds.minx,
      minY: buildableBounds.miny,
      maxX: buildableBounds.maxx,
      maxY: buildableBounds.maxy
    };

    const seedPads: SeedPad[] = [];
    const attempts = count * 3; // Try 3x to get valid layouts

    for (let i = 0; i < attempts && seedPads.length < count; i++) {
      // Convert feet to SVG units (assuming 12 SVG units per foot)
      const minWidth = min_building_width_ft * 12;
      const maxWidth = max_building_width_ft * 12;
      const minHeight = min_building_depth_ft * 12;
      const maxHeight = max_building_depth_ft * 12;

      const rectangle = generateRandomRectangle(
        parcelBounds,
        minWidth,
        maxWidth,
        minHeight,
        maxHeight
      );

      // Check if rectangle is valid
      if (!isValidRectangle(rectangle.width, rectangle.height)) {
        continue;
      }

      // Create building geometry
      const buildingGeometry = rectangleToGeoJSON(
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height
      );

      // Create parking geometry
      const parkingGeometry = generateParkingGeometry(rectangle, parking_ratio);

      // Create landscape geometry
      const landscapeGeometry = generateLandscapeGeometry(
        parcelBounds,
        buildingGeometry,
        parkingGeometry
      );

      const seedPad: SeedPad = {
        id: `seed_${i}`,
        building_geometry: buildingGeometry,
        parking_geometry: parkingGeometry,
        landscape_geometry: landscapeGeometry,
        bounds: {
          minX: rectangle.x,
          minY: rectangle.y,
          maxX: rectangle.x + rectangle.width,
          maxY: rectangle.y + rectangle.height
        }
      };

      seedPads.push(seedPad);
    }

    return seedPads;
  } catch (error) {
    console.error('Error generating seed pads:', error);
    throw error;
  }
}

/**
 * Score and rank seed pads
 */
export async function scoreAndRankSeedPads(
  parcel_id: string,
  seedPads: SeedPad[],
  zoning_requirements: Record<string, any> = {}
): Promise<Array<SeedPad & { score: number; coverage: number; far: number }>> {
  const scoredPads = await Promise.allSettled(
    seedPads.map(async (pad) => {
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
        console.error(`Error scoring pad ${pad.id}:`, error);
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
    .filter((result): result is PromiseFulfilledResult<SeedPad & { score: number; coverage: number; far: number }> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value);

  // Sort by score (highest first)
  return validPads.sort((a, b) => b.score - a.score);
}
