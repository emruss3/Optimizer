import { describe, it, expect } from 'vitest';
import type { SiteMetrics } from '../../../engine/types';
import { parkingCounts, parkingCountsDisagree, parkingCountsLine, parkingSupplyForAdequacy } from './parkingCounts';
import { builtSummary } from './BuiltHeadline';
import type { Element } from '../../../engine/types';

describe('one parking reading, named the same everywhere (audit 2026-11-26)', () => {
  // 6420 Holt Rd: 150 drawn, 64 in the engine summary, 0 reachable (the drive stops short), 115 required
  const holt = { totalUnits: 66, totalBuiltSF: 70000, stallsDrawn: 150, stallsReported: 64, stallsReachable: 0, stallsProvided: 0, stallsRequired: 115 } as SiteMetrics;

  it('names each count; a reachable zero is shown as reachable, not as the supply', () => {
    const c = parkingCounts(holt);
    expect(parkingCountsDisagree(c)).toBe(true);
    expect(parkingCountsLine(c)).toBe('150 drawn · 64 in the engine summary · 0 reachable from the street · 115 required');
    expect(parkingSupplyForAdequacy(c)).toBe(0);
  });

  it('the headline says the same three counts, not "0 stalls"', () => {
    const bar = { id: 'mfgen-bldg-1', type: 'building', name: 'A', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { floors: 3, use: 'residential', unitMix: [{ type: '1br', count: 66, avgSqft: 700 }] }, metadata: {} } as unknown as Element;
    const s = builtSummary(holt, [bar]);
    expect(s?.headline).toContain('stalls: 150 drawn, 64 in the engine summary, 0 reachable from the street');
    expect(s?.headline).not.toMatch(/(^|· )0 stalls/);
    expect(s?.stallsPerUnit).toBeNull();
  });

  it('one figure when the counts agree; unknown reachability is left out, not printed as 0', () => {
    const c = parkingCounts({ stallsDrawn: 64, stallsReported: 64, stallsRequired: 64 } as SiteMetrics);
    expect(parkingCountsDisagree(c)).toBe(false);
    expect(parkingCountsLine(c)).toBe('64 drawn · 64 required');
    expect(c.reachable).toBeNull();
  });
});
