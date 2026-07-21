import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { optimize, solveConstructive, type OptimizeInput } from './optimizer';
import { createBuildingSpec, type BuildingSpec } from './model';

// A ~120m square envelope in EPSG:3857 (near San Antonio); large enough to place
// at least one default multifamily bar building.
const X0 = -9664400;
const Y0 = 4324300;
const SIDE = 120;
const envelope: Polygon = {
  type: 'Polygon',
  coordinates: [[
    [X0, Y0],
    [X0 + SIDE, Y0],
    [X0 + SIDE, Y0 + SIDE],
    [X0, Y0 + SIDE],
    [X0, Y0],
  ]],
};

const zoning: OptimizeInput['zoning'] = {
  frontSetbackFt: 20,
  sideSetbackFt: 10,
  rearSetbackFt: 20,
  maxFar: 2.0,
  maxCoveragePct: 60,
  minParkingRatio: 1.0,
  maxHeightFt: 65,
  maxDensityDuPerAcre: 80,
  maxImperviousPct: 80,
  minOpenSpacePct: 10,
};

const designParams: OptimizeInput['designParams'] = {
  targetFAR: 1.5,
  targetCoveragePct: 50,
  parking: {
    targetRatio: 1.0,
    stallWidthFt: 9,
    stallDepthFt: 18,
    aisleWidthFt: 24,
    adaPct: 5,
    evPct: 10,
    layoutAngle: 0,
  },
  buildingTypology: 'bar',
  numBuildings: undefined,
};

const run = (seed?: number) =>
  optimize({ envelope, zoning, designParams, maxIterations: 40, seed });

describe('optimize (simulated annealing)', () => {
  it('produces a non-empty, plausible plan', () => {
    const result = run(123);
    const buildings = result.bestElements.filter(e => e.type === 'building');
    expect(buildings.length).toBeGreaterThanOrEqual(1);
    expect(result.bestMetrics.totalBuiltSF).toBeGreaterThan(0);
    // FAR must not exceed the zoning maximum for a compliant best plan.
    expect(result.bestMetrics.achievedFAR).toBeLessThanOrEqual(zoning.maxFar! + 1e-6);
  });

  it('is deterministic: the same seed yields an identical plan', () => {
    const a = run(42);
    const b = run(42);
    expect(a.bestMetrics.totalBuiltSF).toBe(b.bestMetrics.totalBuiltSF);
    expect(a.bestMetrics.achievedFAR).toBe(b.bestMetrics.achievedFAR);
    expect(a.bestMetrics.totalUnits).toBe(b.bestMetrics.totalUnits);
    expect(a.finalScore).toBe(b.finalScore);
    expect(a.bestElements.length).toBe(b.bestElements.length);
    // Geometry is bit-for-bit identical.
    expect(JSON.stringify(a.bestElements[0].geometry)).toBe(
      JSON.stringify(b.bestElements[0].geometry)
    );
  });

  it('defaults to a fixed seed (reproducible across calls with no seed)', () => {
    const a = run();
    const b = run();
    expect(a.finalScore).toBe(b.finalScore);
    expect(a.bestMetrics.totalBuiltSF).toBe(b.bestMetrics.totalBuiltSF);
  });

  it('honors the target-FAR slider: a higher target builds more', () => {
    // High zoning cap so feasibility never clips the target; compare a low vs
    // high targetFAR on the same parcel. Use the constructive (no-SA) path so the
    // comparison is deterministic and reflects only the target.
    const z = { ...zoning, maxFar: 3.0 };
    const low = solveConstructive({
      envelope, zoning: z, designParams: { ...designParams, targetFAR: 0.2 }, seed: 1,
    });
    const high = solveConstructive({
      envelope, zoning: z, designParams: { ...designParams, targetFAR: 2.0 }, seed: 1,
    });
    expect(high.bestMetrics.totalBuiltSF).toBeGreaterThan(low.bestMetrics.totalBuiltSF);
  });

  it('solveConstructive returns a plausible plan with no annealing', () => {
    const r = solveConstructive({ envelope, zoning, designParams, seed: 7 });
    expect(r.iterations).toBe(0);
    expect(r.bestElements.some(e => e.type === 'building')).toBe(true);
    expect(r.bestMetrics.totalBuiltSF).toBeGreaterThan(0);
  });

  it('keeps a user-pinned building exactly in place (constructive AND SA)', () => {
    const pinnedSpec: BuildingSpec = {
      ...createBuildingSpec('user-1', { x: X0 + 40, y: Y0 + 40 }, 30, 15, 4, 'MF_BAR_V1'),
      rotationRad: 0.3,
      locked: { position: true, rotation: true, dimensions: true },
    };
    for (const iters of [0, 40]) {
      const r = optimize({
        envelope, zoning, designParams,
        maxIterations: iters, seed: 21,
        pinnedBuildings: [pinnedSpec],
      });
      const kept = r.bestBuildings.find(b => b.id === 'user-1');
      expect(kept, `pinned building survived ${iters}-iteration solve`).toBeDefined();
      expect(kept!.anchor).toEqual({ x: X0 + 40, y: Y0 + 40 });
      expect(kept!.widthM).toBe(30);
      expect(kept!.depthM).toBe(15);
      expect(kept!.rotationRad).toBe(0.3);
      expect(kept!.floors).toBe(4); // dimensions locked → floors untouched too
    }
  });

  it('drops pins anchored outside the envelope (stale parcel state)', () => {
    const stale: BuildingSpec = {
      ...createBuildingSpec('stale-1', { x: X0 - 500, y: Y0 - 500 }, 30, 15, 3),
      locked: { position: true, rotation: true, dimensions: true },
    };
    const r = solveConstructive({ envelope, zoning, designParams, seed: 3, pinnedBuildings: [stale] });
    expect(r.bestBuildings.some(b => b.id === 'stale-1')).toBe(false);
  });

  it('reports ADA/EV stalls as designated subsets of provided parking', () => {
    const dp = {
      ...designParams,
      parking: { ...designParams.parking, adaPct: 5, evPct: 10 },
    };
    const r = solveConstructive({ envelope, zoning, designParams: dp, seed: 11 });
    const provided = r.bestMetrics.stallsProvided ?? 0;
    expect(provided).toBeGreaterThan(0);
    // ADA: at least one, and ceil(provided * 5%); EV: ceil(provided * 10%).
    expect(r.bestMetrics.adaStalls).toBe(Math.max(1, Math.ceil(provided * 0.05)));
    expect(r.bestMetrics.evStalls).toBe(Math.ceil(provided * 0.10));
    // They are designations within provided parking, never more than the total.
    expect(r.bestMetrics.adaStalls!).toBeLessThanOrEqual(provided);
    expect(r.bestMetrics.evStalls!).toBeLessThanOrEqual(provided);
  });

  it('constructive solve sizes floors so achieved FAR tracks the target', () => {
    // High caps so neither FAR nor height clips the requested target.
    const z = { ...zoning, maxFar: 5.0, maxHeightFt: 300 };
    const low = solveConstructive({
      envelope, zoning: z, designParams: { ...designParams, targetFAR: 1.0 }, seed: 3,
    });
    const high = solveConstructive({
      envelope, zoning: z, designParams: { ...designParams, targetFAR: 3.0 }, seed: 3,
    });
    // Achieved FAR rises with the target and lands within ~one floor of it.
    expect(high.bestMetrics.achievedFAR).toBeGreaterThan(low.bestMetrics.achievedFAR);
    expect(Math.abs(low.bestMetrics.achievedFAR - 1.0)).toBeLessThan(0.75);
    expect(Math.abs(high.bestMetrics.achievedFAR - 3.0)).toBeLessThan(0.75);
  });

  it('constructive achieved FAR never exceeds zoning.maxFar (rounding capped)', () => {
    const z = { ...zoning, maxFar: 1.5, maxHeightFt: 400 };
    const r = solveConstructive({
      envelope, zoning: z,
      designParams: { ...designParams, targetFAR: 3.0 }, seed: 9,
    });
    expect(r.bestMetrics.achievedFAR).toBeLessThanOrEqual(1.5 + 1e-6);
    expect(r.bestMetrics.achievedFAR).toBeGreaterThan(0.4); // still builds meaningfully
    expect(r.bestMetrics.violations.some(v => v.includes('FAR'))).toBe(false);
  });

  it('constructive mode honors an explicitly requested numBuildings', () => {
    const r = solveConstructive({
      envelope, zoning,
      designParams: { ...designParams, numBuildings: 1, targetCoveragePct: 60 }, seed: 13,
    });
    const buildings = r.bestElements.filter(e => e.type === 'building');
    expect(buildings.length).toBe(1);
  });

  it('constructive solve lets target coverage drive the building count', () => {
    // A larger envelope so the coverage-driven count isn't physically capped.
    const SIDE2 = 320;
    const bigEnvelope: Polygon = {
      type: 'Polygon',
      coordinates: [[
        [X0, Y0],
        [X0 + SIDE2, Y0],
        [X0 + SIDE2, Y0 + SIDE2],
        [X0, Y0 + SIDE2],
        [X0, Y0],
      ]],
    };
    const z = { ...zoning, maxCoveragePct: 80, maxFar: 5.0, maxHeightFt: 400 };
    const low = solveConstructive({
      envelope: bigEnvelope, zoning: z,
      designParams: { ...designParams, targetCoveragePct: 10, targetFAR: 1.0 }, seed: 5,
    });
    const high = solveConstructive({
      envelope: bigEnvelope, zoning: z,
      designParams: { ...designParams, targetCoveragePct: 30, targetFAR: 1.0 }, seed: 5,
    });
    // Coverage rises with the target...
    expect(high.bestMetrics.siteCoveragePct).toBeGreaterThan(low.bestMetrics.siteCoveragePct);
    // ...and the low target (10%, well under any cap) tracks within a few points.
    expect(low.bestMetrics.siteCoveragePct).toBeGreaterThan(6);
    expect(low.bestMetrics.siteCoveragePct).toBeLessThan(16);
  });
});

// ── WO-0: the worker's widened diet ─────────────────────────────────────────

describe('WO-0: brief-wins contract + capture-primary objective', () => {
  const briefFull = {
    generationAllowed: true,
    hardConstraints: { maxFar: 1.2, maxHeightFt: 55, maxCoveragePct: 45 },
    parking: { ratio: 1.25, stallWidthFt: 9, stallDepthFt: 18, aisleWidthFt: 24 },
    maxBuildout: { maxGsf: 90000, atStories: 5 },
  };

  it('records every brief-sourced input and NO legacy use when the brief is complete', () => {
    const r = solveConstructive({
      envelope, zoning, designParams,
      parkingSpec: { stallW: 2.7432, stallD: 5.4864, aisleW: 7.3152, anglesDeg: [0] },
      seed: 5,
      solverBrief: briefFull,
    });
    expect(r.contract).toBeTruthy();
    expect(r.contract!.briefFieldsUsed).toEqual(
      expect.arrayContaining(['maxFar', 'maxCoveragePct', 'maxHeightFt', 'parkingRatio', 'parkingSpec', 'maxGsf'])
    );
    expect(r.contract!.legacyFieldsUsed).toEqual([]);
  });

  it('flags legacy fallback per-field when the brief is partial', () => {
    const r = solveConstructive({
      envelope, zoning, designParams,
      parkingSpec: { stallW: 2.7432, stallD: 5.4864, aisleW: 7.3152, anglesDeg: [0] },
      seed: 5,
      solverBrief: { generationAllowed: true, hardConstraints: { maxFar: 1.2 } },
    });
    expect(r.contract!.briefFieldsUsed).toContain('maxFar');
    expect(r.contract!.legacyFieldsUsed).toEqual(
      expect.arrayContaining(['maxCoveragePct', 'maxHeightFt', 'parkingRatio', 'parkingSpec'])
    );
  });

  it('no brief → no contract receipt (nothing to deprecate against)', () => {
    const r = solveConstructive({ envelope, zoning, designParams, seed: 5 });
    expect(r.contract).toBeUndefined();
  });

  it('WO-0d: a coverage-capped site CLIMBS floors toward the max-buildout GSF instead of settling', () => {
    const withTarget = solveConstructive({
      envelope, zoning, designParams,
      seed: 9,
      solverBrief: {
        generationAllowed: true,
        maxBuildout: { maxGsf: 140000, atStories: 6 },
        hardConstraints: { maxFar: 2.0, maxHeightFt: 75, maxCoveragePct: 45 },
      },
    });
    const without = solveConstructive({ envelope, zoning, designParams, seed: 9 });
    const floorsOf = (r: typeof withTarget) =>
      r.bestBuildings.length ? Math.max(...r.bestBuildings.map(b => b.floors ?? 1)) : 0;
    expect(floorsOf(withTarget)).toBeGreaterThanOrEqual(floorsOf(without));
    expect(withTarget.bestMetrics?.totalBuiltSF ?? 0).toBeGreaterThanOrEqual(
      without.bestMetrics?.totalBuiltSF ?? 0
    );
  });
});

describe('WO3: the massing program is a composition directive', () => {
  it('honors building count, bar dims, and stories (553450 acceptance shape: 2 × 253 ft × 4 st)', () => {
    // Envelope big enough for two 253-ft bars: 200m × 160m.
    const bigEnv: Polygon = {
      type: 'Polygon',
      coordinates: [[
        [X0, Y0], [X0 + 200, Y0], [X0 + 200, Y0 + 160], [X0, Y0 + 160], [X0, Y0],
      ]],
    };
    const r = solveConstructive({
      envelope: bigEnv, zoning, designParams, seed: 5,
      solverBrief: {
        generationAllowed: true,
        maxBuildout: { maxGsf: 136400, atStories: 4 },
        hardConstraints: { maxFar: 2.0, maxHeightFt: 70, maxCoveragePct: 60 },
        massingProgram: {
          buildingCount: 2,
          barLengthFt: 253,
          barDepthFt: 67.3,
          stories: 4,
          parti: 'street_bar_parking_behind',
          constructionType: 'V-A',
          constructionMaxStories: 4,
          rationale: '136400 GSF @ 4 stories (V-A) → 2 building(s) × 253 ft.',
          targetGsf: 136400,
        },
      },
    });
    expect(r.bestBuildings).toHaveLength(2);
    const widthsFt = r.bestBuildings.map(b => Math.round(b.widthM / 0.3048)).sort((a, b) => b - a);
    // The directive sizes bars at 253 ft; envelope fit may shorten one.
    expect(widthsFt[0]).toBeGreaterThanOrEqual(200);
    expect(widthsFt[0]).toBeLessThanOrEqual(260);
    expect(Math.max(...r.bestBuildings.map(b => b.floors ?? 1))).toBe(4);
    expect(r.contract!.briefFieldsUsed).toEqual(
      expect.arrayContaining(['buildingCount', 'barLengthFt', 'barDepthFt'])
    );
  });
});
