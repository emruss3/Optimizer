export interface SelectedParcel {
  id: string;
  parcelnumb: string;
  address: string;
  deededacreage: number;
  sqft: number;
  zoning: string;
  geometry: any;
  landval?: number;
  parval?: number;
  lat?: string;
  lon?: string;
  // Zoning constraints
  max_far?: number;
  max_height_ft?: number;
  max_coverage_pct?: number;
  min_front_setback_ft?: number;
  min_rear_setback_ft?: number;
  min_side_setback_ft?: number;
  // Additional site characteristics
  slope?: 'flat' | 'moderate' | 'steep';
  flood_zone?: string;
  soil_type?: string;
  access_points?: number;
  utilities?: string[];
}

export interface ProjectState {
  id: string;
  name: string;
  parcels: SelectedParcel[];
  totalAcreage: number;
  totalSqft: number;
  totalLandValue: number;
  avgFAR: number;
  maxUnits: number;
  buildableArea: number;
  siteplanConfig: SiteplanConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteplanConfig {
  targetFAR: number;
  targetHeight: number;
  buildingSetbacks: {
    front: number;
    rear: number;
    side: number;
  };
  targetCoverage: number;
  buildingType: 'residential' | 'commercial' | 'mixed-use';
  unitsPerAcre?: number;
  parkingRatio?: number;
}

export interface BuildingMassing {
  footprint: number; // sq ft
  totalGSF: number; // gross square feet
  height: number; // feet
  stories: number;
  units?: number;
  parkingSpaces?: number;
  coverage: number; // percentage of lot
  far: number; // floor area ratio
  // Enhanced metrics
  buildableArea?: number;
  openSpaceArea?: number;
  parkingArea?: number;
  amenitySpace?: number;
  averageUnitSize?: number;
  constructionCost?: number;
  estimatedValue?: number;
  roiProjection?: number;
  constraintAnalysis?: {
    farUtilization: number;
    heightUtilization: number;
    coverageUtilization: number;
    limitingFactor: string;
  };
}

export interface SitePlanVisualization {
  buildings: BuildingFootprint[];
  openSpaces: OpenSpaceArea[];
  parkingAreas: ParkingArea[];
  utilities: UtilityLocation[];
  circulation: CirculationPath[];
}

export interface BuildingFootprint {
  id: string;
  coordinates: number[][];
  height: number;
  stories: number;
  use: string;
  units?: number;
  gsf: number;
}

export interface OpenSpaceArea {
  id: string;
  coordinates: number[][];
  type: 'playground' | 'garden' | 'plaza' | 'buffer';
  amenities: string[];
}

export interface ParkingArea {
  id: string;
  coordinates: number[][];
  type: 'surface' | 'garage' | 'underground';
  spaces: number;
  accessPoint: number[];
}

export interface UtilityLocation {
  id: string;
  coordinate: number[];
  type: 'electric' | 'water' | 'sewer' | 'gas' | 'fiber';
  capacity: string;
}

export interface CirculationPath {
  id: string;
  coordinates: number[][];
  type: 'road' | 'sidewalk' | 'path' | 'emergency';
  width: number;
}