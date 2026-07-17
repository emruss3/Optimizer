import { describe, it, expect } from 'vitest';
import { validatePlanElements, rejectionChip, OVERLAP_TOLERANCE_M2 } from './validatePlan';
import type { Element } from './types';

const rect = (id: string, type: string, x: number, y: number, w: number, h: number): Element => ({
  id,
  type: type as Element['type'],
  name: id,
  geometry: {
    type: 'Polygon',
    coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]],
  },
  properties: {},
  metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
} as unknown as Element);

describe('validatePlanElements (zero-overlap invariant)', () => {
  it('passes a clean plan with edge-adjacent elements', () => {
    const v = validatePlanElements([
      rect('b1', 'building', 0, 0, 30, 15),
      rect('p1', 'parking', 0, 15, 30, 18), // shares an edge — adjacency, not overlap
      rect('a1', 'parking-aisle', 0, 33, 30, 7),
      rect('g1', 'greenspace', 40, 0, 20, 40),
    ]);
    expect(v.ok).toBe(true);
    expect(v.overlaps).toHaveLength(0);
    expect(v.reason).toBeNull();
  });

  it('rejects parking overlapping a building (the failure-state garbage)', () => {
    const v = validatePlanElements([
      rect('b1', 'building', 0, 0, 30, 15),
      rect('p1', 'parking', 20, 5, 30, 18), // 10×10 m over the building
    ]);
    expect(v.ok).toBe(false);
    expect(v.overlaps[0].areaM2).toBeGreaterThan(90);
    expect(v.reason).toMatch(/building overlaps parking|parking overlaps building/);
    expect(rejectionChip(v)).toMatch(/overlap \((building|parking)×(building|parking)\)/);
  });

  it('rejects building-on-building stacking', () => {
    const v = validatePlanElements([
      rect('b1', 'building', 0, 0, 30, 15),
      rect('b2', 'building', 5, 5, 30, 15),
    ]);
    expect(v.ok).toBe(false);
  });

  it('tolerates sub-threshold slivers (float noise, shared corners)', () => {
    const v = validatePlanElements([
      rect('b1', 'building', 0, 0, 30, 15),
      rect('p1', 'parking', 29.7, 0, 30, 3), // 0.3 m × 3 m = 0.9 m² < tolerance
    ]);
    expect(v.ok).toBe(true);
    expect(OVERLAP_TOLERANCE_M2).toBe(1);
  });

  it('ignores greenspace overlaps by design (courts under decorative rings)', () => {
    const v = validatePlanElements([
      rect('b1', 'building', 0, 0, 30, 15),
      rect('g1', 'greenspace', 0, 0, 60, 60),
    ]);
    expect(v.ok).toBe(true);
  });

  it('worst overlap leads the reason', () => {
    const v = validatePlanElements([
      rect('b1', 'building', 0, 0, 30, 15),
      rect('p1', 'parking', 28, 0, 10, 10),   // small
      rect('c1', 'circulation', 0, 0, 30, 15), // total
    ]);
    expect(v.ok).toBe(false);
    expect(v.overlaps[0].bType === 'circulation' || v.overlaps[0].aType === 'circulation').toBe(true);
  });
});
