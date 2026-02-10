import type { Polygon, Point, MultiPolygon } from 'geojson';
import type { Vertex, Envelope } from './types';
import polyclip from 'polygon-clipping';

/**
 * polygon-clipping type definitions
 */
type PcRing = [number, number][];
type PcPolygon = PcRing[];           // number[][][]
type PcMultiPolygon = PcPolygon[];   // number[][][][]
type PcGeom = PcPolygon | PcMultiPolygon;

/**
 * Convert GeoJSON to polygon-clipping format
 * GeoJSON Polygon.coordinates already match PcPolygon
 * GeoJSON MultiPolygon.coordinates already match PcMultiPolygon
 */
function toPc(geom: Polygon | MultiPolygon): PcGeom {
  return geom.type === 'Polygon'
    ? (geom.coordinates as unknown as PcPolygon)
    : (geom.coordinates as unknown as PcMultiPolygon);
}

/**
 * Convert polygon-clipping result to GeoJSON
 * polygon-clipping always returns MultiPolygon (array of polygons)
 */
function fromPc(result: PcMultiPolygon): Polygon | MultiPolygon {
  // polyclip returns MultiPolygon always (array of polygons)
  if (!result || result.length === 0) {
    return { type: 'MultiPolygon', coordinates: [] };
  }
  if (result.length === 1) {
    return { type: 'Polygon', coordinates: result[0] as unknown as number[][][] };
  }
  return { type: 'MultiPolygon', coordinates: result as unknown as number[][][][] };
}

/**
 * Convert square meters to square feet
 */
function toSqFt(m2: number): number {
  return m2 * 10.7639; // 1 m┬▓ = 10.7639 ft┬▓
}

/**
 * Calculate area in square meters (planar shoelace formula)
 * Works with any planar coordinate system (EPSG:3857 expected)
 */
export function areaM2(polygon: Polygon): number {
  if (!polygon.coordinates || !polygon.coordinates[0] || polygon.coordinates[0].length < 4) {
    return 0;
  }
  const coords = polygon.coordinates[0];
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    area += coords[i][0] * coords[i + 1][1];
    area -= coords[i + 1][0] * coords[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate area of a polygon in square feet
 * Converts from m┬▓ to ft┬▓ (coordinates are in meters for EPSG:3857)
 */
export function areaSqft(polygon: Polygon): number {
  return toSqFt(areaM2(polygon));
}

/**
 * Calculate polygon area (alias for areaSqft)
 */
export function calculatePolygonArea(vertices: number[][]): number {
  if (vertices.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    area += vertices[i][0] * vertices[i + 1][1];
    area -= vertices[i + 1][0] * vertices[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate polygon bounds
 */
export function calculatePolygonBounds(vertices: number[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (vertices.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  
  let minX = vertices[0][0];
  let minY = vertices[0][1];
  let maxX = vertices[0][0];
  let maxY = vertices[0][1];
  
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex[0]);
    minY = Math.min(minY, vertex[1]);
    maxX = Math.max(maxX, vertex[0]);
    maxY = Math.max(maxY, vertex[1]);
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Calculate polygon centroid
 */
export function calculatePolygonCentroid(vertices: number[][]): number[] {
  if (vertices.length === 0) return [0, 0];
  
  let cx = 0;
  let cy = 0;
  
  for (const vertex of vertices) {
    cx += vertex[0];
    cy += vertex[1];
  }
  
  return [cx / vertices.length, cy / vertices.length];
}

/**
 * Check if point is in polygon (ray-casting algorithm)
 */
export function isPointInPolygon(point: number[], vertices: number[][]): boolean {
  const x = point[0];
  const y = point[1];
  
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    if (((vertices[i][1] > y) !== (vertices[j][1] > y)) &&
        (x < (vertices[j][0] - vertices[i][0]) * (y - vertices[i][1]) / (vertices[j][1] - vertices[i][1]) + vertices[i][0])) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if two polygons overlap
 */
export function doPolygonsOverlap(vertices1: number[][], vertices2: number[][]): boolean {
  const bounds1 = calculatePolygonBounds(vertices1);
  const bounds2 = calculatePolygonBounds(vertices2);
  
  // Quick bounding box check
  if (bounds1.maxX < bounds2.minX || bounds1.minX > bounds2.maxX ||
      bounds1.maxY < bounds2.minY || bounds1.minY > bounds2.maxY) {
    return false;
  }
  
  // Check if any vertex of polygon1 is inside polygon2
  for (const vertex of vertices1) {
    if (isPointInPolygon(vertex, vertices2)) {
      return true;
    }
  }
  
  // Check if any vertex of polygon2 is inside polygon1
  for (const vertex of vertices2) {
    if (isPointInPolygon(vertex, vertices1)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Analyze geometry properties
 */
export function analyzeGeometry(vertices: number[][]): {
  area: number;
  perimeter: number;
  centroid: number[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  isConvex: boolean;
  aspectRatio: number;
} {
  const area = calculatePolygonArea(vertices);
  const bounds = calculatePolygonBounds(vertices);
  const centroid = calculatePolygonCentroid(vertices);
  
  // Calculate perimeter
  let perimeter = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const dx = vertices[i + 1][0] - vertices[i][0];
    const dy = vertices[i + 1][1] - vertices[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  
  // Calculate aspect ratio
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const aspectRatio = width > 0 ? height / width : 1;
  
  // Simple convexity check (not perfect but good enough for most cases)
  const isConvex = checkConvexity(vertices);
  
  return {
    area,
    perimeter,
    centroid,
    bounds,
    isConvex,
    aspectRatio
  };
}

/**
 * Check if polygon is convex (simplified)
 */
function checkConvexity(vertices: number[][]): boolean {
  if (vertices.length < 3) return true;
  
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const p3 = vertices[(i + 2) % vertices.length];
    
    const cross = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
    
    if (sign === 0) {
      sign = cross > 0 ? 1 : -1;
    } else if ((cross > 0 && sign < 0) || (cross < 0 && sign > 0)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Union multiple polygons into one
 * Uses polygon-clipping library for robust boolean operations
 */
export function union(...polygons: Polygon[]): Polygon | MultiPolygon {
  const valid = polygons.filter(p => p?.coordinates?.[0]?.length);
  if (valid.length === 0) return { type: 'Polygon', coordinates: [] };
  if (valid.length === 1) return valid[0];

  const pcInputs = valid.map(p => toPc(p));
  // union accepts (geom, ...moreGeoms)
  const res = polyclip.union(pcInputs[0], ...pcInputs.slice(1)) as PcMultiPolygon;
  return fromPc(res);
}

/**
 * Difference between two polygons (polygon1 - polygon2)
 * Uses polygon-clipping library for robust boolean operations
 */
export function difference(a: Polygon, b: Polygon): Polygon | MultiPolygon {
  if (!a?.coordinates?.[0]?.length) return { type: 'Polygon', coordinates: [] };
  if (!b?.coordinates?.[0]?.length) return a;

  const res = polyclip.difference(toPc(a), toPc(b)) as PcMultiPolygon;
  return fromPc(res);
}

/**
 * Intersection of two polygons
 */
export function intersection(a: Polygon, b: Polygon): Polygon | MultiPolygon {
  if (!a?.coordinates?.[0]?.length || !b?.coordinates?.[0]?.length) {
    return { type: 'Polygon', coordinates: [] };
  }

  const res = polyclip.intersection(toPc(a), toPc(b)) as PcMultiPolygon;
  return fromPc(res);
}

/**
 * Extract polygons from a geometry
 */
export function polygons(geometry: Polygon | MultiPolygon): Polygon[] {
  if (geometry.type === 'Polygon') {
    return [geometry];
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map(ring => ({
      type: 'Polygon',
      coordinates: ring
    }));
  }
  return [];
}

/**
 * Sort polygons by area (largest first)
 */
export function sortByArea(polygons: Polygon[]): Polygon[] {
  return polygons.sort((a, b) => areaSqft(b) - areaSqft(a));
}

/**
 * Convert elements to polygons
 */
export function elementsToPolygons(elements: Element[]): Polygon[] {
  return elements.map(element => element.geometry);
}

/**
 * Select largest ring from a polygon (handles multiple rings)
 */
export function selectLargestRingFromPolygon(poly: Polygon): Polygon {
  const rings = poly.coordinates ?? [];
  if (!rings.length) throw new Error('Polygon has no rings');
  
  let best = rings[0];
  let bestA = -1;
  
  for (const ring of rings) {
    if (!ring || ring.length < 4) continue;
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      a += x1 * y2 - x2 * y1;
    }
    const abs = Math.abs(a / 2);
    if (abs > bestA) {
      bestA = abs;
      best = ring;
    }
  }
  
  return { type: 'Polygon', coordinates: [best] };
}

/**
 * Normalize geometry to a single polygon (handles MultiPolygon)
 */
export function normalizeToPolygon(geom: Polygon | MultiPolygon): Polygon {
  if (!geom) throw new Error('Missing geometry');
  
  if (geom.type === 'Polygon') {
    return selectLargestRingFromPolygon(geom);
  }
  
  // MultiPolygon -> pick largest polygon by area
  let best: Polygon | null = null;
  let bestA = -1;
  
  for (const coords of geom.coordinates) {
    const poly: Polygon = { type: 'Polygon', coordinates: coords };
    const p = selectLargestRingFromPolygon(poly);
    
    // Quick area calculation on main ring
    const ring = p.coordinates[0];
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      a += (x1 * y2 - x2 * y1);
    }
    const abs = Math.abs(a / 2);
    if (abs > bestA) {
      bestA = abs;
      best = p;
    }
  }
  
  if (!best) throw new Error('MultiPolygon has no valid polygons');
  return best;
}

/**
 * Safe bounding box calculation
 */
export function safeBbox(poly: Polygon): [number, number, number, number] {
  const ring = poly.coordinates?.[0];
  if (!ring || ring.length < 4) throw new Error('Cannot bbox empty polygon');
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  
  return [minX, minY, maxX, maxY];
}

/**
 * Handle MultiPolygon by selecting the largest ring (legacy)
 */
export function selectLargestRing(geometry: Polygon | MultiPolygon): Polygon {
  return normalizeToPolygon(geometry);
}

/**
 * Get bounding box of a polygon
 */
export function bbox(polygon: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!polygon.coordinates || !polygon.coordinates[0] || polygon.coordinates[0].length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  const coords = polygon.coordinates[0];
  let minX = coords[0][0];
  let minY = coords[0][1];
  let maxX = coords[0][0];
  let maxY = coords[0][1];
  
  for (const coord of coords) {
    minX = Math.min(minX, coord[0]);
    minY = Math.min(minY, coord[1]);
    maxX = Math.max(maxX, coord[0]);
    maxY = Math.max(maxY, coord[1]);
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Buffer/offset a polygon by a given distance (in same units as coordinates).
 * Positive distance = expand outward, negative = shrink inward (setbacks).
 *
 * Works on ANY polygon (irregular, concave, 5+ vertices).
 * Coordinates must be in a planar metre CRS (EPSG:3857).
 *
 * Uses a Minkowski-sum approach via polygon-clipping:
 *   Outward  → union(polygon, each-edge-offset-rect) then union with corner circles
 *   Inward   → intersect the polygon with all inward half-planes (edge offsets)
 *
 * For simplicity and robustness we approximate the offset by:
 *   1. Compute the straight-skeleton-style edge offsets (move each edge inward/outward
 *      by `distance` along its normal).
 *   2. Build the new polygon from the offset edge intersections.
 *   3. For outward buffers, union with the original to fill concavities.
 *   4. For inward buffers, intersect with the original to trim overhangs.
 *
 * If the inward buffer collapses (area ≤ 0), returns null-equivalent empty polygon.
 *
 * When the result is a MultiPolygon, selectLargestRingFromPolygon picks the biggest piece.
 */
export function buffer(polygon: Polygon, distance: number): Polygon {
  if (!polygon.coordinates || !polygon.coordinates[0] || polygon.coordinates[0].length < 4) {
    return polygon;
  }

  if (distance === 0) {
    return polygon;
  }

  const ring = polygon.coordinates[0];
  // Ensure we work with a closed ring; strip the closing vertex for edge iteration
  const isClosed =
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const verts: number[][] = isClosed ? ring.slice(0, -1) : ring.slice();
  const n = verts.length;

  if (n < 3) return polygon;

  // Ensure consistent winding (CCW for outer ring). Compute signed area.
  let signedArea2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea2 += verts[i][0] * verts[j][1] - verts[j][0] * verts[i][1];
  }
  // If CW (signedArea2 < 0), reverse to CCW
  if (signedArea2 < 0) {
    verts.reverse();
  }

  // Compute offset edges: for each edge, shift it by `distance` along its outward normal.
  // For a CCW polygon the outward normal of edge (A→B) is (dy, -dx) normalized.
  const offsetLines: Array<{ px: number; py: number; dx: number; dy: number }> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = verts[j][0] - verts[i][0];
    const ey = verts[j][1] - verts[i][1];
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len < 1e-12) continue; // degenerate edge
    // Outward normal for CCW winding
    const nx = ey / len;
    const ny = -ex / len;
    // Offset point on the shifted edge
    const px = verts[i][0] + nx * distance;
    const py = verts[i][1] + ny * distance;
    offsetLines.push({ px, py, dx: ex, dy: ey });
  }

  if (offsetLines.length < 3) {
    // Degenerate polygon
    return { type: 'Polygon', coordinates: [[]] };
  }

  // Intersect consecutive offset lines to find new vertices
  const offsetVerts: number[][] = [];
  const m = offsetLines.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const pt = lineLineIntersection(offsetLines[i], offsetLines[j]);
    if (pt) {
      offsetVerts.push(pt);
    } else {
      // Parallel edges → use midpoint of the two offset origins
      offsetVerts.push([
        (offsetLines[i].px + offsetLines[j].px) / 2,
        (offsetLines[i].py + offsetLines[j].py) / 2
      ]);
    }
  }

  if (offsetVerts.length < 3) {
    return { type: 'Polygon', coordinates: [[]] };
  }

  // Close the ring
  offsetVerts.push([offsetVerts[0][0], offsetVerts[0][1]]);

  const rawOffset: Polygon = { type: 'Polygon', coordinates: [offsetVerts] };

  const originalArea = areaM2(polygon);

  // For inward (negative distance) buffers, intersect with original to prevent overshoot
  // For outward (positive distance) buffers, union with original to fill concavities
  let result: Polygon | MultiPolygon;
  if (distance < 0) {
    result = intersection(polygon, rawOffset);
  } else {
    result = union(polygon, rawOffset);
  }

  // Normalize to single Polygon (pick largest)
  const polyList = polygons(result);
  if (polyList.length === 0) {
    return { type: 'Polygon', coordinates: [[]] };
  }

  // Find the largest polygon
  let best = polyList[0];
  let bestArea = areaM2(best);
  for (let i = 1; i < polyList.length; i++) {
    const a = areaM2(polyList[i]);
    if (a > bestArea) {
      bestArea = a;
      best = polyList[i];
    }
  }

  // If area collapsed to near-zero, return empty
  if (bestArea < 0.01) {
    return { type: 'Polygon', coordinates: [[]] };
  }

  // For inward buffers: result must be strictly smaller than original.
  // If it's not, the offset polygon overshot (edges crossed) and the buffer collapsed.
  if (distance < 0 && bestArea >= originalArea - 0.01) {
    return { type: 'Polygon', coordinates: [[]] };
  }

  return selectLargestRingFromPolygon(best);
}

/**
 * Intersect two lines defined as point+direction.
 * Returns the intersection point or null if parallel.
 */
function lineLineIntersection(
  a: { px: number; py: number; dx: number; dy: number },
  b: { px: number; py: number; dx: number; dy: number }
): number[] | null {
  const denom = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / denom;
  return [a.px + t * a.dx, a.py + t * a.dy];
}

/**
 * Alias for buffer (offset is more common term in some contexts)
 */
export function offset(polygon: Polygon, distance: number): Polygon {
  return buffer(polygon, distance);
}

/**
 * Calculate polygon area (in square units of coordinate system)
 * Works with planar coordinates (EPSG:3857 meters expected)
 */
export function area(polygon: Polygon): number {
  return areaSqft(polygon); // areaSqft uses shoelace, works for any units
}

/**
 * Calculate polygon centroid
 */
export function centroid(polygon: Polygon): number[] {
  return getCentroid(polygon);
}

/**
 * Simplify polygon by removing redundant vertices
 */
export function simplify(polygon: Polygon, tolerance: number = 0.001): Polygon {
  const coords = polygon.coordinates[0];
  const simplified: number[][] = [];
  
  for (let i = 0; i < coords.length; i++) {
    const prev = coords[i === 0 ? coords.length - 1 : i - 1];
    const curr = coords[i];
    const next = coords[i === coords.length - 1 ? 0 : i + 1];
    
    // Calculate distance from current point to line between prev and next
    const dist = pointToLineDistance(curr, prev, next);
    
    if (dist > tolerance) {
      simplified.push(curr);
    }
  }
  
  // Ensure polygon is closed
  if (simplified.length > 0 && 
      (simplified[0][0] !== simplified[simplified.length - 1][0] || 
       simplified[0][1] !== simplified[simplified.length - 1][1])) {
    simplified.push([simplified[0][0], simplified[0][1]]);
  }
  
  return {
    type: 'Polygon',
    coordinates: [simplified]
  };
}

/**
 * Rotate polygon around its centroid
 */
export function rotate(polygon: Polygon, angleDegrees: number): Polygon {
  const coords = polygon.coordinates[0];
  const centroid = getCentroid(polygon);
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  
  const rotated = coords.map(coord => {
    const x = coord[0] - centroid[0];
    const y = coord[1] - centroid[1];
    return [
      x * cos - y * sin + centroid[0],
      x * sin + y * cos + centroid[1]
    ];
  });
  
  return {
    type: 'Polygon',
    coordinates: [rotated]
  };
}

/**
 * Create envelope from polygon
 */
export function createEnvelope(polygon: Polygon): Envelope {
  const bounds = bbox(polygon);
  const area = areaSqft(polygon);
  
  return {
    geometry: polygon,
    areaSqFt: area,
    bounds
  };
}

/**
 * Convert vertices to polygon
 */
export function verticesToPolygon(vertices: Vertex[]): Polygon {
  const coords = vertices.map(v => [v.x, v.y]);
  // Ensure polygon is closed
  if (coords.length > 0 && 
      (coords[0][0] !== coords[coords.length - 1][0] || 
       coords[0][1] !== coords[coords.length - 1][1])) {
    coords.push([coords[0][0], coords[0][1]]);
  }
  
  return {
    type: 'Polygon',
    coordinates: [coords]
  };
}

/**
 * Convert polygon to vertices
 */
export function polygonToVertices(polygon: Polygon): Vertex[] {
  const coords = polygon.coordinates[0];
  return coords.slice(0, -1).map((coord, index) => ({
    x: coord[0],
    y: coord[1],
    id: `v${index}`
  }));
}

// Helper functions
function pointToLineDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const A = point[0] - lineStart[0];
  const B = point[1] - lineStart[1];
  const C = lineEnd[0] - lineStart[0];
  const D = lineEnd[1] - lineStart[1];
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return Math.sqrt(A * A + B * B);
  
  const param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = lineStart[0];
    yy = lineStart[1];
  } else if (param > 1) {
    xx = lineEnd[0];
    yy = lineEnd[1];
  } else {
    xx = lineStart[0] + param * C;
    yy = lineStart[1] + param * D;
  }
  
  const dx = point[0] - xx;
  const dy = point[1] - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function getCentroid(polygon: Polygon): number[] {
  const coords = polygon.coordinates[0];
  let cx = 0;
  let cy = 0;
  
  for (const coord of coords) {
    cx += coord[0];
    cy += coord[1];
  }
  
  return [cx / coords.length, cy / coords.length];
}