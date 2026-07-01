import { describe, it, expect } from 'vitest';
import { corridorEfficiency, generateDefaultUnitMix, generateUnitMixForCount, totalUnitsFromMix } from './model';

describe('generateUnitMixForCount', () => {
  it('distributes an exact count across the mix (sums precisely)', () => {
    for (const n of [1, 7, 50, 123]) {
      expect(totalUnitsFromMix(generateUnitMixForCount(n))).toBe(n);
    }
  });

  it('handles zero and negative counts without going negative', () => {
    expect(totalUnitsFromMix(generateUnitMixForCount(0))).toBe(0);
    expect(totalUnitsFromMix(generateUnitMixForCount(-5))).toBe(0);
  });
});

describe('corridorEfficiency', () => {
  it('rises with building depth (deeper plates lose less to the corridor)', () => {
    const shallow = corridorEfficiency(12.2); // ~40 ft
    const deep = corridorEfficiency(24.4); // ~80 ft
    expect(deep).toBeGreaterThan(shallow);
  });

  it('matches the legacy ~0.85 for a standard 60 ft bar', () => {
    expect(corridorEfficiency(18.29)).toBeCloseTo(0.85, 1);
  });

  it('clamps degenerate depths to the [0.5, 0.9] range', () => {
    expect(corridorEfficiency(0)).toBe(0.5);
    expect(corridorEfficiency(1)).toBe(0.5); // <= corridor width
    expect(corridorEfficiency(1000)).toBeLessThanOrEqual(0.9);
    expect(corridorEfficiency(Number.NaN)).toBe(0.5);
  });
});

describe('generateDefaultUnitMix efficiency', () => {
  it('a higher efficiency yields more units for the same GFA', () => {
    const lean = totalUnitsFromMix(generateDefaultUnitMix(100_000, 0.75));
    const rich = totalUnitsFromMix(generateDefaultUnitMix(100_000, 0.90));
    expect(rich).toBeGreaterThan(lean);
  });

  it('defaults to 0.85 when no efficiency is supplied', () => {
    const def = totalUnitsFromMix(generateDefaultUnitMix(100_000));
    const explicit = totalUnitsFromMix(generateDefaultUnitMix(100_000, 0.85));
    expect(def).toBe(explicit);
  });
});
