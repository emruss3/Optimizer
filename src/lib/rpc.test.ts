import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getParcelsInBbox } from './rpc';

// Mock the Supabase client so these run as unit tests (no live DB required)
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('./supabase', () => ({
  supabase: { rpc: mockRpc }
}));

const sampleRow = {
  ogc_fid: 661807,
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  parcelnumb: '105-06-0-123.00',
  address: '2518 W HEIMAN ST',
  zoning: 'RS5',
  sqft: 631204
};

describe('getParcelsInBbox', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns stable columns', async () => {
    mockRpc.mockResolvedValue({ data: [sampleRow], error: null });

    const rows = await getParcelsInBbox(-86.95, 36.10, -86.70, 36.25, 0, 5);
    expect(mockRpc).toHaveBeenCalledWith('get_parcels_in_bbox', expect.objectContaining({
      min_lng: -86.95, min_lat: 36.10, max_lng: -86.70, max_lat: 36.25,
      min_sqft: 0, max_results: 5
    }));
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toHaveProperty('ogc_fid');
    expect(rows[0]).toHaveProperty('geometry');
    expect(rows[0]).toHaveProperty('parcelnumb');
    expect(rows[0]).toHaveProperty('address');
    expect(rows[0]).toHaveProperty('zoning');
    expect(rows[0]).toHaveProperty('sqft');
  });

  it('handles empty results gracefully', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const rows = await getParcelsInBbox(0, 0, 0.001, 0.001, 0, 10);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });

  it('passes maxResults through to the RPC', async () => {
    mockRpc.mockResolvedValue({ data: [sampleRow, sampleRow], error: null });

    const rows = await getParcelsInBbox(-86.95, 36.10, -86.70, 36.25, 0, 2);
    expect(mockRpc).toHaveBeenCalledWith('get_parcels_in_bbox', expect.objectContaining({ max_results: 2 }));
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(getParcelsInBbox(0, 0, 1, 1)).rejects.toThrow('boom');
  });
});
