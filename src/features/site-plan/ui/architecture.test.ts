import { describe, it, expect } from 'vitest';
import { ARCH_STYLES, buildArchitecture, hashId, isArchStyle, wallsOf, type ArchStyle, type Architecture } from './architecture';
import { apronOn } from './architecture/house';
import { insetRing, ringWalls } from './architecture/kit';
import { clearestAzimuth, convexHull, groundShadow, type RenderSlab } from './renderModel';
import { buildingHeight } from '../scene/heights';
import { METERS_PER_FOOT } from '../../../engine/units';

const rect = (w: number, d: number, x0 = 0, y0 = 0): number[][][] => [[[x0, y0], [x0 + w, y0], [x0 + w, y0 + d], [x0, y0 + d], [x0, y0]]];
const STYLES = ARCH_STYLES.map(s => s.key);
const top = (s: RenderSlab) => (s.polygon[0]?.[0]?.[2] ?? 0) + s.elevation;
const walls = (a: Architecture) => a.slabs.filter(s => s.part === 'base' || s.part === 'body');
const solid = (a: Architecture) => a.slabs.filter(s => s.part !== 'detail');
const span = (slabs: RenderSlab[]) => {
  const xs = slabs.flatMap(s => s.polygon.flatMap(r => r.map(p => p[0] ?? 0))), ys = slabs.flatMap(s => s.polygon.flatMap(r => r.map(p => p[1] ?? 0)));
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(v => Math.round(v * 1000) / 1000);
};
const surfaces = (a: Architecture) => new Set([...a.slabs, ...a.flats].map(p => p.surface ?? 'plain'));
/** A street to the south of the pad, and a drive from it to the given stretch of the front wall. */
const street = (from: number, to: number): Array<[number, number]> => [[2, -9], [6, -9], [10, -9], [from, 0], [to, 0], [from, -4], [to, -4], [from, -8], [to, -8]];

describe('walls', () => {
  it('face out of the building and into a court', () => {
    const outer = rect(20, 20)[0] as number[][];
    const court = [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]];
    const w = wallsOf([outer, court]);
    expect(w).toHaveLength(8);
    // the south wall of the building faces south; the south wall of the court faces north, into it
    expect(w[0]?.n).toEqual([0, -1]);
    expect(w[4]?.n[1]).toBe(1);
  });

  it('draw a ring in from its walls, and out from a court', () => {
    const inner = insetRing(ringWalls(rect(10, 6)[0] as number[][]), 1);
    expect(inner.map(p => p.map(v => Math.round(v * 1000) / 1000))).toEqual([[1, 1], [9, 1], [9, 5], [1, 5]]);
    const grown = insetRing(ringWalls([[4, 2], [6, 2], [6, 4], [4, 4], [4, 2]], true), 0.5);
    expect(span([{ id: 'x', building: true, polygon: [grown], elevation: 1, color: [0, 0, 0, 0], part: 'detail', label: '' }])).toEqual([3.5, 6.5, 1.5, 4.5]);
  });
});

describe('a style', () => {
  it('is one of four, and anything else is not a style', () => {
    expect(STYLES).toEqual(['mansard', 'farmhouse', 'modern', 'heritage']);
    expect(isArchStyle('modern')).toBe(true);
    expect(isArchStyle('castle')).toBe(false);
    expect(isArchStyle(null)).toBe(false);
  });
});

describe.each(STYLES)('a house in the %s style', style => {
  it.each([1, 2])('with %i stories stands on its pad and stops at the scene height', floors => {
    const h = buildingHeight('house', floors);
    const zT = h.aboveGradeFt * METERS_PER_FOOT;
    const a = buildArchitecture('lot-7-house', 'House', rect(12.2, 14), 'house', h, street(1, 6), 1, style);
    // the walls and the mansard keep to the pad, and between them cover it
    expect(span(solid(a))).toEqual([0, 12.2, 0, 14]);
    // a mansard takes the top story: the walls stop a story lower and the top of the mansard is the stated height
    const mansard = style === 'mansard' && floors >= 2;
    expect(Math.max(...walls(a).map(top))).toBeCloseTo(mansard ? (h.levelsFt[floors - 2] ?? 0) * METERS_PER_FOOT : zT, 6);
    if (mansard) expect(Math.max(...a.slabs.filter(s => s.part === 'parapet').map(top))).toBeCloseTo(zT, 6);
    expect(a.glass.length).toBeGreaterThanOrEqual(8);
    expect(a.shrubs.length).toBeGreaterThan(0);
    // a roof: pitched planes above the walls, or a flat one
    const above = a.flats.filter(f => f.polygon.some(p => (p[2] ?? 0) > zT + 0.5));
    if (style === 'modern' || mansard) expect(above).toHaveLength(0);
    else expect(above.length).toBeGreaterThanOrEqual(2);
  });

  it('turns its door to the street and puts its block where the drive arrives', () => {
    const h = buildingHeight('house', 1);
    const left = buildArchitecture('lot-7-house', 'House', rect(12.2, 14), 'house', h, street(1, 6), 1, style);
    // the walk from the door reaches the street to the south; nothing reaches as far to the north
    const flatwork = (a: Architecture) => a.slabs.filter(s => s.part === 'detail' && (s.polygon[0]?.[0]?.[2] ?? 1) === 0);
    const ys = flatwork(left).flatMap(s => (s.polygon[0] ?? []).map(p => p[1] ?? 0));
    expect(Math.min(...ys)).toBeLessThan(-6);
    expect(Math.max(...ys)).toBeLessThan(14 + 4);
    const north = buildArchitecture('lot-7-house', 'House', rect(12.2, 14), 'house', h, [[2, 23], [6, 23], [10, 23]], 1, style);
    expect(Math.max(...flatwork(north).flatMap(s => (s.polygon[0] ?? []).map(p => p[1] ?? 0)))).toBeGreaterThan(14 + 6);
    // the windows of the front's ground story lie to the side the drive does not: the garage has taken the other
    const frontGlass = (a: Architecture) => a.glass.filter(g => g.polygon.every(p => (p[1] ?? 9) < 2.5 && (p[2] ?? 9) < 2.6) && g.polygon.some(p => (p[2] ?? 9) < 1.3));
    const cx = (a: Architecture) => { const xs = frontGlass(a).flatMap(g => g.polygon.map(p => p[0] ?? 0)); return xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length); };
    const right = buildArchitecture('lot-7-house', 'House', rect(12.2, 14), 'house', h, street(6.5, 11.5), 1, style);
    if (style !== 'mansard') {
      expect(cx(left)).toBeGreaterThan(6.1);
      expect(cx(right)).toBeLessThan(6.1);
    }
  });

  it('keeps its look between draws', () => {
    const h = buildingHeight('house', 2);
    const one = buildArchitecture('lot-7-house', 'House', rect(12.2, 14), 'house', h, street(1, 6), 1, style);
    const two = buildArchitecture('lot-7-house', 'House', rect(12.2, 14), 'house', h, street(1, 6), 1, style);
    expect(two).toEqual(one);
    expect(hashId('lot-7-house')).not.toBe(hashId('lot-8-house'));
  });
});

describe('houses', () => {
  it('differ by style in what they are built of', () => {
    const h = buildingHeight('house', 2);
    const of = (style: ArchStyle) => surfaces(buildArchitecture('lot-7-house', 'House', rect(12.2, 14), 'house', h, street(1, 6), 1, style));
    expect(of('mansard').has('brick')).toBe(true);
    expect(of('mansard').has('shingle')).toBe(true);
    expect(of('farmhouse').has('batten')).toBe(true);
    expect(of('farmhouse').has('metal')).toBe(true);
    expect(of('modern').has('plaster') || of('modern').has('panel')).toBe(true);
    expect(of('modern').has('wood')).toBe(true);
    expect(of('modern').has('shingle')).toBe(false);
    expect(of('heritage').has('siding')).toBe(true);
    expect(of('heritage').has('brick')).toBe(true);
  });

  it('find where a drive comes to the front wall', () => {
    const front = wallsOf(rect(12.2, 14))[0];
    if (!front) throw new Error('no wall');
    expect(apronOn(front, street(1, 6))).toEqual([1, 6]);
    // a street that passes the house is not a drive to it
    expect(apronOn(front, [[2, -9], [6, -9], [10, -9]])).toBeNull();
  });

  it('fall back to a plain building on a pad that is not a rectangle', () => {
    const ell = [[[0, 0], [12, 0], [12, 6], [6, 6], [6, 12], [0, 12], [0, 0]]];
    const a = buildArchitecture('odd', 'House', ell, 'house', buildingHeight('house', 2), [], 1, 'farmhouse');
    expect(span(solid(a))).toEqual([0, 12, 0, 12]);
    expect(a.glass.length).toBeGreaterThan(4);
  });
});

describe.each(STYLES)('a row home in the %s style', style => {
  const h = buildingHeight('townhome', 3);
  const zT = h.aboveGradeFt * METERS_PER_FOOT;
  const home = rect(6.1, 12.2, 6.1, 0);
  const neighbours = [rect(6.1, 12.2, 0, 0)[0] as number[][], rect(6.1, 12.2, 12.2, 0)[0] as number[][]];
  const alley: Array<[number, number]> = [[6, 16], [9, 16], [12, 16]];
  const mid = buildArchitecture('home-2', 'Townhome', home, 'townhome', h, alley, 1, style, neighbours);
  const sideGlass = (a: Architecture) => a.glass.filter(g => g.polygon.every(p => (p[1] ?? 0) > 1 && (p[1] ?? 0) < 11.2 && ((p[0] ?? 0) < 6.3 || (p[0] ?? 0) > 12.0) && (p[2] ?? 0) < zT));

  it('stands on its footprint and has glass at both ends', () => {
    expect(span(solid(mid))).toEqual([6.1, 12.2, 0, 12.2]);
    expect(mid.glass.some(g => g.polygon.every(p => (p[1] ?? 0) < 0.2))).toBe(true);
    expect(mid.glass.some(g => g.polygon.every(p => (p[1] ?? 0) > 12))).toBe(true);
  });

  it('has party walls where neighbours stand, and windows where it ends the row', () => {
    expect(sideGlass(mid)).toHaveLength(0);
    const end = buildArchitecture('home-2', 'Townhome', home, 'townhome', h, alley, 1, style, neighbours.slice(0, 1));
    expect(sideGlass(end).length).toBeGreaterThan(0);
    expect(sideGlass(end).every(g => g.polygon.every(p => (p[0] ?? 0) > 12))).toBe(true);
  });
});

describe.each(STYLES)('an apartment building in the %s style', style => {
  const h = buildingHeight('apartments', 4);
  const zT = h.aboveGradeFt * METERS_PER_FOOT;
  const a = buildArchitecture('bldg-1', 'Apartments', rect(60, 20), 'apartments', h, [[30, -12]], 1, style);

  it('has a base to the first level, and walls or a mansard to the roof line', () => {
    const base = a.slabs.find(s => s.part === 'base');
    expect(base?.elevation).toBeCloseTo(14 * METERS_PER_FOOT, 6);
    expect(span(solid(a))).toEqual([0, 60, 0, 20]);
    if (style === 'mansard') {
      expect(Math.max(...walls(a).map(top))).toBeCloseTo((h.levelsFt[2] ?? 0) * METERS_PER_FOOT, 6);
      expect(Math.max(...a.slabs.filter(s => s.part === 'parapet').map(top))).toBeCloseTo(zT, 6);
    } else {
      expect(Math.max(...walls(a).map(top))).toBeCloseTo(zT, 6);
      // the parapet stands on the roof line
      expect(Math.min(...a.slabs.filter(s => s.part === 'parapet').map(s => s.polygon[0]?.[0]?.[2] ?? 0))).toBeCloseTo(zT, 6);
    }
  });

  it('has balconies with railings, an entrance, planting and roof equipment', () => {
    expect([...a.flats].filter(f => f.surface === 'railing' || f.surface === 'glassrail').length).toBeGreaterThan(6);
    expect(a.glass.length).toBeGreaterThan(150);
    expect(a.shrubs.length).toBeGreaterThan(10);
    // nothing but what is on the roof sits inside the footprint
    for (const d of a.slabs.filter(s => s.part === 'detail')) {
      const ring = d.polygon[0] ?? [];
      const inside = ring.every(p => (p[0] ?? 0) > 1.2 && (p[0] ?? 0) < 58.8 && (p[1] ?? 0) > 1.2 && (p[1] ?? 0) < 18.8);
      if (inside) expect(ring[0]?.[2] ?? 0).toBeGreaterThanOrEqual((style === 'mansard' ? (h.levelsFt[2] ?? 0) * METERS_PER_FOOT : zT) - 0.2);
    }
  });

  it('widens its bays and draws its openings plainly when asked, to keep a very large model light', () => {
    const wide = buildArchitecture('bldg-1', 'Apartments', rect(60, 20), 'apartments', h, [], 3, style);
    expect(wide.glass.length).toBeLessThan(a.glass.length / 2);
    expect(wide.slabs.length).toBeLessThan(a.slabs.length / 4);
  });

  it('keeps a court open', () => {
    const court = [[20, 6], [40, 6], [40, 14], [20, 14], [20, 6]];
    const b = buildArchitecture('bldg-2', 'Apartments', [rect(60, 20)[0] as number[][], court], 'apartments', h, [], 1, style);
    // no roof, cap or wall covers the middle of the court
    const covers = (s: RenderSlab) => {
      const outer = s.polygon[0] ?? [];
      const xs = outer.map(p => p[0] ?? 0), ys = outer.map(p => p[1] ?? 0);
      const over = Math.min(...xs) < 29 && Math.max(...xs) > 31 && Math.min(...ys) < 9 && Math.max(...ys) > 11;
      const holed = s.polygon.slice(1).some(r => { const hx = r.map(p => p[0] ?? 0), hy = r.map(p => p[1] ?? 0); return Math.min(...hx) < 29 && Math.max(...hx) > 31 && Math.min(...hy) < 9 && Math.max(...hy) > 11; });
      return over && !holed;
    };
    expect(b.slabs.filter(covers)).toHaveLength(0);
  });
});

describe('a clubhouse', () => {
  it.each(STYLES)('is a pavilion on its pad in the %s style', style => {
    const h = buildingHeight('amenity', 1);
    const a = buildArchitecture('club', 'Clubhouse', rect(18, 12), 'amenity', h, [[9, -8]], 1, style);
    expect(span(solid(a))).toEqual([0, 18, 0, 12]);
    expect(Math.max(...walls(a).map(top))).toBeCloseTo(h.aboveGradeFt * METERS_PER_FOOT, 6);
    expect(a.glass.length).toBeGreaterThan(8);
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
