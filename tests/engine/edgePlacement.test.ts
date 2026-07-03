import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { placeBarsAlongEdges } from '../../src/engine/edgePlacement';
import { buildBuildingFootprint } from '../../src/engine/buildingGeometry';
import { areaM2, intersection, isPointInPolygon, polygons } from '../../src/engine/geometry';

const rect = (w: number, h: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[0, 0], [w, 0], [w, h], [0, h], [0, 0]]],
});

const overlap = (a: Polygon, b: Polygon) =>
  polygons(intersection(a, b)).reduce((s, p) => s + areaM2(p), 0);

describe('placeBarsAlongEdges', () => {
  it('hugs the longest edge: parallel, inset by margin + depth/2', () => {
    const env = rect(160, 80);
    const bars = placeBarsAlongEdges(env, { widthM: 60, depthM: 18, count: 2, marginM: 1, gapM: 6 });
    expect(bars.length).toBe(2);
    for (const b of bars) {
      // Parallel to a horizontal edge (the 160m frontage)
      expect(Math.abs(Math.sin(b.rotationRad))).toBeLessThan(1e-6);
      // Flush: anchor sits margin + depth/2 = 10m off an edge (y=10 or y=70)
      const offEdge = Math.min(b.anchor.y, 80 - b.anchor.y);
      expect(offEdge).toBeCloseTo(10, 6);
    }
  });

  it('every placement is inside the envelope and overlap-free', () => {
    const env = rect(200, 120);
    const bars = placeBarsAlongEdges(env, { widthM: 61, depthM: 18, count: 6 });
    expect(bars.length).toBeGreaterThanOrEqual(3);
    const fps = bars.map(b => buildBuildingFootprint(b));
    for (const fp of fps) {
      for (const [x, y] of fp.coordinates[0]) {
        expect(isPointInPolygon([x, y], env.coordinates[0])).toBe(true);
      }
    }
    for (let i = 0; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        expect(overlap(fps[i], fps[j])).toBeLessThan(0.5);
      }
    }
  });

  it('caps at what legally fits and returns fewer than requested', () => {
    const env = rect(70, 25); // room for exactly one 60x18 bar
    const bars = placeBarsAlongEdges(env, { widthM: 60, depthM: 18, count: 5 });
    expect(bars.length).toBe(1);
  });

  it('avoids user-pinned footprints', () => {
    const env = rect(160, 80);
    const first = placeBarsAlongEdges(env, { widthM: 60, depthM: 18, count: 1 });
    const pinnedFp = buildBuildingFootprint(first[0]);
    const bars = placeBarsAlongEdges(env, {
      widthM: 60, depthM: 18, count: 4, avoidFootprints: [pinnedFp],
    });
    for (const b of bars) {
      expect(overlap(buildBuildingFootprint(b), pinnedFp)).toBeLessThan(0.5);
    }
  });

  it('works on non-rectangular (L-shaped) envelopes', () => {
    const L: Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [140, 0], [140, 50], [60, 50], [60, 120], [0, 120], [0, 0]]],
    };
    const bars = placeBarsAlongEdges(L, { widthM: 50, depthM: 16, count: 4 });
    expect(bars.length).toBeGreaterThanOrEqual(2);
    for (const b of bars) {
      const fp = buildBuildingFootprint(b);
      for (const [x, y] of fp.coordinates[0]) {
        expect(isPointInPolygon([x, y], L.coordinates[0])).toBe(true);
      }
    }
  });

  it('fills short/jagged frontages with variable-width bars (real-parcel sliver)', () => {
    // ~200m × 30m sliver whose long edges are broken into short survey
    // segments — the shape that previously fell through to a single tiny
    // centred fallback building ("9k SF on 3 acres").
    const sliver: Polygon = {
      type: 'Polygon',
      coordinates: [[
        [0, 0], [42, 1], [85, 0], [128, 2], [170, 1], [200, 0],
        [200, 30], [165, 29], [120, 31], [80, 30], [40, 31], [0, 30],
        [0, 0],
      ]],
    };
    const bars = placeBarsAlongEdges(sliver, { widthM: 61, depthM: 18, count: 6 });
    expect(bars.length).toBeGreaterThanOrEqual(2);
    // Variable widths: bars size themselves to the frontage
    expect(bars.some(b => b.widthM < 61)).toBe(true);
    for (const b of bars) {
      const fp = buildBuildingFootprint(b);
      for (const [x, y] of fp.coordinates[0]) {
        expect(isPointInPolygon([x, y], sliver.coordinates[0])).toBe(true);
      }
    }
  });

  it('is deterministic and handles degenerate input', () => {
    const env = rect(160, 80);
    const a = placeBarsAlongEdges(env, { widthM: 60, depthM: 18, count: 3 });
    const b = placeBarsAlongEdges(env, { widthM: 60, depthM: 18, count: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(placeBarsAlongEdges({ type: 'Polygon', coordinates: [[]] }, { widthM: 60, depthM: 18, count: 3 })).toEqual([]);
  });
});
