import { describe, it, expect } from 'vitest';
import {
  normalizeDesignContext,
  contextToZoningPatch,
  contextToParkingPatch,
  normalizePermittedUses,
  routesToLotFit,
  toContextTypology,
  pickDefaultUse,
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

  it('reads the LIVE backend shape (verified against parcel 667899)', () => {
    const ctx = normalizeDesignContext({
      zoning_base: 'RS10',
      zoning_subtype: 'single_family',
      regime: 'civil_horizontal',
      confidence: 'medium',
      parking_strategy: 'driveway',
      flags: [],
      far_max: { value: null, source: 'missing' },
      height_max_ft: { value: null, source: 'missing' },
      setbacks: {
        front: { value: 20, source: 'typology_default' },
        side: { value: 5, source: 'typology_default' },
        rear: { value: 20, source: 'zoning' },
      },
    })!;
    expect(ctx.zoningBase).toBe('RS10');
    expect(ctx.setbackRearFt).toMatchObject({ value: 20, source: 'zoning' });
    expect(ctx.setbackFrontFt!.source).toBe('typology_default'); // → "est." badge
    // Null-valued fields normalize but never ground the solver config
    expect(ctx.maxFar!.value).toBeNull();
    expect(contextToZoningPatch(ctx)).toEqual({
      frontSetbackFt: 20,
      sideSetbackFt: 5,
      rearSetbackFt: 20,
    });
  });

  it('reads flags, parking strategy, and embedded permitted uses (new brief shape)', () => {
    const ctx = normalizeDesignContext({
      zoning_base: 'RS5',
      parking_strategy: 'surface',
      flags: ['flood_zone_ae', { flag: 'review_required' }],
      permitted_uses: { feasible_uses_as_of_right: ['single_family', 'duplex'] },
    })!;
    expect(ctx.parkingStrategy).toBe('surface');
    expect(ctx.flags).toEqual(['flood_zone_ae', 'review_required']);
    expect(ctx.permittedUses).toEqual(['single_family', 'duplex']);
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

describe('routesToLotFit (HBU plan routing)', () => {
  const ctx = (o: Record<string, unknown>) => normalizeDesignContext({ zoning_base: 'X', ...o })!;

  it('routes by resolved typology: SF/duplex → lot fit, multifamily → massing', () => {
    expect(routesToLotFit(ctx({ typology: 'single_family' }))).toBe(true);
    expect(routesToLotFit(ctx({ typology: 'two_family' }))).toBe(true);
    expect(routesToLotFit(ctx({ typology: 'multifamily' }))).toBe(false);
    expect(routesToLotFit(ctx({}))).toBe(false);
  });

  it('REGRESSION (parcel 669046): regime never routes — a multifamily context', () => {
    // Live payload shape that once tiled an RM40 parcel with house pads:
    // regime 'horizontal_pending' means "surface parking, FAR unknown",
    // NOT "this is a single-family parcel".
    const live = ctx({ typology: 'multifamily', regime: 'horizontal_pending' });
    expect(routesToLotFit(live)).toBe(false);
    // …and a vertical regime never drags an SF parcel into massing either.
    expect(routesToLotFit(ctx({ typology: 'single_family', regime: 'vertical' }))).toBe(true);
  });

  it('falls back to the selected use when there is no context', () => {
    expect(routesToLotFit(null, 'single_family')).toBe(true);
    expect(routesToLotFit(null, 'multi_family')).toBe(false);
    expect(routesToLotFit(null)).toBe(false);
  });

  it('REGRESSION: multifamily zoning codes never route to lot fit, even when the context echoes single_family', () => {
    // The failure mode: default-use auto-correction couldn't run (permitted-
    // uses RPC hiccup) → the context was fetched for 'single_family' and its
    // typology just echoes that back on RM40 land.
    expect(routesToLotFit(ctx({ zoning_base: 'RM40', typology: 'single_family' }))).toBe(false);
    expect(routesToLotFit(ctx({ zoning_base: 'MF2', typology: 'single_family' }))).toBe(false);
    expect(routesToLotFit(ctx({ zoning_base: 'RX10', typology: 'two_family' }))).toBe(false);
    // …while genuinely single-family zoning still routes to lots
    expect(routesToLotFit(ctx({ zoning_base: 'RS10', typology: 'single_family' }))).toBe(true);
    expect(routesToLotFit(ctx({ zoning_base: 'R8', typology: 'single_family' }))).toBe(true);
  });
});

describe('toContextTypology (vocabulary bridge)', () => {
  it('maps permitted-uses names onto typology_spec rows', () => {
    // fn_resolve_permitted_uses says 'multi_family'; typology_spec's row is
    // 'multifamily' — passing the raw string returns {error: unknown typology}.
    expect(toContextTypology('multi_family')).toBe('multifamily');
    expect(toContextTypology('multifamily')).toBe('multifamily');
    expect(toContextTypology('single_family')).toBe('single_family');
    // No two_family spec row yet → SF spec is the closest defaults source
    expect(toContextTypology('two_family')).toBe('single_family');
    expect(toContextTypology('commercial')).toBe('commercial'); // pass-through, fails soft
  });
});

describe('pickDefaultUse (zoning-grounded default)', () => {
  it('prefers the highest-intensity as-of-right residential use', () => {
    expect(pickDefaultUse(['single_family', 'two_family', 'multi_family'])).toBe('multi_family');
    expect(pickDefaultUse(['single_family', 'two_family'])).toBe('two_family');
    expect(pickDefaultUse(['single_family'])).toBe('single_family');
  });

  it('falls back to the first listed use, and null when empty', () => {
    expect(pickDefaultUse(['commercial'])).toBe('commercial');
    expect(pickDefaultUse([])).toBeNull();
  });
});

describe('parking context (typology_spec grounding)', () => {
  it('normalizes the live parking block and maps it onto solver parking keys', () => {
    // Live shape from fn_resolve_design_context(669046, 'multifamily')
    const ctx = normalizeDesignContext({
      zoning_base: 'RM40',
      typology: 'multifamily',
      regime: 'horizontal_pending',
      parking: { basis: 'per_unit', ratio: 1.5, stall_w_ft: 9, stall_d_ft: 18, drive_aisle_ft: 24 },
    })!;
    expect(ctx.parking).toEqual({
      ratio: 1.5,
      basis: 'per_unit',
      stallWidthFt: 9,
      stallDepthFt: 18,
      aisleWidthFt: 24,
    });
    expect(contextToParkingPatch(ctx)).toEqual({
      targetRatio: 1.5,
      stallWidthFt: 9,
      stallDepthFt: 18,
      aisleWidthFt: 24,
    });
  });

  it('returns empty patches when the context has no parking block', () => {
    const ctx = normalizeDesignContext({ zoning_base: 'X', max_far: 1 })!;
    expect(ctx.parking).toBeUndefined();
    expect(contextToParkingPatch(ctx)).toEqual({});
  });
});
