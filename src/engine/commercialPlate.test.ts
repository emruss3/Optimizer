import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { layoutCommercialPlate, canvasStallCells, type Pt } from './commercialPlate';
import { classifyParcelEdges, applyVariableSetbacks } from './setbacks';
import { feature4326To3857 } from '../utils/reproject';
import { areaM2, intersection, polygons, mercatorCorrectionFactor } from './geometry';

const at = <T,>(arr: T[], i: number): T => arr[i] as T;

// 2405 12th Ave S (ogc_fid 408571, CS): a 170 × 50 ft slot rotated ~7° off the
// screen axes, 12th Ave S on the short EAST edge (frontage bearing 184.5°),
// an alley on the west, neighbours on both long sides. Setbacks F 20 / S 0 /
// R 20; FAR 0.6 on 8,622 SF → 5,173 SF allowable.
const PARCEL_4326: Polygon = {
  type: 'Polygon',
  coordinates: [[
    [-86.7899665, 36.125886], [-86.789946, 36.1260225], [-86.789374, 36.1259645],
    [-86.789386, 36.125826], [-86.7899665, 36.125886],
  ]],
};
const FRONT_4326: Pt[] = [[-86.789374355, 36.125960406], [-86.789385643, 36.125830117]];
const LOT_SQFT = 8622;
const MAX_GFA = 5173;
const PARKING = { stallWidthFt: 9, stallDepthFt: 18, aisleWidthFt: 24 };

// CCW ring: applyVariableSetbacks re-indexes the edge classes off by one on a
// CW ring (pre-existing; the live envelope comes from the brief, not from
// this construction), so the fixture is wound CCW to build the same envelope.
const parcel3857: Polygon = ((): Polygon => {
  const p = feature4326To3857(PARCEL_4326);
  const r = p.coordinates[0] as Pt[];
  let s2 = 0;
  for (let i = 0; i < r.length - 1; i++) s2 += at(r, i)[0] * at(r, i + 1)[1] - at(r, i + 1)[0] * at(r, i)[1];
  return s2 >= 0 ? p : { type: 'Polygon', coordinates: [[...r].reverse()] };
})();
const front3857 = feature4326To3857({ type: 'LineString', coordinates: FRONT_4326 }).coordinates as Pt[];
const k = mercatorCorrectionFactor(parcel3857);
// The live envelope is built in EPSG:2274 true feet — offset the same true
// distance here, expressed in Mercator metres at this latitude.
const trueFtToMercM = (ft: number) => (ft * 0.3048) / Math.sqrt(k);
const edges = classifyParcelEdges(parcel3857, [], 184.5);
const envelope = applyVariableSetbacks(parcel3857, edges, {
  front: trueFtToMercM(20), side: 0, rear: trueFtToMercM(20),
})!;

const trueSqft = (p: Polygon | null) => (p ? areaM2(p) * k * 10.7639 : 0);
const ring = (p: Polygon): Pt[] => p.coordinates[0] as Pt[];
const seg = (line: Pt[]): [Pt, Pt] => [at(line, 0), at(line, line.length - 1)];
const centroid = (p: Polygon): Pt => {
  const r = ring(p); const n = r.length - 1;
  return [r.slice(0, n).reduce((s, q) => s + q[0], 0) / n, r.slice(0, n).reduce((s, q) => s + q[1], 0) / n];
};
const distToSeg = (p: Pt, a: Pt, b: Pt) => {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(p[0] - (a[0] + t * ex), p[1] - (a[1] + t * ey));
};
const edgeAngles = (p: Polygon): number[] => {
  const r = ring(p); const out: number[] = [];
  for (let i = 0; i < r.length - 1; i++) {
    const a = at(r, i), b = at(r, i + 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0.05) out.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  return out;
};
const angleDiffDeg = (a: number, b: number) => {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return (d * 180) / Math.PI;
};
const insideEnvelope = (p: Polygon) => {
  const inter = polygons(intersection(envelope, p)).reduce((s, q) => s + areaM2(q), 0);
  return Math.abs(inter - areaM2(p)) < 0.05; // m²
};
const overlapM2 = (a: Polygon, b: Polygon) => polygons(intersection(a, b)).reduce((s, q) => s + areaM2(q), 0);

describe('commercial plate — 408571 (2405 12th Ave S, CS)', () => {
  const layout = layoutCommercialPlate({
    envelope, frontLine: front3857, targetFootprintSqft: MAX_GFA, lotSqft: LOT_SQFT,
    parking: PARKING, sqftPerStall: 300, maxImperviousSqft: 7759,
  })!;
  const all = [layout.building, ...layout.stallRows, ...(layout.drive ? [layout.drive] : []), ...(layout.landscape ? [layout.landscape] : [])];

  it('lays out', () => {
    expect(layout).not.toBeNull();
    expect(layout.stallRows.length).toBeGreaterThan(0);
    expect(layout.drive).not.toBeNull();
  });

  it('BUILDING FIRST: the plate reaches max GFA — FAR ≈ 0.60, not a bar starved by parking', () => {
    expect(layout.footprintSqft).toBeGreaterThan(MAX_GFA * 0.99);
    expect(layout.footprintSqft).toBeLessThanOrEqual(MAX_GFA + 1);
    expect(layout.achievedFar!).toBeCloseTo(0.6, 2);
    expect(layout.giveBackSqft).toBe(0);
    // The building dominates the site plan; parking is the remnant.
    const parkingSqft = layout.stallRows.reduce((s, p) => s + trueSqft(p), 0) + trueSqft(layout.drive);
    expect(parkingSqft).toBeLessThan(layout.footprintSqft / 3);
  });

  it('fronts 12th Ave S: the building sits on the front setback line, parking behind it', () => {
    const [fa, fb] = seg(front3857);
    const dBuilding = distToSeg(centroid(layout.building), fa, fb);
    for (const row of layout.stallRows) expect(distToSeg(centroid(row), fa, fb)).toBeGreaterThan(dBuilding);
    expect(distToSeg(centroid(layout.drive!), fa, fb)).toBeGreaterThan(dBuilding);
    // The front face touches the envelope's front edge (within 2 cm).
    const frontEdgeDist = Math.min(...ring(layout.building).map(p => distToSeg(p, fa, fb)));
    const envFrontDist = Math.min(...ring(envelope).map(p => distToSeg(p, fa, fb)));
    expect(Math.abs(frontEdgeDist - envFrontDist)).toBeLessThan(0.02);
  });

  it('ON-PLANE: every edge of every band is parallel to a parcel edge or square to the lot sides', () => {
    const envAngles = edgeAngles(envelope);
    const axes = [...envAngles, ...envAngles.map(a => a + Math.PI / 2)];
    for (const poly of all) {
      for (const a of edgeAngles(poly)) {
        expect(Math.min(...axes.map(x => angleDiffDeg(a, x)))).toBeLessThan(0.5);
      }
    }
    // Not axis-aligned to EPSG:3857: the lot is rotated ~7°, so must the plate be.
    const bldgAngles = edgeAngles(layout.building);
    expect(Math.min(...bldgAngles.map(a => angleDiffDeg(a, 0)))).toBeGreaterThan(5);
  });

  it('stays inside the setback-adjusted envelope and tiles it without dead wedges', () => {
    for (const poly of all) expect(insideEnvelope(poly)).toBe(true);
    const tiled = all.reduce((s, p) => s + areaM2(p), 0);
    expect(Math.abs(tiled - areaM2(envelope))).toBeLessThan(0.5); // m² — nothing left over
  });

  it('bands abut without overlapping (geometry gate)', () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(overlapM2(at(all, i), at(all, j))).toBeLessThan(0.05);
    }
  });

  it('honest stalls: modest, one row, counted the way the canvas stripes them, short of 1/300 and flagged', () => {
    expect(layout.stallRows).toHaveLength(1);
    const drawn = canvasStallCells(ring(at(layout.stallRows, 0)), 9 * 0.3048);
    expect(layout.stallsProvided).toBe(drawn);
    expect(layout.stallsProvided).toBeGreaterThanOrEqual(5);
    expect(layout.stallsProvided).toBeLessThanOrEqual(7);
    expect(layout.stallsRequired).toBe(Math.ceil(layout.footprintSqft / 300));
    expect(layout.stallsProvided).toBeLessThan(layout.stallsRequired);
    expect(layout.flags).toContain('parking_below_ratio');
    // One stall row (18 ft) plus the rear apron the remnant allows.
    expect(layout.depthsFt.stalls).toBeCloseTo(18, 0);
    expect(layout.depthsFt.drive).toBeGreaterThanOrEqual(8);
    expect(layout.depthsFt.building + layout.depthsFt.stalls + layout.depthsFt.drive + layout.depthsFt.landscape)
      .toBeCloseTo(layout.depthsFt.envelope, 0);
    expect(layout.flags).not.toContain('impervious_over_cap');
  });
});

describe('commercial plate — frame follows the frontage, not the screen axes', () => {
  // A 60 × 30 m rectangle rotated 30°, street along a LONG edge: the depth
  // axis must run across the short dimension so parking lands BEHIND the
  // building, not beside it.
  const rot = (p: Pt, a: number): Pt => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const a = Math.PI / 6;
  const base: Pt[] = [[0, 0], [60, 0], [60, 30], [0, 30], [0, 0]];
  const env: Polygon = { type: 'Polygon', coordinates: [base.map(p => rot(p, a))] };
  const front: Pt[] = [rot([-5, -3], a), rot([65, -3], a)]; // street just south of the long edge
  const kk = mercatorCorrectionFactor(env); // ≈1 at the equator-ish origin
  const layout = layoutCommercialPlate({
    envelope: env, frontLine: front,
    targetFootprintSqft: 60 * 12 * kk * 10.7639, // a 12 m deep plate across the full 60 m frontage
    lotSqft: 60 * 45 * kk * 10.7639, parking: PARKING, sqftPerStall: 300,
  })!;

  it('puts the plate across the whole frontage and the parking behind it', () => {
    expect(layout).not.toBeNull();
    const [fa, fb] = seg(front);
    const dB = distToSeg(centroid(layout.building), fa, fb);
    for (const row of layout.stallRows) expect(distToSeg(centroid(row), fa, fb)).toBeGreaterThan(dB);
    // Full 60 m width: the building's longest edge is the frontage length.
    const r = ring(layout.building);
    let longest = 0;
    for (let i = 0; i < r.length - 1; i++) longest = Math.max(longest, Math.hypot(at(r, i + 1)[0] - at(r, i)[0], at(r, i + 1)[1] - at(r, i)[1]));
    expect(longest).toBeCloseTo(60, 1);
    // Rotated with the lot.
    for (const ang of edgeAngles(layout.building)) expect(Math.min(angleDiffDeg(ang, a), angleDiffDeg(ang, a + Math.PI / 2))).toBeLessThan(0.5);
    // 30 m deep lot, 12 m plate → 18 m remnant = 5.5 m stalls + 12.5 m apron
    expect(layout.stallRows).toHaveLength(1);
    expect(layout.drive).not.toBeNull();
  });

  it('opens a double-loaded rear module with an entry throat when the remnant is deep enough', () => {
    const deep: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [40, 0], [40, 60], [0, 60], [0, 0]]] };
    const kd = mercatorCorrectionFactor(deep);
    const L = layoutCommercialPlate({
      envelope: deep, frontLine: [[-5, -2], [45, -2]],
      targetFootprintSqft: 40 * 30 * kd * 10.7639, lotSqft: 40 * 80 * kd * 10.7639,
      parking: PARKING, sqftPerStall: 300,
    })!;
    // 30 m remnant ≥ 2×5.5 + 7.3 → two rows; the rear row is split around the throat
    expect(L.flags).toContain('parking_double_loaded_rear');
    expect(L.stallRows.length).toBe(3);
    expect(L.drive).not.toBeNull();
    // the drive reaches the rear edge of the envelope (through the throat)
    const maxY = Math.max(...ring(L.drive!).map(p => p[1]));
    expect(maxY).toBeCloseTo(60, 1);
  });

  it('gives back at most 5 % of the footprint to fit one parking module, else FAR wins', () => {
    const lot: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [20, 0], [20, 40], [0, 40], [0, 0]]] };
    const kl = mercatorCorrectionFactor(lot);
    // Remnant would be 8 m: a stall (5.5) + 2.5 m — short of the 3 m apron by 0.5 m → 0.5×20 = 10 m² of 640 (1.6 %) → trimmed
    const near = layoutCommercialPlate({
      envelope: lot, frontLine: [[-1, -1], [21, -1]],
      targetFootprintSqft: 20 * 32 * kl * 10.7639, lotSqft: 20 * 60 * kl * 10.7639,
      parking: PARKING, sqftPerStall: 300,
    })!;
    expect(near.flags).toContain('footprint_trimmed_for_parking_module');
    expect(near.giveBackSqft).toBeLessThanOrEqual(20 * 32 * kl * 10.7639 * 0.05 + 1e-6);
    expect(near.stallRows).toHaveLength(1);
    // Remnant 3 m: would need a 5.5 m give-back (14 %) → no stalls, a drive only, FAR intact
    const far = layoutCommercialPlate({
      envelope: lot, frontLine: [[-1, -1], [21, -1]],
      targetFootprintSqft: 20 * 37 * kl * 10.7639, lotSqft: 20 * 60 * kl * 10.7639,
      parking: PARKING, sqftPerStall: 300,
    })!;
    expect(far.giveBackSqft).toBe(0);
    expect(far.stallRows).toHaveLength(0);
    expect(far.flags).toContain('no_on_site_parking_fits');
    expect(far.footprintSqft).toBeCloseTo(20 * 37 * kl * 10.7639, 0);
  });
});

describe('canvasStallCells mirrors the canvas striping grid', () => {
  it('counts full cells between the dividers the canvas draws', () => {
    const band: Pt[] = [[0, 0], [18, 0], [18, 5.5], [0, 5.5], [0, 0]];
    // centre at x = 9 → local −9..9; dividers from ceil(−9/2.7432)·2.7432 = −8.23 → floor(17.23/2.7432) = 6
    expect(canvasStallCells(band, 9 * 0.3048)).toBe(6);
    expect(canvasStallCells(band, 0)).toBe(0);
  });
});
