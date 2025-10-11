import { describe, it, expect } from 'vitest'
import { 
  polygonAreaMeters2, 
  polygonAreaSqFt, 
  polygonPerimeterMeters, 
  polygonPerimeterFeet,
  polygonCentroid,
  polygonBounds
} from './geometry'

describe('polygonAreaMeters2', () => {
  it('computes area of unit square', () => {
    const coords: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const area = polygonAreaMeters2(coords)
    expect(area).toBe(1)
  })

  it('computes area of triangle', () => {
    const coords: [number, number][] = [[0, 0], [2, 0], [1, 2]]
    const area = polygonAreaMeters2(coords)
    expect(area).toBe(2)
  })

  it('returns 0 for insufficient points', () => {
    expect(polygonAreaMeters2([])).toBe(0)
    expect(polygonAreaMeters2([[0, 0]])).toBe(0)
    expect(polygonAreaMeters2([[0, 0], [1, 0]])).toBe(0)
  })

  it('handles negative coordinates', () => {
    const coords: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    const area = polygonAreaMeters2(coords)
    expect(area).toBe(4)
  })
})

describe('polygonAreaSqFt', () => {
  it('converts square meters to square feet', () => {
    const coords: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const areaSqFt = polygonAreaSqFt(coords)
    expect(areaSqFt).toBeCloseTo(10.7639, 4)
  })
})

describe('polygonPerimeterMeters', () => {
  it('computes perimeter of unit square', () => {
    const coords: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const perimeter = polygonPerimeterMeters(coords)
    expect(perimeter).toBe(4)
  })

  it('computes perimeter of triangle', () => {
    const coords: [number, number][] = [[0, 0], [3, 0], [0, 4]]
    const perimeter = polygonPerimeterMeters(coords)
    expect(perimeter).toBeCloseTo(12, 1) // 3 + 4 + 5
  })

  it('returns 0 for insufficient points', () => {
    expect(polygonPerimeterMeters([])).toBe(0)
    expect(polygonPerimeterMeters([[0, 0]])).toBe(0)
  })
})

describe('polygonPerimeterFeet', () => {
  it('converts meters to feet', () => {
    const coords: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const perimeterFeet = polygonPerimeterFeet(coords)
    expect(perimeterFeet).toBeCloseTo(13.1234, 4) // 4 * 3.28084
  })
})

describe('polygonCentroid', () => {
  it('computes centroid of unit square', () => {
    const coords: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]]
    const centroid = polygonCentroid(coords)
    expect(centroid.x).toBe(1)
    expect(centroid.y).toBe(1)
  })

  it('computes centroid of triangle', () => {
    const coords: [number, number][] = [[0, 0], [3, 0], [0, 3]]
    const centroid = polygonCentroid(coords)
    expect(centroid.x).toBe(1)
    expect(centroid.y).toBe(1)
  })

  it('handles empty polygon', () => {
    const centroid = polygonCentroid([])
    expect(centroid.x).toBe(0)
    expect(centroid.y).toBe(0)
  })
})

describe('polygonBounds', () => {
  it('computes bounds of unit square', () => {
    const coords: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const bounds = polygonBounds(coords)
    expect(bounds).toEqual({ minX: 0, maxX: 1, minY: 0, maxY: 1 })
  })

  it('computes bounds with negative coordinates', () => {
    const coords: [number, number][] = [[-2, -1], [3, 0], [1, 4], [-1, 2]]
    const bounds = polygonBounds(coords)
    expect(bounds).toEqual({ minX: -2, maxX: 3, minY: -1, maxY: 4 })
  })

  it('handles empty polygon', () => {
    const bounds = polygonBounds([])
    expect(bounds).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 })
  })
})
