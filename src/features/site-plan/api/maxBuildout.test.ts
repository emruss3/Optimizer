import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchMaxBuildout,
  isMaxBuildout,
  normalizeMaxBuildout,
  upperBoundFinding,
  bindingLabel,
  __clearMaxBuildoutCache,
  captureBasis,
  captureBasisParts,
  parksInStructure,
} from './maxBuildout';

const rpcMock = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

// Contract-v3 fixture verified against fn_max_buildout on 553450.
const BUILDOUT = {
  contract_version: 'max_buildout_v3',
  parcel_ogc_fid: 553450,
  typology: 'multifamily',
  max_gsf: 136400,
  at_stories: 4,
  at_unit_gsf: 1550,
  units_at_max: 88,
  footprint_at_max: 34100,
  unit_gsf_min: 750,
  unit_gsf_max: 1550,
  binding_constraint: 'impervious_coverage',
  program_frontier: {
    gsf_max_option: {
      stories: 4,
      units: 88,
      max_gsf: 136400,
      unit_gsf: 1550,
      footprint_sqft: 34100,
      binding: 'impervious_coverage',
    },
    units_max_option: {
      stories: 4,
      units: 110,
      gsf: 82500,
      unit_gsf: 750,
      footprint_sqft: 20625,
      binding: 'density(units)',
    },
    unit_gsf_band: { min: 750, max: 1550, hard_constraint: true },
  },
  stories_ladder: [
    { stories: 1, units: 41, max_gsf: 63550, unit_gsf: 1550, footprint_sqft: 63550, binding: 'impervious_coverage' },
    { stories: 4, units: 88, max_gsf: 136400, unit_gsf: 1550, footprint_sqft: 34100, binding: 'impervious_coverage' },
  ],
  entitlement_capacity: { max_units: 110, max_units_source: 'ordinance', far_uncapped_for_mf: true },
};

// Regression shape that shipped on 2026-07-20: the richer program frontier was
// present, but top-level aliases and an explicit band were absent. The client
// derives both without accepting an impossible/inverted range.
const FRONTIER_ONLY = {
  contract_version: 'max_buildout_v2',
  parcel_ogc_fid: 669046,
  typology: 'multifamily',
  max_gsf: 117794,
  binding_constraint: 'impervious_coverage',
  program_frontier: {
    gsf_max_option: {
      stories: 4,
      units: 75,
      max_gsf: 117794,
      unit_gsf: 1550,
      footprint_sqft: 29448,
      binding: 'impervious_coverage',
    },
    units_max_option: {
      stories: 4,
      units: 94,
      gsf: 70941,
      unit_gsf: 750,
      footprint_sqft: 17735,
      binding: 'density(units)',
    },
  },
  stories_ladder: [
    { stories: 1, units: 35, max_gsf: 54979, unit_gsf: 1550, footprint_sqft: 54979, binding: 'impervious_coverage' },
    { stories: 4, units: 75, max_gsf: 117794, unit_gsf: 1550, footprint_sqft: 29448, binding: 'impervious_coverage' },
  ],
};

beforeEach(() => {
  rpcMock.mockReset();
  __clearMaxBuildoutCache();
});

describe('fn_max_buildout client (GSF-first headline)', () => {
  it('recognizes contract v3 and caches by parcel+typology', async () => {
    rpcMock.mockResolvedValue({ data: BUILDOUT, error: null });
    const first = await fetchMaxBuildout(553450, 'multifamily');
    const second = await fetchMaxBuildout(553450, 'multifamily');
    expect(first?.max_gsf).toBe(136400);
    expect(first?.unit_gsf_min).toBe(750);
    expect(first?.unit_gsf_max).toBe(1550);
    expect(first?.program_frontier?.unit_gsf_band?.hard_constraint).toBe(true);
    expect(first?.stories_ladder).toHaveLength(2);
    expect(second).toBe(first);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('fn_max_buildout', {
      p_ogc_fid: 553450,
      p_typology: 'multifamily',
    });
  });

  it('derives aliases and the hard band from a compatible frontier-only payload', async () => {
    expect(isMaxBuildout(FRONTIER_ONLY)).toBe(false);

    const normalized = normalizeMaxBuildout(FRONTIER_ONLY);
    expect(normalized).toMatchObject({
      max_gsf: 117794,
      at_stories: 4,
      at_unit_gsf: 1550,
      units_at_max: 75,
      footprint_at_max: 29448,
      unit_gsf_min: 750,
      unit_gsf_max: 1550,
      binding_constraint: 'impervious_coverage',
    });
    expect(isMaxBuildout(normalized)).toBe(true);

    rpcMock.mockResolvedValue({ data: FRONTIER_ONLY, error: null });
    const fetched = await fetchMaxBuildout(669046, 'multifamily');
    expect(fetched?.at_stories).toBe(4);
    expect(fetched?.units_at_max).toBe(75);
    expect(fetched?.unit_gsf_min).toBe(750);
    expect(fetched?.unit_gsf_max).toBe(1550);
    expect(fetched?.program_frontier?.units_max_option?.units).toBe(94);
  });

  it('rejects inverted or self-contradictory unit bands', () => {
    expect(normalizeMaxBuildout({
      ...BUILDOUT,
      unit_gsf_min: 1600,
      unit_gsf_max: 1500,
    })).toBeNull();
    expect(normalizeMaxBuildout({
      ...BUILDOUT,
      at_unit_gsf: 1700,
    })).toBeNull();
  });

  it('failures return null and never poison the cache', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchMaxBuildout(1)).toBeNull();
    rpcMock.mockResolvedValueOnce({ data: BUILDOUT, error: null });
    expect((await fetchMaxBuildout(1))?.max_gsf).toBe(136400);
  });

  it('guards normalized shape and labels the binding constraint for display', () => {
    expect(isMaxBuildout(BUILDOUT)).toBe(true);
    expect(isMaxBuildout({ max_gsf: 'nope' })).toBe(false);
    expect(bindingLabel('impervious_coverage')).toBe('impervious coverage');
    expect(bindingLabel(null)).toBe('unknown');
  });
});

describe('captureBasis: one claim, one denominator (535 Main St, audit 2026-11-22)', () => {
  // the live figures: 232,425 GSF built, surface bound 199,950, structured ceiling 423,765
  const MAIN = { max_gsf: 199950, structured_parking_ceiling: { gsf: 423765, binding: 'far' } };

  it('measures a structure-parked plan against the structured ceiling and names the surface bound beside it', () => {
    const c = captureBasis(232425, MAIN, 'wrap_garage');
    expect(c?.label).toBe('structured-parking ceiling');
    expect(c?.denominatorGsf).toBe(423765);
    expect(Math.round((c?.pct ?? 0) * 10) / 10).toBe(54.8);
    expect(c?.comparison).toEqual({ gsf: 199950, label: 'surface-parking bound', pct: (232425 / 199950) * 100 });
    expect(captureBasisParts(c!)).toEqual([
      '423,765 GSF structured-parking ceiling',
      '55% capture',
      'surface-parking bound 199,950 GSF (116%: this plan parks in a structure)',
    ]);
  });

  it('measures a surface-parked plan against the surface bound, with nothing beside it', () => {
    const c = captureBasis(106776, { max_gsf: 134850, structured_parking_ceiling: { gsf: 300000 } }, 'surface');
    expect(c).toEqual({ denominatorGsf: 134850, label: 'upper bound', pct: (106776 / 134850) * 100, comparison: null });
    expect(captureBasisParts(c!)).toEqual(['134,850 GSF upper bound', '79% capture']);
  });

  it('falls back to the surface bound when no structured ceiling is on file', () => {
    expect(captureBasis(232425, { max_gsf: 199950 }, 'wrap_garage')?.label).toBe('upper bound');
  });

  it('says nothing without a plan or a bound', () => {
    expect(captureBasis(null, MAIN, 'wrap_garage')).toBeNull();
    expect(captureBasis(232425, null, 'wrap_garage')).toBeNull();
    expect(captureBasis(232425, { max_gsf: 0 }, 'surface')).toBeNull();
  });

  it('reads the parking strategy for a structure', () => {
    expect(parksInStructure('podium')).toBe(true);
    expect(parksInStructure('tuck_under')).toBe(true);
    expect(parksInStructure('surface')).toBe(false);
    expect(parksInStructure(undefined)).toBe(false);
  });
});

describe('upperBoundFinding: which bound a plan is over, named (audit cf4f0e8)', () => {
  const mb = { max_gsf: 65_100, binding_constraint: 'parking_land', structured_parking_ceiling: { gsf: 423_765, binding: 'height' } };
  it('calls a surface-parking bound an estimate, not an ordinance cap (441 Ocala Dr)', () => {
    expect(upperBoundFinding(65_481, mb, false)).toBe('381 GSF over the 65,100 GSF surface-parking estimate (binding: parking land), an estimate rather than an ordinance cap');
  });
  it('calls a FAR- or height-bound figure an ordinance cap', () => {
    expect(upperBoundFinding(70_000, { ...mb, binding_constraint: 'far' }, false)).toContain('ordinance cap (binding: far)');
  });
  it('measures a structure-parked plan against the structured ceiling (535 Main St)', () => {
    expect(upperBoundFinding(245_108, { ...mb, max_gsf: 199_950 }, true)).toBeNull();
    expect(upperBoundFinding(430_000, { ...mb, max_gsf: 199_950 }, true)).toContain('ceiling with structured parking (binding: height)');
  });
  it('says nothing within the bound or without one', () => {
    expect(upperBoundFinding(60_000, mb, false)).toBeNull();
    expect(upperBoundFinding(60_000, null, false)).toBeNull();
  });
});
