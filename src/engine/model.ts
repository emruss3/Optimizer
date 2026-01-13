// ┬⌐ 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Polygon, Point } from 'geojson';
// Note: buildingGeometry functions are imported where needed to avoid circular deps

/**
 * SiteState: Represents the buildable site with constraints
 * All coordinates in planar meters (EPSG:3857)
 */
export interface SiteState {
  /** Buildable envelope (already includes setbacks/exclusions) */
  envelope: Polygon;

  /** Zones where building is not allowed */
  noBuildZones: Polygon[];

  /** Access points (v1 can be empty) */
  accessPoints: Point[];
}

/**
 * BuildingSpec: Parameterized building definition
 * Uses "smart objects" approach - geometry is derived from parameters
 */
export interface BuildingSpec {
  id: string;
  type: 'MF_BAR_V1' | 'MF_L_SHAPE' | 'MF_PODIUM' | 'CUSTOM';

  /** Anchor point (center or corner, depending on type) */
  anchor: { x: number; y: number };

  /** Rotation in radians (0 = no rotation) */
  rotationRad: number;

  /** Building dimensions in meters */
  widthM: number;
  depthM: number;

  /** Number of floors */
  floors: number;

  /** Unit mix (optional, for MF buildings) */
  unitMix?: {
    studio?: number;
    oneBed?: number;
    twoBed?: number;
    threeBed?: number;
  };

  /** Lock flags - when true, solver respects these values */
  locked?: {
    position?: boolean;
    rotation?: boolean;
    dimensions?: boolean;
  };
}

/**
 * ParkingSpec: Parking configuration
 */
export interface ParkingSpec {
  /** Parking angle in degrees (0, 15, 30, 45, 60, 75, 90) */
  angleDeg: number;

  /** Stall dimensions in meters */
  stallW: number;  // Stall width
  stallD: number;  // Stall depth

  /** Aisle width in meters */
  aisleW: number;

  /** Bay module depth (stall depth + aisle) in meters */
  bayModuleDepth: number;

  /** Target number of stalls */
  targetStalls: number;

  /** Lock parking orientation */
  lockedOrientation?: boolean;
}

/**
 * ParkingSolution: Result of parking solver
 */
export interface ParkingSolution {
  /** Bay polygons (few large polygons, not individual stalls) */
  bays: Polygon[];

  /** Aisle polygons */
  aisles: Polygon[];

  /** Number of stalls achieved */
  stallsAchieved: number;

  /** Parking orientation used (degrees) */
  orientationDeg: number;

  /** Efficiency metrics */
  efficiency: {
    stallsPer1000SqM: number;
    wastedAreaSqM: number;
    numberOfIslands: number;
  };
}

/**
 * PlanState: Complete site plan state
 */
export interface PlanState {
  /** Site constraints */
  site: SiteState;

  /** Buildings (parameterized) */
  buildings: BuildingSpec[];

  /** Parking solution (derived) */
  parking: ParkingSolution | null;

  /** Circulation (v1: optional/empty) */
  circulation?: Polygon[];

  /** Computed metrics */
  metrics: PlanMetrics;

  /** Computed violations */
  violations: Violation[];
}

/**
 * PlanMetrics: Computed metrics for the plan
 */
export interface PlanMetrics {
  /** Floor Area Ratio */
  far: number;

  /** Site coverage percentage */
  coverage: number;

  /** Parking provided (stalls) */
  parkingProvided: number;

  /** Parking required (stalls) */
  parkingRequired: number;

  /** Total Gross Floor Area (sq meters) */
  totalGFA: number;

  /** Total footprint area (sq meters) */
  totalFootprintArea: number;

  /** Site area (sq meters) */
  siteArea: number;
}

/**
 * Violation: A constraint violation with explanation
 */
export interface Violation {
  type: 'buildingOutsideEnvelope' | 'buildingOverlap' | 'parkingShortfall' |
        'farExceeded' | 'coverageExceeded' | 'other';

  /** Human-readable message */
  message: string;

  /** Numeric delta (e.g., "short by 24 stalls", "exceeded by 0.12 FAR") */
  delta?: number;

  /** Related building IDs (if applicable) */
  buildingIds?: string[];

  /** Severity */
  severity: 'error' | 'warning';
}

/**
 * Helper function to create a default BuildingSpec
 */
export function createBuildingSpec(
  id: string,
  anchor: { x: number; y: number },
  widthM: number,
  depthM: number,
  floors: number = 3,
  type: BuildingSpec['type'] = 'MF_BAR_V1'
): BuildingSpec {
  return {
    id,
    type,
    anchor,
    rotationRad: 0,
    widthM,
    depthM,
    floors,
    locked: {
      position: false,
      rotation: false,
      dimensions: false
    }
  };
}

/**
 * Helper function to create a default ParkingSpec
 */
export function createParkingSpec(
  targetStalls: number,
  angleDeg: number = 0
): ParkingSpec {
  // Default stall dimensions (convert from feet: 9ft x 18ft)
  const stallW = 2.7432; // 9ft in meters
  const stallD = 5.4864; // 18ft in meters
  const aisleW = 7.3152; // 24ft in meters

  return {
    angleDeg,
    stallW,
    stallD,
    aisleW,
    bayModuleDepth: stallD + aisleW,
    targetStalls,
    lockedOrientation: false
  };
}

/**
 * Helper function to create initial PlanState
 */
export function createPlanState(
  envelope: Polygon,
  noBuildZones: Polygon[] = []
): PlanState {
  return {
    site: {
      envelope,
      noBuildZones,
      accessPoints: []
    },
    buildings: [],
    parking: null,
    metrics: {
      far: 0,
      coverage: 0,
      parkingProvided: 0,
      parkingRequired: 0,
      totalGFA: 0,
      totalFootprintArea: 0,
      siteArea: 0
    },
    violations: []
  };
}
