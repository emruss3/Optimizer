import { describe, it, expect } from 'vitest';
import {
  longestEdgeAngle,
  computeUnitTicks,
  corridorLine,
  edgeDimensions,
  pickScaleBarFt,
  setbackLabelIndices,
  PLAN_Z_ORDER,
  sortByZOrder,
  pointsAlongSegment,
  computeCurbCut,
} from './planRendering';

// Closed 40×20 rectangle, long axis along X
const rect40x20 = [
  [0, 0],
  [40, 0],
  [40, 20],
  [0, 20],
  [0, 0],
];

// Same rectangle rotated 30°
const rot = (deg: number) => (p: number[]) => {
  const r = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(r) - p[1] * Math.sin(r), p[0] * Math.sin(r) + p[1] * Math.cos(r)];
};
const rect40x20r30 = rect40x20.map(rot(30));

describe('longestEdgeAngle', () => {
  it('finds the long axis of an axis-aligned bar', () => {
    expect(Math.abs(Math.cos(longestEdgeAngle(rect40x20)))).toBeCloseTo(1, 6);
  });

  it('follows the bar when rotated', () => {
    const a = longestEdgeAngle(rect40x20r30);
    expect(((a * 180) / Math.PI + 360) % 180).toBeCloseTo(30, 4);
  });
});

describe('computeUnitTicks', () => {
  it('spaces ticks along the long axis and spans the short axis', () => {
    const ticks = computeUnitTicks(rect40x20, 8);
    // 40 / 8 = 5 bays → 4 interior ticks
    expect(ticks).toHaveLength(4);
    for (const [[x1, y1], [x2, y2]] of ticks) {
      expect(x1).toBeCloseTo(x2, 6); // vertical (perpendicular to long axis)
      expect(Math.abs(y2 - y1)).toBeCloseTo(20, 6); // spans the short dimension
    }
    expect(ticks[0][0][0]).toBeCloseTo(8, 6);
    expect(ticks[3][0][0]).toBeCloseTo(32, 6);
  });

  it('tick length is preserved under rotation', () => {
    const ticks = computeUnitTicks(rect40x20r30, 8);
    expect(ticks).toHaveLength(4);
    for (const [[x1, y1], [x2, y2]] of ticks) {
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(20, 4);
    }
  });

  it('returns nothing for degenerate input', () => {
    expect(computeUnitTicks([[0, 0], [1, 1]], 8)).toHaveLength(0);
    expect(computeUnitTicks(rect40x20, 0)).toHaveLength(0);
  });
});

describe('corridorLine', () => {
  it('runs the full long axis at mid-depth', () => {
    const line = corridorLine(rect40x20)!;
    const [[x1, y1], [x2, y2]] = line;
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(40, 6);
    expect(y1).toBeCloseTo(10, 6);
    expect(y2).toBeCloseTo(10, 6);
  });
});

describe('edgeDimensions', () => {
  it('returns width and depth callouts offset outward', () => {
    const dims = edgeDimensions(rect40x20, 3);
    expect(dims).toHaveLength(2);
    expect(dims[0].lengthM).toBeCloseTo(40, 6);
    expect(dims[1].lengthM).toBeCloseTo(20, 6);
    // Edge 0 runs along y=0; its callout must sit BELOW the rectangle (y=-3),
    // i.e. away from the centroid at (20,10).
    expect(dims[0].labelAt[1]).toBeCloseTo(-3, 6);
    // Edge 1 runs along x=40; its callout must sit to the RIGHT (x=43).
    expect(dims[1].labelAt[0]).toBeCloseTo(43, 6);
  });
});

describe('pickScaleBarFt', () => {
  it('picks the largest nice length that fits', () => {
    // 1 px/m: 50ft = 15.24px, 400ft = 121.9px, 800ft = 243.8px → 400
    expect(pickScaleBarFt(1).ft).toBe(400);
    // 10 px/m: 50ft = 152px > 140 → 20ft = 61px... 20*0.3048*10=60.96 ✓, 50 too big
    expect(pickScaleBarFt(10).ft).toBe(20);
  });

  it('falls back to the smallest candidate when zoomed far in', () => {
    expect(pickScaleBarFt(1000).ft).toBe(10);
  });
});

describe('setbackLabelIndices (one label per bearing group)', () => {
  it('collapses collinear side segments into a single label', () => {
    const edges = [
      { type: 'side', edge: [[0, 0], [0, 10]] as [[number, number], [number, number]] },
      { type: 'side', edge: [[0, 10], [0, 18]] as [[number, number], [number, number]] },
      { type: 'side', edge: [[0.5, 18], [0.5, 40]] as [[number, number], [number, number]] }, // longest
      { type: 'front', edge: [[0, 0], [50, 0]] as [[number, number], [number, number]] },
    ];
    const labeled = setbackLabelIndices(edges);
    expect(labeled.size).toBe(2); // one side label + one front label
    expect(labeled.has(2)).toBe(true); // the longest side segment carries it
    expect(labeled.has(3)).toBe(true);
  });

  it('labels perpendicular sides separately (different bearing groups)', () => {
    const edges = [
      { type: 'side', edge: [[0, 0], [0, 30]] as [[number, number], [number, number]] },
      { type: 'side', edge: [[0, 30], [40, 30]] as [[number, number], [number, number]] },
    ];
    expect(setbackLabelIndices(edges).size).toBe(2);
  });
});

describe('PLAN_Z_ORDER contract', () => {
  it('buildings above parking above circulation above greenspace', () => {
    expect(PLAN_Z_ORDER.building).toBeGreaterThan(PLAN_Z_ORDER.parking);
    expect(PLAN_Z_ORDER.parking).toBeGreaterThan(PLAN_Z_ORDER.circulation);
    expect(PLAN_Z_ORDER.circulation).toBeGreaterThan(PLAN_Z_ORDER.greenspace);
    expect(PLAN_Z_ORDER.other).toBeLessThan(PLAN_Z_ORDER.greenspace);
  });
  it('sortByZOrder is stable and total', () => {
    const sorted = sortByZOrder([
      { type: 'building' }, { type: 'greenspace' }, { type: 'parking' }, { type: 'unknown-type' },
    ]);
    expect(sorted.map(s => s.type)).toEqual(['greenspace', 'parking', 'building', 'unknown-type']);
  });
});

describe('street-connection helpers', () => {
  it('pointsAlongSegment spaces trees inside the insets', () => {
    const pts = pointsAlongSegment([[0, 0], [100, 0]], 10, 5);
    expect(pts.length).toBeGreaterThanOrEqual(8);
    for (const [x] of pts) {
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThanOrEqual(95);
    }
  });

  it('computeCurbCut finds the boundary point where the drive touches', () => {
    const parcel = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const drive = [[45, 0.5], [55, 0.5], [55, 40], [45, 40], [45, 0.5]];
    const cut = computeCurbCut(drive, parcel);
    expect(cut).not.toBeNull();
    expect(cut!.at[1]).toBeCloseTo(0, 5);
    expect(cut!.at[0]).toBeGreaterThan(40);
    expect(cut!.at[0]).toBeLessThan(60);
  });

  it('no curb cut when the drive dead-ends far from the boundary', () => {
    const parcel = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const drive = [[45, 30], [55, 30], [55, 60], [45, 60], [45, 30]];
    expect(computeCurbCut(drive, parcel)).toBeNull();
  });
});
