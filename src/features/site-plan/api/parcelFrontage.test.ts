import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: rpcMock } }));

import { fetchParcelFrontage } from './parcelFrontage';

describe('fetchParcelFrontage — WO-1b direct fetch (brief-first interim)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('returns the frontage payload and caches per parcel', async () => {
    rpcMock.mockResolvedValue({
      data: {
        parcel_ogc_fid: 553450, landlocked: false, n_segments: 1,
        total_frontage_ft: 283.5,
        primary: { length_ft: 283.5, bearing_deg: 261.4, midpoint_2274: [1, 2] },
      },
      error: null,
    });
    const a = await fetchParcelFrontage(553450);
    const b = await fetchParcelFrontage(553450);
    expect(a?.primary?.bearing_deg).toBe(261.4);
    expect(b).toBe(a);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('fn_parcel_frontage', { p_ogc_fid: 553450 });
  });

  it('landlocked parcels come back honest, and failures return null without caching', async () => {
    rpcMock.mockResolvedValueOnce({ data: { parcel_ogc_fid: 669046, landlocked: true, n_segments: 0, total_frontage_ft: 0 }, error: null });
    const landlocked = await fetchParcelFrontage(669046);
    expect(landlocked?.landlocked).toBe(true);

    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchParcelFrontage(999999)).toBeNull();
    rpcMock.mockResolvedValueOnce({ data: { parcel_ogc_fid: 999999, landlocked: false, n_segments: 1, total_frontage_ft: 10 }, error: null });
    expect((await fetchParcelFrontage(999999))?.n_segments).toBe(1);
  });
});
