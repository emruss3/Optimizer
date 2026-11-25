/**
 * Durable housing design records for Parcel Proforma.
 *
 * A design is a versioned product (plan number, elevations, rights, footprints,
 * openings, entry and vehicle thresholds). Selection → drawing must carry this
 * identity through the SF adapter, scene, A-01, section, Three.js and Cycles.
 *
 * Unknown baths / garage stay unknown (`null`). A design with no attached
 * garage uses an independent parking arrangement — never invent a garage door.
 *
 * Second demo product (The Lanes Unit A) is stubbed only; no assets yet.
 */

/** How a resident parks when the design has no attached garage (or garage is unknown). */
export type ParkingArrangement =
  | 'attached-garage'
  | 'detached-garage'
  | 'pad'
  | 'street'
  | 'alley'
  | 'none'
  | 'unknown';

/** Which long face of the heated footprint carries the porch / primary entry. */
export type PorchFace = 'width' | 'depth';

export type DesignVerificationStatus =
  | 'verified'
  | 'trial-cleared'
  | 'provisional'
  | 'unverified';

export type DesignRights =
  | 'licensed'
  | 'citation-only'
  | 'internal'
  | 'unknown';

/** A threshold on the design in plan-local feet (origin at SW corner, +x along width). */
export interface DesignThreshold {
  /** Centre along the wall the opening faces, feet from the wall’s start (left when facing out). */
  alongFt: number;
  /** Facing: 0 = +y (porch/width face at y=0 when porchFace is width), 90 = +x, etc. */
  facingDeg: number;
  widthFt: number;
  /** Wall the threshold sits on, relative to the heated footprint. */
  wall: 'front' | 'rear' | 'left' | 'right';
}

export interface DesignFootprintFloor {
  floor: number;
  /** Outer heated ring in plan-local feet: [x, y][], closed optional. */
  ringFt: Array<[number, number]>;
  heatedSf: number;
  garageSf: number | null;
  porchSf: number | null;
}

/**
 * One versioned house design. Fields that the source does not state stay
 * `null` / `unknown` — never coerce baths or garage from door counts.
 */
export interface HousingDesignRecord {
  /** Stable product id, e.g. `abhp:1754-00010`. */
  id: string;
  /** Asset / schema version for this record. */
  assetVersion: string;
  /** Human label for pickers. */
  name: string;
  /** Publisher plan number when known. */
  planNumber: string;
  source: {
    publisher: string;
    url: string | null;
    citation: string;
    rights: DesignRights;
  };
  stories: number;
  beds: number;
  /** `null` when the source does not state baths (CubiCasa 0-bath fits stay unknown). */
  baths: number | null;
  heatedSf: number;
  /** Attached garage: true / false / null (unknown). */
  attachedGarage: boolean | null;
  /** Garage floor area when known; null when none or unknown. */
  garageSf: number | null;
  porchSf: number | null;
  /** Heated footprint width × depth in feet (porch face named separately). */
  footprint: { widthFt: number; depthFt: number };
  porchFace: PorchFace;
  parking: ParkingArrangement;
  elevations: string[];
  mirrors: Array<'none' | 'left-right'>;
  footprintsByFloor: DesignFootprintFloor[];
  entry: DesignThreshold;
  /** Vehicle threshold when the design has one; null when no garage / pad-only. */
  vehicle: DesignThreshold | null;
  verification: DesignVerificationStatus;
  notes: string[];
}

export type PlacementStatus = 'placed' | 'unplaced' | 'schematic';

/** One placement of a design on a lot — the identity every view must share. */
export interface HousingPlacement {
  designId: string;
  assetVersion: string;
  elevation: string;
  mirror: 'none' | 'left-right';
  /** Rotation of the design’s +x axis from world +x, degrees CCW. */
  rotationDeg: number;
  /** World transform of the design origin (SW of heated footprint), local feet. */
  originFt: [number, number];
  entryAnchorFt: [number, number];
  vehicleAnchorFt: [number, number] | null;
  parking: ParkingArrangement;
  status: PlacementStatus;
  /** Why it placed, or why it did not. */
  reason: string;
  lotIndex: number;
}

export interface LotFitInput {
  /** Lot outer ring in local feet (EPSG:2274 or scene local). */
  ringFt: Array<[number, number]>;
  /** Frontage edge as a segment, or null when frontage is unresolved. */
  frontage: { a: [number, number]; b: [number, number] } | null;
  setbacks: { front: number; side: number; rear: number };
  lotKind?: string | null;
  lotIndex: number;
}

export interface DesignFitResult {
  placement: HousingPlacement | null;
  /** Always set: fit reason or open decision / reject string. */
  reason: string;
  status: PlacementStatus;
}
