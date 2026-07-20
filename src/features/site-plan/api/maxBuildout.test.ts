import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchMaxBuildout,
  isMaxBuildout,
  normalizeMaxBuildout,
  bindingLabel,
  __clearMaxBuildoutCache,
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
