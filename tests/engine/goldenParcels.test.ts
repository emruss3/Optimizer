/**
 * Golden-parcel regression suite.
 *
 * A fixed set of realistic parcel shapes (EPSG:3857, Nashville latitude) is
 * solved with fixed seeds; the key KPIs are snapshotted. Because the solver is
 * fully deterministic, ANY change to these numbers is a real behavioural
 * change — if it's intentional, update the snapshot in the same PR and say
 * why in the commit message. For a numbers product, this suite is the brand:
 * same inputs → same outputs, forever, on purpose.
 *
 * KPIs are rounded before snapshotting so ulp-level libm differences across
 * platforms can't flake the suite.
 */
import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { optimize, solveConstructive, type OptimizeInput } from '../../src/engine/optimizer';

// Nashville-ish origin in EPSG:3857
const X = -9_660_000;
const Y = 4_320_000;

const poly = (pts: number[][]): Polygon => ({
  type: 'Polygon',
  coordinates: [[...pts, pts[0]]],
});

const rect = (w: number, h: number): Polygon =>
  poly([[X, Y], [X + w, Y], [X + w, Y + h], [X, Y + h]]);

/** Envelope fixtures (metres). Shapes chosen to exercise different regimes. */
const PARCELS: Array<{ name: string; envelope: Polygon }> = [
  { name: 'small-infill-30x35', envelope: rect(30, 35) },
  { name: 'mid-rect-80x60', envelope: rect(80, 60) },
  { name: 'wide-shallow-160x40', envelope: rect(160, 40) },
  { name: 'narrow-deep-40x140', envelope: rect(40, 140) },
  {
    name: 'l-shape-120',
    envelope: poly([
      [X, Y], [X + 120, Y], [X + 120, Y + 50],
      [X + 55, Y + 50], [X + 55, Y + 120], [X, Y + 120],
    ]),
  },
  {
    name: 'trapezoid-140',
    envelope: poly([[X, Y], [X + 140, Y], [X + 110, Y + 90], [X + 25, Y + 90]]),
  },
  { name: 'large-block-220x160', envelope: rect(220, 160) },
];

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
  targetCoveragePct: 40,
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

type Kpis = Record<string, number | string | boolean>;

const round = (v: number, dp: number) => Number(v.toFixed(dp));

function kpisOf(r: ReturnType<typeof optimize>): Kpis {
  const m = r.bestMetrics;
  return {
    buildings: r.bestElements.filter(e => e.type === 'building').length,
    far: round(m.achievedFAR, 2),
    coveragePct: round(m.siteCoveragePct, 1),
    builtSF: Math.round(m.totalBuiltSF / 100) * 100,
    units: m.totalUnits ?? 0,
    stalls: m.stallsProvided ?? 0,
    stallsRequired: m.stallsRequired ?? 0,
    adaStalls: m.adaStalls ?? 0,
    evStalls: m.evStalls ?? 0,
    openSpacePct: round(m.openSpacePct, 1),
    compliant: m.zoningCompliant,
    score: round(r.finalScore, 3),
  };
}

describe('golden parcels — deterministic KPI regression', () => {
  for (const { name, envelope } of PARCELS) {
    it(`constructive solve is stable: ${name}`, () => {
      const r = solveConstructive({ envelope, zoning, designParams, seed: 42 });
      expect(kpisOf(r)).toMatchSnapshot();
    });
  }

  // SA on a representative subset (kept small for suite runtime)
  for (const { name, envelope } of [PARCELS[1], PARCELS[4], PARCELS[6]]) {
    it(`SA solve (30 iterations) is stable: ${name}`, () => {
      const r = optimize({ envelope, zoning, designParams, maxIterations: 30, seed: 42 });
      expect(kpisOf(r)).toMatchSnapshot();
    });
  }
});
