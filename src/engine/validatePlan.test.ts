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

/** Amenity carve-outs: the server's clubhouse occupies the host bar's ground
 *  floor — same mass, deliberately coincident (amenity_program_ground_floor_v1).
 *  Containment is legal; anything less stays a defect. */
describe('validatePlanElements (ground-floor amenity carve-outs)', () => {
  const amenity = (id: string, x: number, y: number, w: number, h: number): Element => {
    const el = rect(id, 'building', x, y, w, h);
    (el.properties as { use?: string }).use = 'amenity';
    return el;
  };

  it('passes a clubhouse fully contained in its host bar', () => {
    const v = validatePlanElements([
      rect('bldg-1', 'building', 0, 0, 60, 20),
      amenity('amenity-1', 2, 2, 15, 12), // wholly inside the bar
    ]);
    expect(v.ok).toBe(true);
  });

  it('rejects an amenity only PARTIALLY overlapping a building', () => {
    const v = validatePlanElements([
      rect('bldg-1', 'building', 0, 0, 60, 20),
      amenity('amenity-1', 50, 10, 20, 15), // hangs off the bar
    ]);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/building overlaps building/);
  });

  it('rejects an amenity overlapping parking (the 667574 pool-court defect)', () => {
    const v = validatePlanElements([
      amenity('amenity-2', 0, 0, 20, 25),
      rect('park-3', 'parking', 15, 0, 30, 18),
    ]);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/parking/);
  });

  it('rejects two amenities stacked on each other', () => {
    const v = validatePlanElements([
      amenity('amenity-1', 0, 0, 20, 20),
      amenity('amenity-2', 5, 5, 20, 20),
    ]);
    expect(v.ok).toBe(false);
  });

  it('rejects a drive aisle crossing a building — the Davis-frame case (order-5 item 4)', () => {
    // "1 issue" must never render from a non-gesture path: circulation×building
    // is a first-class overlap, and gateNonGesturePlan applies this validator
    // to worker, fallback, saved-plan, and SF paths alike.
    const v = validatePlanElements([
      rect('bldg-1', 'building', 0, 0, 60, 20),
      rect('aisle-1', 'circulation', 20, -5, 8, 40), // aisle straight through the bar
    ]);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/drive overlaps building|building overlaps drive/);
  });

  it('still rejects plain building-on-building even when one is large enough to contain', () => {
    const v = validatePlanElements([
      rect('b1', 'building', 0, 0, 60, 30),
      rect('b2', 'building', 10, 10, 10, 10), // contained but NOT an amenity
    ]);
    expect(v.ok).toBe(false);
  });
});
