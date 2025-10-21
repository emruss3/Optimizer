import type { Polygon, Point } from 'geojson';
import type { Vertex, Envelope } from './types';

/**
 * Calculate area of a polygon in square feet
 */
export function areaSqft(polygon: Polygon): number {
  // Simple shoelace formula for now - can be replaced with turf.area() later
  const coords = polygon.coordinates[0];
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    area += coords[i][0] * coords[i + 1][1];
    area -= coords[i + 1][0] * coords[i][1];
  }
  return Math.abs(area) / 2;
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
 * Check if point is in polygon (alias for contains)
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
 * Check if a point is inside a polygon
 */
export function contains(polygon: Polygon, point: Point): boolean {
  const coords = polygon.coordinates[0];
  const x = point.coordinates[0];
  const y = point.coordinates[1];
  
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    if (((coords[i][1] > y) !== (coords[j][1] > y)) &&
        (x < (coords[j][0] - coords[i][0]) * (y - coords[i][1]) / (coords[j][1] - coords[i][1]) + coords[i][0])) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Get bounding box of a polygon
 */
export function bbox(polygon: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
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