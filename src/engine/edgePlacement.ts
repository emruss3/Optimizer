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
  buildingType?: BuildingType;
  /** Footprints that new bars must not overlap (e.g. user-pinned buildings) */
  avoidFootprints?: Polygon[];
  /** Id prefix (default 'building') */
  idPrefix?: string;
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

  // Collect edges, longest first — long street frontages fill before jogs.
  const edges: Array<{ a: number[]; b: number[]; len: number }> = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 1e-6) edges.push({ a, b, len });
  }
  edges.sort((e1, e2) => e2.len - e1.len);

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

    // How many full-width slots fit along this edge?
    const usable = edge.len - 2 * margin;
    const slots = Math.floor((usable + gap) / (widthM + gap));
    if (slots <= 0) continue;

    // Center the run of slots on the edge so leftovers split evenly.
    const runLength = slots * widthM + (slots - 1) * gap;
    const start = margin + (usable - runLength) / 2;

    for (let s = 0; s < slots && placed.length < opts.count; s++) {
      const along = start + s * (widthM + gap) + widthM / 2;
      const inset = margin + depthM / 2;
      const anchor = {
        x: edge.a[0] + dx * along + nx * inset,
        y: edge.a[1] + dy * along + ny * inset,
      };

      const spec = createBuildingSpec(
        `${opts.idPrefix ?? 'building'}-${++n}`,
        anchor,
        widthM,
        depthM,
        undefined,
        opts.buildingType ?? 'MF_BAR_V1'
      );
      spec.rotationRad = rotation;

      const footprint = buildBuildingFootprint(spec);
      const inside = footprint.coordinates[0].every(([vx, vy]) =>
        isPointInPolygon([vx, vy], ring)
      );
      if (!inside) continue;
      if (placedFootprints.some(pf => overlapArea(footprint, pf) > 0.5)) continue;

      placed.push(spec);
      placedFootprints.push(footprint);
    }
  }

  return placed;
}
