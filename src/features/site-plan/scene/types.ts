// The drawing scene: one typed description of what is on the sheet, read by
// the plan, the 3D model, the section and the printed exhibits. It is built
// once from the accepted scheme (`buildDrawingScene`) and is read-only: a
// renderer draws what is here and never adds a stall, a lot or a unit.
import type { GroundFrame, Pt } from './frame';
import type { BuildingUse, SceneHeight } from './heights';

/** Where a value comes from. A view says so when it is not `engine`. */
export type Authority =
  | 'engine'      // returned by the plan generator
  | 'record'      // the parcel record or a public layer
  | 'derived'     // arithmetic on engine values (footprint x stories)
  | 'estimated'   // a drawing assumption
  | 'unavailable';

export interface Sourced<T> {
  value: T;
  authority: Authority;
}

export interface SceneIdentity {
  parcelId: string;
  /** The scheme on the sheet: a saved candidate id, or the generator and pattern. */
  schemeId: string;
  /** A hash of the scheme's geometry and stories: changes when the plan does. */
  revision: string;
  /** `parcel|scheme`: what a selection or a camera position is remembered for. */
  key: string;
}

export type FeatureRole = 'building' | 'parking' | 'drive' | 'street' | 'open-space' | 'lot' | 'other';
export type StyleRole = 'building' | 'amenity' | 'house' | 'parking' | 'drive' | 'street' | 'open-space' | 'lot' | 'other';

/** Polygons of one feature in local ground feet: polygon, ring (0 is the outer, the rest are holes), point. */
export type ScenePolygons = Pt[][][];

export interface SceneFeature {
  /** The plan element's own id, unchanged, in every view. */
  id: string;
  role: FeatureRole;
  styleRole: StyleRole;
  name: string;
  polygons: ScenePolygons;
  /** Stalls on a parking feature, as the plan reports them. */
  stalls: number | null;
  /** The feature's area as the plan reports it, square feet. Never measured here. */
  reportedAreaSqFt: number | null;
  provenance: { elementType: string; generator: string | null };
}

export interface BuildingDisplay {
  /** "Building A" */
  title: string;
  use: string;
  /** "4 stories" */
  floors: string;
  /** "13,561 sf" or "not reported" */
  footprint: string;
  /** "54,244 sf" or "not reported" */
  gross: string;
  /** "30" or "not reported" */
  units: string;
  /** "Estimated height" or "Height" */
  heightLabel: string;
  /** "44 ft" */
  height: string;
  /** "est. 44 ft" or "44 ft" */
  heightShort: string;
  /** Lines under the tag on the plan, most important first. */
  planLines: string[];
  /** One line for a status bar: tag, id, floors, footprint, height. */
  oneLine: string;
}

export interface SceneBuilding extends SceneFeature {
  role: 'building';
  /** A, B, C on the sheet; H1 or T1 for a house or a townhome. */
  tag: string;
  /** False for houses and townhomes: their lot or row carries the label. */
  tagOnPlan: boolean;
  use: BuildingUse;
  floors: Sourced<number>;
  footprintSqFt: Sourced<number> | null;
  grossSqFt: Sourced<number> | null;
  units: Sourced<number> | null;
  height: SceneHeight;
  /** A point inside the footprint and clear of any court, in local feet. */
  labelPoint: Pt;
  display: BuildingDisplay;
}

export interface SceneContext {
  buildings: Array<{ polygons: ScenePolygons; stories: number }>;
  parcels: ScenePolygons;
  roads: Array<{ path: Pt[]; name: string | null }>;
}

export interface FrameCheck {
  /** `verified`: areas in this frame match the areas the engine reports. */
  status: 'verified' | 'unverified' | 'mismatch';
  samples: number;
  /** Largest disagreement, percent. */
  worstPct: number | null;
  note: string;
}

export interface SceneSchedule {
  /** Units and stalls of the accepted scheme, passed in, never recounted here. */
  units: number | null;
  stalls: number | null;
  /** Sum of the buildings' own unit counts, or null when a building has none. */
  buildingUnits: number | null;
  /** Sum of the parking features' own stall counts, or null when one has none. */
  featureStalls: number | null;
  /** False when a sum above disagrees with the scheme's figure. */
  consistent: boolean;
}

export interface DrawingScene {
  identity: SceneIdentity;
  frame: GroundFrame;
  units: { horizontal: 'ft'; vertical: 'ft' };
  /**
   * Heights in the scene are above grade at each building. Ground elevations
   * and a vertical datum are not part of it yet, and no view may add a height
   * to an elevation as if they shared a zero.
   */
  vertical: { heights: 'above-grade'; groundElevations: 'unavailable'; datum: null };
  /** The parcel, holes and parts kept. */
  parcel: { polygons: ScenePolygons } | null;
  envelope: { polygons: ScenePolygons } | null;
  features: SceneFeature[];
  buildings: SceneBuilding[];
  context: SceneContext;
  schedule: SceneSchedule;
  /** Bounding box of the parcel and the plan, in local feet. */
  extentFt: { minX: number; minY: number; maxX: number; maxY: number };
  frameCheck: FrameCheck;
}
