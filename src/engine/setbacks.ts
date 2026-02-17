/**
 * Setback Edge Classification & Variable Setback Application
 *
 * Real zoning codes have different setbacks for front, side, and rear edges.
 * The front edge faces the street. This module:
 *   1. Classifies each parcel edge as FRONT / SIDE / REAR based on proximity to roads
 *   2. Applies per-edge inward offsets to produce a buildable envelope
 *
 * All coordinates are EPSG:3857 (metres).
 */

import type { Polygon, LineString } from 'geojson';
import { intersection, polygons, areaM2 } from './geometry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EdgeType = 'front' | 'side' | 'rear';

export interface EdgeClassification {
  /** The two endpoints of the edge [[x1,y1],[x2,y2]] */
  edge: [number, number][];
  /** Classification of this edge */
  type: EdgeType;
  /** Name of the nearest road (only for front edges) */
  roadName?: string;
  /** Distance in metres from edge midpoint to the nearest road */
  distanceToRoad: number;
  /** Length of this edge in metres */
  length: number;
  /** Index of this edge in the original polygon ring */
  index: number;
}

export interface SetbackValues {
  /** Front setback in metres */
  front: number;
  /** Side setback in metres */
  side: number;
  /** Rear setback in metres */
  rear: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Euclidean distance between two 2-D points */
function dist(a: number[], b: number[]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Midpoint of a segment */
function midpoint(a: number[], b: number[]): number[] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Minimum distance from a point to a LineString (set of segments).
 * Returns { distance, name } where name comes from properties if available.
 */
function pointToLineStringDist(
  pt: number[],
  lineCoords: number[][]
): number {
  let minD = Infinity;
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const d = pointToSegmentDist(pt, lineCoords[i], lineCoords[i + 1]);
    if (d < minD) minD = d;
  }
  return minD;
}

/** Perpendicular (or endpoint) distance from point P to segment AB */
function pointToSegmentDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return dist(p, a);

  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const proj = [a[0] + t * dx, a[1] + t * dy];
  return dist(p, proj);
}

/**
 * Determine the edge index that is most "opposite" to the front edge.
 *
 * Strategy: pick the edge whose midpoint is farthest from the front edge midpoint
 * AND whose normal points roughly opposite to the front edge normal.
 */
function findOppositeEdgeIndex(
  edges: { mid: number[]; nx: number; ny: number }[],
  frontIdx: number
): number {
  const front = edges[frontIdx];
  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < edges.length; i++) {
    if (i === frontIdx) continue;
    // Dot product of normals – opposite normals → dot ≈ -1
    const dot = front.nx * edges[i].nx + front.ny * edges[i].ny;
    // Distance between midpoints
    const d = dist(front.mid, edges[i].mid);
    // Score: prefer far away AND opposite-facing
    const score = d - dot * 1000; // heavily weight opposite-normal direction
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// 1. classifyParcelEdges
// ---------------------------------------------------------------------------

/**
 * Classify each edge of a parcel polygon as FRONT, SIDE, or REAR.
 *
 * @param parcelGeom  Polygon in EPSG:3857
 * @param roadGeoms   Array of { geom: LineString (3857), name?: string }
 * @returns  One EdgeClassification per edge (excluding the closing segment)
 */
export function classifyParcelEdges(
  parcelGeom: Polygon,
  roadGeoms: { geom: LineString; name?: string }[]
): EdgeClassification[] {
  const ring = parcelGeom.coordinates[0];
  if (!ring || ring.length < 4) return [];

  // Strip closing vertex
  const verts = ring.slice(0, -1);
  const n = verts.length;

  // Pre-compute edge metadata
  const edgeMeta: {
    mid: number[];
    nx: number;
    ny: number;
    length: number;
    a: number[];
    b: number[];
  }[] = [];

  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const mid = midpoint(a, b);
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.sqrt(ex * ex + ey * ey);
    // Outward normal (assuming CCW winding; will still work for classification)
    const nx = len > 1e-12 ? ey / len : 0;
    const ny = len > 1e-12 ? -ex / len : 0;
    edgeMeta.push({ mid, nx, ny, length: len, a, b });
  }

  // For each edge, compute distance to nearest road
  const ROAD_PROXIMITY_THRESHOLD = 60.96; // 200 ft in metres

  interface RoadHit {
    distance: number;
    name?: string;
  }

  const edgeRoadHits: (RoadHit | null)[] = edgeMeta.map((e) => {
    if (roadGeoms.length === 0) return null;

    let bestDist = Infinity;
    let bestName: string | undefined;

    for (const road of roadGeoms) {
      const coords = road.geom.coordinates;
      if (!coords || coords.length < 2) continue;
      const d = pointToLineStringDist(e.mid, coords);
      if (d < bestDist) {
        bestDist = d;
        bestName = road.name;
      }
    }

    return bestDist <= ROAD_PROXIMITY_THRESHOLD
      ? { distance: bestDist, name: bestName }
      : null;
  });

  // Determine FRONT edge
  let frontIdx = -1;

  // Find the edge closest to any road
  let minRoadDist = Infinity;
  for (let i = 0; i < n; i++) {
    const hit = edgeRoadHits[i];
    if (hit && hit.distance < minRoadDist) {
      minRoadDist = hit.distance;
      frontIdx = i;
    }
  }

  // Fallback: if no roads within threshold, use the longest edge as FRONT
  if (frontIdx === -1) {
    let maxLen = -1;
    for (let i = 0; i < n; i++) {
      if (edgeMeta[i].length > maxLen) {
        maxLen = edgeMeta[i].length;
        frontIdx = i;
      }
    }
  }

  // Determine REAR edge (opposite to front)
  const rearIdx = findOppositeEdgeIndex(edgeMeta, frontIdx);

  // Build classifications
  const classifications: EdgeClassification[] = [];
  for (let i = 0; i < n; i++) {
    const e = edgeMeta[i];
    const hit = edgeRoadHits[i];

    let edgeType: EdgeType;
    if (i === frontIdx) {
      edgeType = 'front';
    } else if (i === rearIdx) {
      edgeType = 'rear';
    } else {
      edgeType = 'side';
    }

    classifications.push({
      edge: [e.a as [number, number], e.b as [number, number]],
      type: edgeType,
      roadName: i === frontIdx ? (hit?.name ?? undefined) : undefined,
      distanceToRoad: hit?.distance ?? Infinity,
      length: e.length,
      index: i,
    });
  }

  return classifications;
}

// ---------------------------------------------------------------------------
// 2. applyVariableSetbacks
// ---------------------------------------------------------------------------

/**
 * Apply per-edge setback distances to produce a buildable envelope.
 *
 * For each edge, shift it inward by the appropriate setback.
 * Then intersect all inward half-planes to get the buildable area.
 *
 * @param parcelGeom  Polygon in EPSG:3857
 * @param edges       Edge classifications (from classifyParcelEdges)
 * @param setbacks    { front, side, rear } in metres (positive = inward)
 * @returns  The buildable polygon, or null if setbacks collapse the polygon
 */
export function applyVariableSetbacks(
  parcelGeom: Polygon,
  edges: EdgeClassification[],
  setbacks: SetbackValues
): Polygon | null {
  const ring = parcelGeom.coordinates[0];
  if (!ring || ring.length < 4 || edges.length < 3) return null;

  // Strip closing vertex
  const verts = ring.slice(0, -1);
  const n = verts.length;

  if (edges.length !== n) {
    // Mismatch — fall back to uniform buffer
    console.warn('[applyVariableSetbacks] Edge count mismatch, falling back');
    return null;
  }

  // Ensure consistent winding (CCW)
  let signedArea2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea2 += verts[i][0] * verts[j][1] - verts[j][0] * verts[i][1];
  }
  const ccw = signedArea2 >= 0;
  const orderedVerts = ccw ? verts : [...verts].reverse();
  const orderedEdges = ccw ? edges : [...edges].reverse();

  // For each edge, compute its inward-offset line
  // (shift the edge along its inward normal by the appropriate setback distance)
  type OffsetLine = { px: number; py: number; dx: number; dy: number };
  const offsetLines: OffsetLine[] = [];

  for (let i = 0; i < n; i++) {
    const a = orderedVerts[i];
    const b = orderedVerts[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len < 1e-12) {
      // Degenerate edge — still push a placeholder to keep indexing consistent
      offsetLines.push({ px: a[0], py: a[1], dx: 1, dy: 0 });
      continue;
    }

    // Outward normal for CCW winding: (ey, -ex)/len
    const nx = ey / len;
    const ny = -ex / len;

    // Determine setback distance for this edge
    const edgeClass = orderedEdges[i];
    let setbackDist: number;
    switch (edgeClass.type) {
      case 'front':
        setbackDist = setbacks.front;
        break;
      case 'rear':
        setbackDist = setbacks.rear;
        break;
      case 'side':
      default:
        setbackDist = setbacks.side;
        break;
    }

    // Shift inward → negative distance (inward is opposite of outward normal)
    const dist = -setbackDist;
    const px = a[0] + nx * dist;
    const py = a[1] + ny * dist;
    offsetLines.push({ px, py, dx: ex, dy: ey });
  }

  // Intersect consecutive offset lines to find new vertices
  const offsetVerts: number[][] = [];
  const m = offsetLines.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const pt = lineLineIntersect(offsetLines[i], offsetLines[j]);
    if (pt) {
      offsetVerts.push(pt);
    } else {
      // Parallel edges → midpoint fallback
      offsetVerts.push([
        (offsetLines[i].px + offsetLines[j].px) / 2,
        (offsetLines[i].py + offsetLines[j].py) / 2,
      ]);
    }
  }

  if (offsetVerts.length < 3) return null;

  // Close the ring
  offsetVerts.push([offsetVerts[0][0], offsetVerts[0][1]]);

  const rawOffsetPoly: Polygon = { type: 'Polygon', coordinates: [offsetVerts] };

  // Intersect with original parcel to trim any overhangs (concave parcels)
  const clipped = intersection(parcelGeom, rawOffsetPoly);
  const polyList = polygons(clipped);

  if (polyList.length === 0) return null;

  // Pick the largest polygon
  let best = polyList[0];
  let bestArea = areaM2(best);
  for (let i = 1; i < polyList.length; i++) {
    const a = areaM2(polyList[i]);
    if (a > bestArea) {
      bestArea = a;
      best = polyList[i];
    }
  }

  // Check for collapse
  if (bestArea < 1) return null; // < 1 m²

  const origArea = areaM2(parcelGeom);

  // If any setback is non-zero but the result didn't shrink, it means the offset
  // lines overshot (setbacks exceeded polygon dimensions) → polygon collapsed.
  const anySetback = setbacks.front > 0 || setbacks.side > 0 || setbacks.rear > 0;
  if (bestArea >= origArea - 0.01) {
    if (anySetback) {
      // Setbacks overshot — collapse
      return null;
    }
    // All setbacks are 0 — return original as-is
    return parcelGeom;
  }

  return best;
}

// ---------------------------------------------------------------------------
// Helper: line-line intersection
// ---------------------------------------------------------------------------

function lineLineIntersect(
  a: { px: number; py: number; dx: number; dy: number },
  b: { px: number; py: number; dx: number; dy: number }
): number[] | null {
  const denom = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / denom;
  return [a.px + t * a.dx, a.py + t * a.dy];
}
