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

  it('emits a spandrel ring per floor line plus the parapet, at the extrusion arithmetic', () => {
    const { floorLines } = buildMassingData([
      el('b1', 'building', square(X, Y, 40), 3),
      el('p1', 'parking-bay', square(X + 50, Y, 20)),
    ]);
    // 3 floors: spandrels at 14 ft and 24 ft + parapet at 34 ft — flatwork emits none.
    expect(floorLines).toHaveLength(3);
    const zs = floorLines.map(f => f.path[0][2]).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(14 * 0.3048, 4);
    expect(zs[1]).toBeCloseTo(24 * 0.3048, 4);
    expect(zs[2]).toBeCloseTo(34 * 0.3048, 4);
  });

  it('derives the sun-study origin from the scene, not a hardcoded city', () => {
    const { origin } = buildMassingData([el('b1', 'building', square(X, Y, 40), 2)]);
    // -9660000, 4320000 in 3857 sits near 86.8°W / 36.1°N.
    expect(origin.lonDeg).toBeLessThan(-86);
    expect(origin.lonDeg).toBeGreaterThan(-88);
    expect(origin.latDeg).toBeGreaterThan(35);
    expect(origin.latDeg).toBeLessThan(37);
  });
});

describe('what the rendered view is given', () => {
  const building = el('b1', 'building', square(X, Y, 30), 3);

  it('draws the buildings in the style asked for, and in the first style when none is', () => {
    const surfaces = (style?: 'mansard' | 'farmhouse' | 'modern' | 'heritage') => {
      const d = buildMassingData([building], style ? { style } : undefined);
      return new Set([...d.slabs, ...d.roofs].map(p => p.surface ?? 'plain'));
    };
    expect(surfaces()).toEqual(surfaces('mansard'));
    expect(surfaces('farmhouse').has('batten')).toBe(true);
    expect(surfaces('farmhouse').has('metal')).toBe(true);
    expect(surfaces('modern').has('glassrail')).toBe(true);
    expect(surfaces('mansard').has('shingle')).toBe(true);
  });

  it('keeps the same footprints and heights whatever the style', () => {
    const tops = (style: 'mansard' | 'modern') => {
      const d = buildMassingData([building], { style });
      return [d.polygons.map(p => p.elevation), d.roofLines.map(r => r.path.map(p => p.map(v => Math.round(v * 1000))))];
    };
    expect(tops('modern')).toEqual(tops('mansard'));
  });

  it('passes on the lots of a subdivision, in the same local metres as the buildings', () => {
    const lot: Element = { ...el('lot', 'other', square(X - 10, Y - 10, 50)), name: 'Lot 7' };
    const d = buildMassingData([building, lot]);
    expect(d.lots).toHaveLength(1);
    const xs = (d.lots[0] ?? []).map(p => p[0] ?? 0), bx = (d.polygons[0]?.polygon[0] ?? []).map(p => p[0] ?? 0);
    // the lot is 50 projected metres wide and the building 30: the same scale carries both
    expect((Math.max(...xs) - Math.min(...xs)) / (Math.max(...bx) - Math.min(...bx))).toBeCloseTo(50 / 30, 6);
    expect(buildMassingData([building]).lots).toHaveLength(0);
  });
});

import { streetConnection } from './massingData';

describe('streetConnection', () => {
  const street: Array<[number, number]> = [[-50, 0], [50, 0]];
  // a 6 m wide lane running north from y = 12 to y = 40: its mouth is 12 m from the street's centre line
  const lane: Array<[number, number]> = [[-3, 12], [3, 12], [3, 40], [-3, 40]];

  it('lays an apron from the lane mouth to the street pavement', () => {
    const apron = streetConnection([lane], [street])!;
    expect(apron).toHaveLength(4);
    expect(apron[0]).toEqual([-3, 12]);
    expect(apron[1]).toEqual([3, 12]);
    // it runs on to just inside the 3.65 m half width the street is drawn at
    expect(apron[2]![1]).toBeLessThan(3.65);
    expect(apron[2]![1]).toBeGreaterThan(2.5);
    expect(apron[2]![0]).toBeCloseTo(3, 6);
  });

  it('lays nothing where the pavement already reaches the street', () => {
    expect(streetConnection([[[-3, 2], [3, 2], [3, 40], [-3, 40]]], [street])).toBeNull();
  });

  it('still joins a lane that stops short when a parking field elsewhere already touches the street', () => {
    const field: Array<[number, number]> = [[20, 2], [50, 2], [50, 20], [20, 20]];
    const apron = streetConnection([field, lane], [street])!;
    expect(apron[0]).toEqual([-3, 12]);
  });

  it('lays nothing where no street is near, or none is known', () => {
    expect(streetConnection([lane], [])).toBeNull();
    expect(streetConnection([[[-3, 112], [3, 112], [3, 140], [-3, 140]]], [street])).toBeNull();
  });

  it('runs to the parcel line and a lane past it where the street has no centre line', () => {
    const parcel: Array<[number, number]> = [[-40, 4], [40, 4], [40, 60], [-40, 60], [-40, 4]];
    const apron = streetConnection([lane], [], [parcel])!;
    expect(apron[0]).toEqual([-3, 12]);
    // the line is at y = 4; the apron runs on 6 m past it
    expect(apron[2]![1]).toBeCloseTo(-2, 5);
    // a lane that stops well inside the parcel is not taken for the way out
    expect(streetConnection([[[-3, 25], [3, 25], [3, 40], [-3, 40]]], [], [parcel])).toBeNull();
  });

  it('does not take a long side of a parking field for a mouth', () => {
    expect(streetConnection([[[-30, 12], [30, 12], [30, 30], [-30, 30]]], [street])).toBeNull();
  });
});
