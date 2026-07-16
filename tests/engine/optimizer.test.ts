import { describe, it, expect } from 'vitest';
import { optimize, resolveScoreWeights } from '../../src/engine/optimizer';
import { createBuildingSpec } from '../../src/engine/model';


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

describe('Regrid geometry priors drive the worker layout (planner_context_v2)', () => {
  // Same envelope the contract suite above uses (the parking solver's polygon
  // clipping is only robust on this scale): 207m of frontage comfortably fits
  // the full 90–300 ft length-prior range, so the priors — not the boundary —
  // decide bar shape.
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
  const FT = 0.3048;

  it('bar depth initializes from the local median, clamped to 45–72 ft', () => {
    const at = (depthP50Ft: number) => optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { depthP50Ft, sampleSize: 5 } },
    }).bestBuildings[0];

    // In-range median is used verbatim
    expect(at(50).depthM).toBeCloseTo(50 * FT, 3);
    // Out-of-range medians clamp to the constructable window (hard bound)
    expect(at(99.8).depthM).toBeCloseTo(72 * FT, 3);
    expect(at(30).depthM).toBeCloseTo(45 * FT, 3);
  });

  it('bar length initializes from the local p75, clamped to 90–300 ft', () => {
    const at = (lengthP75Ft: number) => optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { lengthP75Ft, depthP50Ft: 60, sampleSize: 5 } },
    }).bestBuildings[0];

    expect(at(164).widthM).toBeCloseTo(164 * FT, 3);
    expect(at(500).widthM).toBeCloseTo(300 * FT, 3);
    expect(at(40).widthM).toBeCloseTo(90 * FT, 3);
  });

  it('changing ONLY the Regrid priors changes the worker output', () => {
    const shallow = optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { depthP50Ft: 50, lengthP75Ft: 120, sampleSize: 8 } },
    });
    const deep = optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { depthP50Ft: 70, lengthP75Ft: 250, sampleSize: 8 } },
    });
    expect(JSON.stringify(shallow.bestBuildings)).not.toBe(JSON.stringify(deep.bestBuildings));
  });

  it('building-count prior caps the constructive count (never below 1)', () => {
    const many = optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { buildingCountP50: 8, sampleSize: 5 } },
    });
    const one = optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { buildingCountP50: 1, sampleSize: 5 } },
    });
    expect(one.bestBuildings.length).toBe(1);
    expect(many.bestBuildings.length).toBeGreaterThanOrEqual(one.bestBuildings.length);
  });

  it('user pins remain intact during a same-context re-solve', () => {
    const brief = {
      generationAllowed: true,
      precedent: { depthP50Ft: 60, lengthP75Ft: 164, buildingCountP50: 3, sampleSize: 5 },
      objectiveWeights: { financial_return: 0.2, precedent_fit: 0.3 },
    };
    const pinnedSpec = {
      ...createBuildingSpec('user-1', { x: 60, y: 60 }, 30, 15, 4, 'MF_BAR_V1'),
      rotationRad: 0.3,
      locked: { position: true, rotation: true, dimensions: true },
    };
    const solveOnce = () => optimize({ ...base(), solverBrief: brief, pinnedBuildings: [pinnedSpec] });
    const first = solveOnce();
    const second = solveOnce();

    const kept = first.bestBuildings.find(b => b.id === 'user-1');
    expect(kept).toBeDefined();
    expect(kept!.anchor).toEqual({ x: 60, y: 60 });
    expect(kept!.widthM).toBe(30);
    expect(kept!.depthM).toBe(15);
    expect(kept!.rotationRad).toBe(0.3);
    // Same context, same pins → the re-solve reproduces the plan exactly
    expect(JSON.stringify(second.bestBuildings)).toBe(JSON.stringify(first.bestBuildings));
  });

  it('a sample below 5 is not treated as a prior', () => {
    const noPrior = optimize({ ...base() });
    const thinSample = optimize({
      ...base(),
      solverBrief: { generationAllowed: true, precedent: { depthP50Ft: 45, lengthP75Ft: 90, sampleSize: 3 } },
    });
    expect(JSON.stringify(thinSample.bestBuildings)).toBe(JSON.stringify(noPrior.bestBuildings));
  });
});

describe('context objective weights replace the hardcoded constants', () => {
  it('maps the context vocabulary onto worker score terms and normalizes to 1', () => {
    const w = resolveScoreWeights({
      objectiveWeights: {
        financial_return: 0.2,
        unit_or_program_yield: 0.2,
        parking_compliance: 0.1,
        zoning_utilization: 0.1,
        open_space_quality: 0.1,
        precedent_fit: 0.3,
      },
    });
    const sum = Object.values(w).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(w.precedentFit).toBeGreaterThan(0);
    // precedent_fit got the biggest context weight — it must dominate the
    // similarly-mapped terms after normalization
    expect(w.precedentFit).toBeGreaterThan(w.parkingCompliance);
  });

  it('no context weights → the defaults, precedent fit stays off', () => {
    const w = resolveScoreWeights(undefined);
    expect(w.precedentFit).toBe(0);
    expect(w.unitCount).toBe(0.25);
  });

  it('different objective weights change the reported score for the same plan', () => {
    const rect = {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [207, 0], [207, 133], [0, 133], [0, 0]]],
    };
    const common = {
      envelope: rect,
      zoning: { maxFar: 2, maxHeightFt: 60, frontSetbackFt: 0, sideSetbackFt: 0, rearSetbackFt: 0, maxCoveragePct: 60 } as never,
      designParams: { targetFAR: 2, buildingTypology: 'bar', targetCoveragePct: 50, parking: { targetRatio: 1.5, stallWidthFt: 9, stallDepthFt: 18, aisleWidthFt: 24, adaPct: 2, evPct: 0 } } as never,
      maxIterations: 0,
    };
    const prec = { footprintP75SqFt: 9100, coverageP75Pct: 31, storiesP75: 2, sampleSize: 5 };
    const balanced = optimize({
      ...common,
      solverBrief: { generationAllowed: true, precedent: prec, objectiveWeights: { financial_return: 0.5, precedent_fit: 0 } },
    });
    const precedentHeavy = optimize({
      ...common,
      solverBrief: { generationAllowed: true, precedent: prec, objectiveWeights: { financial_return: 0.1, precedent_fit: 0.6 } },
    });
    expect(balanced.finalScore).not.toBeCloseTo(precedentHeavy.finalScore, 6);
  });
});
