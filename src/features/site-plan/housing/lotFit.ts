/**
 * Fit a stock house footprint inside a drawn lot, in ground feet.
 *
 * The 2026-11-26 audit found the stock picker offering zero plans on every
 * tested lot: lot rings arrived in EPSG:3857 metres and were read as feet,
 * and the fit boxed each lot in an axis-aligned rectangle, which on a turned
 * lot is larger than the lot. This module works on the true polygon:
 *
 *   1. The lot ring is converted once to local ground feet (createGroundFrame).
 *   2. The front edge is the lot edge the lot's own driveway meets, or failing
 *      that, the edge a street or lane meets. With neither, the lot is not
 *      fitted: an unresolved front cannot be guessed.
 *   3. Every lot edge is classed front, rear or side by its direction relative
 *      to the front, and the footprint must keep that setback from it.
 *   4. The footprint is tried with its porch face along the front and, where
 *      the design allows, turned 90°, slid across the lot in 1 ft steps from
 *      the front setback back. The first position that is inside the lot,
 *      keeps every setback and stays off the driveway wins.
 *
 * Pie lots and outlines of more than four edges are still refused with the
 * reason stated: their front needs resolving from the actual frontage first.
 */
import type { Element } from '../../../engine/types';
import { createGroundFrame, type GroundFrame } from '../scene/frame';
import type { DesignFitResult, HousingDesignRecord, HousingPlacement } from './types';

export type Pt = [number, number];
export interface Setbacks { front: number; side: number; rear: number }

export interface LotGeometry {
  lotId: string;
  /** Lot ring in ground feet, open (no repeated last point), counter-clockwise. */
  ringFt: Pt[];
  /** Index into ringFt of the front edge (ringFt[i] → ringFt[i+1]), or null when unresolved. */
  frontEdge: number | null;
  frontSource: 'driveway' | 'street' | null;
  setbacks: Setbacks;
  lotKind: string | null;
  /** Driveway pieces on this lot, ground feet: the house must stay off them. */
  drivesFt: Pt[][];
  frame: GroundFrame;
}

export interface LotFitResult extends DesignFitResult {
  /** Placed heated footprint, ground feet, closed ring. */
  footprintFt?: Pt[];
  /** Same footprint in the sheet's EPSG:3857 coordinates, closed ring. */
  footprint3857?: Pt[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const len = (a: Pt) => Math.hypot(a[0], a[1]);

function openRing(ring: Pt[]): Pt[] {
  if (ring.length > 1) {
    const f = ring[0]!, l = ring[ring.length - 1]!;
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) return ring.slice(0, -1);
  }
  return ring;
}

function signedArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) a += cross(ring[i]!, ring[(i + 1) % ring.length]!);
  return a / 2;
}

function ccw(ring: Pt[]): Pt[] {
  return signedArea(ring) < 0 ? [...ring].reverse() : ring;
}

/** Drop vertices that sit on a straight run (within 0.5 ft) or repeat: they are not edges. */
function dropCollinear(ring: Pt[]): Pt[] {
  let pts = ring;
  for (let pass = 0; pass < 3; pass++) {
    const out = pts.filter((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length]!, b = pts[(i + 1) % pts.length]!;
      return len(sub(p, a)) > 0.5 && pointSegDist(p, a, b) > 0.5;
    });
    if (out.length === pts.length || out.length < 3) break;
    pts = out;
  }
  return pts;
}

export function pointInPolygon(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
  return len(sub(p, add(a, mul(ab, t))));
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segsCross(a, b, c, d)) return 0;
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

function polyPolyDist(p: Pt[], q: Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      m = Math.min(m, segSegDist(p[i]!, p[(i + 1) % p.length]!, q[j]!, q[(j + 1) % q.length]!));
      if (m === 0) return 0;
    }
  }
  return m;
}

function polysOverlap(p: Pt[], q: Pt[]): boolean {
  if (polyPolyDist(p, q) > 1e-6) return p.some(v => pointInPolygon(v, q)) || q.some(v => pointInPolygon(v, p));
  // touching or crossing: crossing edges overlap; a shared boundary alone does not
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      if (segsCross(p[i]!, p[(i + 1) % p.length]!, q[j]!, q[(j + 1) % q.length]!)) return true;
    }
  }
  const cp = mul(p.reduce((s, v) => add(s, v), [0, 0] as Pt), 1 / p.length);
  return pointInPolygon(cp, q);
}

const ringOf = (el: Element): Pt[] | null => {
  const g = el.geometry as { type?: string; coordinates?: unknown } | undefined;
  const c = g?.coordinates as unknown;
  const ring = g?.type === 'MultiPolygon' ? (c as number[][][][])?.[0]?.[0] : (c as number[][][])?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  return ring.map(p => [Number(p[0]), Number(p[1])] as Pt);
};

/** Edge of `ring` nearest to `target` (both ground feet), with that distance. */
function nearestEdge(ring: Pt[], target: Pt[]): { index: number; dist: number } {
  let best = { index: -1, dist: Infinity };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    let d = Infinity;
    for (let j = 0; j < target.length; j++) d = Math.min(d, segSegDist(a, b, target[j]!, target[(j + 1) % target.length]!));
    // prefer the longer edge on a tie (a driveway touching a corner meets two edges)
    if (d < best.dist - 0.5 || (Math.abs(d - best.dist) <= 0.5 && len(sub(b, a)) > len(sub(ring[(best.index + 1) % ring.length]!, ring[best.index]!)))) {
      best = { index: i, dist: d };
    }
  }
  return best;
}

const FRONT_TOUCH_FT = 3;

const isStreetLike = (e: Element) =>
  /(^|[-:])(street|row|lane|alley)-\d+$/.test(e.id) || (e.type === 'circulation' && e.properties?.kind !== 'driveway');

/**
 * Build the ground-feet geometry of one lot, with its front edge taken from
 * its driveway (or a street) and its setbacks from the lot's own engine
 * values when present, else the fallback.
 */
export function lotGeometry(lot: Element, elements: Element[], fallback: Setbacks): LotGeometry | null {
  const raw = ringOf(lot);
  if (!raw) return null;
  const frame = createGroundFrame(raw[0]![0], raw[0]![1]);
  const toFt = (r: Pt[]) => ccw(openRing(r.map(p => frame.toFeet(p) as Pt)));
  const ringFt = dropCollinear(toFt(raw));
  if (ringFt.length < 3) return null;

  const drives: Pt[][] = [];
  for (const e of elements) {
    if (e.properties?.kind !== 'driveway') continue;
    const r = ringOf(e);
    if (!r) continue;
    const ft = toFt(r);
    if (polyPolyDist(ringFt, ft) <= FRONT_TOUCH_FT || polysOverlap(ringFt, ft)) drives.push(ft);
  }
  let frontEdge: number | null = null;
  let frontSource: LotGeometry['frontSource'] = null;
  for (const d of drives) {
    const n = nearestEdge(ringFt, d);
    if (n.index >= 0 && n.dist <= FRONT_TOUCH_FT && frontEdge == null) { frontEdge = n.index; frontSource = 'driveway'; }
  }
  if (frontEdge == null) {
    let best: { index: number; dist: number } | null = null;
    for (const e of elements) {
      if (!isStreetLike(e)) continue;
      const r = ringOf(e);
      if (!r) continue;
      const n = nearestEdge(ringFt, toFt(r));
      if (n.index >= 0 && n.dist <= FRONT_TOUCH_FT && (!best || n.dist < best.dist)) best = n;
    }
    if (best) { frontEdge = best.index; frontSource = 'street'; }
  }

  const sb = lot.properties?.homeSetbacksFt as Record<string, unknown> | undefined;
  const own = sb && ['front', 'side', 'rear'].every(k => Number.isFinite(Number(sb[k])) && Number(sb[k]) >= 0)
    ? { front: Number(sb.front), side: Number(sb.side), rear: Number(sb.rear) }
    : null;

  return {
    lotId: lot.id,
    ringFt,
    frontEdge,
    frontSource,
    setbacks: own ?? fallback,
    lotKind: typeof lot.properties?.lotKind === 'string' ? lot.properties.lotKind : null,
    drivesFt: drives,
    frame,
  };
}

/** Fit one stock design inside one lot. Never invents a front, a garage or a smaller house. */
export function fitStockDesignInLot(design: HousingDesignRecord, lot: LotGeometry, lotIndex: number): LotFitResult {
  const W = design.footprint.widthFt, D = design.footprint.depthFt;
  if (!(W > 0) || !(D > 0)) return { placement: null, status: 'unplaced', reason: 'design footprint not stated' };
  if (lot.lotKind === 'pie') {
    return { placement: null, status: 'unplaced', reason: 'pie lot: frontage edge unresolved — cannot place a rectangular house honestly' };
  }
  if (lot.ringFt.length > 4) {
    return { placement: null, status: 'unplaced', reason: `irregular lot outline (${lot.ringFt.length} edges): resolve frontage edges before placing` };
  }
  if (lot.frontEdge == null) {
    return { placement: null, status: 'unplaced', reason: 'frontage unresolved: no driveway or street meets this lot' };
  }

  const ring = lot.ringFt;
  const fa = ring[lot.frontEdge]!, fb = ring[(lot.frontEdge + 1) % ring.length]!;
  const u = mul(sub(fb, fa), 1 / len(sub(fb, fa)));
  // counter-clockwise ring: the interior is to the left of each edge
  const n: Pt = [-u[1], u[0]];
  const edgeSetback = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const e = sub(b, a);
    const out: Pt = mul([e[1], -e[0]], 1 / len(e)); // outward normal
    const c = dot(out, n);
    return c < -0.7 ? lot.setbacks.front : c > 0.7 ? lot.setbacks.rear : lot.setbacks.side;
  });
  const sMin = Math.min(...ring.map(p => dot(sub(p, fa), u)));
  const sMax = Math.max(...ring.map(p => dot(sub(p, fa), u)));
  const tMax = Math.max(...ring.map(p => dot(sub(p, fa), n)));
  const frontMid = dot(sub(fb, fa), u) / 2;

  const porchAlong = design.porchFace === 'width' ? W : D;
  const porchBack = design.porchFace === 'width' ? D : W;
  const orientations: Array<{ along: number; back: number; turned: boolean }> = [{ along: porchAlong, back: porchBack, turned: false }];
  if (porchAlong !== porchBack) orientations.push({ along: porchBack, back: porchAlong, turned: true });

  const rectAt = (s: number, t: number, along: number, back: number): Pt[] => {
    const o = add(add(fa, mul(u, s)), mul(n, t));
    return [o, add(o, mul(u, along)), add(add(o, mul(u, along)), mul(n, back)), add(o, mul(n, back))];
  };
  const fits = (rect: Pt[]): boolean => {
    if (!rect.every(p => pointInPolygon(p, ring))) return false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      for (let k = 0; k < 4; k++) {
        if (segSegDist(rect[k]!, rect[(k + 1) % 4]!, a, b) < edgeSetback[i]! - 1e-6) return false;
      }
    }
    return lot.drivesFt.every(d => !polysOverlap(rect, d));
  };

  for (const o of orientations) {
    for (let t = lot.setbacks.front; t + o.back <= tMax + 1e-6; t += 1) {
      // centred on the front edge first, then outward in 1 ft steps either side
      const centre = frontMid - o.along / 2;
      const span = Math.ceil(Math.max(centre - sMin, sMax - o.along - centre)) + 1;
      for (let k = 0; k <= 2 * span; k++) {
        const s = centre + (k % 2 === 0 ? k / 2 : -(k + 1) / 2);
        if (s < sMin - 1e-6 || s + o.along > sMax + 1e-6) continue;
        const rect = rectAt(s, t, o.along, o.back);
        if (!fits(rect)) continue;
        const rotationDeg = (Math.atan2(u[1], u[0]) * 180) / Math.PI + (o.turned ? 90 : 0);
        const entry = add(add(add(fa, mul(u, s)), mul(n, t)), mul(u, Math.min(design.entry.alongFt, o.along)));
        const placement: HousingPlacement = {
          designId: design.id,
          assetVersion: design.assetVersion,
          elevation: design.elevations[0] ?? 'front',
          mirror: 'none',
          rotationDeg: r2(rotationDeg),
          originFt: [r2(rect[0]![0]), r2(rect[0]![1])],
          entryAnchorFt: [r2(entry[0]), r2(entry[1])],
          vehicleAnchorFt: null,
          parking: design.parking,
          status: 'placed',
          reason: `fits inside the lot ${r2(t)} ft back from the ${lot.frontSource === 'driveway' ? 'driveway' : 'street'} front, keeping ${lot.setbacks.front}/${lot.setbacks.side}/${lot.setbacks.rear} ft front/side/rear setbacks${o.turned ? ', turned 90°' : ''}`,
          lotIndex,
        };
        const closed = [...rect, rect[0]!];
        return {
          placement,
          status: 'placed',
          reason: placement.reason,
          footprintFt: closed,
          footprint3857: closed.map(p => lot.frame.fromFeet(p) as Pt),
        };
      }
    }
  }
  const depthAvail = r2(tMax - lot.setbacks.front - lot.setbacks.rear);
  const widthAvail = r2(sMax - sMin - 2 * lot.setbacks.side);
  return {
    placement: null,
    status: 'unplaced',
    reason: `footprint ${r2(W)}×${r2(D)} ft does not fit inside the lot with its setbacks (about ${widthAvail} ft wide × ${depthAvail} ft deep to build on${lot.drivesFt.length ? ', clear of the driveway' : ''})`,
  };
}
