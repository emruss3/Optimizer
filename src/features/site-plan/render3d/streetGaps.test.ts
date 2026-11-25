import { describe, it, expect } from 'vitest';
import { streetGaps } from './siteScene';

const box = (x: number, y: number, w = 40, h = 40) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe('streetGaps', () => {
  it('paves the gap between two parcels that face each other across a street', () => {
    // two lots 18 m apart: a street between them
    const strips = streetGaps([box(0, 0), box(58, 0)]);
    // paved once, not once from each side
    expect(strips.length).toBe(1);
    for (const s of strips) {
      const xs = s.map(p => p[0] ?? 0);
      // each strip spans the gap, to within the 2 m step it is probed at
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(38);
      expect(Math.max(...xs)).toBeLessThanOrEqual(60);
    }
  });

  it('paves nothing beside open land or along a shared lot line', () => {
    expect(streetGaps([box(0, 0)])).toEqual([]);
    // two lots that share a line
    expect(streetGaps([box(0, 0), box(40, 0)])).toEqual([]);
    // two lots a field apart
    expect(streetGaps([box(0, 0), box(140, 0)])).toEqual([]);
  });

  it('does not care which way a parcel ring is wound', () => {
    const a = box(0, 0), b = [...box(58, 0)].reverse();
    expect(streetGaps([a, b]).length).toBe(1);
  });
});
