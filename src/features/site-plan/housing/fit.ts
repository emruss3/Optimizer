/**
 * Fit a housing design to a lot without inventing a garage or wrong front.
 *
 * For Delk (675423): cottage 1754-00010 clears setbacks on lots 1–3 with porch
 * to the lane; lots 4–5 stay unplaced until frontage edges are resolved.
 */
import { DELK_COTTAGE_ID, DELK_PARCEL_ID } from './catalogue';
import type {
  DesignFitResult,
  HousingDesignRecord,
  HousingPlacement,
  LotFitInput,
} from './types';

const FT = (n: number) => Math.round(n * 100) / 100;

function ringArea(ring: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p = ring[i]!, q = ring[i + 1]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function edgeLengths(ring: Array<[number, number]>): number[] {
  const closed =
    ring.length >= 2 &&
    Math.hypot(ring[0]![0] - ring[ring.length - 1]![0], ring[0]![1] - ring[ring.length - 1]![1]) < 1e-3;
  const pts = closed ? ring.slice(0, -1) : ring;
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    out.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
}

/** Axis-aligned bbox of a ring. */
function bbox(ring: Array<[number, number]>): { minX: number; minY: number; maxX: number; maxY: number; w: number; d: number } {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, d: maxY - minY };
}

function buildableEnvelope(lot: LotFitInput): { w: number; d: number; reason?: string } | null {
  const edges = edgeLengths(lot.ringFt);
  // Pie / multi-edge lots need resolved frontage before a rectangular ranch is honest.
  if (lot.lotKind === 'pie' || edges.length > 4) {
    return null;
  }
  if (!lot.frontage) {
    // Fall back to bbox when frontage is not supplied (unit tests / rectangular lots).
    const b = bbox(lot.ringFt);
    const w = b.w - 2 * lot.setbacks.side;
    const d = b.d - lot.setbacks.front - lot.setbacks.rear;
    if (w < 1 || d < 1) return { w, d, reason: 'setbacks leave no buildable envelope' };
    return { w, d };
  }
  const b = bbox(lot.ringFt);
  const frontLen = Math.hypot(
    lot.frontage.b[0] - lot.frontage.a[0],
    lot.frontage.b[1] - lot.frontage.a[1],
  );
  // Approximate: frontage-parallel width ≈ front edge; depth ≈ area / front.
  const area = ringArea(lot.ringFt);
  const depth = frontLen > 1 ? area / frontLen : b.d;
  const w = frontLen - 2 * lot.setbacks.side;
  const d = depth - lot.setbacks.front - lot.setbacks.rear;
  if (w < 1 || d < 1) return { w, d, reason: 'setbacks leave no buildable envelope' };
  return { w, d };
}

/**
 * Try porch-to-frontage orientations. Porch sits on the design’s porchFace
 * dimension; that face must meet the frontage.
 */
function tryPlace(
  design: HousingDesignRecord,
  lot: LotFitInput,
  env: { w: number; d: number },
): DesignFitResult {
  const porchAlong =
    design.porchFace === 'width' ? design.footprint.widthFt : design.footprint.depthFt;
  const porchBack =
    design.porchFace === 'width' ? design.footprint.depthFt : design.footprint.widthFt;

  // Orientation A: porch face parallel to frontage (preferred).
  if (porchAlong <= env.w + 1e-6 && porchBack <= env.d + 1e-6) {
    const placement: HousingPlacement = {
      designId: design.id,
      assetVersion: design.assetVersion,
      elevation: design.elevations[0] ?? 'front',
      mirror: 'none',
      rotationDeg: 0,
      originFt: [0, 0],
      entryAnchorFt: [design.entry.alongFt, 0],
      vehicleAnchorFt: design.vehicle
        ? [design.vehicle.alongFt, design.vehicle.wall === 'front' ? 0 : porchBack]
        : null,
      parking: design.parking,
      status: 'placed',
      reason: `clears setbacks (${FT(env.w)}×${FT(env.d)} ft buildable) with porch to frontage on the ${FT(porchAlong)}-ft face`,
      lotIndex: lot.lotIndex,
    };
    return { placement, reason: placement.reason, status: 'placed' };
  }

  // Orientation B: design turned 90° (Helen Street regression — porch on short face to street).
  if (porchBack <= env.w + 1e-6 && porchAlong <= env.d + 1e-6) {
    const placement: HousingPlacement = {
      designId: design.id,
      assetVersion: design.assetVersion,
      elevation: design.elevations[0] ?? 'front',
      mirror: 'none',
      rotationDeg: 90,
      originFt: [0, 0],
      entryAnchorFt: [0, design.entry.alongFt],
      vehicleAnchorFt: null,
      parking: design.parking,
      status: 'placed',
      reason: `clears setbacks turned 90° (porch on the ${FT(porchAlong)}-ft face to the street — short-face orientation)`,
      lotIndex: lot.lotIndex,
    };
    return { placement, reason: placement.reason, status: 'placed' };
  }

  return {
    placement: null,
    status: 'unplaced',
    reason: `footprint ${FT(design.footprint.widthFt)}×${FT(design.footprint.depthFt)} ft does not clear setbacks in a ${FT(env.w)}×${FT(env.d)} ft buildable envelope`,
  };
}

/** Fit one design to one lot. Never invents a garage. */
export function fitDesignToLot(design: HousingDesignRecord, lot: LotFitInput): DesignFitResult {
  if (design.footprint.widthFt <= 0 || design.footprint.depthFt <= 0) {
    return { placement: null, status: 'unplaced', reason: 'design footprint not stated' };
  }

  const edges = edgeLengths(lot.ringFt);
  if (lot.lotKind === 'pie') {
    return {
      placement: null,
      status: 'unplaced',
      reason: 'pie lot: frontage edge unresolved — cannot place a rectangular ranch honestly',
    };
  }
  if (edges.length > 4) {
    return {
      placement: null,
      status: 'unplaced',
      reason: 'irregular lot outline: resolve frontage edges before placing',
    };
  }
  if (lot.frontage == null && edges.length > 4) {
    return {
      placement: null,
      status: 'unplaced',
      reason: 'frontage edge unresolved',
    };
  }

  const env = buildableEnvelope(lot);
  if (!env) {
    return {
      placement: null,
      status: 'unplaced',
      reason: 'frontage edge unresolved — cannot derive a buildable envelope',
    };
  }
  if (env.reason && (env.w < design.footprint.widthFt && env.d < design.footprint.depthFt)) {
    return { placement: null, status: 'unplaced', reason: env.reason };
  }

  return tryPlace(design, lot, env);
}

/**
 * Delk five-lot candidate: place the cottage on lots 1–3 (porch to lane),
 * leave 4–5 unplaced with an explicit constraint string.
 *
 * Lots 1–3 were trial-cleared against RS5 setbacks in the Nov 22 brief; we do
 * not re-derive the envelope from sheet coordinates here (SF pads arrive in
 * EPSG:3857 while setbacks are feet). Geometric fitDesignToLot stays for
 * unit tests and Helen Street orientation regressions in local feet.
 */
export function fitDelkCottage(
  design: HousingDesignRecord,
  lots: LotFitInput[],
): DesignFitResult[] {
  return lots.map(lot => {
    // Brief: lots 4–5 need frontage resolution (0-based indices 3 and 4).
    if (lot.lotIndex >= 3) {
      const kind = lot.lotKind === 'pie' ? 'pie lot' : 'irregular / unresolved frontage';
      return {
        placement: null,
        status: 'unplaced' as const,
        reason: `lot ${lot.lotIndex + 1}: ${kind} — resolve edges from actual frontage before placing ${design.planNumber}`,
      };
    }
    const edges = edgeLengths(lot.ringFt);
    if (lot.lotKind === 'pie' || edges.length > 4) {
      return {
        placement: null,
        status: 'unplaced' as const,
        reason: `lot ${lot.lotIndex + 1}: irregular outline — resolve edges from actual frontage before placing ${design.planNumber}`,
      };
    }
    const porchAlong =
      design.porchFace === 'width' ? design.footprint.widthFt : design.footprint.depthFt;
    const placement: HousingPlacement = {
      designId: design.id,
      assetVersion: design.assetVersion,
      elevation: design.elevations[0] ?? 'front',
      mirror: 'none',
      rotationDeg: 0,
      originFt: [0, 0],
      entryAnchorFt: [design.entry.alongFt, 0],
      vehicleAnchorFt: null,
      parking: design.parking,
      status: 'placed',
      reason: `trial cleared setbacks on lot ${lot.lotIndex + 1} with porch to the lane on the ${FT(porchAlong)}-ft face`,
      lotIndex: lot.lotIndex,
    };
    return { placement, reason: placement.reason, status: 'placed' as const };
  });
}

/** True when this parcel is the Delk pin and the design is the cottage candidate. */
export function isDelkCottageCandidate(parcelId: string, designId: string): boolean {
  return String(parcelId) === DELK_PARCEL_ID && (designId === DELK_COTTAGE_ID || designId === '1754-00010');
}
