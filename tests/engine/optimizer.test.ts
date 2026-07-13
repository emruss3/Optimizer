import { describe, it, expect } from 'vitest';
import { optimize } from '../../src/engine/optimizer';


describe('solverBrief (planner context contract)', () => {
  const rect = (w: number, h: number) => ({
    type: 'Polygon' as const,
    coordinates: [[[0, 0], [w, 0], [w, h], [0, h], [0, 0]]],
  });
  const base = () => ({
    envelope: rect(207, 133),
    zoning: { maxFar: 2, maxHeightFt: 60, frontSetbackFt: 0, sideSetbackFt: 0, rearSetbackFt: 0, maxCoveragePct: 60 } as never,
    designParams: { targetFAR: 2, buildingTypology: 'bar', targetCoveragePct: 50, parking: { targetRatio: 1.5, stallWidthFt: 9, stallDepthFt: 18, aisleWidthFt: 24, adaPct: 2, evPct: 0 } } as never,
    maxIterations: 0,
  });

  it('generationAllowed=false is a REJECTION: no layout, explicit violation', () => {
    const r = optimize({ ...base(), solverBrief: { generationAllowed: false } });
    expect(r.bestElements).toHaveLength(0);
    expect(r.bestBuildings).toHaveLength(0);
    expect(r.bestViolations[0]?.code).toBe('context');
  });

  it('precedent stories cap the floor count (prior as cap, never a raise)', () => {
    const withPrior = optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { storiesP50: 1, storiesP75: 2, sampleSize: 64 } },
    });
    for (const b of withPrior.bestBuildings) {
      expect(b.floors).toBeLessThanOrEqual(2);
    }
    const without = optimize(base());
    const maxWithout = Math.max(...without.bestBuildings.map(b => b.floors ?? 1));
    expect(maxWithout).toBeGreaterThanOrEqual(2); // the cap actually bit
  });

  it('stays deterministic with a brief (same inputs → same plan)', () => {
    const brief = { generationAllowed: true, precedent: { storiesP50: 1, storiesP75: 2, footprintP90SqFt: 3216, sampleSize: 64 } };
    const a = optimize({ ...base(), solverBrief: brief });
    const b = optimize({ ...base(), solverBrief: brief });
    expect(JSON.stringify(a.bestBuildings)).toBe(JSON.stringify(b.bestBuildings));
  });
});
