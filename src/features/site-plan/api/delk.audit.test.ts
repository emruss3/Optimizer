import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCounts, sfV1ToElements, type SfV1Response } from './sfV1Plan';

// 0 Delk Ave, the live audit of 2026-11-22: 3 lots by default, 4 in the
// comparison, 5 from the deep search. The plans are the engine's own answers.
const FIX = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'delk-675423.json'), 'utf8')) as {
  default: SfV1Response; deep: SfV1Response; competition: { best_lots: number; best_pattern: string };
};

describe('0 Delk Ave: the numbers on the selected plan (audit 2026-11-22)', () => {
  it('reproduces 3 by default, 4 in the comparison, 5 from the deep search', () => {
    expect(sfV1ToElements(FIX.default).summary.lots).toBe(3);
    expect(FIX.competition.best_lots).toBe(4);
    expect(sfV1ToElements(FIX.deep).summary.lots).toBe(5);
  });

  it('keeps the shared private drive and the new public street as separate lengths', () => {
    const { summary } = sfV1ToElements(FIX.deep);
    // the row read summary.streetFt and said "Private drive 0 ft" beside a 300 ft lane
    expect(summary.streetFt).toBe(0);
    expect(summary.privateDrive?.lengthFt).toBe(300);
    expect(summary.privateDrive?.laneFt).toBe(16);
    expect(summary.privateDrive?.easementFt).toBe(24);
  });

  it('counts a measurement with no verdict as a measurement, not a pass', () => {
    const { summary } = sfV1ToElements(FIX.deep);
    // the badge said 16 checks pass and the basis line said 15 for this plan
    expect(summary.tests).toHaveLength(16);
    expect(checkCounts(summary.tests)).toEqual({ graded: 15, passed: 15, measured: 1 });
    expect(summary.tests.find(t => t.pass == null)?.id).toBe('yield.vs_arithmetic');
    expect(summary.basisLine).toContain('15 checks pass');
    expect(summary.basisLine.startsWith('5 lots')).toBe(true);
  });
});
