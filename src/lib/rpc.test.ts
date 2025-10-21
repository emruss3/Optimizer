import { describe, it, expect } from 'vitest';
import { getParcelsInBbox } from './rpc';

describe('getParcelsInBbox', () => {
  it('returns stable columns', async () => {
    // Use a small bbox around Nashville; env must point to local DB
    const rows = await getParcelsInBbox(-86.95, 36.10, -86.70, 36.25, 0, 5);
    expect(Array.isArray(rows)).toBe(true);
    if (rows[0]) {
      expect(rows[0]).toHaveProperty('ogc_fid');
      expect(rows[0]).toHaveProperty('geometry');
      expect(rows[0]).toHaveProperty('parcelnumb');
      expect(rows[0]).toHaveProperty('address');
      expect(rows[0]).toHaveProperty('zoning');
      expect(rows[0]).toHaveProperty('sqft');
    }
  });

  it('handles empty results gracefully', async () => {
    // Use a bbox with no parcels
    const rows = await getParcelsInBbox(0, 0, 0.001, 0.001, 0, 10);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });

  it('respects maxResults parameter', async () => {
    const rows = await getParcelsInBbox(-86.95, 36.10, -86.70, 36.25, 0, 2);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(2);
  });
});

