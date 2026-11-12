// The shapes a rendered building is made of, and the shadow one casts on flat
// ground. The buildings themselves are put together in architecture.ts.

export type RGBA = [number, number, number, number];

/** What a surface is made of, for a renderer that draws materials. */
export type Surface =
  | 'siding'     // horizontal lap boards
  | 'batten'     // vertical board and batten
  | 'brick'
  | 'shingle'    // roof shingles, and shingled walls
  | 'metal'      // standing-seam metal roofing
  | 'wood'       // cedar and other boarding
  | 'plaster'    // stucco
  | 'panel'      // fibre-cement panels with joints
  | 'concrete'
  | 'asphalt'
  | 'grass'
  | 'railing'    // a balustrade of thin bars: see-through between them
  | 'glassrail'  // a glass balustrade
  | 'water'
  | 'plain';

export interface RenderSlab {
  /** The plan element's id. */
  id: string;
  building: true;
  /** Rings of [x, y, z] in local metres; z is the base of the slab. */
  polygon: number[][][];
  /** Height of the slab above its base, metres. */
  elevation: number;
  color: RGBA;
  /** What it is made of. Without one, a renderer treats it as plain. */
  surface?: Surface;
  part: 'base' | 'body' | 'parapet' | 'detail';
  label: string;
}

export interface RenderWindow {
  id: string;
  /** One flat polygon in space, [x, y, z] in local metres. */
  polygon: number[][];
  color: RGBA;
  /** What it is made of. Without one, a renderer treats it as plain. */
  surface?: Surface;
}

/** No more parts than four times this in one model: bays widen, and then openings are drawn plainly, to stay under it. */
export const MAX_WINDOWS = 9000;

/** Convex hull of points (Andrew's monotone chain), counter-clockwise. */
export function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Array<[number, number]>) => {
    const h: Array<[number, number]> = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2] as [number, number], h[h.length - 1] as [number, number], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half(pts.reverse())];
}

/**
 * The shadow a building casts on flat ground, as one polygon: its footprint
 * and the footprint moved down-sun by its height over the tangent of the
 * sun's altitude, and what lies between. Exact for a convex footprint; a
 * re-entrant one (an L, a court) is filled across. `sunDirection` points from
 * the sun to the ground (x east, y north, z up).
 */
export function groundShadow(ring: number[][], heightM: number, sunDirection: [number, number, number]): number[][] | null {
  const [dx, dy, dz] = sunDirection;
  if (dz >= -0.05 || heightM <= 0) return null;
  const reach = Math.min(heightM / -dz, heightM * 6);
  const ox = dx * reach, oy = dy * reach;
  const pts: Array<[number, number]> = [];
  for (const p of ring) {
    const x = p[0] ?? 0, y = p[1] ?? 0;
    pts.push([x, y], [x + ox, y + oy]);
  }
  const hull = convexHull(pts);
  return hull.length >= 3 ? hull.map(([x, y]) => [x, y, 0.22]) : null;
}

/**
 * The compass direction to look from for an aerial view, as an angle in
 * degrees clockwise from south: of the four diagonals, the one with the least
 * existing building standing between the camera and the site. `blocks` are
 * the neighbours as [x, y, height] in the model's metres, `extent` its size.
 */
export function clearestAzimuth(blocks: Array<[number, number, number]>, extent: number): number {
  const options = [-38, 52, 142, 232];
  let best = options[0] as number, bestScore = Infinity;
  for (const az of options) {
    const a = (az * Math.PI) / 180;
    // the camera stands toward (sin a, -cos a) from the middle: x east, y north
    const cx = Math.sin(a), cy = -Math.cos(a);
    let score = 0;
    for (const [x, y, h] of blocks) {
      const d = Math.hypot(x, y);
      if (d < extent * 0.25 || d > extent * 1.6) continue;
      const along = (x * cx + y * cy) / d;
      if (along > 0.55) score += h * along * (1.6 - d / extent);
    }
    if (score < bestScore - 1e-9) { bestScore = score; best = az; }
  }
  return best;
}
