import { describe, it, expect } from 'vitest';
import type { Element } from '../../../engine/types';
import type { ArchStyle } from './architecture';
import { polygonArea } from '../scene/frame';
import { buildMassingData, buildingHeightM, exposedApron } from './massingData';
import { buildSiteModel } from '../render3d/siteScene';

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
  it('renders the mapped alley without inventing curbs or sidewalks, and applies a finish only on that alley', async () => {
    const front = el('Front street', 'road', square(X, Y, 10));
    const rear = el('Rear access', 'road', square(X, Y + 30, 10));
    rear.properties.kind = 'alley';
    const drive = el('Driveway', 'circulation', square(X, Y + 20, 10));
    const path = el('Alley sidewalk', 'circulation', square(X + 12, Y + 30, 5));
    const data = buildMassingData([front, rear, drive, path]);
    const lane = data.polygons.find(p => p.id === rear.id)!;
    expect(lane).toMatchObject({ kind: 'street', mappedAlley: true });
    expect(lane.polygon).toEqual(rear.geometry.coordinates.map(r => r.map(data.toLocal)));
    expect(data.polygons.filter(p => p.mappedAlley)).toEqual([lane]);
    expect(data.walks).toHaveLength(0);
    expect(data.curbs.find(c => c.id === 'Rear access:0')?.guideOnly).toBe(true);
    const standard = buildSiteModel(data, { keepParts: true, noContext: true, light: true });
    const preview = buildSiteModel(data, { keepParts: true, noContext: true, light: true, alleyPavers: true });
    const review = buildSiteModel(data, { keepParts: true, noContext: true, light: true, alleyPavers: true, review: true });
    try {
      await Promise.all([standard.ready, preview.ready, review.ready]);
      const pavement = (model: typeof standard, id: string) => model.parts.find(p => p.owner === id)!;
      const original = pavement(standard, 'pavement:Rear access');
      const changed = pavement(preview, 'pavement:Rear access');
      expect(original.slot).toBe('asphalt');
      expect(changed.slot).toBe('pavers');
      expect(pavement(review, 'pavement:Rear access').slot).toBe('asphalt');
      expect(pavement(preview, 'pavement:Front street').slot).toBe('asphalt');
      expect(pavement(preview, 'driveway:Driveway').slot).toBe('concrete');
      expect([...changed.geometry.getAttribute('position').array]).toEqual([...original.geometry.getAttribute('position').array]);
      expect(changed.geometry.getAttribute('uv').array).toEqual(original.geometry.getAttribute('uv').array);
      expect(standard.parts.filter(p => p.owner === 'curb:Rear access:0')).toHaveLength(0);
      expect(review.parts.filter(p => p.owner === 'curb:Rear access:0')).toHaveLength(1);
    } finally {
      standard.dispose(); preview.dispose(); review.dispose();
    }
  });

  it('keeps drawn stalls while hiding decorative vehicles at a known access break', () => {
    const bay = el('verified-bay', 'parking-bay', [[X, Y], [X + 46, Y], [X + 46, Y + 7], [X, Y + 7]]);
    bay.properties.parkingSpaces = 13;
    const normal = buildMassingData([bay]);
    const blocked = buildMassingData([bay], { accessBreak: { from: [X, Y], to: [X - 3, Y] } });
    expect(normal.stripes.length).toBeGreaterThan(0);
    expect(normal.cars.length).toBeGreaterThan(0);
    expect(blocked.cars).toHaveLength(0);
    expect(blocked.stripes).toEqual(normal.stripes);
    expect(bay.properties.parkingSpaces).toBe(13);
  });

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
    const surfaces = (style?: ArchStyle) => {
      const d = buildMassingData([building], style ? { style } : undefined);
      return new Set([...d.slabs, ...d.roofs].map(p => p.surface ?? 'plain'));
    };
    expect(surfaces()).toEqual(surfaces('infill'));
    expect(surfaces('farmhouse').has('batten')).toBe(true);
    expect(surfaces('farmhouse').has('metal')).toBe(true);
    expect(surfaces('modern').has('glassrail')).toBe(true);
    expect(surfaces('mansard').has('shingle')).toBe(true);
  });

  it('keeps the same footprints and heights whatever the style', () => {
    const tops = (style: ArchStyle) => {
      const d = buildMassingData([building], { style });
      return [d.polygons.map(p => p.elevation), d.roofLines.map(r => r.path.map(p => p.map(v => Math.round(v * 1000))))];
    };
    expect(tops('modern')).toEqual(tops('mansard'));
    expect(tops('infill')).toEqual(tops('urban-brick'));
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

describe('exposedApron', () => {
  it('keeps only the part of an illustrative apron not covered by a mapped lane', () => {
    const apron = [[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]] as Array<[number, number]>;
    const lane = [[-2, 3], [8, 3], [8, 7], [-2, 7], [-2, 3]];
    const parts = exposedApron(apron, [[lane]]);
    expect(parts).toHaveLength(1);
    expect(polygonArea(parts[0]!)).toBeCloseTo(18);
    expect(parts[0]![0]!.every(p => p[1] <= 3)).toBe(true);
    expect(exposedApron(apron, [[apron]])).toEqual([]);
  });
});

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

// A wrap: a liner bar on the street, three bars standing over a two-level garage, a court and a
// pool house on the garage's deck. The rules it tests are general: they read the plan's own
// structured-parking element and the buildings round it, whichever generator drew them.
describe('a parking structure in the model', () => {
  const rect = (x: number, y: number, w: number, h: number) => [[X + x, Y + y], [X + x + w, Y + y], [X + x + w, Y + y + h], [X + x, Y + y + h], [X + x, Y + y]];
  const el = (id: string, type: Element['type'], ring: number[][], properties: Record<string, unknown> = {}): Element =>
    ({ id, type, name: id, geometry: { type: 'Polygon', coordinates: [ring] }, properties: { areaSqFt: 0, ...properties }, metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' } }) as Element;
  const bar = (id: string, ring: number[][], over: boolean): Element => el(id, 'building', ring, { floors: 5, stories: 5, use: 'residential', wrapBar: id, overGarage: over, residentialLevels: over ? 3 : 5 });
  const plan: Element[] = [
    bar('front', rect(0, 0, 120, 25), false),
    bar('rear', rect(0, 80, 120, 25), true),
    bar('west', rect(0, 25, 25, 55), true),
    bar('east', rect(95, 25, 25, 55), true),
    el('garage', 'parking', rect(0, 25, 120, 80), { structured: true, levels: 2, stalls: 238, garageEntries: [[X + 124, Y + 60]] }),
    el('court', 'greenspace', rect(30, 30, 60, 45)),
    el('pool', 'building', rect(50, 40, 18, 10), { floors: 1, stories: 1, use: 'amenity' }),
    el('drive', 'circulation', rect(121, -10, 8, 130)),
  ];
  const data = buildMassingData(plan, { style: 'infill' as ArchStyle });
  const deck = 24 * 0.3048;
  const lowest = (id: string) => Math.min(...data.windows.filter(w => w.id === id).flatMap(w => w.polygon.map(q => q[2] ?? 0)));

  it('makes the garage, its bars and what stands on its deck one structure on one floor level', () => {
    expect(data.structures).toHaveLength(1);
    expect([...(data.structures?.[0] ?? [])].sort()).toEqual(['east', 'front', 'garage', 'pool', 'rear', 'west']);
  });

  it('draws the garage as a structure with a deck, and the pool house on the deck', () => {
    const podium = data.slabs.filter(s => s.id === 'garage' && s.part === 'base');
    expect(podium).toHaveLength(1);
    expect(podium[0]!.elevation).toBeGreaterThan(deck - 0.5);
    const pool = data.slabs.filter(s => s.id === 'pool');
    expect(pool.length).toBeGreaterThan(0);
    expect(Math.min(...pool.flatMap(s => s.polygon[0]!.map(q => q[2] ?? 0)))).toBeGreaterThanOrEqual(deck - 0.01);
  });

  it('shows the way in: a portal where the engine puts the garage entry', () => {
    expect(data.slabs.filter(s => s.label === 'Garage entry').length).toBe(4);
  });

  it('puts no apartment windows on the parking levels of a bar that stands over the garage', () => {
    expect(lowest('rear')).toBeGreaterThanOrEqual(deck - 0.5);
    expect(lowest('east')).toBeGreaterThanOrEqual(deck - 0.5);
    // the liner bar on the street has homes from the ground up
    expect(lowest('front')).toBeLessThan(3);
  });

  it('keeps windows off walls that stand against another building and off inside corners', () => {
    // the east bar's court wall runs into the front and rear bars at inside corners: no glass beside them
    const wall = data.toLocal([X + 95, Y + 25]), far = data.toLocal([X + 95, Y + 80]);
    const onCourtWall = data.windows.filter(w => w.id === 'east' && w.polygon.every(q => Math.abs((q[0] ?? 0) - wall[0]!) < 1));
    expect(onCourtWall.length).toBeGreaterThan(0);
    const ys = onCourtWall.flatMap(w => w.polygon.map(q => q[1] ?? 0));
    expect(Math.min(...ys)).toBeGreaterThan(Math.min(wall[1]!, far[1]!) + 3);
    expect(Math.max(...ys)).toBeLessThan(Math.max(wall[1]!, far[1]!) - 3);
    // and its two ends stand against those bars: no glass on them at all
    const beyond = data.windows.filter(w => w.id === 'east' && w.polygon.every(q => (q[1] ?? 0) < Math.min(wall[1]!, far[1]!) + 0.3 || (q[1] ?? 0) > Math.max(wall[1]!, far[1]!) - 0.3));
    expect(beyond).toHaveLength(0);
  });
});
