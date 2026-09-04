import { describe, it, expect } from 'vitest';
import { computeFloorplate, UNIT_COLORS } from './unitLayout';

// 61×18m bar (200×60ft), axis-aligned, closed ring
const bar = (w = 61, d = 18, x0 = 0, y0 = 0) => [
  [x0, y0],
  [x0 + w, y0],
  [x0 + w, y0 + d],
  [x0, y0 + d],
  [x0, y0],
];

const mix = [
  { type: 'studio', count: 6, avgSqft: 550 },
  { type: '1br', count: 24, avgSqft: 700 },
  { type: '2br', count: 21, avgSqft: 1100 },
  { type: '3br', count: 9, avgSqft: 1600 },
];

const SQFT_PER_SQM = 10.7639;

describe('computeFloorplate', () => {
  it('slices a bar into typed units on two banks with end cores', () => {
    const fp = computeFloorplate(bar(), mix, 3);
    expect(fp.cores).toHaveLength(2);
    expect(fp.units.length).toBeGreaterThan(6);
    // Only known types, each with a color + label
    for (const u of fp.units) {
      expect(UNIT_COLORS[u.type]).toBeDefined();
      expect(['Studio', '1 Bed', '2 Bed', '3 Bed']).toContain(u.label);
    }
    // All unit geometry stays inside the footprint bbox
    for (const u of fp.units) {
      for (const [x, y] of u.ring) {
        expect(x).toBeGreaterThanOrEqual(-1e-6);
        expect(x).toBeLessThanOrEqual(61 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeLessThanOrEqual(18 + 1e-6);
      }
    }
  });

  it('draws each unit at its fixed per-type area (proportional sizing)', () => {
    const fp = computeFloorplate(bar(), mix, 3);
    const bySqft: Record<string, number> = { studio: 550, '1br': 700, '2br': 1100, '3br': 1600 };
    for (const u of fp.units) {
      const xs = u.ring.map(p => p[0]);
      const ys = u.ring.map(p => p[1]);
      const areaSqft =
        (Math.max(...xs) - Math.min(...xs)) *
        (Math.max(...ys) - Math.min(...ys)) *
        SQFT_PER_SQM;
      // Within 10% of the type's nominal size (MIN_UNIT_W can pad narrow types)
      expect(areaSqft).toBeGreaterThan(bySqft[u.type] * 0.9);
      expect(areaSqft).toBeLessThan(bySqft[u.type] * 1.1);
    }
  });

  it('re-fills dynamically: a longer bar yields more units, a shorter bar fewer', () => {
    const base = computeFloorplate(bar(61), mix, 3).units.length;
    const longer = computeFloorplate(bar(100), mix, 3).units.length;
    const shorter = computeFloorplate(bar(35), mix, 3).units.length;
    expect(longer).toBeGreaterThan(base);
    expect(shorter).toBeLessThan(base);
  });

  it('keeps roughly the mix proportions when filling a long bar', () => {
    const fp = computeFloorplate(bar(160), mix, 3);
    const byType: Record<string, number> = {};
    for (const u of fp.units) byType[u.type] = (byType[u.type] ?? 0) + 1;
    // 1br has the largest share of the mix (24 of 60) — it should dominate
    expect(byType['1br'] ?? 0).toBeGreaterThanOrEqual(byType['studio'] ?? 0);
    expect(byType['1br'] ?? 0).toBeGreaterThanOrEqual(byType['3br'] ?? 0);
    // Every type in the mix shows up on a bar this long
    for (const t of ['studio', '1br', '2br', '3br']) {
      expect(byType[t] ?? 0).toBeGreaterThan(0);
    }
  });

  it('units within a bank never overlap (disjoint x-ranges)', () => {
    const fp = computeFloorplate(bar(), mix, 3);
    // Group by bank via y of first corner (top bank y >= 9, bottom < 9)
    const banks: Record<string, Array<[number, number]>> = { top: [], bottom: [] };
    for (const u of fp.units) {
      const xs = u.ring.map(p => p[0]);
      const ys = u.ring.map(p => p[1]);
      const key = Math.min(...ys) >= 9 ? 'top' : 'bottom';
      banks[key].push([Math.min(...xs), Math.max(...xs)]);
    }
    for (const spans of Object.values(banks)) {
      spans.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1e-6);
      }
    }
  });

  it('handles rotation: unit rings follow the bar angle', () => {
    const rot = (deg: number) => ([x, y]: number[]) => {
      const r = (deg * Math.PI) / 180;
      return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
    };
    const fp = computeFloorplate(bar().map(rot(35)), mix, 3);
    expect(fp.units.length).toBeGreaterThan(4);
    // A unit's long edge should be perpendicular-ish to the 35° axis — just
    // sanity-check geometry is finite and closed.
    for (const u of fp.units) {
      expect(u.ring[0]).toEqual(u.ring[u.ring.length - 1]);
      for (const [x, y] of u.ring) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
  });

  it('fails soft on degenerate input', () => {
    expect(computeFloorplate([], mix, 3).units).toHaveLength(0);
    expect(computeFloorplate(bar(), undefined, 3).units).toHaveLength(0);
    expect(computeFloorplate(bar(4, 3), mix, 3).units).toHaveLength(0); // too small
    expect(computeFloorplate(bar(), [], 3).units).toHaveLength(0);
  });
});

// 2026-09-04 (Eric, 2622 W Heiman): the plate is the BARS of the footprint,
// not the bounding box of the whole shape.
describe('computeFloorplate — bars of an L, E, or slab', () => {
  const dims = (u: { ring: number[][] }): [number, number] => {
    const xs = u.ring.map(p => p[0]);
    const ys = u.ring.map(p => p[1]);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  // a 20 m bar: (20 − 1.7 m corridor) / 2 = 9.15 m banks
  const BANK = (20 - 1.7) / 2;
  // an E: a 20 m spine 100 m tall with three 20 m arms
  const E = [[0, 0], [100, 0], [100, 20], [20, 20], [20, 40], [80, 40], [80, 60], [20, 60], [20, 80], [90, 80], [90, 100], [0, 100], [0, 0]];
  // an L: a 20 × 70 spine with an 80 m arm
  const L = [[0, 0], [80, 0], [80, 20], [20, 20], [20, 70], [0, 70], [0, 0]];

  it('reads an E as a spine and three arms, each with its own corridor', () => {
    const fp = computeFloorplate(E, mix, 3);
    expect(fp.bars).toHaveLength(4);
    expect(fp.corridors).toHaveLength(4);
    // cores at the free ends only: two on the spine, one on each arm's far end
    expect(fp.cores).toHaveLength(5);
    // every unit is exactly a bank deep (across its bar) and a type wide along
    // it — never a 100 m sliver across the whole shape
    for (const u of fp.units) {
      const [w, h] = dims(u);
      const deep = Math.abs(w - BANK) < 0.05 ? h : Math.abs(h - BANK) < 0.05 ? w : null;
      expect(deep).not.toBeNull();
      expect(deep as number).toBeGreaterThanOrEqual(3);
      expect(deep as number).toBeLessThan(20);
    }
    expect(fp.units.length).toBeGreaterThan(20);
  });

  it('reads an L as two bars and skips the core at the junction', () => {
    const fp = computeFloorplate(L, mix, 3);
    expect(fp.bars).toHaveLength(2);
    expect(fp.corridors).toHaveLength(2);
    expect(fp.cores).toHaveLength(3);
  });

  it('a corridor runs along each bar, not across the courtyard', () => {
    const fp = computeFloorplate(E, mix, 3);
    // the spine's corridor is vertical at x = 10; the arms' are horizontal at y = 10 / 50 / 90
    const vertical = fp.corridors.filter(([a, b]) => Math.abs(a[0] - b[0]) < 1e-6);
    const horizontal = fp.corridors.filter(([a, b]) => Math.abs(a[1] - b[1]) < 1e-6);
    expect(vertical).toHaveLength(1);
    expect(Math.abs(vertical[0][0][0] - 10)).toBeLessThan(1e-6);
    expect(horizontal.map(([a]) => Math.round(a[1])).sort((p, q) => p - q)).toEqual([10, 50, 90]);
  });

  it('units of a plain bar are bank-deep and type-wide', () => {
    const fp = computeFloorplate(bar(61, 20), mix, 3);
    expect(fp.bars).toHaveLength(1);
    for (const u of fp.units) {
      const [w, h] = dims(u);
      expect(h).toBeCloseTo(BANK, 1);
      expect(w).toBeGreaterThanOrEqual(3);
    }
  });

  it('a slanted footprint still yields one bar of units', () => {
    const para = [[0, 0], [61, 0], [71, 18], [10, 18], [0, 0]];
    const fp = computeFloorplate(para, mix, 3);
    expect(fp.bars).toHaveLength(1);
    expect(fp.units.length).toBeGreaterThan(4);
  });
});
