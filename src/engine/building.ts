import type { Polygon } from 'geojson';
import type { Element, PlannerConfig, BuildingTypology } from './types';
import { areaSqft, bbox, createEnvelope } from './geometry';

export interface BuildingConfig {
  targetFAR: number;
  targetCoveragePct: number;
  typology: string;
  numBuildings: number;
  maxHeightFt?: number;
  minHeightFt?: number;
}

/**
 * Generate building footprints within envelope
 */
export function generateBuildingFootprints(
  envelope: Polygon,
  config: BuildingConfig,
  parcelAreaSqFt: number
): Element[] {
  const targetBuiltSF = parcelAreaSqFt * config.targetFAR;
  const maxCoverageSF = parcelAreaSqFt * (config.targetCoveragePct / 100);
  
  // Get building typology
  const typology = getBuildingTypology(config.typology);
  
  // Calculate building dimensions
  const buildings: Element[] = [];
  const bounds = bbox(envelope);
  const envelopeArea = areaSqft(envelope);
  
  // Distribute buildings across the envelope
  const buildingsPerRow = Math.ceil(Math.sqrt(config.numBuildings));
  const buildingWidth = (bounds.maxX - bounds.minX) / buildingsPerRow;
  const buildingDepth = (bounds.maxY - bounds.minY) / Math.ceil(config.numBuildings / buildingsPerRow);
  
  let totalBuiltSF = 0;
  let buildingIndex = 0;
  
  for (let row = 0; row < Math.ceil(config.numBuildings / buildingsPerRow) && buildingIndex < config.numBuildings; row++) {
    for (let col = 0; col < buildingsPerRow && buildingIndex < config.numBuildings; col++) {
      // Calculate building position
      const x = bounds.minX + col * buildingWidth + buildingWidth / 2;
      const y = bounds.minY + row * buildingDepth + buildingDepth / 2;
      
      // Calculate building size based on remaining target
      const remainingSF = targetBuiltSF - totalBuiltSF;
      const remainingBuildings = config.numBuildings - buildingIndex;
      const avgBuildingSF = remainingSF / remainingBuildings;
      
      // Ensure building fits within coverage limits
      const maxBuildingSF = Math.min(avgBuildingSF, maxCoverageSF - totalBuiltSF);
      
      if (maxBuildingSF > 0) {
        const building = createBuildingElement(
          buildingIndex,
          x,
          y,
          buildingWidth * 0.8, // 80% of allocated space
          buildingDepth * 0.8,
          maxBuildingSF,
          typology,
          config
        );
        
        buildings.push(building);
        totalBuiltSF += building.properties.areaSqFt || 0;
        buildingIndex++;
      }
    }
  }
  
  return buildings;
}

/**
 * Create a building element
 */
function createBuildingElement(
  index: number,
  x: number,
  y: number,
  width: number,
  depth: number,
  targetArea: number,
  typology: BuildingTypology,
  config: BuildingConfig
): Element {
  // Adjust dimensions to meet target area
  const currentArea = width * depth;
  const scaleFactor = Math.sqrt(targetArea / currentArea);
  const finalWidth = width * scaleFactor;
  const finalDepth = depth * scaleFactor;
  
  // Create building geometry
  const geometry = createBuildingGeometry(x, y, finalWidth, finalDepth);
  
  // Calculate stories based on area and height constraints
  const floorArea = finalWidth * finalDepth;
  const stories = Math.max(1, Math.floor(targetArea / floorArea));
  const heightFt = stories * 10; // Assume 10ft per story
  
  return {
    id: `building_${index}`,
    type: 'building',
    name: `Building ${index + 1}`,
    geometry,
    properties: {
      areaSqFt: targetArea,
      units: Math.floor(targetArea / 800), // Assume 800 sqft per unit
      heightFt: Math.min(heightFt, config.maxHeightFt || 100),
      stories,
      use: getUseFromTypology(typology),
      color: getColorForTypology(typology),
      rotation: 0
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'ai-generated'
    }
  };
}

/**
 * Create building geometry as rectangle
 */
function createBuildingGeometry(x: number, y: number, width: number, depth: number): Polygon {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  
  return {
    type: 'Polygon',
    coordinates: [[
      [x - halfWidth, y - halfDepth],
      [x + halfWidth, y - halfDepth],
      [x + halfWidth, y + halfDepth],
      [x - halfWidth, y + halfDepth],
      [x - halfWidth, y - halfDepth]
    ]]
  };
}

/**
 * Get building typology configuration
 */
function getBuildingTypology(typologyName: string): BuildingTypology {
  const typologies: Record<string, BuildingTypology> = {
    'bar': {
      id: 'bar',
      name: 'Bar Building',
      description: 'Rectangular building with linear layout',
      shape: 'rectangle',
      aspectRatio: 3.0,
      defaultStories: 3,
      defaultHeightFt: 30
    },
    'L-shape': {
      id: 'L-shape',
      name: 'L-Shaped Building',
      description: 'L-shaped building for corner lots',
      shape: 'L-shape',
      aspectRatio: 1.5,
      defaultStories: 2,
      defaultHeightFt: 20
    },
    'podium': {
      id: 'podium',
      name: 'Podium Building',
      description: 'Mixed-use with podium and tower',
      shape: 'podium',
      aspectRatio: 1.0,
      defaultStories: 8,
      defaultHeightFt: 80
    },
    'custom': {
      id: 'custom',
      name: 'Custom Building',
      description: 'Custom building design',
      shape: 'custom',
      aspectRatio: 1.0,
      defaultStories: 2,
      defaultHeightFt: 20
    }
  };
  
  return typologies[typologyName] || typologies['bar'];
}

/**
 * Get use type from typology
 */
function getUseFromTypology(typology: BuildingTypology): string {
  switch (typology.id) {
    case 'podium':
      return 'mixed-use';
    case 'bar':
      return 'residential';
    case 'L-shape':
      return 'commercial';
    default:
      return 'residential';
  }
}

/**
 * Get color for typology
 */
function getColorForTypology(typology: BuildingTypology): string {
  switch (typology.id) {
    case 'podium':
      return '#8B5CF6'; // Purple
    case 'bar':
      return '#3B82F6'; // Blue
    case 'L-shape':
      return '#10B981'; // Green
    default:
      return '#6B7280'; // Gray
  }
}

/**
 * Calculate optimal building placement
 */
export function optimizeBuildingPlacement(
  envelope: Polygon,
  buildings: Element[],
  config: BuildingConfig
): Element[] {
  // Simple optimization: sort by area and place largest first
  return buildings.sort((a, b) => (b.properties.areaSqFt || 0) - (a.properties.areaSqFt || 0));
}

/**
 * Validate building placement against zoning
 */
export function validateBuildingPlacement(
  buildings: Element[],
  envelope: Polygon,
  config: BuildingConfig,
  parcelAreaSqFt: number
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check total coverage
  const totalBuildingArea = buildings.reduce((sum, building) => 
    sum + (building.properties.areaSqFt || 0), 0);
  const coveragePct = (totalBuildingArea / parcelAreaSqFt) * 100;
  
  if (coveragePct > config.targetCoveragePct) {
    violations.push(`Building coverage ${coveragePct.toFixed(1)}% exceeds target ${config.targetCoveragePct}%`);
  }
  
  // Check FAR
  const far = totalBuildingArea / parcelAreaSqFt;
  if (far > config.targetFAR) {
    violations.push(`FAR ${far.toFixed(2)} exceeds target ${config.targetFAR}`);
  }
  
  // Check building heights
  for (const building of buildings) {
    const height = building.properties.heightFt || 0;
    if (config.maxHeightFt && height > config.maxHeightFt) {
      violations.push(`Building ${building.name} height ${height}ft exceeds maximum ${config.maxHeightFt}ft`);
    }
    if (config.minHeightFt && height < config.minHeightFt) {
      violations.push(`Building ${building.name} height ${height}ft below minimum ${config.minHeightFt}ft`);
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}