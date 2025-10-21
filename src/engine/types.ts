// Core types for the site planning engine
export interface Vertex {
  x: number;
  y: number;
  id: string;
}

export interface Element {
  id: string;
  type: 'building' | 'parking' | 'greenspace' | 'road' | 'utility';
  vertices: Vertex[];
  rotation?: number; // Current rotation angle in degrees
  properties: {
    name?: string;
    area?: number;
    perimeter?: number;
    color?: string;
    strokeColor?: string;
    fillOpacity?: number;
    // Building-specific properties
    stories?: number;
    height?: number;
    use?: string;
    // Parking-specific properties
    stallCount?: number;
    stallType?: 'standard' | 'compact' | 'handicap' | 'ev';
    // Greenspace properties
    vegetationType?: string;
    maintenanceLevel?: 'low' | 'medium' | 'high';
  };
}

export interface DragState {
  isDragging: boolean;
  dragType: 'element' | 'vertex' | 'selection';
  elementId?: string;
  vertexId?: string;
  offset: { x: number; y: number };
  originalPosition: { x: number; y: number };
  originalVertices?: Vertex[];
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  elements: Element[];
}

export interface SitePlanConfig {
  // Zoning constraints
  maxFAR: number;
  maxCoverage: number;
  minSetbacks: {
    front: number;
    side: number;
    rear: number;
  };
  
  // Building requirements
  targetFAR: number;
  buildingTypes: string[];
  minUnitSize: number;
  maxBuildingHeight: number;
  
  // Parking requirements
  parkingRatio: number;
  stallDimensions: {
    standard: { width: number; depth: number };
    compact: { width: number; depth: number };
    handicap: { width: number; depth: number };
  };
  aisleWidth: number;
  
  // Site analysis
  parcelArea: number;
  buildableArea: number;
  existingElements: Element[];
}

export interface SiteMetrics {
  totalBuiltSF: number;
  siteCoverage: number; // percentage
  achievedFAR: number;
  parkingRatio: number;
  openSpacePercent: number;
  buildingCount: number;
  parkingStallCount: number;
  utilization: number; // how well the space is used
}

export interface ParkingConfig {
  targetStalls: number;
  stallWidth: number;
  stallDepth: number;
  aisleWidth: number;
  layoutAngle: number; // degrees from horizontal
  adaRatio: number; // percentage of ADA stalls
  evRatio: number; // percentage of EV stalls
}

export interface BuildingTypology {
  id: string;
  name: string;
  use: string;
  aspectRatio: number; // width/height
  minSize: number; // minimum area
  maxSize: number; // maximum area
  preferredOrientation: number; // degrees
  template: Vertex[]; // normalized template (0-1 coordinates)
}

export interface GeometryResult {
  area: number;
  perimeter: number;
  centroid: { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  isValid: boolean;
}

export interface ParkingResult {
  stalls: Element[];
  metrics: {
    totalStalls: number;
    adaStalls: number;
    evStalls: number;
    utilization: number;
    overlapCount: number;
  };
}

export interface BuildingResult {
  buildings: Element[];
  metrics: {
    totalArea: number;
    achievedFAR: number;
    buildingCount: number;
    averageSize: number;
  };
}

// GeoJSON compatibility
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONPoint {
  type: 'Point';
  coordinates: number[];
}

// Utility types
export type ElementType = Element['type'];
export type PropertyKey = keyof Element['properties'];
export type ConfigKey = keyof SitePlanConfig;
