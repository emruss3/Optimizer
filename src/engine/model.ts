// ┬⌐ 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Polygon, Point } from 'geojson';
// Note: buildingGeometry functions are imported where needed to avoid circular deps

// ─── Unit Mix ────────────────────────────────────────────────────────────────

export interface UnitMixEntry {
  type: 'studio' | '1br' | '2br' | '3br';
  count: number;
  avgSqft: number;
  rentPerMonth: number;
}

/**
 * Standard unit type definitions.
 * Studio: 450sf, 10%, $1500/mo
 * 1BR: 650sf, 40%, $1800/mo
 * 2BR: 900sf, 35%, $2200/mo
 * 3BR: 1200sf, 15%, $2800/mo
 */
const UNIT_TYPE_DEFS: Array<{
  type: UnitMixEntry['type'];
  avgSqft: number;
  pct: number;
  rentPerMonth: number;
}> = [
  { type: 'studio', avgSqft: 450, pct: 0.10, rentPerMonth: 1500 },
  { type: '1br',    avgSqft: 650, pct: 0.40, rentPerMonth: 1800 },
  { type: '2br',    avgSqft: 900, pct: 0.35, rentPerMonth: 2200 },
  { type: '3br',    avgSqft: 1200, pct: 0.15, rentPerMonth: 2800 },
];

/**
 * Generate a default unit mix from a gross floor area (in sqft).
 * Efficiency factor: 85% of GFA is net leasable.
 * Total units = floor(netLeasable / weightedAvgSqft)
 */
export function generateDefaultUnitMix(gfaSqft: number): UnitMixEntry[] {
  const EFFICIENCY = 0.85;
  const weightedAvgSqft = UNIT_TYPE_DEFS.reduce(
    (sum, d) => sum + d.avgSqft * d.pct, 0
  );
  const totalUnits = Math.max(1, Math.floor(gfaSqft * EFFICIENCY / weightedAvgSqft));

  let assigned = 0;
  const entries: UnitMixEntry[] = UNIT_TYPE_DEFS.map((def, idx) => {
    const isLast = idx === UNIT_TYPE_DEFS.length - 1;
    const count = isLast ? totalUnits - assigned : Math.round(totalUnits * def.pct);
    assigned += count;
    return {
      type: def.type,
      count: Math.max(0, count),
      avgSqft: def.avgSqft,
      rentPerMonth: def.rentPerMonth,
    };
  });

  return entries;
}

/**
 * Get total dwelling units from a unit mix array.
 */
export function totalUnitsFromMix(mix: UnitMixEntry[] | undefined): number {
  if (!mix || mix.length === 0) return 0;
  return mix.reduce((sum, e) => sum + e.count, 0);
}

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
export type BuildingType = 'MF_BAR_V1' | 'MF_L_SHAPE' | 'MF_PODIUM' | 'MF_U_SHAPE' | 'MF_COURTYARD_WRAP' | 'CUSTOM';

export interface BuildingSpec {
  id: string;
  type: BuildingType;

  /** Anchor point (center or corner, depending on type) */
  anchor: { x: number; y: number };

  /** Rotation in radians (0 = no rotation) */
  rotationRad: number;

  /** Building dimensions in meters */
  widthM: number;
  depthM: number;

  /** Number of floors */
  floors: number;

  /** Wing dimensions for L-shape (optional) */
  wingWidth?: number;
  wingDepth?: number;

  /** Courtyard dimensions for U-shape and courtyard-wrap (optional) */
  courtyardWidth?: number;
  courtyardDepth?: number;

  /** Number of podium floors for podium type (optional) */
  podiumFloors?: number;

  /** Unit mix (optional, for MF buildings) */
  unitMix?: UnitMixEntry[];

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
        'farExceeded' | 'coverageExceeded' | 'heightExceeded' | 'densityExceeded' |
        'imperviousExceeded' | 'openSpaceInsufficient' | 'other';

  /** Human-readable message */
  message: string;

  /** Numeric delta (e.g., "short by 24 stalls", "exceeded by 0.12 FAR") */
  delta?: number;

  /** Related building IDs (if applicable) */
  buildingIds?: string[];

  /** Severity */
  severity: 'error' | 'warning';
}

/** Feet-to-metres constant used for default dimensions */
const FT_TO_M = 0.3048;

/**
 * Default dimensions (in metres) per building type.
 * Derived from common US multifamily standards.
 */
const TYPOLOGY_DEFAULTS: Record<BuildingType, {
  widthM: number;
  depthM: number;
  floors: number;
  wingWidth?: number;
  wingDepth?: number;
  courtyardWidth?: number;
  courtyardDepth?: number;
  podiumFloors?: number;
}> = {
  MF_BAR_V1: {
    widthM: 200 * FT_TO_M,       // 200 ft
    depthM: 60 * FT_TO_M,        // 60 ft
    floors: 3
  },
  MF_L_SHAPE: {
    widthM: 150 * FT_TO_M,       // main 150 ft × 60 ft
    depthM: 60 * FT_TO_M,
    wingWidth: 80 * FT_TO_M,     // wing 80 ft × 60 ft
    wingDepth: 60 * FT_TO_M,
    floors: 3
  },
  MF_PODIUM: {
    widthM: 200 * FT_TO_M,       // 200 ft × 100 ft
    depthM: 100 * FT_TO_M,
    podiumFloors: 2,
    floors: 5
  },
  MF_U_SHAPE: {
    widthM: 200 * FT_TO_M,       // 200 ft × 120 ft
    depthM: 120 * FT_TO_M,
    courtyardWidth: 100 * FT_TO_M,
    courtyardDepth: 60 * FT_TO_M,
    floors: 4
  },
  MF_COURTYARD_WRAP: {
    widthM: 200 * FT_TO_M,       // 200 ft × 150 ft
    depthM: 150 * FT_TO_M,
    courtyardWidth: 120 * FT_TO_M,
    courtyardDepth: 70 * FT_TO_M,
    floors: 4
  },
  CUSTOM: {
    widthM: 200 * FT_TO_M,
    depthM: 60 * FT_TO_M,
    floors: 3
  }
};

/**
 * Helper function to create a default BuildingSpec.
 * When widthM / depthM are supplied they override the typology defaults.
 */
export function createBuildingSpec(
  id: string,
  anchor: { x: number; y: number },
  widthM?: number,
  depthM?: number,
  floors?: number,
  type: BuildingType = 'MF_BAR_V1'
): BuildingSpec {
  const defaults = TYPOLOGY_DEFAULTS[type] ?? TYPOLOGY_DEFAULTS.MF_BAR_V1;
  return {
    id,
    type,
    anchor,
    rotationRad: 0,
    widthM: widthM ?? defaults.widthM,
    depthM: depthM ?? defaults.depthM,
    floors: floors ?? defaults.floors,
    wingWidth: defaults.wingWidth,
    wingDepth: defaults.wingDepth,
    courtyardWidth: defaults.courtyardWidth,
    courtyardDepth: defaults.courtyardDepth,
    podiumFloors: defaults.podiumFloors,
    locked: {
      position: false,
      rotation: false,
      dimensions: false
    }
  };
}

/**
 * Map UI typology string to BuildingType enum value.
 */
export function typologyToBuildingType(typology: string): BuildingType {
  switch (typology.toLowerCase()) {
    case 'bar': return 'MF_BAR_V1';
    case 'l-shape': return 'MF_L_SHAPE';
    case 'podium': return 'MF_PODIUM';
    case 'u-shape': return 'MF_U_SHAPE';
    case 'courtyard-wrap':
    case 'courtyard': return 'MF_COURTYARD_WRAP';
    default: return 'MF_BAR_V1';
  }
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
