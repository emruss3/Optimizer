import { describe, it, expect } from 'vitest';
import type { SiteMetrics } from '../../../engine/types';
import { parkingCounts, parkingCountsLine, parkingCountsDisagree, parkingSupplyForAdequacy } from './parkingCounts';

const base = { totalBuiltSF: 1, siteCoveragePct: 1, achievedFAR: 1, parkingRatio: 1, openSpacePct: 0 } as SiteMetrics;

describe('structured parking (podium_v1, 2026-11-27)', () => {
  it('garage stalls are named as such, not as drawn bays or an engine-summary mismatch', () => {
    const c = parkingCounts({ ...base, stallsProvided: 120, stallsStructured: 120, stallsRequired: 0 });
    expect(c.drawn).toBeNull();
    expect(parkingCountsLine(c)).toBe('120 in a garage (structured parking)');
    expect(parkingCountsDisagree(c)).toBe(false);
    expect(parkingSupplyForAdequacy(c)).toBe(120);
  });
  it('surface plans read as before', () => {
    const c = parkingCounts({ ...base, stallsDrawn: 112, stallsReported: 28, stallsRequired: 113 });
    expect(parkingCountsLine(c)).toBe('112 drawn · 28 in the engine summary · 113 required');
  });
});
