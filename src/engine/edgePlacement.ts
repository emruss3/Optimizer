// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * Edge-hugging bar placement — the TestFit-style constructive layout.
 *
 * Instead of centering a grid in the envelope, walk the buildable envelope's
 * edges (longest first) and lay bars flush along them: each bar is parallel
 * to its edge, inset by margin + depth/2, spaced along the edge with a
 * fire-separation gap. Deterministic (no RNG), pure, and unit-testable.
 */
import type { Polygon } from 'geojson';
import type { BuildingSpec, BuildingType } from './model';
import { createBuildingSpec } from './model';
import { buildBuildingFootprint } from './buildingGeometry';
import { areaM2, intersection, isPointInPolygon, polygons } from './geometry';

export interface EdgePlacementOptions {
  widthM: number;
  depthM: number;
  /** Maximum number of bars to place */
  count: number;
  /** Clear distance from the envelope edge to the bar face (default 1m) */
  marginM?: number;
  /** Gap between bars along an edge (default 6m ≈ 20ft separation) */
  gapM?: number;
  /**
   * Minimum bar width (default 24m ≈ 80ft). Bars SIZE THEMSELVES to the
   * frontage: a full-width bar where the edge allows, shorter bars down to
   * this minimum on short/jagged segments — real parcels rarely offer a
   * clean 200ft straightaway.
   */
  minWidthM?: number;
  buildingType?: BuildingType;
  /** Footprints that new bars must not overlap (e.g. user-pinned buildings) */
  avoidFootprints?: Polygon[];
  /** Id prefix (default 'building') */
  idPrefix?: string;
  /** WO-1b: derived street-frontage bearing (compass degrees). When set,
   *  edges sort STREET-EDGE-FIRST — best alignment with the frontage
   *  bearing wins, length breaks ties — replacing longest-edge-first. */
  preferredBearingDeg?: number | null;
}

const overlapArea = (a: Polygon, b: Polygon): number =>
  polygons(intersection(a, b)).reduce((s, p) => s + areaM2(p), 0);

/**
 * Place up to `count` bars flush along the envelope's edges, longest edge
 * first. Returns fewer when the envelope can't legally host more (every
 * placement is fully inside the envelope and overlap-free).
 */
export function placeBarsAlongEdges(envelope: Polygon, opts: EdgePlacementOptions): BuildingSpec[] {
  const ring = envelope?.coordinates?.[0];
  if (!ring || ring.length < 4 || opts.count <= 0) return [];

  const margin = opts.marginM ?? 1;
  const gap = opts.gapM ?? 6;
  const { widthM, depthM } = opts;

  // Winding: interior is to the LEFT of travel for CCW rings.
  let signedArea2 = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    signedArea2 += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  const ccw = signedArea2 >= 0;

  // Collect edges. Default order is longest-first; with a derived frontage
  // bearing the order becomes STREET-EDGE-FIRST: edges most parallel to the
  // street (mod 180°) fill first, so the massing addresses the actual
  // frontage instead of whichever lot line happens to be longest.
  const edges: Array<{ a: number[]; b: number[]; len: number; align: number }> = [];
  const bearing = opts.preferredBearingDeg;
  const bearingRad = bearing != null ? ((90 - bearing) * Math.PI) / 180 : null;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= 1e-6) continue;
    let align = 0;
    if (bearingRad != null) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      // Alignment mod 180°: 1 = parallel to the street, 0 = perpendicular.
      align = Math.abs(Math.cos(ang - bearingRad));
    }
    edges.push({ a, b, len, align });
  }
  if (bearingRad != null) {
    edges.sort((e1, e2) => (e2.align - e1.align) || (e2.len - e1.len));
  } else {
    edges.sort((e1, e2) => e2.len - e1.len);
  }

  const placed: BuildingSpec[] = [];
  const placedFootprints: Polygon[] = [...(opts.avoidFootprints ?? [])];
  let n = 0;

  for (const edge of edges) {
    if (placed.length >= opts.count) break;

    const dx = (edge.b[0] - edge.a[0]) / edge.len;
    const dy = (edge.b[1] - edge.a[1]) / edge.len;
    // Inward normal: left of direction for CCW rings, right for CW.
    const nx = ccw ? -dy : dy;
    const ny = ccw ? dx : -dx;
    const rotation = Math.atan2(dy, dx);

    // Greedy fill along the edge: full-width bars where they fit, then a
    // final shorter bar down to minWidth — so short/jagged frontages still
    // host buildings instead of falling through to the centred fallback.
    const usable = edge.len - 2 * margin;
    const minW = Math.min(opts.minWidthM ?? 24, widthM);
    let along = margin;
    while (usable - (along - margin) >= minW && placed.length < opts.count) {
      const w = Math.min(widthM, edge.len - margin - along);
      const inset = margin + depthM / 2;
      const cx = along + w / 2;
      const anchor = {
        x: edge.a[0] + dx * cx + nx * inset,
        y: edge.a[1] + dy * cx + ny * inset,
      };

      const spec = createBuildingSpec(
        `${opts.idPrefix ?? 'building'}-${++n}`,
        anchor,
        w,
        depthM,
        undefined,
        opts.buildingType ?? 'MF_BAR_V1'
      );
      spec.rotationRad = rotation;

      const footprint = buildBuildingFootprint(spec);
      const inside = footprint.coordinates[0].every(([vx, vy]) =>
        isPointInPolygon([vx, vy], ring)
      );
      const clear = inside && !placedFootprints.some(pf => overlapArea(footprint, pf) > 0.5);
      if (clear) {
        placed.push(spec);
        placedFootprints.push(footprint);
        along += w + gap;
      } else {
        // Slide forward and try a fresh slot further down the edge
        n--;
        along += Math.max(minW / 2, 6);
      }
    }
  }

  return placed;
}
