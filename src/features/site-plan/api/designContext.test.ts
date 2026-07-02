import { describe, it, expect } from 'vitest';
import {
  normalizeDesignContext,
  contextToZoningPatch,
  normalizePermittedUses,
} from './designContext';

describe('normalizeDesignContext', () => {
  it('reads the canonical annotated shape with provenance', () => {
    const ctx = normalizeDesignContext({
      zoning_base: 'RS5',
      regime: 'architectural_vertical',
      context_confidence: 'high',
      setbacks: {
        front: { value: 20, source: 'zoning', confidence: 'high' },
        side: { value: 5, source: 'inferred_local', confidence: 'medium' },
      },
      max_far: { value: 2.0, source: 'zoning', confidence: 'high' },
      max_height_ft: 45,
    })!;
    expect(ctx.zoningBase).toBe('RS5');
    expect(ctx.confidence).toBe('high');
    expect(ctx.setbackFrontFt).toEqual({ value: 20, source: 'zoning', confidence: 'high' });
    expect(ctx.setbackSideFt!.source).toBe('inferred_local'); // → "estimated" badge
    // Bare numbers get wrapped with unknown provenance
    expect(ctx.maxHeightFt).toEqual({ value: 45, source: 'unknown', confidence: 'medium' });
  });

  it('tolerates alternate key spellings', () => {
    const ctx = normalizeDesignContext({
      zoning: 'RM15',
      min_front_setback_ft: 25,
      max_density_du_per_acre: { value: 15, source: 'zoning', confidence: 'high' },
    })!;
    expect(ctx.zoningBase).toBe('RM15');
    expect(ctx.setbackFrontFt!.value).toBe(25);
    expect(ctx.maxDensityDuAc!.value).toBe(15);
  });

  it('returns null for empty/garbage payloads (fail-soft)', () => {
    expect(normalizeDesignContext(null)).toBeNull();
    expect(normalizeDesignContext('oops')).toBeNull();
    expect(normalizeDesignContext({ unrelated: true })).toBeNull();
  });
});

describe('contextToZoningPatch', () => {
  it('maps known values onto planner zoning keys and skips unknowns', () => {
    const ctx = normalizeDesignContext({
      zoning_base: 'RS5',
      setbacks: { front: 20, rear: 20 },
      max_far: 1.2,
      max_height_ft: 35,
    })!;
    expect(contextToZoningPatch(ctx)).toEqual({
      frontSetbackFt: 20,
      rearSetbackFt: 20,
      maxFar: 1.2,
      maxHeightFt: 35,
    });
  });

  it('drops non-numeric and negative values', () => {
    const ctx = normalizeDesignContext({
      zoning_base: 'X',
      setbacks: { front: { value: 'n/a', source: 'zoning', confidence: 'low' } },
      max_far: -1,
    })!;
    expect(contextToZoningPatch(ctx)).toEqual({});
  });
});

describe('normalizePermittedUses', () => {
  it('accepts string arrays, object arrays, and wrapped payloads', () => {
    expect(normalizePermittedUses(['single_family', 'duplex'])).toEqual(['single_family', 'duplex']);
    expect(normalizePermittedUses({ feasible_uses_as_of_right: [{ use: 'multifamily' }] })).toEqual(['multifamily']);
    expect(normalizePermittedUses(null)).toEqual([]);
    expect(normalizePermittedUses({ nope: 1 })).toEqual([]);
  });
});
