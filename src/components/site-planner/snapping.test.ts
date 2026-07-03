import { describe, it, expect } from 'vitest';
import { computeSnapDelta } from './snapping';

// 100×100 envelope
const env = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
  [0, 0],
];

// 20×10 building whose left edge sits at x
const bldg = (x: number, y: number) => [
  [x, y],
  [x + 20, y],
  [x + 20, y + 10],
  [x, y + 10],
  [x, y],
];

describe('computeSnapDelta', () => {
  it('pulls a near vertex flush onto the envelope edge', () => {
    // Left edge at x=1.2 → within tol 2 of envelope x=0 → snap dx = -1.2
    const snap = computeSnapDelta(bldg(1.2, 40), env, 2)!;
    expect(snap).not.toBeNull();
    expect(snap.dx).toBeCloseTo(-1.2, 6);
    expect(snap.dy).toBeCloseTo(0, 6);
  });

  it('returns null when nothing is within tolerance', () => {
    expect(computeSnapDelta(bldg(30, 40), env, 2)).toBeNull();
  });

  it('picks the CLOSEST edge when multiple are near (corner case)', () => {
    // Corner: left edge 1.5 away, bottom edge 0.8 away → snap to bottom (dy)
    const snap = computeSnapDelta(bldg(1.5, 0.8), env, 2)!;
    expect(Math.abs(snap.dy)).toBeCloseTo(0.8, 6);
    expect(snap.dy).toBeLessThan(0);
  });

  it('handles rotated footprints (any vertex can snap)', () => {
    // Diamond with its left tip 1 unit from the envelope's left edge
    const diamond = [
      [1, 50],
      [11, 40],
      [21, 50],
      [11, 60],
      [1, 50],
    ];
    const snap = computeSnapDelta(diamond, env, 2)!;
    expect(snap.dx).toBeCloseTo(-1, 6);
  });

  it('ignores degenerate inputs', () => {
    expect(computeSnapDelta([], env, 2)).toBeNull();
    expect(computeSnapDelta(bldg(1, 1), [[0, 0], [1, 1]], 2)).toBeNull();
    expect(computeSnapDelta(bldg(1, 1), env, 0)).toBeNull();
  });
});
