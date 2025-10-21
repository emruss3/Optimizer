import * as turf from '@turf/turf';
import type { Vertex, Element, GeometryResult, GeoJSONPolygon, GeoJSONPoint } from './types';

/**
 * Convert Vertex array to GeoJSON Polygon
 */
export function verticesToGeoJSON(vertices: Vertex[]): GeoJSONPolygon {
  if (vertices.length < 3) {
    throw new Error('At least 3 vertices required for polygon');
  }
  
  const coordinates = [vertices.map(v => [v.x, v.y])];
  return {
    type: 'Polygon',
    coordinates
  };
}

/**
 * Convert GeoJSON Polygon to Vertex array
 */
export function geoJSONToVertices(geoJSON: GeoJSONPolygon, idPrefix = 'v'): Vertex[] {
  const coords = geoJSON.coordinates[0];
  return coords.map((coord, index) => ({
    x: coord[0],
    y: coord[1],
    id: `${idPrefix}_${index}`
  }));
}

/**
 * Calculate polygon area using Turf.js
 */
export function calculatePolygonArea(vertices: Vertex[]): number {
  try {
    const geoJSON = verticesToGeoJSON(vertices);
    const polygon = turf.polygon(geoJSON.coordinates);
    return turf.area(polygon); // Returns area in square meters
  } catch (error) {
    console.error('Error calculating polygon area:', error);
    return 0;
  }
}

/**
 * Calculate polygon perimeter using Turf.js
 */
export function calculatePolygonPerimeter(vertices: Vertex[]): number {
  try {
    const geoJSON = verticesToGeoJSON(vertices);
    const polygon = turf.polygon(geoJSON.coordinates);
    return turf.length(turf.polygonToLine(polygon), { units: 'meters' });
  } catch (error) {
    console.error('Error calculating polygon perimeter:', error);
    return 0;
  }
}

/**
 * Check if point is inside polygon using Turf.js
 */
export function isPointInPolygon(point: { x: number; y: number }, vertices: Vertex[]): boolean {
  try {
    const geoJSON = verticesToGeoJSON(vertices);
    const polygon = turf.polygon(geoJSON.coordinates);
    const pointGeoJSON: GeoJSONPoint = {
      type: 'Point',
      coordinates: [point.x, point.y]
    };
    return turf.booleanPointInPolygon(pointGeoJSON, polygon);
  } catch (error) {
    console.error('Error checking point in polygon:', error);
    return false;
  }
}

/**
 * Calculate polygon bounds using Turf.js
 */
export function calculatePolygonBounds(vertices: Vertex[]): { minX: number; minY: number; maxX: number; maxY: number } {
  try {
    const geoJSON = verticesToGeoJSON(vertices);
    const polygon = turf.polygon(geoJSON.coordinates);
    const bbox = turf.bbox(polygon);
    return {
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3]
    };
  } catch (error) {
    console.error('Error calculating polygon bounds:', error);
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

/**
 * Calculate polygon centroid using Turf.js
 */
export function calculatePolygonCentroid(vertices: Vertex[]): { x: number; y: number } {
  try {
    const geoJSON = verticesToGeoJSON(vertices);
    const polygon = turf.polygon(geoJSON.coordinates);
    const centroid = turf.centroid(polygon);
    return {
      x: centroid.geometry.coordinates[0],
      y: centroid.geometry.coordinates[1]
    };
  } catch (error) {
    console.error('Error calculating polygon centroid:', error);
    return { x: 0, y: 0 };
  }
}

/**
 * Get comprehensive geometry analysis
 */
export function analyzeGeometry(vertices: Vertex[]): GeometryResult {
  const area = calculatePolygonArea(vertices);
  const perimeter = calculatePolygonPerimeter(vertices);
  const centroid = calculatePolygonCentroid(vertices);
  const bounds = calculatePolygonBounds(vertices);
  
  return {
    area,
    perimeter,
    centroid,
    bounds,
    isValid: area > 0 && vertices.length >= 3
  };
}

/**
 * Rotate vertices around a center point
 */
export function rotateVertices(
  vertices: Vertex[], 
  center: { x: number; y: number }, 
  angleDegrees: number
): Vertex[] {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  
  return vertices.map(vertex => {
    const dx = vertex.x - center.x;
    const dy = vertex.y - center.y;
    
    return {
      ...vertex,
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  });
}

/**
 * Scale vertices around a center point
 */
export function scaleVertices(
  vertices: Vertex[], 
  center: { x: number; y: number }, 
  scaleX: number, 
  scaleY: number = scaleX
): Vertex[] {
  return vertices.map(vertex => ({
    ...vertex,
    x: center.x + (vertex.x - center.x) * scaleX,
    y: center.y + (vertex.y - center.y) * scaleY
  }));
}

/**
 * Translate vertices by offset
 */
export function translateVertices(vertices: Vertex[], offset: { x: number; y: number }): Vertex[] {
  return vertices.map(vertex => ({
    ...vertex,
    x: vertex.x + offset.x,
    y: vertex.y + offset.y
  }));
}

/**
 * Snap vertices to grid
 */
export function snapToGrid(vertices: Vertex[], gridSize: number): Vertex[] {
  return vertices.map(vertex => ({
    ...vertex,
    x: Math.round(vertex.x / gridSize) * gridSize,
    y: Math.round(vertex.y / gridSize) * gridSize
  }));
}

/**
 * Check if two polygons overlap using Turf.js
 */
export function doPolygonsOverlap(vertices1: Vertex[], vertices2: Vertex[]): boolean {
  try {
    const geoJSON1 = verticesToGeoJSON(vertices1);
    const geoJSON2 = verticesToGeoJSON(vertices2);
    const polygon1 = turf.polygon(geoJSON1.coordinates);
    const polygon2 = turf.polygon(geoJSON2.coordinates);
    
    return turf.booleanOverlap(polygon1, polygon2);
  } catch (error) {
    console.error('Error checking polygon overlap:', error);
    return false;
  }
}

/**
 * Calculate distance between two points
 */
export function calculateDistance(point1: { x: number; y: number }, point2: { x: number; y: number }): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find closest point on polygon edge to a given point
 */
export function findClosestPointOnPolygon(point: { x: number; y: number }, vertices: Vertex[]): { x: number; y: number } {
  let closestPoint = vertices[0];
  let minDistance = calculateDistance(point, vertices[0]);
  
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    
    // Find closest point on line segment
    const lineDistance = distanceToLineSegment(point, current, next);
    if (lineDistance < minDistance) {
      minDistance = lineDistance;
      // Calculate actual closest point on line
      const t = Math.max(0, Math.min(1, 
        ((point.x - current.x) * (next.x - current.x) + (point.y - current.y) * (next.y - current.y)) /
        ((next.x - current.x) ** 2 + (next.y - current.y) ** 2)
      ));
      closestPoint = {
        x: current.x + t * (next.x - current.x),
        y: current.y + t * (next.y - current.y),
        id: `closest_${i}`
      };
    }
  }
  
  return closestPoint;
}

/**
 * Calculate distance from point to line segment
 */
function distanceToLineSegment(
  point: { x: number; y: number }, 
  lineStart: { x: number; y: number }, 
  lineEnd: { x: number; y: number }
): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return calculateDistance(point, lineStart);
  
  const param = Math.max(0, Math.min(1, dot / lenSq));
  
  const projX = lineStart.x + param * C;
  const projY = lineStart.y + param * D;
  
  return calculateDistance(point, { x: projX, y: projY });
}

/**
 * Create a rectangle from center point and dimensions
 */
export function createRectangle(
  center: { x: number; y: number }, 
  width: number, 
  height: number, 
  idPrefix = 'rect'
): Vertex[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  
  return [
    { x: center.x - halfWidth, y: center.y - halfHeight, id: `${idPrefix}_0` },
    { x: center.x + halfWidth, y: center.y - halfHeight, id: `${idPrefix}_1` },
    { x: center.x + halfWidth, y: center.y + halfHeight, id: `${idPrefix}_2` },
    { x: center.x - halfWidth, y: center.y + halfHeight, id: `${idPrefix}_3` }
  ];
}

/**
 * Create a circle approximation (polygon with many sides)
 */
export function createCircle(
  center: { x: number; y: number }, 
  radius: number, 
  sides = 16, 
  idPrefix = 'circle'
): Vertex[] {
  const vertices: Vertex[] = [];
  const angleStep = (2 * Math.PI) / sides;
  
  for (let i = 0; i < sides; i++) {
    const angle = i * angleStep;
    vertices.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      id: `${idPrefix}_${i}`
    });
  }
  
  return vertices;
}

/**
 * Validate polygon (check for self-intersections, etc.)
 */
export function validatePolygon(vertices: Vertex[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (vertices.length < 3) {
    errors.push('Polygon must have at least 3 vertices');
  }
  
  if (vertices.length > 2) {
    const area = calculatePolygonArea(vertices);
    if (area <= 0) {
      errors.push('Polygon has zero or negative area');
    }
  }
  
  // Check for duplicate vertices
  const uniqueVertices = new Set(vertices.map(v => `${v.x},${v.y}`));
  if (uniqueVertices.size !== vertices.length) {
    errors.push('Polygon has duplicate vertices');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
