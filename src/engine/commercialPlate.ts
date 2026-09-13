// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * Single-tenant retail plate — BUILDING FIRST, on-plane with the parcel.
 *
 * Eric (2026-09-13, 2405 12th Ave S): "You've prioritized parking in an urban
 * environment over the building… The design isn't on plane with the
 * orientation of the parcel… You didn't maximize FAR."
 *
 * The product model for an urban CS lot:
 *   1. The building chases the entitlement (max GFA / FAR) and fronts the
 *      street — it takes the front of the buildable envelope, full width.
 *   2. Parking is the REMNANT behind it: only what fits, honestly counted;
 *      never a field the building was starved to create.
 *   3. Everything is laid out in the envelope's own frame — depth axis square
 *      to the side lot lines, bands clipped to the envelope — so nothing is
 *      axis-aligned to EPSG:3857 and no dead wedges appear along rotated
 *      boundaries. Nothing leaves the setback-adjusted envelope.
 *
 * Pure geometry (EPSG:3857 metres in, metres out); the workspace turns the
 * result into Elements. Areas reported in TRUE square feet (Mercator-corrected)
 * so FAR = footprint / lot reads the same on the canvas and in the ordinance.
 */
import type { Polygon } from 'geojson';
import { areaM2, intersection, union, polygons, mercatorCorrectionFactor } from './geometry';

export type Pt = [number, number];

export interface PlateParkingSpec {
  stallWidthFt: number;
  stallDepthFt: number;
  aisleWidthFt: number;
}

export interface PlateLayoutInput {
  /** Setback-adjusted buildable envelope, EPSG:3857 metres. */
  envelope: Polygon;
  /** Street-frontage segment (the parcel's front edge), EPSG:3857 metres.
   *  Null falls back to the envelope's longest edge as the frontage. */
  frontLine: Pt[] | null;
  /** Footprint the building should reach — max GFA at one story, TRUE sqft.
   *  Already capped by whatever binds (FAR, building coverage). */
  targetFootprintSqft: number;
  /** Lot area, TRUE sqft (for FAR / coverage). */
  lotSqft: number | null;
  parking: PlateParkingSpec;
  /** Ordinance parking basis: retail SF per required stall (CS: 300). */
  sqftPerStall: number;
  /** Impervious cap, TRUE sqft (null = not checked). */
  maxImperviousSqft?: number | null;
}

export interface PlateLayout {
  /** Depth axis (front → rear), radians in the 3857 frame. */
  depthAxisRad: number;
  building: Polygon;
  /** Stall-row bands, front to rear (0–2). Each is one stall deep. */
  stallRows: Polygon[];
  /** Drive aisle / rear apron (null when nothing fits behind the building). */
  drive: Polygon | null;
  /** Leftover rear strip too thin for anything else. */
  landscape: Polygon | null;
  /** TRUE sqft actually enclosed by `building`. */
  footprintSqft: number;
  achievedFar: number | null;
  coveragePct: number | null;
  /** Building + parking + drive, TRUE sqft. */
  imperviousSqft: number;
  /** Full stall cells the canvas striping will draw across the stall rows. */
  stallsProvided: number;
  stallsRequired: number;
  /** Footprint given back (TRUE sqft) so a working parking module fits — 0 = none. */
  giveBackSqft: number;
  /** Depth of each band, TRUE feet — for the basis line / receipts. */
  depthsFt: { building: number; stalls: number; drive: number; landscape: number; envelope: number };
  widthFt: number;
  flags: string[];
}

const SQFT_PER_M2 = 10.7639;
const FT_PER_M = 1 / 0.3048;

/** Narrowest rear apron that still reads as a drive — cars back out of the
 *  stall row across it into the rear setback / alley (urban alley-loaded
 *  parking). A full aisle (24 ft) is used whenever the remnant allows. */
const MIN_APRON_FT = 10;
/** The building may give back at most this share of its target footprint to
 *  fit one working parking module — beyond that, parking is what remains. */
const MAX_GIVE_BACK_SHARE = 0.05;
/** A remnant thinner than this is float noise, not a band. */
const MIN_BAND_M = 0.3;

const ringOf = (p: Polygon | null | undefined): Pt[] | null => {
  const r = p?.coordinates?.[0] as Pt[] | undefined;
  return r && r.length >= 4 ? r : null;
};

/** Indexed ring access for rings already validated by `ringOf`. */
const at = (ring: Pt[], i: number): Pt => ring[i] as Pt;

function longestEdge(ring: Pt[]): { a: Pt; b: Pt; angle: number } {
  let best = { a: at(ring, 0), b: at(ring, 1), len: -1 };
  for (let i = 0; i < ring.length - 1; i++) {
    const a = at(ring, i), b = at(ring, i + 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best.len) best = { a, b, len };
  }
  return { a: best.a, b: best.b, angle: Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]) };
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * ex), p[1] - (a[1] + t * ey));
}

/** Index of the ring edge that IS the frontage: the edge whose midpoint sits
 *  closest to the street-frontage line, parallel-ish edges winning ties (a
 *  corner vertex can sit nearer the street than the front edge's midpoint on
 *  a skewed lot). Longest edge when no frontage is known. */
function frontEdgeIndex(ring: Pt[], frontLine: Pt[] | null): number {
  let pick = -1;
  if (frontLine && frontLine.length >= 2) {
    let bestD = Infinity;
    const f0 = at(frontLine, 0), f1 = at(frontLine, frontLine.length - 1);
    for (let i = 0; i < ring.length - 1; i++) {
      const a = at(ring, i), b = at(ring, i + 1);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let d = Infinity;
      for (let j = 0; j < frontLine.length - 1; j++) d = Math.min(d, segDist(mid, at(frontLine, j), at(frontLine, j + 1)));
      const fx = f1[0] - f0[0];
      const fy = f1[1] - f0[1];
      const flen = Math.hypot(fx, fy) || 1;
      const align = Math.abs(((b[0] - a[0]) * fx + (b[1] - a[1]) * fy) / (len * flen));
      const score = d * (2 - align);
      if (score < bestD) { bestD = score; pick = i; }
    }
  }
  if (pick < 0) {
    let bestLen = -1;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = at(ring, i), b = at(ring, i + 1);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > bestLen) { bestLen = len; pick = i; }
    }
  }
  return pick;
}

/** Inward unit normal of edge i, from the ring's winding (interior is to the
 *  left of travel on a CCW ring) — holds on concave parcels too. */
function inwardNormal(ring: Pt[], i: number): Pt {
  let s2 = 0;
  for (let j = 0; j < ring.length - 1; j++) {
    const p = at(ring, j), q = at(ring, j + 1);
    s2 += p[0] * q[1] - q[0] * p[1];
  }
  const ccw = s2 >= 0;
  const a = at(ring, i), b = at(ring, i + 1);
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  return ccw ? [-ey / len, ex / len] : [ey / len, -ex / len];
}

/** Inward unit normal of the envelope edge that IS the frontage. */
function frontInwardNormal(ring: Pt[], frontLine: Pt[] | null): Pt {
  return inwardNormal(ring, frontEdgeIndex(ring, frontLine));
}

export interface SetbacksFt { front: number; side: number; rear: number }

/**
 * The setback-adjusted envelope the brief's OWN standards describe: the parcel
 * with the front setback off its street edge, the rear setback off the edge
 * facing away from it, the side setback off every other edge — each in TRUE
 * feet at the parcel's latitude, applied along the parcel's edges (so the
 * result is on-plane with the lot).
 *
 * Why this exists (408571, 2026-09-13): the compiled brief carried a
 * `buildable_envelope` that was a UNIFORM 6.096 m inset on all four sides —
 * 20 ft applied in Mercator metres (16 true ft), sides included — while the
 * same brief declared side_setback_ft = 0. A plate that fills that strip can
 * never reach FAR 0.6. The plate is measured against the standards, not the
 * polygon that contradicts them.
 */
export function envelopeFromSetbacks(parcel: Polygon, frontLine: Pt[] | null, setbacks: SetbacksFt): Polygon | null {
  const ring = ringOf(parcel);
  if (!ring) return null;
  const lin = Math.sqrt(mercatorCorrectionFactor(parcel));
  const ftToM = (ft: number): number => (ft * 0.3048) / lin;
  const fi = frontEdgeIndex(ring, frontLine);
  const nFront = inwardNormal(ring, fi);
  // Rear = the longest edge facing most directly away from the front.
  let ri = -1, bestRear = -Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    if (i === fi) continue;
    const a = at(ring, i), b = at(ring, i + 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const n = inwardNormal(ring, i);
    const opposite = -(n[0] * nFront[0] + n[1] * nFront[1]); // 1 = faces the front edge
    const score = opposite * len;
    if (opposite > 0 && score > bestRear) { bestRear = score; ri = i; }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const big = 4 * Math.hypot(maxX - minX, maxY - minY) + 10;
  let acc: Polygon | null = parcel;
  for (let i = 0; i < ring.length - 1 && acc; i++) {
    const a = at(ring, i), b = at(ring, i + 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const sFt = i === fi ? setbacks.front : i === ri ? setbacks.rear : setbacks.side;
    const s = ftToM(Math.max(0, sFt));
    if (s <= 1e-6) continue;
    const n = inwardNormal(ring, i);
    const t: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Half-plane on the inward side of the edge, offset by the setback.
    const p = (along: number, inward: number): Pt => [
      mid[0] + t[0] * along + n[0] * inward,
      mid[1] + t[1] * along + n[1] * inward,
    ];
    const half: Polygon = {
      type: 'Polygon',
      coordinates: [[p(-big, s), p(big, s), p(big, s + big), p(-big, s + big), p(-big, s)]],
    };
    let best: Polygon | null = null;
    let bestA = 0;
    for (const part of polygons(intersection(acc, half))) {
      if (!ringOf(part)) continue;
      const area = areaM2(part);
      if (area > bestA) { bestA = area; best = part; }
    }
    acc = best;
  }
  return acc && areaM2(acc) >= 1 ? acc : null;
}

export interface ParkingBasisLike { basis?: string | null; ratio?: number | null }

/**
 * Retail SF per required stall from the brief's parking basis
 * (`per_1000_gsf` × ratio 4 → 250 SF/stall). Unit-based or unknown bases
 * fall back to the CS default of one stall per 300 SF.
 */
export function retailSqftPerStall(
  p: ParkingBasisLike | null | undefined,
  fallback = 300
): { sqftPerStall: number; label: string; source: 'brief' | 'default' } {
  const basis = (p?.basis ?? '').toLowerCase();
  const ratio = p?.ratio ?? null;
  if (ratio != null && ratio > 0) {
    const perN = basis.match(/per_?(\d+)_?(g?sf|sq_?ft)/);
    const n = perN ? Number(perN[1]) : 0;
    if (n > 0) return { sqftPerStall: n / ratio, label: `${ratio} / ${n.toLocaleString()} SF`, source: 'brief' };
    if (/(sf|sqft)_per_stall/.test(basis)) return { sqftPerStall: ratio, label: `1 / ${ratio} SF`, source: 'brief' };
  }
  return { sqftPerStall: fallback, label: `1 / ${fallback} SF`, source: 'default' };
}

/** Full stall cells the canvas striping draws on a one-row band: dividers
 *  every `stallWidthM` along the band's longest edge, snapped to a grid from
 *  the band's centre — mirrored from SitePlanCanvas.renderParkingStripes so
 *  the label counts what is on the screen. */
export function canvasStallCells(ring: Pt[], stallWidthM: number): number {
  if (ring.length < 4 || stallWidthM <= 0) return 0;
  const { angle } = longestEdge(ring);
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let lmin = Infinity, lmax = -Infinity;
  for (const [x, y] of ring) {
    const lx = (x - cx) * cos - (y - cy) * sin;
    if (lx < lmin) lmin = lx;
    if (lx > lmax) lmax = lx;
  }
  const startX = Math.ceil(lmin / stallWidthM) * stallWidthM;
  return Math.max(0, Math.floor((lmax - startX) / stallWidthM + 1e-9));
}

/**
 * Lay the plate out. Returns null only when the envelope is unusable.
 */
export function layoutCommercialPlate(input: PlateLayoutInput): PlateLayout | null {
  const ring = ringOf(input.envelope);
  if (!ring) return null;
  const k = mercatorCorrectionFactor(input.envelope); // cos²(lat): merc m² → true m²
  const lin = Math.sqrt(k);                            // merc m → true m
  const trueSqft = (p: Polygon | null): number => (p ? areaM2(p) * k * SQFT_PER_M2 : 0);
  const ftToM = (ft: number): number => (ft * 0.3048) / lin;   // TRUE feet → Mercator metres
  const mToFt = (m: number): number => m * lin * FT_PER_M;      // Mercator metres → TRUE feet

  // ── Frame: depth axis u (front → rear), cross axis v ─────────────────────
  // u is the OBB axis (longest edge or its perpendicular) that best follows
  // the frontage's inward normal — square to the side lot lines on a deep
  // lot, front-to-back on a wide one.
  const n = frontInwardNormal(ring, input.frontLine);
  const theta = longestEdge(ring).angle;
  const c1: Pt = [Math.cos(theta), Math.sin(theta)];
  const c2: Pt = [-Math.sin(theta), Math.cos(theta)];
  const d1 = c1[0] * n[0] + c1[1] * n[1];
  const d2 = c2[0] * n[0] + c2[1] * n[1];
  let u: Pt = Math.abs(d1) >= Math.abs(d2) ? c1 : c2;
  if ((u === c1 ? d1 : d2) < 0) u = [-u[0], -u[1]];
  const v: Pt = [-u[1], u[0]];
  const origin = at(ring, 0);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of ring) {
    const du = (p[0] - origin[0]) * u[0] + (p[1] - origin[1]) * u[1];
    const dv = (p[0] - origin[0]) * v[0] + (p[1] - origin[1]) * v[1];
    if (du < u0) u0 = du; if (du > u1) u1 = du;
    if (dv < v0) v0 = dv; if (dv > v1) v1 = dv;
  }
  const D = u1 - u0;
  const W = v1 - v0;
  if (!(D > MIN_BAND_M) || !(W > MIN_BAND_M)) return null;

  const world = (uu: number, vv: number): Pt => [
    origin[0] + u[0] * uu + v[0] * vv,
    origin[1] + u[1] * uu + v[1] * vv,
  ];
  const rect = (ua: number, ub: number, va: number, vb: number): Polygon => ({
    type: 'Polygon',
    coordinates: [[world(ua, va), world(ub, va), world(ub, vb), world(ua, vb), world(ua, va)]],
  });
  const largest = (parts: Polygon[]): Polygon | null => {
    let best: Polygon | null = null;
    let bestA = 0;
    for (const p of parts) {
      if (!ringOf(p)) continue;
      const a = areaM2(p);
      if (a > bestA) { bestA = a; best = p; }
    }
    return best;
  };
  /** Envelope ∩ {ua ≤ u ≤ ub} (optionally narrowed in v). Outer bounds
   *  overshoot the envelope by 1 m so the clip lands on the envelope edge. */
  const slab = (ua: number, ub: number, va = v0 - 1, vb = v1 + 1): Polygon | null => {
    if (ub - ua < MIN_BAND_M) return null;
    const a = ua <= u0 + 1e-6 ? u0 - 1 : ua;
    const b = ub >= u1 - 1e-6 ? u1 + 1 : ub;
    return largest(polygons(intersection(input.envelope, rect(a, b, va, vb))));
  };

  // ── 1. Building: fill from the front until the target footprint ─────────
  const flags: string[] = [];
  const target = Math.max(0, input.targetFootprintSqft);
  const envelopeSqft = trueSqft(input.envelope);
  let d: number;
  if (envelopeSqft <= target + 1) {
    d = D;
    flags.push('footprint_capped_by_envelope');
  } else {
    let lo = 0, hi = D;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (trueSqft(slab(u0, u0 + mid)) < target) lo = mid; else hi = mid;
    }
    d = lo;
  }

  // ── 2. Parking: the remnant behind the building, honestly ───────────────
  const stallD = ftToM(input.parking.stallDepthFt);
  const aisle = ftToM(input.parking.aisleWidthFt);
  const minApron = ftToM(MIN_APRON_FT);
  let giveBackSqft = 0;
  let r = D - d;
  // One working module = a stall row + a rear apron. If the remnant is just
  // short of it, the building gives back a sliver (≤ 5 % of target) rather
  // than leaving stalls with nowhere to back out — a plate with no parking
  // at all is not investable either. Beyond that share, FAR wins.
  if (target > 0 && r < stallD + minApron && d > 0) {
    const need = stallD + minApron - r;
    const dTry = d - need;
    if (dTry > 0) {
      const areaTry = trueSqft(slab(u0, u0 + dTry));
      const loss = target - areaTry;
      if (loss <= target * MAX_GIVE_BACK_SHARE) {
        giveBackSqft = Math.max(0, loss);
        d = dTry;
        r = D - d;
        flags.push('footprint_trimmed_for_parking_module');
      }
    }
  }

  const building = slab(u0, u0 + d) ?? input.envelope;
  const stallRows: Polygon[] = [];
  let drive: Polygon | null = null;
  let landscape: Polygon | null = null;
  let stallsDepth = 0, driveDepth = 0, landscapeDepth = 0;
  const uB = u0 + d; // rear face of the building

  if (r >= 2 * stallD + aisle) {
    // Double-loaded module: row on the building, aisle, row on the rear edge
    // with an entry throat cut through it (the aisle must reach the alley).
    const uA0 = uB + stallD;
    const uA1 = u1 - stallD;
    const front = slab(uB, uA0);
    if (front) stallRows.push(front);
    const vc = (v0 + v1) / 2;
    const throat = aisle;
    const rearL = slab(uA1, u1, v0 - 1, vc - throat / 2);
    const rearR = slab(uA1, u1, vc + throat / 2, v1 + 1);
    for (const piece of [rearL, rearR]) {
      const pr = piece ? ringOf(piece) : null;
      if (pr && canvasStallCells(pr, input.parking.stallWidthFt * 0.3048) >= 1) stallRows.push(piece!);
    }
    const aisleBand = slab(uA0, uA1);
    const throatBand = slab(uA1, u1, vc - throat / 2, vc + throat / 2);
    drive = aisleBand && throatBand ? largest(polygons(union(aisleBand, throatBand))) : (aisleBand ?? throatBand);
    stallsDepth = 2 * stallD;
    driveDepth = r - 2 * stallD;
    flags.push('parking_double_loaded_rear');
  } else if (r >= stallD + minApron) {
    // Single row against the building's rear wall; the rest of the remnant
    // is the aisle / apron along the rear edge (alley side).
    const row = slab(uB, uB + stallD);
    if (row) stallRows.push(row);
    drive = slab(uB + stallD, u1);
    stallsDepth = stallD;
    driveDepth = r - stallD;
    if (driveDepth < aisle - 1e-6) flags.push('parking_apron_below_aisle_standard');
  } else if (r >= minApron) {
    // No stall fits with a way to back out — a rear service drive only.
    drive = slab(uB, u1);
    driveDepth = r;
    flags.push('no_on_site_parking_fits');
  } else if (r >= MIN_BAND_M) {
    landscape = slab(uB, u1);
    landscapeDepth = r;
    flags.push('no_on_site_parking_fits');
  } else {
    flags.push('no_on_site_parking_fits');
  }

  // ── 3. Honest numbers ────────────────────────────────────────────────────
  const footprintSqft = trueSqft(building);
  // The canvas stripes stalls every stallWidthFt in UNCORRECTED canvas
  // metres (its scale bar is in the same frame) — count in that frame so the
  // stall label and KPI equal the cells a reviewer can count on the screen.
  const canvasStallW = input.parking.stallWidthFt * 0.3048;
  const stallsProvided = stallRows.reduce((s, row) => s + canvasStallCells(ringOf(row)!, canvasStallW), 0);
  const stallsRequired = input.sqftPerStall > 0 ? Math.ceil(footprintSqft / input.sqftPerStall) : 0;
  if (stallsRequired > 0 && stallsProvided < stallsRequired) flags.push('parking_below_ratio');
  const imperviousSqft = footprintSqft + stallRows.reduce((s, p) => s + trueSqft(p), 0) + trueSqft(drive);
  if (input.maxImperviousSqft != null && input.maxImperviousSqft > 0 && imperviousSqft > input.maxImperviousSqft + 1) {
    flags.push('impervious_over_cap');
  }
  const lot = input.lotSqft && input.lotSqft > 0 ? input.lotSqft : null;

  return {
    depthAxisRad: Math.atan2(u[1], u[0]),
    building,
    stallRows,
    drive,
    landscape,
    footprintSqft,
    achievedFar: lot ? footprintSqft / lot : null,
    coveragePct: lot ? (footprintSqft / lot) * 100 : null,
    imperviousSqft,
    stallsProvided,
    stallsRequired,
    giveBackSqft,
    depthsFt: {
      building: mToFt(d),
      stalls: mToFt(stallsDepth),
      drive: mToFt(driveDepth),
      landscape: mToFt(landscapeDepth),
      envelope: mToFt(D),
    },
    widthFt: mToFt(W),
    flags,
  };
}
