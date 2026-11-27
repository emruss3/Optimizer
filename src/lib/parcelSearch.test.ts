import { describe, it, expect, vi, beforeEach } from 'vitest';

const { from, or, rpc, abortSignal, legacyAbortSignal } = vi.hoisted(() => ({
  from: vi.fn(), or: vi.fn(), rpc: vi.fn(), abortSignal: vi.fn(), legacyAbortSignal: vi.fn(),
}));
vi.mock('./supabase', () => ({ supabase: { from, rpc } }));
import { searchParcels, SEARCH_TIMEOUT_MS } from './parcelSearch';

describe('searchParcels', () => {
  beforeEach(() => {
    from.mockReset().mockReturnValue({ select: () => ({ or }) });
    or.mockReset().mockReturnValue({ limit: () => ({ abortSignal: legacyAbortSignal }) });
    rpc.mockReset().mockReturnValue({ abortSignal });
    abortSignal.mockReset().mockResolvedValue({ data: [], error: null });
    legacyAbortSignal.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('uses the indexed RPC and retains literal apostrophes and APN formatting', async () => {
    await searchParcels("12 O'Brien% St, (rear)", 7);
    await searchParcels('116 02 0 020.00');
    expect(rpc).toHaveBeenNthCalledWith(1, 'find_planner_parcels', { p_query: "12 O'Brien St rear", p_limit: 7 });
    expect(rpc).toHaveBeenNthCalledWith(2, 'find_planner_parcels', { p_query: '116 02 0 020.00', p_limit: 10 });
    expect(from).not.toHaveBeenCalled();
  });

  it('retains the legacy filters only where the RPC is not deployed', async () => {
    abortSignal.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await searchParcels('116 02 0 020.00');
    expect(or.mock.calls[0]?.[0]).toContain('parcelnumb_no_formatting.ilike.%11602002000%');
    await searchParcels("12 O'Brien% St, (rear)");
    expect(or.mock.calls[1]?.[0]).toContain('address.ilike.%12 O_Brien St rear%');
  });

  it('reports database errors without falling back to an unindexed search', async () => {
    abortSignal.mockResolvedValue({ data: null, error: { code: '57014', message: 'statement timeout' } });
    await expect(searchParcels('12 Main St')).rejects.toThrow('statement timeout');
    expect(from).not.toHaveBeenCalled();
  });

  it('returns both parcels that share an address', async () => {
    const row = { ogc_fid: 1, address: '0 MAIN ST', parcelnumb: '012', zoning: null };
    abortSignal.mockResolvedValue({ data: [row, { ...row, ogc_fid: 2 }], error: null });
    const hits = await searchParcels('0 Main St');
    expect(hits.map(p => p.ogcFid)).toEqual([1, 2]);
    expect(hits[0]?.parcelNumber).toBe('012');
  });

  it('aborts the HTTP request when the search times out', async () => {
    vi.useFakeTimers();
    try {
      abortSignal.mockReturnValue(new Promise(() => {}));
      const pending = expect(searchParcels('12 Main St')).rejects.toThrow('no answer after 12 seconds');
      await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
      await pending;
      expect(abortSignal.mock.calls[0]?.[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts a superseded request without waiting for the deadline', async () => {
    abortSignal.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const pending = expect(searchParcels('12 Main', 10, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await pending;
    expect(abortSignal.mock.calls[0]?.[0].aborted).toBe(true);
  });

  it('does not search on a single character', async () => {
    expect(await searchParcels('a')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('searchParcels: app parcel ID and assessor-style street words (audit 9379472 F7)', () => {
  beforeEach(() => {
    abortSignal.mockReset().mockResolvedValue({ data: [], error: null });
    rpc.mockReset().mockReturnValue({ abortSignal });
  });

  it('finds the parcel by its app ID and puts it first', async () => {
    const eqLimit = vi.fn().mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data: [{ ogc_fid: 675423, address: '0 DELK AVE', parcelnumb: '08110007300', zoning: 'RS5' }], error: null }) });
    from.mockReset().mockReturnValue({ select: () => ({ eq: () => ({ limit: eqLimit }) }) });
    const hits = await searchParcels('675423', 10, new AbortController().signal);
    expect(hits[0]).toMatchObject({ ogcFid: 675423, address: '0 DELK AVE', parcelNumber: '08110007300' });
  });

  it('retries once with street words abbreviated when the words as typed find nothing', async () => {
    abortSignal.mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ ogc_fid: 1, address: '2500 W HEIMAN ST', parcelnumb: 'x', zoning: 'RM40' }], error: null });
    const hits = await searchParcels('2500 West Heiman Street');
    expect(rpc).toHaveBeenNthCalledWith(1, 'find_planner_parcels', { p_query: '2500 West Heiman Street', p_limit: 10 });
    expect(rpc).toHaveBeenNthCalledWith(2, 'find_planner_parcels', { p_query: '2500 W HEIMAN ST', p_limit: 10 });
    expect(hits[0]?.address).toBe('2500 W HEIMAN ST');
  });

  it('does not retry when the words as typed already find the parcel (West End Ave stays West End)', async () => {
    abortSignal.mockResolvedValueOnce({ data: [{ ogc_fid: 2, address: '2100 WEST END AVE', parcelnumb: 'y', zoning: 'MUI' }], error: null });
    await searchParcels('2100 West End Avenue');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
