import { describe, expect, it } from 'vitest';
import { approachGeometry, planCurb, streetDetails } from './streetDetails';

describe('street geometry', () => {
  it('meets the building threshold and the pavement on a slope', () => {
    const { anchor, concrete, joints } = approachGeometry('walk', 'A', {
      start: [0, 0], end: [9, 0], width: 1.4, threshold: 0.17, pavement: 0.3, kind: 'walk',
    }, 0.7, x => -x / 6);
    expect(anchor.threshold[2]).toBeCloseTo(0.87);
    expect(anchor.connection[2]).toBeCloseTo(-1.2);
    expect(concrete!.getAttribute('position').count).toBeGreaterThan(90);
    expect(joints).toBeNull(); // step risers are geometry
  });

  it('breaks the raised curb and sidewalk where a driveway crosses it', () => {
    const pieces = streetDetails([[0, 0], [18, 0]], (x, y) => x > 6 && x < 12 && y > 0);
    expect(pieces.map(p => p.part)).toEqual(['curb', 'walk', 'joint']);
    for (const piece of pieces) {
      const p = piece.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0) expect(p.getX(i) > 7 && p.getX(i) < 11).toBe(false);
      }
    }
  });

  it('leaves the seam between connected pieces of pavement open', () => {
    expect(planCurb([[0, 0], [8, 0]], () => true)).toBeNull();
    const curb = planCurb([[0, 0], [8, 0]], (_x, y) => y < 0);
    expect(curb?.getAttribute('position').count).toBeGreaterThan(0);
  });
});
