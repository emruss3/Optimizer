/**
 * Geometry utilities for site planning calculations
 */

export interface Point {
  x: number
  y: number
}

export interface Polygon {
  coordinates: Point[]
}

/**
 * Calculate polygon area using the shoelace formula
 * For small polygons, this planar calculation is sufficient
 * For large areas or high precision, consider using a proper projection library
 */
export function polygonAreaMeters2(coords: [number, number][]): number {
  if (coords.length < 3) return 0
  
  let area = 0
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
}

/**
 * Calculate polygon area in square feet
 */
export function polygonAreaSqFt(coords: [number, number][]): number {
  const meters2 = polygonAreaMeters2(coords)
  return meters2 * 10.7639 // Convert square meters to square feet
}

/**
 * Calculate polygon perimeter in meters
 */
export function polygonPerimeterMeters(coords: [number, number][]): number {
  if (coords.length < 2) return 0
  
  let perimeter = 0
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    const dx = x2 - x1
    const dy = y2 - y1
    perimeter += Math.sqrt(dx * dx + dy * dy)
  }
  return perimeter
}

/**
 * Calculate polygon perimeter in feet
 */
export function polygonPerimeterFeet(coords: [number, number][]): number {
  const meters = polygonPerimeterMeters(coords)
  return meters * 3.28084 // Convert meters to feet
}

/**
 * Find the centroid of a polygon
 */
export function polygonCentroid(coords: [number, number][]): Point {
  if (coords.length === 0) return { x: 0, y: 0 }
  
  let cx = 0
  let cy = 0
  let area = 0
  
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    const cross = x1 * y2 - x2 * y1
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
    area += cross
  }
  
  area /= 2
  if (area === 0) {
    // Fallback to simple average for degenerate polygons
    const sumX = coords.reduce((sum, [x]) => sum + x, 0)
    const sumY = coords.reduce((sum, [, y]) => sum + y, 0)
    return { x: sumX / coords.length, y: sumY / coords.length }
  }
  
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

/**
 * Calculate the bounding box of a polygon
 */
export function polygonBounds(coords: [number, number][]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  if (coords.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }
  
  let minX = coords[0][0]
  let maxX = coords[0][0]
  let minY = coords[0][1]
  let maxY = coords[0][1]
  
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  
  return { minX, maxX, minY, maxY }
}
