import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { assembleParcels } from './assemblage';

describe('assembleParcels', () => {
  beforeEach(() => rpc.mockReset());

  it('does not ask the engine about fewer than two parcels', async () => {
    const r = await assembleParcels(['488278', '488278']);
    expect(r.status).toBe('refused');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends the set sorted and returns the combined site', async () => {
    rpc.mockResolvedValueOnce({ data: { ogc_fid: -12, address: 'A + 1 more', zoning: 'RM20', acres: 2.2 }, error: null });
    const r = await assembleParcels(['488279', 488278]);
    expect(rpc).toHaveBeenCalledWith('fn_assemble_parcels', { p_fids: [488278, 488279] });
    expect(r).toEqual({ status: 'ready', ogcFid: -12, address: 'A + 1 more', zoning: 'RM20', acres: 2.2 });
  });

  it('reads an engine refusal as a reason, not an error', async () => {
    rpc.mockResolvedValueOnce({ data: { error: 'not_adjacent' }, error: null });
    const r = await assembleParcels([1, 2]);
    expect(r.status).toBe('refused');
    expect(r.status === 'refused' && r.message).toMatch(/do not all touch/);
  });

  it('uses the engine wording for a refusal it does not know', async () => {
    rpc.mockResolvedValueOnce({ data: { error: 'flood_split', message: 'A floodway divides the site.' }, error: null });
    const r = await assembleParcels([1, 2]);
    expect(r).toEqual({ status: 'refused', code: 'flood_split', message: 'A floodway divides the site.' });
  });

  it('says so when the database has no combine function', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_assemble_parcels' } });
    const r = await assembleParcels([1, 2]);
    expect(r.status).toBe('unavailable');
  });

  it('asks for a sign-in when the caller is not allowed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for function fn_assemble_parcels' } });
    const r = await assembleParcels([1, 2]);
    expect(r.status === 'refused' && r.code).toBe('sign_in');
  });

  it('reports any other failure as a failure', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    const r = await assembleParcels([1, 2]);
    expect(r).toEqual({ status: 'failed', message: 'canceling statement due to statement timeout' });
  });
});
