/**
 * Does the plan's parking have a road? (Eric, 2622 W Heiman, 2026-09-04:
 * "You have a random parking, with no road to get to it.")
 *
 * Read from the rendered elements, in the canvas frame (EPSG:3857 metres):
 * a drive network that reaches the street (or parcel line when no street edge
 * is known), and every parking bay that can travel that network to the curb.
 * Proximity alone is not enough — a bay beside an isolated stub is not served
 * just because a different drive touches the boundary (field audit 32a264a).
 *
 * The battery asserts it; the headline states it. Lengths shown to a reviewer
 * (gapFt) are ground feet via the scene frame — Web Mercator metres are not
 * ground metres (~1.24× at Nashville).
 */
import type { Element } from '../../../engine/types';

export interface MfAccessSummary {
  /** a curb-connected drive network reaches the street / parcel edge */
  curb: boolean;
  /** parking bays on the plan (garage aprons excluded) — striped count */
  bays: number;
  /** bays with a traversable trip to the curb through overlapping drives */
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

/** Distance from a closed drive ring to a street edge (open polyline) or parcel ring. */
function distanceToEdge(drive: number[][], edge: number[][]): number {
  const closed =
    edge.length >= 4 &&
    edge[0]![0] === edge[edge.length - 1]![0] &&
    edge[0]![1] === edge[edge.length - 1]![1];
  if (closed) return ringDistance(drive, edge);
  const pair = nearestPair(drive, edge);
  return pair ? pair.d : Infinity;
}

function driveTouchesEdge(drive: number[][], edge: number[][], tolM: number): boolean {
  return distanceToEdge(drive, edge) <= tolM;
}

/** Union-find components of drives that overlap / touch within tolM. */
function driveComponents(drives: number[][][], tolM: number): number[] {
  const n = drives.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) x = parent[x]!;
    let y = i;
    while (parent[y] !== y) {
      const next = parent[y]!;
      parent[y] = x;
      y = next;
    }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (ringDistance(drives[i]!, drives[j]!) <= tolM) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[b] = a;
      }
    }
  }
  return drives.map((_, i) => find(i));
}

function collectDrives(elements: Element[]): number[][][] {
  return elements.filter(e => e.type === 'circulation').map(ringOf).filter((r): r is number[][] => r != null);
}

function collectBays(elements: Element[]): number[][][] {
  return elements
    .filter(e => (e.type === 'parking' || e.type === 'parking-bay') && !(e.properties as { apron?: boolean } | undefined)?.apron)
    .map(ringOf)
    .filter((r): r is number[][] => r != null);
}

/**
 * Street edge when the frontage layer has one; else the full parcel line.
 * A side lot line alone must not count as curb when a street edge is known
 * (Herman / field audit: nearest boundary can be a non-street line).
 */
function curbEdge(parcelRing: number[][] | null, streetEdge: number[][] | null): number[][] | null {
  if (streetEdge && streetEdge.length >= 2) return streetEdge;
  if (parcelRing && parcelRing.length >= 4) return parcelRing;
  return null;
}

export function mfAccessSummary(
  elements: Element[],
  parcelRing: number[][] | null,
  tolM = 3,
  /** Preferred street / approved-approach edge; falls back to the parcel line. */
  streetEdge: number[][] | null = null,
): MfAccessSummary {
  const drives = collectDrives(elements);
  const bays = collectBays(elements);
  const edge = curbEdge(parcelRing, streetEdge);
  if (!edge || drives.length === 0) {
    return { curb: false, bays: bays.length, served: 0, drives: drives.length };
  }

  const comps = driveComponents(drives, tolM);
  const curbRoots = new Set<number>();
  for (let i = 0; i < drives.length; i++) {
    if (driveTouchesEdge(drives[i]!, edge, tolM)) curbRoots.add(comps[i]!);
  }
  const curb = curbRoots.size > 0;

  const served = bays.filter(b => {
    for (let i = 0; i < drives.length; i++) {
      if (ringDistance(b, drives[i]!) <= tolM && curbRoots.has(comps[i]!)) return true;
    }
    return false;
  }).length;

  return { curb, bays: bays.length, served, drives: drives.length };
}

export type AccessBreak = {
  from: number[];
  to: number[];
  /** Gap length in raw EPSG:3857 canvas metres (not ground metres). */
  gap3857: number;
  /**
   * Same gap in ground feet when a frame is available (Live Design P2:
   * W Heiman ~20.85 ft short of frontage). Null until `distanceFt` is passed
   * so a first paint can't show raw Mercator-as-feet (~26 ft at Nashville).
   */
  gapFt: number | null;
};

/**
 * Partner-sheet / canvas / notes copy for a measured gap: one decimal under
 * 10 ft, otherwise whole feet. Keep every surface on this rule.
 */
export function formatGapFt(gapFt: number): string {
  return gapFt < 10 ? gapFt.toFixed(1) : String(Math.round(gapFt));
}

/**
 * Where the route to the street breaks:
 * 1. No curb-connected drive → end of the drive nearest the street edge.
 * 2. Curb exists but parking sits on an isolated network → gap between that
 *    network and the nearest curb-connected drive (or the street if none).
 *
 * Endpoints mark the drawing; gapFt is what a reviewer reads against the scale.
 */
export function accessBreak(
  elements: Element[],
  parcelRing: number[][] | null,
  /** the street edge of the parcel, when the frontage layer has one; else the parcel line stands in */
  frontageLine: number[][] | null = null,
  tolM = 3,
  distanceFt?: (a: ArrayLike<number>, b: ArrayLike<number>) => number,
): AccessBreak | null {
  const drives = collectDrives(elements);
  const bays = collectBays(elements);
  const edge = curbEdge(parcelRing, frontageLine);
  if (drives.length === 0 || !edge) return null;

  const comps = driveComponents(drives, tolM);
  const curbRoots = new Set<number>();
  for (let i = 0; i < drives.length; i++) {
    if (driveTouchesEdge(drives[i]!, edge, tolM)) curbRoots.add(comps[i]!);
  }

  const toBreak = (pair: { from: number[]; to: number[]; d: number }): AccessBreak => ({
    from: pair.from,
    to: pair.to,
    gap3857: pair.d,
    gapFt: distanceFt ? distanceFt(pair.from, pair.to) : null,
  });

  // Case 1: nothing reaches the street — same as the historical Herman gap.
  if (curbRoots.size === 0) {
    let best: { from: number[]; to: number[]; d: number } | null = null;
    for (const d of drives) {
      const pair = nearestPair(d, edge);
      if (pair && (!best || pair.d < best.d)) best = pair;
    }
    return best ? toBreak(best) : null;
  }

  // Case 2: curb-connected network exists, but some bays only touch isolated drives.
  const strandedDriveIdx: number[] = [];
  for (let i = 0; i < drives.length; i++) {
    if (curbRoots.has(comps[i]!)) continue;
    const touchesBay = bays.some(b => ringDistance(b, drives[i]!) <= tolM);
    if (touchesBay) strandedDriveIdx.push(i);
  }
  if (strandedDriveIdx.length === 0) return null;

  const curbDrives = drives.filter((_, i) => curbRoots.has(comps[i]!));
  let best: { from: number[]; to: number[]; d: number } | null = null;
  for (const i of strandedDriveIdx) {
    const stranded = drives[i]!;
    for (const curb of curbDrives) {
      const pair = nearestPair(stranded, curb);
      if (pair && (!best || pair.d < best.d)) best = pair;
    }
    // Prefer joining to the curb network; if somehow empty, aim at the street.
    if (curbDrives.length === 0) {
      const pair = nearestPair(stranded, edge);
      if (pair && (!best || pair.d < best.d)) best = pair;
    }
  }
  return best && best.d > tolM ? toBreak(best) : null;
}
