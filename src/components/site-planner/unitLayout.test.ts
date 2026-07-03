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
  { type: 'studio', count: 6, avgSqft: 450 },
  { type: '1br', count: 24, avgSqft: 650 },
  { type: '2br', count: 21, avgSqft: 900 },
  { type: '3br', count: 9, avgSqft: 1200 },
];

describe('computeFloorplate', () => {
  it('slices a bar into typed units on two banks with end cores', () => {
    const fp = computeFloorplate(bar(), mix, 3);
    expect(fp.cores).toHaveLength(2);
    expect(fp.units.length).toBeGreaterThan(6);
    // Only known types, each with a color + label
    for (const u of fp.units) {
      expect(UNIT_COLORS[u.type]).toBeDefined();
      expect(['S', 'A', 'B', 'C']).toContain(u.label);
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

  it('never renders more units per type than the per-floor mix', () => {
    const fp = computeFloorplate(bar(), mix, 3);
    const byType: Record<string, number> = {};
    for (const u of fp.units) byType[u.type] = (byType[u.type] ?? 0) + 1;
    expect(byType['studio'] ?? 0).toBeLessThanOrEqual(Math.round(6 / 3));
    expect(byType['1br'] ?? 0).toBeLessThanOrEqual(Math.round(24 / 3));
    expect(byType['2br'] ?? 0).toBeLessThanOrEqual(Math.round(21 / 3));
    expect(byType['3br'] ?? 0).toBeLessThanOrEqual(Math.round(9 / 3));
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
