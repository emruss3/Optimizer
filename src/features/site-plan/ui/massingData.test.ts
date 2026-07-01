import { describe, it, expect } from 'vitest';
import type { Element } from '../../../engine/types';
import { buildMassingData, buildingHeightM } from './massingData';

const el = (
  id: string,
  type: Element['type'],
  coords: number[][],
  floors?: number
): Element => ({
  id,
  type,
  name: id,
  geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
  properties: { areaSqFt: 0, ...(floors != null ? { floors } : {}) },
  metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
});

// A square near Nashville in EPSG:3857
const X = -9660000;
const Y = 4320000;
const square = (x: number, y: number, s: number) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

describe('buildingHeightM', () => {
  it('models 14ft ground + 10ft per upper floor', () => {
    expect(buildingHeightM(1)).toBeCloseTo(14 * 0.3048, 4);
    expect(buildingHeightM(3)).toBeCloseTo(34 * 0.3048, 4);
  });

  it('clamps degenerate floor counts to 1', () => {
    expect(buildingHeightM(0)).toBeCloseTo(14 * 0.3048, 4);
    expect(buildingHeightM(Number.NaN)).toBeCloseTo(14 * 0.3048, 4);
  });
});

describe('buildMassingData', () => {
  it('centres geometry on the plan bbox and scales to ground metres', () => {
    const { polygons, extent } = buildMassingData([
      el('b1', 'building', square(X, Y, 40), 3),
    ]);
    expect(polygons).toHaveLength(1);
    // Centred: ring spans symmetric about 0 in both axes.
    const ring = polygons[0].polygon[0];
    const xs = ring.map(p => p[0]);
    const ys = ring.map(p => p[1]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0, 6);
    // Mercator scale at ~36°N shrinks 3857 metres by cos(lat) ≈ 0.8.
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeLessThan(40);
    expect(width).toBeGreaterThan(40 * 0.7);
    expect(extent).toBeCloseTo(width, 6);
  });

  it('extrudes buildings by floors and keeps flatwork near the ground', () => {
    const { polygons } = buildMassingData([
      el('b1', 'building', square(X, Y, 40), 4),
      el('p1', 'parking-bay', square(X + 50, Y, 20)),
    ]);
    const building = polygons.find(p => p.label.startsWith('b1'))!;
    const bay = polygons.find(p => p.label.startsWith('p1'))!;
    expect(building.elevation).toBeCloseTo(44 * 0.3048, 4);
    expect(bay.elevation).toBeLessThan(0.5);
  });

  it('skips unknown element types and empty geometry', () => {
    const bogus = el('x', 'building', square(X, Y, 10));
    bogus.geometry.coordinates = [[]];
    const { polygons } = buildMassingData([
      bogus,
      { ...el('t', 'building', square(X, Y, 10)), type: 'text' as Element['type'] },
    ]);
    expect(polygons).toHaveLength(0);
  });
});
