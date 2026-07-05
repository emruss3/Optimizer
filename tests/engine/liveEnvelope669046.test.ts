import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { optimize, solveConstructive } from '../../src/engine/optimizer';

// REAL buildable envelope for Nashville parcel 669046 (EPSG:3857), captured
// from the live get_parcel_buildable_envelope RPC. A jagged ~288m × 76m
// sliver — the shape class that once collapsed the solver to a single tiny
// fallback building ("9k SF on 3 acres"). This test pins the recovery.
const envelope: Polygon = { type: 'Polygon', coordinates: [[[-9664516.995258793,4324339.544125928],[-9664513.90140764,4324343.036047951],[-9664513.26132128,4324343.901887586],[-9664512.783557385,4324344.866838614],[-9664512.483021664,4324345.900795625],[-9664512.369090496,4324346.971500304],[-9664512.445318406,4324348.04554785],[-9664513.919738058,4324357.223617471],[-9664495.784833968,4324365.064187805],[-9664494.783584196,4324365.613633759],[-9664493.902394135,4324366.340198303],[-9664493.172194347,4324367.218378369],[-9664492.618615497,4324368.217349048],[-9664492.261088703,4324369.302045574],[-9664492.112163475,4324370.434394122],[-9664492.177067222,4324371.574648244],[-9664492.453521766,4324372.682783997],[-9664492.931823302,4324373.71990482],[-9664503.852678088,4324392.534055367],[-9664501.869966991,4324407.380137989],[-9664489.299391897,4324421.570995529],[-9664488.561002284,4324422.603997905],[-9664488.052630473,4324423.767557629],[-9664487.796333184,4324425.01119135],[-9664487.54610403,4324427.532930391],[-9664441.6054739,4324142.849757889],[-9664484.141428111,4324135.920891508],[-9664516.995258793,4324339.544125928]]] };

const zoning = { frontSetbackFt: 20, sideSetbackFt: 10, rearSetbackFt: 20, maxFar: 2.0, maxCoveragePct: 60, minParkingRatio: 1.0, maxHeightFt: 65, maxDensityDuPerAcre: 40, maxImperviousPct: 80, minOpenSpacePct: 15 };
const designParams = {
  targetFAR: 1.5,
  targetCoveragePct: 50,
  parking: { targetRatio: 1.5, stallWidthFt: 9, stallDepthFt: 18, aisleWidthFt: 24, adaPct: 5, evPct: 10, layoutAngle: 0 },
  buildingTypology: 'bar',
  numBuildings: undefined,
} as const;

describe('live envelope 669046 (jagged sliver)', () => {
  it('constructive solve places multiple frontage bars, not one fallback box', () => {
    const r = solveConstructive({ envelope, zoning, designParams: designParams as never, seed: 1 });
    const buildings = r.bestElements.filter(e => e.type === 'building');
    expect(buildings.length).toBeGreaterThanOrEqual(2);
    expect(r.bestMetrics.totalBuiltSF).toBeGreaterThan(50_000);
  });

  it('SA (Generate button) never scores below its edge-hugging seed', () => {
    // SA optimizes its own objective, which on tight parcels may trade a
    // building for parking headroom (fast-score estimate — tuning tracked).
    // The hard guarantee: best-ever score is monotonic vs the seed, and the
    // plan stays non-trivial.
    const seed = solveConstructive({ envelope, zoning, designParams: designParams as never, seed: 1 });
    const r = optimize({ envelope, zoning, designParams: designParams as never, maxIterations: 50 });
    expect(r.finalScore).toBeGreaterThanOrEqual(seed.finalScore - 1e-9);
    expect(r.bestElements.filter(e => e.type === 'building').length).toBeGreaterThanOrEqual(1);
    expect(r.bestMetrics.totalBuiltSF).toBeGreaterThan(30_000);
  });
});
