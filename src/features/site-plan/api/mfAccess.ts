/**
 * Does the plan's parking have a road? (Eric, 2622 W Heiman, 2026-09-04:
 * "You have a random parking, with no road to get to it.")
 *
 * Read from the rendered elements, in the canvas frame (EPSG:3857 metres):
 * a drive that reaches the parcel line (the curb), and a drive touching every
 * parking bay. The battery asserts it; the headline states it.
 */
import type { Element } from '../../../engine/types';

export interface MfAccessSummary {
  /** a drive reaches the parcel line */
  curb: boolean;
  /** parking bays on the plan (garage aprons excluded) */
  bays: number;
  /** bays with a drive within `tolM` of them */
  served: number;
  drives: number;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
  return Math.hypot(px - (ax + t * ex), py - (ay + t * ey));
}

function segmentsCross(a1: number[], a2: number[], b1: number[], b2: number[]): boolean {
  const orient = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Least distance between two ring BOUNDARIES: zero when their edges cross,
 *  else vertices of one to edges of the other, both ways. (A ring wholly
 *  inside another still reads as the gap between the boundaries.) */
export function ringDistance(a: number[][], b: number[][]): number {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsCross(a[i - 1], a[i], b[j - 1], b[j])) return 0;
    }
  }
  let best = Infinity;
  const one = (p: number[][], q: number[][]) => {
    for (const [px, py] of p) {
      for (let i = 1; i < q.length; i++) {
        const d = segDist(px, py, q[i - 1][0], q[i - 1][1], q[i][0], q[i][1]);
        if (d < best) best = d;
      }
    }
  };
  one(a, b);
  one(b, a);
  return best;
}

const ringOf = (el: Element): number[][] | null => {
  const r = el.geometry?.coordinates?.[0] as number[][] | undefined;
  return r && r.length >= 4 ? r : null;
};

export function mfAccessSummary(elements: Element[], parcelRing: number[][] | null, tolM = 3): MfAccessSummary {
  const drives = elements.filter(e => e.type === 'circulation').map(ringOf).filter((r): r is number[][] => r != null);
  const bays = elements
    .filter(e => (e.type === 'parking' || e.type === 'parking-bay') && !(e.properties as { apron?: boolean } | undefined)?.apron)
    .map(ringOf)
    .filter((r): r is number[][] => r != null);
  const curb = !!parcelRing && parcelRing.length >= 4 && drives.some(d => ringDistance(d, parcelRing) <= tolM);
  const served = bays.filter(b => drives.some(d => ringDistance(b, d) <= tolM)).length;
  return { curb, bays: bays.length, served, drives: drives.length };
}

/** Nearest pair of points between two polylines: vertices of each against the segments of the other. */
function nearestPair(a: number[][], b: number[][]): { from: number[]; to: number[]; d: number } | null {
  let best: { from: number[]; to: number[]; d: number } | null = null;
  const one = (p: number[][], q: number[][], flip: boolean) => {
    for (const pt of p) {
      const px = pt[0] ?? 0;
      const py = pt[1] ?? 0;
      for (let i = 1; i < q.length; i++) {
        const ax = q[i - 1]?.[0] ?? 0;
        const ay = q[i - 1]?.[1] ?? 0;
        const ex = (q[i]?.[0] ?? 0) - ax;
        const ey = (q[i]?.[1] ?? 0) - ay;
        const len2 = ex * ex + ey * ey;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
        const on = [ax + t * ex, ay + t * ey];
        const d = Math.hypot(px - on[0]!, py - on[1]!);
        if (!best || d < best.d) best = flip ? { from: on, to: [px, py], d } : { from: [px, py], to: on, d };
      }
    }
  };
  one(a, b, false);
  one(b, a, true);
  return best;
}

/** Metres (EPSG:3857 canvas) → feet for partner-sheet and inspector copy. */
const M_TO_FT = 1 / 0.3048;

export type AccessBreak = {
  from: number[];
  to: number[];
  /** Gap length in canvas metres. */
  gapM: number;
  /** Same gap in feet (Live Design P2: W Heiman ~21 ft short of frontage). */
  gapFt: number;
};

/**
 * Where the route to the street breaks, when no drive reaches the parcel line:
 * the end of the drive nearest the street, the point on the street edge it
 * would have to reach, and the measured gap. Endpoints mark the drawing;
 * gapFt is what a reviewer reads against the graphic scale.
 */
export function accessBreak(
  elements: Element[],
  parcelRing: number[][] | null,
  /** the street edge of the parcel, when the frontage layer has one; else the parcel line stands in */
  frontageLine: number[][] | null = null,
  tolM = 3,
): AccessBreak | null {
  const drives = elements.filter(e => e.type === 'circulation').map(ringOf).filter((r): r is number[][] => r != null);
  if (drives.length === 0 || !parcelRing || parcelRing.length < 4) return null;
  if (drives.some(d => ringDistance(d, parcelRing) <= tolM)) return null;
  const edge = frontageLine && frontageLine.length >= 2 ? frontageLine : parcelRing;
  let best: { from: number[]; to: number[]; d: number } | null = null;
  for (const d of drives) {
    const pair = nearestPair(d, edge);
    if (pair && (!best || pair.d < best.d)) best = pair;
  }
  if (!best) return null;
  return { from: best.from, to: best.to, gapM: best.d, gapFt: best.d * M_TO_FT };
}
