import { describe, it, expect } from 'vitest';
import { buildArchitecture, hashId, surfaceOf, wallsOf } from './architecture';
import { clearestAzimuth, convexHull, groundShadow } from './renderModel';
import { buildingHeight } from '../scene/heights';
import { METERS_PER_FOOT } from '../../../engine/units';

const rect = (w: number, d: number, x0 = 0, y0 = 0): number[][][] => [[[x0, y0], [x0 + w, y0], [x0 + w, y0 + d], [x0, y0 + d], [x0, y0]]];
const zs = (polys: number[][][]) => polys.flatMap(p => p.map(v => v[2] ?? 0));

describe('walls', () => {
  it('face out of the building and into a court', () => {
    const outer = rect(20, 20)[0] as number[][];
    const court = [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]];
    const walls = wallsOf([outer, court]);
    expect(walls).toHaveLength(8);
    // the south wall of the building faces south; the south wall of the court faces north, into it
    expect(walls[0]?.n).toEqual([0, -1]);
    expect(walls[4]?.n[1]).toBe(1);
  });
});

describe('a house', () => {
  const h = buildingHeight('house', 1);
  const eave = h.aboveGradeFt * METERS_PER_FOOT;
  const street: Array<[number, number]> = [[6, -9], [8, -9], [10, -9]];
  const a = buildArchitecture('lot-7-house', 'House', rect(13, 9), 'house', h, street);

  it('stands on its footprint and its walls stop at the scene height', () => {
    const walls = a.slabs.filter(s => s.part === 'body');
    expect(walls).toHaveLength(1);
    const top = (walls[0]?.polygon[0]?.[0]?.[2] ?? 0) + (walls[0]?.elevation ?? 0);
    expect(top).toBeCloseTo(eave, 6);
    const xs = (walls[0]?.polygon[0] ?? []).map(p => p[0] ?? 0), ys = (walls[0]?.polygon[0] ?? []).map(p => p[1] ?? 0);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 13, 0, 9]);
  });

  it('has a pitched roof, a porch, a door, a garage and windows', () => {
    const roof = a.flats.filter(f => surfaceOf(f.color) === 'shingle');
    expect(roof.length).toBeGreaterThanOrEqual(2);
    // the ridge is above the eave
    expect(Math.max(...zs(roof.map(r => r.polygon)))).toBeGreaterThan(eave + 1);
    expect(a.slabs.filter(s => s.part === 'detail').length).toBeGreaterThanOrEqual(5); // porch floor, step, posts, porch roof, chimney
    expect(a.glass.length).toBeGreaterThanOrEqual(6);
    expect(a.shrubs.length).toBeGreaterThan(0);
  });

  it('turns its porch to the street', () => {
    const porch = a.slabs.filter(s => s.part === 'detail' && (s.polygon[0]?.[0]?.[2] ?? 1) === 0);
    const ys = porch.flatMap(s => (s.polygon[0] ?? []).map(p => p[1] ?? 0));
    // the street is to the south (negative y): the porch reaches out that way and no other
    expect(Math.min(...ys)).toBeLessThan(-1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.001);
    const north = buildArchitecture('lot-7-house', 'House', rect(13, 9), 'house', h, [[6, 18]]);
    const nys = north.slabs.filter(s => s.part === 'detail' && (s.polygon[0]?.[0]?.[2] ?? 1) === 0).flatMap(s => (s.polygon[0] ?? []).map(p => p[1] ?? 0));
    expect(Math.max(...nys)).toBeGreaterThan(10);
  });

  it('keeps its colours between draws and differs from its neighbour', () => {
    const again = buildArchitecture('lot-7-house', 'House', rect(13, 9), 'house', h, street);
    expect(again.slabs.map(s => s.color)).toEqual(a.slabs.map(s => s.color));
    expect(hashId('lot-7-house')).not.toBe(hashId('lot-8-house'));
  });
});

describe('an apartment building', () => {
  const h = buildingHeight('apartments', 4);
  const a = buildArchitecture('bldg-1', 'Apartments', rect(60, 20), 'apartments', h, [[30, -12]]);

  it('has a brick base to the first level, a body to the roof line and a parapet', () => {
    const [base, body, cap] = [a.slabs.find(s => s.part === 'base'), a.slabs.find(s => s.part === 'body'), a.slabs.find(s => s.part === 'parapet')];
    expect(surfaceOf(base?.color ?? [0, 0, 0, 0])).toBe('brick');
    expect(base?.elevation).toBeCloseTo(14 * METERS_PER_FOOT, 6);
    expect((body?.polygon[0]?.[0]?.[2] ?? 0) + (body?.elevation ?? 0)).toBeCloseTo(h.aboveGradeFt * METERS_PER_FOOT, 6);
    expect(cap?.polygon[0]?.[0]?.[2]).toBeCloseTo(h.aboveGradeFt * METERS_PER_FOOT, 6);
  });

  it('has balconies, projecting bays, an entry canopy and roof equipment, all outside or above the walls', () => {
    const details = a.slabs.filter(s => s.part === 'detail');
    expect(details.length).toBeGreaterThan(12);
    // nothing but the roof equipment sits inside the footprint
    for (const d of details) {
      const ring = d.polygon[0] ?? [];
      const inside = ring.every(p => (p[0] ?? 0) > 0.5 && (p[0] ?? 0) < 59.5 && (p[1] ?? 0) > 0.5 && (p[1] ?? 0) < 19.5);
      if (inside) expect(ring[0]?.[2] ?? 0).toBeGreaterThanOrEqual(h.aboveGradeFt * METERS_PER_FOOT - 0.01);
    }
    expect(a.glass.length).toBeGreaterThan(80);
  });

  it('widens its bays when asked, to keep a very large model light', () => {
    const wide = buildArchitecture('bldg-1', 'Apartments', rect(60, 20), 'apartments', h, [], 3);
    expect(wide.glass.length).toBeLessThan(a.glass.length / 2);
  });
});

describe('ground shadows', () => {
  it('is the hull of the footprint and the footprint moved down-sun', () => {
    const ring = rect(10, 10)[0] as number[][];
    // sun in the south-west at 45 degrees: the shadow reaches north-east by the height
    const s = Math.SQRT1_2;
    const shadow = groundShadow(ring, 6, [s * s, s * s, -s]) as number[][];
    const xs = shadow.map(p => p[0] ?? 0), ys = shadow.map(p => p[1] ?? 0);
    expect(Math.max(...xs)).toBeCloseTo(10 + 6 * s, 3);
    expect(Math.max(...ys)).toBeCloseTo(10 + 6 * s, 3);
    expect(Math.min(...xs)).toBe(0);
    expect(groundShadow(ring, 6, [0, 0, 0.2])).toBeNull();
  });

  it('finds a convex hull', () => {
    expect(convexHull([[0, 0], [2, 0], [1, 0.2], [2, 2], [0, 2], [1, 1]])).toHaveLength(4);
  });
});

describe('the aerial camera', () => {
  it('looks from the diagonal the neighbours block least', () => {
    // a tall neighbour to the south-west, where the default view stands
    const a = (-38 * Math.PI) / 180;
    const sw: [number, number, number] = [Math.sin(a) * 60, -Math.cos(a) * 60, 20];
    expect(clearestAzimuth([], 80)).toBe(-38);
    expect(clearestAzimuth([sw], 80)).not.toBe(-38);
    // far neighbours and ones on the site itself do not count
    expect(clearestAzimuth([[sw[0] * 4, sw[1] * 4, 20], [1, 1, 20]], 80)).toBe(-38);
  });
});
