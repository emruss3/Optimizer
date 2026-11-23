import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc } }));
import { searchParcels, SEARCH_TIMEOUT_MS } from './parcelSearch';

describe('searchParcels', () => {
  beforeEach(() => {
    rpc.mockReset().mockReturnValue({ abortSignal });
    abortSignal.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('passes punctuation and formatted IDs as parameter values', async () => {
    for (const term of ["12 O'Brien Ave", '116 02 0 020.00', 'Main St, (rear) 50%_']) {
      await searchParcels(term);
      expect(rpc).toHaveBeenCalledWith('find_planner_parcels', { p_query: term, p_limit: 10 });
    }
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
  });
});
