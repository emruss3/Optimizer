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
