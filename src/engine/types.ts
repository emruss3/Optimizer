import type { Feature, Polygon, Point } from 'geojson';

export interface Vertex {
  x: number;
  y: number;
  id: string;
}

export interface Element {
  id: string;
  type: 'building' | 'parking' | 'greenspace' | 'road' | 'utility' | 'other';
  name: string;
  geometry: Polygon;
  properties: {
    areaSqFt?: number;
    units?: number;
    parkingSpaces?: number;
    heightFt?: number;
    stories?: number;
    use?: string; // e.g., 'residential', 'commercial', 'mixed-use'
    color?: string;
    rotation?: number; // in degrees
    [key: string]: any;
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    source: 'user-drawn' | 'ai-generated' | 'imported';
    [key: string]: any;
  };
}

export interface Envelope {
  geometry: Polygon;
  areaSqFt: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface PlannerConfig {
  parcelId: string;
  buildableArea: Polygon;
  zoning: {
    frontSetbackFt: number;
    sideSetbackFt: number;
    rearSetbackFt: number;
    maxFar?: number;
    maxCoveragePct?: number;
    minParkingRatio?: number; // e.g., stalls per unit/sqft
  };
  designParameters: {
    targetFAR: number;
    targetCoveragePct?: number;
    padElevationFt?: number; // Pad elevation in feet for earthwork calculation
    parking: {
      targetRatio: number; // e.g., 1.5 stalls per unit
      stallWidthFt: number;
      stallDepthFt: number;
      aisleWidthFt: number;
      adaPct: number;
      evPct: number;
      layoutAngle?: number; // in degrees
    };
    buildingTypology: string; // e.g., 'bar', 'L-shape', 'podium'
    numBuildings: number;
  };
}

export interface PlannerOutput {
  elements: Element[];
  metrics: {
    totalBuiltSF: number;
    siteCoveragePct: number;
    achievedFAR: number;
    parkingRatio: number; // stalls per unit or per 1000 sqft
    openSpacePct: number;
    zoningCompliant: boolean;
    violations: string[];
    warnings: string[];
  };
  envelope: Envelope;
  processingTime: number; // in milliseconds
}

export interface BuildingTypology {
  id: string;
  name: string;
  description: string;
  shape: 'rectangle' | 'L-shape' | 'podium' | 'custom';
  aspectRatio: number; // width / depth
  minAreaSqFt?: number;
  maxAreaSqFt?: number;
  defaultStories: number;
  defaultHeightFt: number;
}

export interface ParkingMetrics {
  totalStalls: number;
  adaStalls: number;
  evStalls: number;
  utilizationPct: number;
  overlapCount: number;
}

export interface SiteMetrics {
  totalBuiltSF: number;
  siteCoveragePct: number;
  achievedFAR: number;
  parkingRatio: number;
  openSpacePct: number;
  zoningCompliant: boolean;
  violations: string[];
  warnings: string[];
  earthworkCutCY?: number;
  earthworkFillCY?: number;
  earthworkNetCY?: number;
  earthworkCost?: number;
}

export interface WorkerAPI {
  generateSitePlan: (parcel: GeoJSON.Polygon | GeoJSON.MultiPolygon, config: PlannerConfig) => Promise<PlannerOutput>;
}