// The one horizontal basis of the drawing workspace.
//
// Plan elements arrive in EPSG:3857 (Web Mercator). Its metres are not ground
// metres: at Nashville a projected metre is about 0.81 m on the ground. Every
// view that shows a length — the plan's scale bar and callouts, the 3D model,
// a section, a printed sheet — reads positions through this frame, so the
// conversion happens once and the views cannot disagree.
//
// The factors are those of the WGS84 ellipsoid, not the sphere: east-west and
// north-south differ by 0.4% at this latitude, which the engine's own frame
// (EPSG:2274, state plane feet) shows on a 200-ft building.
import { METERS_PER_FOOT } from '../../../engine/units';

const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;

export type Pt = [number, number];
/** A point as it arrives from GeoJSON or from the scene: x and y first. */
export type XY = ArrayLike<number>;
export type Ring = ArrayLike<XY>;

// Index reads are checked once, here. A missing coordinate reads as NaN and
// is dropped by the finite tests below instead of being treated as zero.
const px = (p: XY | undefined): number => p?.[0] ?? NaN;
const py = (p: XY | undefined): number => p?.[1] ?? NaN;

export interface GroundFrame {
  /** The projected system the inputs are in. */
  crs: 'EPSG:3857';
  /** Frame origin in projected metres. */
  origin: Pt;
  latDeg: number;
  lonDeg: number;
  /** Ground metres per projected metre, east-west and north-south. */
  kx: number;
  ky: number;
  /** One factor for a view that can only scale uniformly (the plan canvas):
   *  the geometric mean of the two, within 0.25% of either. */
  groundScale: number;
  /** Degrees from the frame's +y axis to true north, clockwise. 3857 is north-up. */
  northDeg: 0;
  /** Projected point to local ground feet east and north of the origin. */
  toFeet(p: XY): Pt;
  /** Projected point to local ground metres east and north of the origin. */
  toMeters(p: XY): Pt;
  /** Local ground feet back to a projected point: where a view that draws in
   *  the projected system puts something the scene positioned. */
  fromFeet(p: XY): Pt;
  /** Ground distance in feet between two projected points. */
  distanceFt(a: XY, b: XY): number;
}

export function createGroundFrame(originX: number, originY: number): GroundFrame {
  const lat = 2 * Math.atan(Math.exp(originY / WGS84_A)) - Math.PI / 2;
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const w2 = 1 - WGS84_E2 * sin * sin;
  const kx = cos / Math.sqrt(w2);
  const ky = (cos * (1 - WGS84_E2)) / Math.pow(w2, 1.5);
  return {
    crs: 'EPSG:3857',
    origin: [originX, originY],
    latDeg: (lat * 180) / Math.PI,
    lonDeg: ((originX / WGS84_A) * 180) / Math.PI,
    kx,
    ky,
    groundScale: Math.sqrt(kx * ky),
    northDeg: 0,
    toMeters: p => [(px(p) - originX) * kx, (py(p) - originY) * ky],
    toFeet: p => [((px(p) - originX) * kx) / METERS_PER_FOOT, ((py(p) - originY) * ky) / METERS_PER_FOOT],
    fromFeet: p => [originX + (px(p) * METERS_PER_FOOT) / kx, originY + (py(p) * METERS_PER_FOOT) / ky],
    distanceFt: (a, b) => Math.hypot((px(b) - px(a)) * kx, (py(b) - py(a)) * ky) / METERS_PER_FOOT,
  };
}

function bounds(rings: ArrayLike<Ring>): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    if (!ring) continue;
    for (let i = 0; i < ring.length; i++) {
      const x = px(ring[i]), y = py(ring[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** A frame centred on the bounding box of the given projected rings. */
export function frameForRings(rings: ArrayLike<Ring>): GroundFrame | null {
  const b = bounds(rings);
  return b ? createGroundFrame((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2) : null;
}

/** Signed area of a ring in the units of its coordinates squared. */
export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    a += px(p) * py(q) - px(q) * py(p);
  }
  return a / 2;
}

/** Area of a polygon (ring 0 outer, the rest holes). */
export function polygonArea(rings: ArrayLike<Ring>): number {
  const outer = rings[0];
  if (!outer) return 0;
  let a = Math.abs(ringArea(outer));
  for (let i = 1; i < rings.length; i++) {
    const hole = rings[i];
    if (hole) a -= Math.abs(ringArea(hole));
  }
  return Math.max(0, a);
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = px(ring[i]), yi = py(ring[i]), xj = px(ring[j]), yj = py(ring[j]);
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the point is in the polygon and not in one of its holes. */
export function pointInPolygon(x: number, y: number, rings: ArrayLike<Ring>): boolean {
  const outer = rings[0];
  if (!outer || !inRing(x, y, outer)) return false;
  for (let i = 1; i < rings.length; i++) {
    const hole = rings[i];
    if (hole && inRing(x, y, hole)) return false;
  }
  return true;
}

function distToRings(x: number, y: number, rings: ArrayLike<Ring>): number {
  let best = Infinity;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    if (!ring) continue;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = px(ring[j]), ay = py(ring[j]), bx = px(ring[i]), by = py(ring[i]);
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * A point for a label that is inside the polygon and clear of its holes: the
 * interior grid point farthest from any edge. A courtyard building's centroid
 * falls in the court; its tag must not.
 */
export function interiorPoint(rings: ArrayLike<Ring>): Pt | null {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  const b = bounds([outer]);
  if (!b) return null;
  const N = 24;
  let best: Pt | null = null;
  let bestD = -1;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = b.minX + ((b.maxX - b.minX) * (i + 0.5)) / (N + 1);
      const y = b.minY + ((b.maxY - b.minY) * (j + 0.5)) / (N + 1);
      if (!pointInPolygon(x, y, rings)) continue;
      const d = distToRings(x, y, rings);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
  }
  return best;
}
