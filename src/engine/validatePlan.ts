/**
 * Post-solve geometry validation — the zero-overlap invariant.
 *
 * Every plan that reaches the screen must pass this gate, regardless of which
 * path produced it (server generator, worker fallback, degraded defaults).
 * The failure states that shipped overlapping garbage all bypassed rendering
 * checks; this module makes "broken geometry rendered" structurally
 * impossible: callers reject and re-solve instead of rendering.
 *
 * All coordinates are world-space metres (EPSG:3857 planar) — the same frame
 * the canvas draws. This validates the scene; it never re-measures the design
 * (backend feet remain the source of truth for all displayed numbers).
 */
import polyclip from 'polygon-clipping';
import type { Element } from './types';

/** Element types that participate in the overlap invariant. Greenspace is
 *  excluded by design: courts sitting under decorative rings are benign. */
export const OVERLAP_TYPES: ReadonlyArray<string> = [
  'building',
  'parking',
  'parking-bay',
  'parking-aisle',
  'circulation',
];

/** Overlaps at or below this area are touching edges / float noise, not bugs. */
export const OVERLAP_TOLERANCE_M2 = 1;

export interface PlanOverlap {
  aId: string;
  aType: string;
  bId: string;
  bType: string;
  areaM2: number;
}

export interface PlanValidation {
  ok: boolean;
  overlaps: PlanOverlap[];
  /** Short human reason ("parking overlaps building"), worst overlap first */
  reason: string | null;
}

type Ring = [number, number][];

function ringArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

function multiPolyArea(mp: Ring[][][] | Ring[][]): number {
  let area = 0;
  for (const poly of mp as Ring[][]) {
    const rings = poly as unknown as Ring[];
    if (!rings.length) continue;
    area += ringArea(rings[0]);
    for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
  }
  return area;
}

function elementRings(el: Element): Ring[] | null {
  const coords = el.geometry?.coordinates as Ring[] | undefined;
  if (!coords || !coords[0] || coords[0].length < 4) return null;
  return coords;
}

function bbox(rings: Ring[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rings[0]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function bboxesDisjoint(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];
}

const typeLabel = (t: string): string =>
  t === 'building' ? 'building'
  : t === 'circulation' ? 'drive'
  : t.startsWith('parking') ? 'parking'
  : t;

/**
 * Pairwise intersection across the overlap-relevant element types.
 * Any pair intersecting by more than OVERLAP_TOLERANCE_M2 fails the plan.
 */
export function validatePlanElements(elements: Element[]): PlanValidation {
  const subjects = elements
    .filter(e => OVERLAP_TYPES.includes(e.type))
    .map(e => ({ el: e, rings: elementRings(e) }))
    .filter((s): s is { el: Element; rings: Ring[] } => s.rings != null)
    .map(s => ({ ...s, box: bbox(s.rings) }));

  const overlaps: PlanOverlap[] = [];
  for (let i = 0; i < subjects.length; i++) {
    for (let j = i + 1; j < subjects.length; j++) {
      const a = subjects[i];
      const b = subjects[j];
      // A drive aisle legitimately meets parking bays edge-to-edge; the area
      // threshold below is what separates adjacency from overlap.
      if (bboxesDisjoint(a.box, b.box)) continue;
      let areaM2 = 0;
      try {
        const inter = polyclip.intersection(
          [a.rings] as never,
          [b.rings] as never
        );
        areaM2 = multiPolyArea(inter as unknown as Ring[][]);
      } catch {
        // polygon-clipping throws on degenerate rings; degenerate inputs are
        // themselves a broken plan — treat as an overlap so the plan re-solves.
        areaM2 = OVERLAP_TOLERANCE_M2 + 1;
      }
      if (areaM2 > OVERLAP_TOLERANCE_M2) {
        overlaps.push({
          aId: a.el.id,
          aType: a.el.type,
          bId: b.el.id,
          bType: b.el.type,
          areaM2: Math.round(areaM2 * 10) / 10,
        });
      }
    }
  }

  overlaps.sort((x, y) => y.areaM2 - x.areaM2);
  return {
    ok: overlaps.length === 0,
    overlaps,
    reason: overlaps.length
      ? `${typeLabel(overlaps[0].aType)} overlaps ${typeLabel(overlaps[0].bType)} (${Math.round(overlaps[0].areaM2)} m²)`
      : null,
  };
}

type PolyLike = { type: 'Polygon'; coordinates: number[][][] };

function polyAreaM2(p: PolyLike): number {
  const rings = p.coordinates as unknown as Ring[];
  if (!rings?.length) return 0;
  let a = ringArea(rings[0]);
  for (let i = 1; i < rings.length; i++) a -= ringArea(rings[i]);
  return a;
}

/**
 * Repair step for solver output: subtract obstacle footprints from a set of
 * polygons (parking bays/aisles/circulation vs buildings), splitting into
 * parts and dropping slivers below `minPartM2`. This is the "re-solve" for
 * packer leaks: geometry becomes valid by construction instead of shipping an
 * overlap to the screen.
 */
/** Dedupe consecutive (near-)identical vertices — the classic cause of
 *  polygon-clipping "degenerate segment" throws — and re-close the ring. */
function cleanCoordinates(coords: number[][][]): number[][][] {
  return coords
    .map(ring => {
      const out: number[][] = [];
      for (const pt of ring) {
        const prev = out[out.length - 1];
        if (!prev || Math.abs(prev[0] - pt[0]) > 1e-9 || Math.abs(prev[1] - pt[1]) > 1e-9) {
          out.push([pt[0], pt[1]]);
        }
      }
      if (out.length >= 3) {
        const [fx, fy] = out[0];
        const [lx, ly] = out[out.length - 1];
        if (Math.abs(fx - lx) > 1e-9 || Math.abs(fy - ly) > 1e-9) out.push([fx, fy]);
        else { out[out.length - 1] = [fx, fy]; }
      }
      return out;
    })
    .filter(r => r.length >= 4);
}

export function clipPolysToObstacles<T extends PolyLike>(
  polys: T[],
  obstacles: PolyLike[],
  minPartM2: number
): T[] {
  if (!obstacles.length) return polys;
  const out: T[] = [];
  for (const poly of polys) {
    let pieces: number[][][][] | null = null;
    const attempt = (subject: number[][][], obs: PolyLike[]): number[][][][] => {
      let acc = [subject] as never;
      for (const ob of obs) {
        acc = polyclip.difference(acc, [ob.coordinates] as never) as never;
      }
      return acc as unknown as number[][][][];
    };
    try {
      pieces = attempt(poly.coordinates, obstacles);
    } catch {
      // Degenerate boolean op — retry with cleaned rings (deduped vertices),
      // and if the geometry still won't difference, DROP the polygon: a
      // missing bay under-reports paving honestly, while keeping the overlap
      // guarantees the whole plan is rejected by the gate.
      try {
        pieces = attempt(
          cleanCoordinates(poly.coordinates),
          obstacles.map(o => ({ ...o, coordinates: cleanCoordinates(o.coordinates) }))
        );
      } catch {
        pieces = null;
      }
    }
    if (pieces === null) continue;
    for (const piece of pieces) {
      const candidate = { ...poly, coordinates: piece } as T;
      if (polyAreaM2(candidate as unknown as PolyLike) >= minPartM2) {
        out.push(candidate);
      }
    }
  }
  return out;
}

/**
 * Merge a set of polygons into disjoint network pieces (drive junctions:
 * a connector tees into the main drive BY CONSTRUCTION — one merged network
 * is the honest geometry, not two overlapping rectangles).
 */
export function unionPolys<T extends PolyLike>(polys: T[]): T[] {
  if (polys.length < 2) return polys;
  try {
    let acc = [polys[0].coordinates] as never;
    for (let i = 1; i < polys.length; i++) {
      acc = polyclip.union(acc, [polys[i].coordinates] as never) as never;
    }
    const pieces = acc as unknown as number[][][][];
    return pieces.map(piece => ({ ...polys[0], coordinates: piece } as T));
  } catch {
    return polys;
  }
}

/** Rail-facing rejection chip text: "overlap (building×parking)". */
export function rejectionChip(v: PlanValidation): string {
  if (v.ok || !v.overlaps.length) return 'overlap';
  const o = v.overlaps[0];
  return `overlap (${typeLabel(o.aType)}×${typeLabel(o.bType)})`;
}
