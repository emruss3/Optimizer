import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMaxBuildout, isMaxBuildout, bindingLabel, __clearMaxBuildoutCache } from './maxBuildout';

const rpcMock = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

// Live-shaped fixture (verified against fn_max_buildout on parcel 553450).
const BUILDOUT = {
  parcel_ogc_fid: 553450,
  typology: 'multifamily',
  max_gsf: 137688,
  at_stories: 4,
  at_unit_gsf: 1550,
  units_at_max: 88,
  binding_constraint: 'impervious_coverage',
  stories_ladder: [
    { stories: 1, units: 41, max_gsf: 64265, unit_gsf: 1550, footprint_sqft: 64265, binding: 'impervious_coverage' },
    { stories: 4, units: 88, max_gsf: 137688, unit_gsf: 1550, footprint_sqft: 34422, binding: 'impervious_coverage' },
  ],
  entitlement_capacity: { max_units: 110, max_units_source: 'ordinance', far_uncapped_for_mf: true },
};

beforeEach(() => {
  rpcMock.mockReset();
  __clearMaxBuildoutCache();
});

describe('fn_max_buildout client (SF-first headline)', () => {
  it('recognizes the live payload shape and caches by parcel+typology', async () => {
    rpcMock.mockResolvedValue({ data: BUILDOUT, error: null });
    const a = await fetchMaxBuildout(553450, 'multifamily');
    const b = await fetchMaxBuildout(553450, 'multifamily');
    expect(a?.max_gsf).toBe(137688);
    expect(a?.stories_ladder).toHaveLength(2);
    expect(b).toBe(a);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('fn_max_buildout', {
      p_ogc_fid: 553450,
      p_typology: 'multifamily',
    });
  });

  it('failures return null and never poison the cache', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchMaxBuildout(1)).toBeNull();
    rpcMock.mockResolvedValueOnce({ data: BUILDOUT, error: null });
    expect((await fetchMaxBuildout(1))?.max_gsf).toBe(137688);
  });

  it('guards shape and labels the binding constraint for display', () => {
    expect(isMaxBuildout(BUILDOUT)).toBe(true);
    expect(isMaxBuildout({ max_gsf: 'nope' })).toBe(false);
    expect(bindingLabel('impervious_coverage')).toBe('impervious coverage');
    expect(bindingLabel(null)).toBe('unknown');
  });
});
