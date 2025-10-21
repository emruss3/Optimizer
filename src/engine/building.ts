import type { Element, Vertex, BuildingTypology, BuildingResult, SitePlanConfig } from './types';
import { 
  verticesToGeoJSON, 
  geoJSONToVertices, 
  calculatePolygonArea, 
  createRectangle,
  rotateVertices,
  analyzeGeometry,
  doPolygonsOverlap
} from './geometry';

/**
 * Building typology library
 */
export const BUILDING_TYPOLOGIES: BuildingTypology[] = [
  // Residential typologies
  {
    id: 'residential_bar',
    name: 'Residential Bar Building',
    use: 'residential',
    aspectRatio: 3.0,
    minSize: 2000,
    maxSize: 10000,
    preferredOrientation: 0,
    template: [
      { x: 0, y: 0, id: 't0' },
      { x: 1, y: 0, id: 't1' },
      { x: 1, y: 0.33, id: 't2' },
      { x: 0, y: 0.33, id: 't3' }
    ]
  },
  {
    id: 'residential_l',
    name: 'Residential L-Shaped Building',
    use: 'residential',
    aspectRatio: 1.5,
    minSize: 3000,
    maxSize: 15000,
    preferredOrientation: 0,
    template: [
      { x: 0, y: 0, id: 't0' },
      { x: 0.6, y: 0, id: 't1' },
      { x: 0.6, y: 0.4, id: 't2' },
      { x: 1, y: 0.4, id: 't3' },
      { x: 1, y: 0.6, id: 't4' },
      { x: 0.4, y: 0.6, id: 't5' },
      { x: 0.4, y: 1, id: 't6' },
      { x: 0, y: 1, id: 't7' }
    ]
  },
  {
    id: 'residential_podium',
    name: 'Residential Podium Building',
    use: 'residential',
    aspectRatio: 2.5,
    minSize: 5000,
    maxSize: 25000,
    preferredOrientation: 0,
    template: [
      { x: 0, y: 0, id: 't0' },
      { x: 1, y: 0, id: 't1' },
      { x: 1, y: 0.4, id: 't2' },
      { x: 0, y: 0.4, id: 't3' }
    ]
  },
  
  // Office typologies
  {
    id: 'office_bar',
    name: 'Office Bar Building',
    use: 'office',
    aspectRatio: 2.0,
    minSize: 5000,
    maxSize: 50000,
    preferredOrientation: 0,
    template: [
      { x: 0, y: 0, id: 't0' },
      { x: 1, y: 0, id: 't1' },
      { x: 1, y: 0.5, id: 't2' },
      { x: 0, y: 0.5, id: 't3' }
    ]
  },
  {
    id: 'office_square',
    name: 'Office Square Building',
    use: 'office',
    aspectRatio: 1.0,
    minSize: 3000,
    maxSize: 30000,
    preferredOrientation: 0,
    template: [
      { x: 0, y: 0, id: 't0' },
      { x: 1, y: 0, id: 't1' },
      { x: 1, y: 1, id: 't2' },
      { x: 0, y: 1, id: 't3' }
    ]
  },
  
  // Retail typologies
  {
    id: 'retail_strip',
    name: 'Retail Strip Building',
    use: 'retail',
    aspectRatio: 4.0,
    minSize: 2000,
    maxSize: 20000,
    preferredOrientation: 0,
    template: [
      { x: 0, y: 0, id: 't0' },
      { x: 1, y: 0, id: 't1' },
      { x: 1, y: 0.25, id: 't2' },
      { x: 0, y: 0.25, id: 't3' }
    ]
  },
  {
    id: 'retail_anchor',
    name: 'Retail Anchor Building',
    use: 'retail',
    aspectRatio: 1.2,
    minSize: 10000,
    maxSize: 100000,
    preferredOrientation: 0,
    template: [
      { x: 0, y: 0, id: 't0' },
      { x: 1, y: 0, id: 't1' },
      { x: 1, y: 0.83, id: 't2' },
      { x: 0, y: 0.83, id: 't3' }
    ]
  }
];

/**
 * Generate building footprints based on typology and constraints
 */
export function generateBuildingFootprints(
  buildableArea: Element,
  config: SitePlanConfig,
  typologyId?: string
): BuildingResult {
  console.log(`🏢 Generating building footprints for target FAR: ${config.targetFAR}`);
  
  const buildings: Element[] = [];
  const buildableVertices = buildableArea.vertices;
  const buildableAreaSqft = calculatePolygonArea(buildableVertices);
  const targetBuildingArea = buildableAreaSqft * config.targetFAR;
  
  // Select typology
  const typology = selectOptimalTypology(config.buildingTypes, targetBuildingArea, typologyId);
  if (!typology) {
    console.warn('No suitable typology found');
    return {
      buildings: [],
      metrics: {
        totalArea: 0,
        achievedFAR: 0,
        buildingCount: 0,
        averageSize: 0
      }
    };
  }
  
  // Generate buildings using the selected typology
  const generatedBuildings = generateBuildingsWithTypology(
    buildableArea,
    typology,
    targetBuildingArea,
    config
  );
  
  // Calculate metrics
  const totalArea = generatedBuildings.reduce((sum, building) => 
    sum + (building.properties.area || 0), 0
  );
  const achievedFAR = buildableAreaSqft > 0 ? totalArea / buildableAreaSqft : 0;
  
  return {
    buildings: generatedBuildings,
    metrics: {
      totalArea,
      achievedFAR,
      buildingCount: generatedBuildings.length,
      averageSize: generatedBuildings.length > 0 ? totalArea / generatedBuildings.length : 0
    }
  };
}

/**
 * Select optimal typology based on requirements
 */
function selectOptimalTypology(
  buildingTypes: string[],
  targetArea: number,
  preferredTypologyId?: string
): BuildingTypology | null {
  if (preferredTypologyId) {
    const typology = BUILDING_TYPOLOGIES.find(t => t.id === preferredTypologyId);
    if (typology && buildingTypes.includes(typology.use)) {
      return typology;
    }
  }
  
  // Filter by building types
  const availableTypologies = BUILDING_TYPOLOGIES.filter(t => 
    buildingTypes.includes(t.use)
  );
  
  if (availableTypologies.length === 0) {
    return null;
  }
  
  // Select based on size constraints
  const suitableTypologies = availableTypologies.filter(t => 
    targetArea >= t.minSize && targetArea <= t.maxSize
  );
  
  if (suitableTypologies.length === 0) {
    // Use the largest available typology
    return availableTypologies.reduce((prev, current) => 
      current.maxSize > prev.maxSize ? current : prev
    );
  }
  
  // Select the typology with the best aspect ratio for the target area
  return suitableTypologies.reduce((prev, current) => {
    const prevScore = calculateTypologyScore(prev, targetArea);
    const currentScore = calculateTypologyScore(current, targetArea);
    return currentScore > prevScore ? current : prev;
  });
}

/**
 * Calculate typology score based on how well it fits the target area
 */
function calculateTypologyScore(typology: BuildingTypology, targetArea: number): number {
  const sizeRatio = Math.min(targetArea / typology.maxSize, typology.maxSize / targetArea);
  const aspectRatioScore = 1 / Math.abs(typology.aspectRatio - 1.5); // Prefer moderate aspect ratios
  return sizeRatio * aspectRatioScore;
}

/**
 * Generate buildings using the selected typology
 */
function generateBuildingsWithTypology(
  buildableArea: Element,
  typology: BuildingTypology,
  targetArea: number,
  config: SitePlanConfig
): Element[] {
  const buildings: Element[] = [];
  const buildableVertices = buildableArea.vertices;
  const buildableBounds = analyzeGeometry(buildableVertices).bounds;
  
  // Calculate building dimensions based on typology
  const buildingArea = Math.min(targetArea, typology.maxSize);
  const aspectRatio = typology.aspectRatio;
  const width = Math.sqrt(buildingArea / aspectRatio);
  const height = width * aspectRatio;
  
  // Generate multiple buildings if needed
  const maxBuildings = Math.ceil(targetArea / buildingArea);
  const spacing = Math.max(width, height) * 0.2; // 20% spacing between buildings
  
  for (let i = 0; i < maxBuildings && buildings.length < 10; i++) {
    const building = createBuildingFromTypology(
      typology,
      buildingArea,
      buildableBounds,
      spacing,
      i
    );
    
    if (building && isBuildingValid(building, buildableArea, buildings)) {
      buildings.push(building);
    }
  }
  
  return buildings;
}

/**
 * Create a building from typology template
 */
function createBuildingFromTypology(
  typology: BuildingTypology,
  area: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  spacing: number,
  index: number
): Element | null {
  // Calculate dimensions
  const aspectRatio = typology.aspectRatio;
  const width = Math.sqrt(area / aspectRatio);
  const height = width * aspectRatio;
  
  // Calculate position (avoid overlaps)
  const x = bounds.minX + spacing + (index * (width + spacing));
  const y = bounds.minY + spacing;
  
  // Check if building fits in bounds
  if (x + width > bounds.maxX || y + height > bounds.maxY) {
    return null;
  }
  
  // Create building from template
  const template = typology.template;
  const vertices: Vertex[] = template.map((vertex, i) => ({
    x: x + vertex.x * width,
    y: y + vertex.y * height,
    id: `building_${index}_${i}`
  }));
  
  // Apply rotation if needed
  const rotatedVertices = typology.preferredOrientation !== 0 
    ? rotateVertices(vertices, { x: x + width/2, y: y + height/2 }, typology.preferredOrientation)
    : vertices;
  
  return {
    id: `building_${typology.id}_${index}`,
    type: 'building',
    vertices: rotatedVertices,
    properties: {
      name: `${typology.name} ${index + 1}`,
      area: area,
      use: typology.use,
      stories: calculateStoriesFromArea(area, typology.use),
      height: calculateHeightFromArea(area, typology.use)
    }
  };
}

/**
 * Check if building is valid (within bounds, no overlaps)
 */
function isBuildingValid(
  building: Element,
  buildableArea: Element,
  existingBuildings: Element[]
): boolean {
  // Check if building is within buildable area
  const buildingCenter = analyzeGeometry(building.vertices).centroid;
  if (!isPointInPolygon(buildingCenter, buildableArea.vertices)) {
    return false;
  }
  
  // Check for overlaps with existing buildings
  for (const existing of existingBuildings) {
    if (doPolygonsOverlap(building.vertices, existing.vertices)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Calculate number of stories based on area and use type
 */
function calculateStoriesFromArea(area: number, use: string): number {
  const storiesPerSqft: Record<string, number> = {
    'residential': 1000, // 1000 sq ft per story
    'office': 2000,       // 2000 sq ft per story
    'retail': 5000,       // 5000 sq ft per story
    'industrial': 10000   // 10000 sq ft per story
  };
  
  const sqftPerStory = storiesPerSqft[use] || 2000;
  return Math.max(1, Math.floor(area / sqftPerStory));
}

/**
 * Calculate building height based on area and use type
 */
function calculateHeightFromArea(area: number, use: string): number {
  const stories = calculateStoriesFromArea(area, use);
  const storyHeight = 10; // 10 feet per story
  return stories * storyHeight;
}

/**
 * Generate buildings for specific use types
 */
export function generateBuildingsForUse(
  use: string,
  buildableArea: Element,
  targetFAR: number
): BuildingResult {
  const config: SitePlanConfig = {
    maxFAR: 5.0,
    maxCoverage: 80,
    minSetbacks: { front: 10, side: 5, rear: 10 },
    targetFAR,
    buildingTypes: [use],
    minUnitSize: 500,
    maxBuildingHeight: 100,
    parkingRatio: 1.0,
    stallDimensions: {
      standard: { width: 9, depth: 18 },
      compact: { width: 8, depth: 16 },
      handicap: { width: 9, depth: 18 }
    },
    aisleWidth: 24,
    parcelArea: calculatePolygonArea(buildableArea.vertices),
    buildableArea: calculatePolygonArea(buildableArea.vertices),
    existingElements: []
  };
  
  return generateBuildingFootprints(buildableArea, config);
}

/**
 * Helper function to check if point is in polygon
 */
function isPointInPolygon(point: { x: number; y: number }, vertices: Vertex[]): boolean {
  // Simple point-in-polygon test
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    if (((vertices[i].y > point.y) !== (vertices[j].y > point.y)) &&
        (point.x < (vertices[j].x - vertices[i].x) * (point.y - vertices[i].y) / (vertices[j].y - vertices[i].y) + vertices[i].x)) {
      inside = !inside;
    }
  }
  return inside;
}
