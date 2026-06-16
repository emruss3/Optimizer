import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { optimize, solveConstructive, type OptimizeInput } from './optimizer';

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
