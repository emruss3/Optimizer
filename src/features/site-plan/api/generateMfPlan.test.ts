import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mfPlanToElements,
  isMfPlanElement,
  isContextContractError,
  listMfCandidates,
  generateMfSitePlanV2,
  generateThSitePlan,
  type MfPlanResponse,
} from './generateMfPlan';

const rpcMock = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

beforeEach(() => {
  rpcMock.mockReset();
});

// Live-shaped fixture (structure verified against fn_generate_mf_site_plan on
// parcel 669046; coordinates simplified). Areas are EPSG:2274 backend truth.
const square = (lon: number, lat: number, d = 0.0005) => ({
  type: 'Polygon',
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});

const RESP: MfPlanResponse = {
  parcel_ogc_fid: 669046,
  typology: 'multifamily',
  seed: 1,
  plan_basis: '2 garden bars · 3 floors · entry drive from primary frontage · 52 stalls surface (1.5/unit target)',
  persisted: true,
  buildings: [
    { i: 1, footprint_sqft: 16250, floors: 3, geom: square(-86.81, 36.14) },
    { i: 2, footprint_sqft: 7768, floors: 3, geom: JSON.stringify(square(-86.809, 36.14)) },
  ],
  parking: [
    { stalls: 40, geom: square(-86.811, 36.141) },
    { stalls: 12, geom: square(-86.8105, 36.141) },
  ],
  drives: [{ geom: square(-86.8112, 36.1405) }],
  greens: [{ area_sqft: 4200, geom: square(-86.8095, 36.1408) }],
  amenity: [{ name: 'Clubhouse + Pool', area_sqft: 5800, geom: square(-86.8118, 36.1402) }],
  metrics: {
    bars: 2, floors: 3, footprint_sqft: 24018, gfa_sqft: 72054,
    units_est: 75, stalls: 52, stalls_required: 113,
    parking_ratio_provided: 0.69, coverage_pct: 23.3, far: 0.7,
    parcel_sqft: 103101, open_space_pct: 62.1,
  },
  flags: ['front_setback_estimated', 'parking_below_ratio', 'entry_from_longest_frontage_heuristic'],
};

describe('mfPlanToElements', () => {
  it('maps the full site system with backend-true areas and worker-matching types', () => {
    const { elements, metrics, basis, flags } = mfPlanToElements(RESP);

    const byType = (t: string) => elements.filter(e => e.type === t);
    // 2 bars + 1 amenity render as buildings; parking/drives/greens keep the
    // exact vocabulary the client engine uses (legend/labels/styles all work)
    expect(byType('building')).toHaveLength(3);
    expect(byType('parking')).toHaveLength(2);
    expect(byType('circulation')).toHaveLength(1);
    expect(byType('greenspace')).toHaveLength(1);

    const b1 = elements.find(e => e.id === 'mfgen-bldg-1')!;
    expect(b1.properties?.areaSqFt).toBe(16250); // EPSG:2274 truth, not re-measured
    expect(b1.properties?.floors).toBe(3);
    expect(Array.isArray(b1.properties?.unitMix)).toBe(true); // unit floorplates render

    // Stringified GeoJSON tolerated (PostgREST sometimes stringifies)
    expect(elements.find(e => e.id === 'mfgen-bldg-2')).toBeTruthy();

    const amenity = elements.find(e => e.id === 'mfgen-amenity-1')!;
    expect(amenity.name).toBe('Clubhouse + Pool');
    expect(amenity.properties?.floors).toBe(1);
    expect(amenity.properties?.unitMix).toBeUndefined();

    expect(elements.find(e => e.id === 'mfgen-park-1')!.name).toContain('40 stalls');
    expect(elements.find(e => e.id === 'mfgen-drive-1')!.name).toBe('Main Drive');

    // Planner metrics for the KPI strip + pro forma
    expect(metrics).toMatchObject({
      totalBuiltSF: 72054,
      achievedFAR: 0.7,
      siteCoveragePct: 23.3,
      totalUnits: 75,
      stallsProvided: 52,
      stallsRequired: 113,
    });

    expect(basis).toContain('2 garden bars');
    expect(flags).toContain('parking_below_ratio');
  });

  it('identifies server-plan elements for replace-on-regenerate', () => {
    const { elements } = mfPlanToElements(RESP);
    expect(elements.every(isMfPlanElement)).toBe(true);
    expect(isMfPlanElement({ id: 'building-1' })).toBe(false);
    expect(isMfPlanElement({ id: 'gen-lot-1' })).toBe(false);
  });

  it('carries the solver optimization verdict + proof VERBATIM into metrics', () => {
    const { metrics } = mfPlanToElements({
      ...RESP,
      metrics: {
        ...(RESP.metrics as Record<string, unknown>),
        optimization_status: 'feasible_demonstrably_constrained',
        optimization_proof: { proof_basis: 'buildable_envelope_exhausted', constraint_proven: true },
      },
    });
    expect(metrics?.optimizationStatus).toBe('feasible_demonstrably_constrained');
    expect(metrics?.optimizationProof).toEqual({
      proof_basis: 'buildable_envelope_exhausted',
      constraint_proven: true,
    });
  });

  it('carries the parking regime + regime-comparison receipts VERBATIM into metrics', () => {
    const { metrics } = mfPlanToElements({
      ...RESP,
      metrics: {
        ...(RESP.metrics as Record<string, unknown>),
        regime: 'tuck_under',
        regime_comparison: {
          surface_gsf: null,
          surface_error: 'planner_parking_infeasible',
          tuck_under_gsf: 227760,
          chosen: 'tuck_under',
          basis: 'complete_real_solves_argmax_gsf',
        },
      },
    });
    expect(metrics?.parkingRegime).toBe('tuck_under');
    expect(metrics?.regimeComparison).toEqual({
      surface_gsf: null,
      surface_error: 'planner_parking_infeasible',
      tuck_under_gsf: 227760,
      chosen: 'tuck_under',
      basis: 'complete_real_solves_argmax_gsf',
    });
  });

  it('dedupes flags — best-effort pinned solves append their marker once per softened gate', () => {
    const { flags } = mfPlanToElements({
      ...RESP,
      flags: [
        'parking_below_ratio', 'pinned_best_effort_v1',
        'impervious_coverage_exceeded_pinned', 'pinned_best_effort_v1',
        'unit_gsf_out_of_band_pinned', 'pinned_best_effort_v1',
      ],
    });
    expect(flags).toEqual([
      'parking_below_ratio', 'pinned_best_effort_v1',
      'impervious_coverage_exceeded_pinned', 'unit_gsf_out_of_band_pinned',
    ]);
  });

  it('degenerate/empty responses map to zero elements and null metrics', () => {
    const { elements, metrics } = mfPlanToElements({ generation: 'envelope too shallow for a building bar' });
    expect(elements).toHaveLength(0);
    expect(metrics).toBeNull();
    // garbage geometry is skipped, not thrown
    const r = mfPlanToElements({ buildings: [{ i: 1, geom: 'not-json' }], metrics: { gfa_sqft: 100 } });
    expect(r.elements).toHaveLength(0);
  });
});

describe('townhome plans (th_context_v1) ride the same pipeline', () => {
  const TH_RESP: MfPlanResponse = {
    parcel_ogc_fid: 669046,
    typology: 'townhome',
    seed: 1,
    plan_basis: 'Townhomes on planner_context_v2 · 41 TH comps (medium) · 10 bldgs / 52 units × 2 fl',
    persisted: true,
    buildings: [
      { i: 1, units: 6, footprint_sqft: 4206, floors: 2, geom: square(-86.81, 36.14) },
      { i: 2, units: 4, footprint_sqft: 2804, floors: 2, geom: square(-86.809, 36.14) },
    ],
    parking: [{ stalls: 30, geom: square(-86.811, 36.141) }],
    drives: [{ geom: square(-86.8112, 36.1405) }],
    greens: [{ area_sqft: 3200, geom: square(-86.8095, 36.1408) }],
    amenity: [],
    metrics: {
      buildings: 2, bars: 2, floors: 2, footprint_sqft: 7010, gfa_sqft: 14020,
      units_est: 10, unit_cap: 68, unit_w_ft: 19, unit_d_ft: 36.9,
      stalls: 20, stalls_required: 15, parking_ratio_provided: 2,
      coverage_pct: 6.8, far: 0.14, parcel_sqft: 103101, open_space_pct: 80.1,
    },
    flags: ['townhome_on_multifamily_legal_basis', 'attached_ordinance_standards_applied'],
  };

  it('maps townhome rows with their real unit counts (not the GFA estimate)', () => {
    const { elements, metrics } = mfPlanToElements(TH_RESP);
    const rows = elements.filter(e => e.type === 'building');
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Townhomes 1 · 6u');
    // unitMix reflects the server's placed units for the row, not GFA/950
    const mix = rows[0].properties?.unitMix as { count: number }[] | undefined;
    const totalUnits = (mix ?? []).reduce((s, u) => s + u.count, 0);
    expect(totalUnits).toBe(6);
    expect(metrics?.totalUnits).toBe(10);
    // A TOWNHOME is not a small apartment building: the mix is a single
    // 'townhome' row (full-depth party-wall dwellings, garage+apron parking),
    // never a studio/1BR distribution — and the row carries its unit form so
    // the canvas renders party-wall slices instead of a corridor floorplate.
    const typed = rows[0].properties?.unitMix as Array<{ type: string; count: number; avgSqft: number; parkingRatio?: number }>;
    expect(typed).toHaveLength(1);
    expect(typed[0].type).toBe('townhome');
    expect(typed[0].parkingRatio).toBe(2.0);
    expect(Math.round(typed[0].avgSqft)).toBe(Math.round((4206 * 2) / 6));
    const th = rows[0].properties?.th as { units: number; unitWFt: number | null; unitDFt: number | null };
    expect(th).toEqual({ units: 6, unitWFt: 19, unitDFt: 36.9 });
    // mfgen ids: pins/strip/regenerate logic treats products identically
    expect(rows.every(isMfPlanElement)).toBe(true);
  });

  it('generateThSitePlan hits the townhome RPC with the context id', async () => {
    rpcMock.mockResolvedValueOnce({ data: TH_RESP, error: null });
    const resp = await generateThSitePlan(669046, 'ctx-th-1', { seed: 3, persist: false });
    expect(rpcMock).toHaveBeenCalledWith('fn_generate_th_site_plan', expect.objectContaining({
      p_ogc_fid: 669046,
      p_context_id: 'ctx-th-1',
      p_seed: 3,
      p_persist: false,
    }));
    expect(resp?.typology).toBe('townhome');
  });

  it('contract rejections surface as responses; transport failures as null', async () => {
    rpcMock.mockResolvedValueOnce({ data: { error: 'planner_generation_not_allowed' }, error: null });
    const rejected = await generateThSitePlan(669046, 'ctx-th-1');
    expect(rejected?.error).toBe('planner_generation_not_allowed');
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    const failed = await generateThSitePlan(669046, 'ctx-th-1');
    expect(failed).toBeNull();
  });
});

describe('context-contract error taxonomy (no silent legacy fallback)', () => {
  it('recognizes every contract rejection the v2 RPC can return', () => {
    for (const err of [
      'planner_context_required',
      'planner_context_not_found',
      'planner_context_parcel_mismatch',
      'planner_context_use_mismatch',
      'planner_generation_not_allowed',
      'planner_solver_brief_invalid',
    ]) {
      expect(isContextContractError(err)).toBe(true);
    }
    // Future planner_* contract errors are contract errors too
    expect(isContextContractError('planner_new_rejection_kind')).toBe(true);
  });

  it('transport-ish/other failures are NOT contract errors (fallback window stays open)', () => {
    expect(isContextContractError(null)).toBe(false);
    expect(isContextContractError(undefined)).toBe(false);
    expect(isContextContractError('network timeout')).toBe(false);
    expect(isContextContractError('envelope too shallow for a building bar')).toBe(false);
  });
});

describe('generateMfSitePlanV2 (context-driven generation)', () => {
  it('sends the context id on the wire — the contract, not a vibe', async () => {
    rpcMock.mockResolvedValue({ data: { parcel_ogc_fid: 1, context_id: 'ctx-1' }, error: null });
    await generateMfSitePlanV2(669046, 'ctx-1', { seed: 3, persist: false });
    expect(rpcMock).toHaveBeenCalledWith('fn_generate_mf_site_plan_v2', expect.objectContaining({
      p_ogc_fid: 669046,
      p_context_id: 'ctx-1',
      p_seed: 3,
      p_persist: false,
    }));
  });

  it('contract rejections come back as responses (surfaced), transport failures as null', async () => {
    rpcMock.mockResolvedValue({ data: { error: 'planner_context_parcel_mismatch' }, error: null });
    const rejected = await generateMfSitePlanV2(669046, 'ctx-1');
    expect(rejected?.error).toBe('planner_context_parcel_mismatch');
    rpcMock.mockResolvedValue({ data: null, error: { message: '500' } });
    expect(await generateMfSitePlanV2(669046, 'ctx-1')).toBeNull();
  });
});

describe('listMfCandidates (saved candidates keep their stored context)', () => {
  it('reads context_id/context_hash tolerantly: row level, metrics level, or absent (v1)', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: 'a', created_at: 't1', seed: 1, pins: [], parent_candidate_id: null,
          metrics: { units_est: 75 }, context_id: 'ctx-row', context_hash: 'hash-row' },
        { id: 'b', created_at: 't2', seed: 2, pins: [], parent_candidate_id: 'a',
          metrics: { units_est: 60, context_id: 'ctx-metrics', context_hash: 'hash-metrics' } },
        { id: 'c', created_at: 't3', seed: 3, pins: [], parent_candidate_id: null,
          metrics: { units_est: 40 } },
      ],
      error: null,
    });
    const cands = await listMfCandidates(669046);
    expect(cands.map(c => c.contextId)).toEqual(['ctx-row', 'ctx-metrics', null]);
    expect(cands.map(c => c.contextHash)).toEqual(['hash-row', 'hash-metrics', null]);
  });

  it('fails soft to an empty rail', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await listMfCandidates(669046)).toEqual([]);
  });
});

// Crash regression: the KPI strip must survive server-shaped metrics.
import { render } from '@testing-library/react';
import React from 'react';
import KpiStrip from '../ui/KpiStrip';

describe('KpiStrip with server-generated metrics (crash regression)', () => {
  it('renders the mapped metrics without violations/zoningCompliant crashing it', () => {
    const { metrics } = mfPlanToElements(RESP);
    const { getByText } = render(React.createElement(KpiStrip, { metrics, investment: null }));
    // 52/113 is parking-short: the chip must say so, not claim "Compliant"
    // next to a red stalls stat (honesty over green).
    expect(getByText(/Code compliant · constrained: parking short/)).toBeTruthy();
    expect(getByText('52 / 113')).toBeTruthy();
  });

  it('fully-parked compliant plans keep the green Compliant chip', () => {
    const { metrics } = mfPlanToElements({
      ...RESP,
      metrics: { ...RESP.metrics, stalls: 120, stalls_required: 113 },
    });
    const { getByText } = render(React.createElement(KpiStrip, { metrics, investment: null }));
    expect(getByText('Code compliant')).toBeTruthy();
  });

  it('tolerates metrics missing optional fields entirely', () => {
    const bare = { totalBuiltSF: 1000, achievedFAR: 0.5 } as never;
    const { getByText } = render(React.createElement(KpiStrip, { metrics: bare, investment: null }));
    expect(getByText('Code compliant')).toBeTruthy();
  });
});

describe('KpiStrip clamp-flag badge (work order item 2)', () => {
  it('FAR/density clamps turn the badge amber Constrained even when parked', () => {
    const { metrics } = mfPlanToElements({
      ...RESP,
      metrics: { ...RESP.metrics, stalls: 120, stalls_required: 113 },
    });
    const { getByText, queryByText } = render(
      React.createElement(KpiStrip, {
        metrics,
        investment: null,
        planFlags: ['floors_clamped_by_far', 'density_clamped_units'],
      })
    );
    expect(queryByText('Code compliant')).toBeNull();
    expect(getByText(/Code compliant · constrained: FAR-clamped \+1/)).toBeTruthy();
  });

  it('utilization stat renders when provided', () => {
    const { metrics } = mfPlanToElements(RESP);
    const { getByText } = render(
      React.createElement(KpiStrip, { metrics, investment: null, utilizationPct: 60.4 })
    );
    expect(getByText('Utilization')).toBeTruthy();
    expect(getByText('60%')).toBeTruthy();
  });
});

// ── seed_v2 payload family (order-6) ─────────────────────────────────────────
// Live-shaped fixture mirroring fn_generate_mf_site_plan_v2 on 553450
// (2026-07-28): native EPSG:2274 single-polygon structures, skeleton drives,
// ONE parking object with structured dual ratios. Coordinates simplified but
// in the real TN State Plane range so the 2274→4326→3857 path is exercised.
import { seedFamilyPlanToElements, isSeedFamilyResponse, type SeedFamilyResponse } from './generateMfPlan';
import { validatePlanElements } from '../../../engine/validatePlan';

const rect2274 = (x: number, y: number, w: number, h: number) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]],
});

const SEED_RESP: SeedFamilyResponse = {
  parcel_ogc_fid: 553450,
  typology: 'multifamily',
  seed: 1,
  generator_version: 'seed_v2',
  plan_basis:
    '133136 GSF seed plan @ 4 st · 106.0% of 125550 max · 1 structure(s) · 75 units @ ~1550 GSF · 168/130 stalls (129.2% of placed need, 120.0% of max) · rear_field_perp · generator: seed_v2 · relaxed: none',
  buildings: [{
    structure_id: 1,
    geom_2274: rect2274(1727000, 670000, 208, 160),
    footprint_sqft: 33284,
    gsf: 133136,
    stories: 4,
    composition_note: 'bars_connected_S_form',
    is_single_polygon: true,
  }],
  drives: [{
    entry_2274: { type: 'Point', coordinates: [1727100, 669800] },
    spine_2274: { type: 'LineString', coordinates: [[1727100, 669810], [1727100, 669990]] },
  }],
  parking: {
    bays: [
      { geom_2274: rect2274(1727250, 670000, 120, 180), area_sqft: 23543 },
      { geom_2274: rect2274(1727400, 670000, 110, 180), area_sqft: 21941 },
    ],
    stalls: 168,
    strategy: 'rear_field_perp',
    stalls_required: 130,
    pct_of_placed_need: 129.2,
    pct_of_max_need: 120,
    stalls_required_at_placed: 130,
    stalls_target_at_max: 140,
  },
  metrics: {
    gsf: 133136, units: 75, stalls: 168, stories: 4, capture_pct: 106,
    parking_limited: false,
    mix: [
      { pct: 10, type: 'studio', units: 7 },
      { pct: 40, type: '1br', units: 30 },
      { pct: 35, type: '2br', units: 26 },
      { pct: 15, type: '3br', units: 11 },
    ],
  },
  flags: ['seed_v2_deterministic'],
};

describe('seed_v2 payload family (order-6)', () => {
  it('detects the family by native 2274 structures, never by flags', () => {
    expect(isSeedFamilyResponse(SEED_RESP)).toBe(true);
    expect(isSeedFamilyResponse(RESP)).toBe(false);
    expect(isSeedFamilyResponse(null)).toBe(false);
  });

  it('renders one outline per connected S/C-form structure with engine areas + the server mix', () => {
    const { elements, metrics, basis, flags } = seedFamilyPlanToElements(SEED_RESP);

    const buildings = elements.filter(e => e.type === 'building');
    expect(buildings).toHaveLength(1); // ONE connected structure = ONE outline
    const b = buildings[0];
    expect(b.id).toBe('mfgen-bldg-1');
    expect(b.name).toBe('bars connected S form × 4 st');
    expect(b.properties?.areaSqFt).toBe(33284); // EPSG:2274 truth, never re-measured
    expect(b.properties?.floors).toBe(4);
    // The SERVER's mix travels verbatim, not a client guess. Note the live
    // mix rows sum to 74 while metrics.units says 75 (server-side rounding);
    // we render the rows as given and never reconcile them client-side.
    const mix = b.properties?.unitMix as Array<{ type: string; count: number }>;
    expect(mix.reduce((s, e) => s + e.count, 0)).toBe(74);
    expect(mix.find(e => e.type === 'studio')?.count).toBe(7);
    expect(mix.find(e => e.type === '3br')?.count).toBe(11);

    const bays = elements.filter(e => e.type === 'parking');
    expect(bays).toHaveLength(2);
    const bayStalls = bays.map(e => e.properties?.stalls as number);
    expect(bayStalls[0] + bayStalls[1]).toBe(168); // apportioned by area share

    // The skeleton (centerline + entry point) renders as ONE unioned access-
    // drive network, clipped against buildings/bays by construction.
    const circ = elements.filter(e => e.type === 'circulation');
    expect(circ.length).toBeGreaterThan(0);
    expect(circ.every(c => (c.name ?? '').startsWith('Access drive'))).toBe(true);

    expect(metrics?.totalBuiltSF).toBe(133136);
    expect(metrics?.totalUnits).toBe(75);
    expect(metrics?.stallsProvided).toBe(168);
    expect(metrics?.stallsRequired).toBe(130);
    expect(metrics?.parkingPctOfPlacedNeed).toBe(129.2);
    expect(metrics?.parkingPctOfMaxNeed).toBe(120);
    expect(metrics?.parkingStallsTargetAtMax).toBe(140);
    expect(metrics?.parkingStrategy).toBe('rear_field_perp');
    expect(metrics?.parkingLimited).toBe(false);
    expect(metrics?.capturePct).toBe(106);
    expect(basis).toContain('129.2% of placed need');
    expect(flags).toContain('seed_v2_deterministic');
    expect(flags).not.toContain('parking_limited');

    // The engine's own clean plan passes the client geometry gate — the
    // family mapper introduces no fabricated overlaps.
    expect(validatePlanElements(elements).ok).toBe(true);

    // Every element carries the mfgen- prefix so a regenerate REPLACES.
    expect(elements.every(isMfPlanElement)).toBe(true);
  });

  it('appends the parking_limited clamp flag when the generator says units were trimmed', () => {
    const { metrics, flags } = seedFamilyPlanToElements({
      ...SEED_RESP,
      metrics: { ...SEED_RESP.metrics, parking_limited: true },
    });
    expect(metrics?.parkingLimited).toBe(true);
    expect(flags).toContain('parking_limited');
  });

  it('apportions the server mix across structures by GSF share (largest remainder)', () => {
    const { elements } = seedFamilyPlanToElements({
      ...SEED_RESP,
      buildings: [
        { structure_id: 1, geom_2274: rect2274(1727000, 670000, 200, 100), footprint_sqft: 20000, gsf: 80000, stories: 4 },
        { structure_id: 2, geom_2274: rect2274(1727300, 670000, 140, 100), footprint_sqft: 14000, gsf: 53136, stories: 4 },
      ],
    });
    const buildings = elements.filter(e => e.type === 'building');
    expect(buildings).toHaveLength(2);
    const total = buildings
      .flatMap(b => b.properties?.unitMix as Array<{ count: number }>)
      .reduce((s, e) => s + e.count, 0);
    expect(total).toBe(74); // the mix rows' own total — nothing lost to apportioning
  });

  it('renders the SF seed as a house + driveway under the sfseed- prefix', () => {
    const sf: SeedFamilyResponse = {
      parcel_ogc_fid: 393306,
      typology: 'single_family',
      generator_version: 'sf_seed_v1',
      plan_basis: '1236 SF house @ 1 st · single_family as-of-right · envelope 3076 sqft (SF setbacks) · generator: sf_seed_v1 · relaxed: none',
      buildings: [{ geom_2274: rect2274(1727000, 670000, 40, 31), footprint_sqft: 1236, gsf: 1236, stories: 1, is_single_polygon: true }],
      drives: [{ geom_2274: rect2274(1727045, 670000, 12, 40), kind: 'driveway' }],
      metrics: { gsf: 1236, units: 1, stories: 1 },
      flags: ['sf_seed_v1_deterministic'],
    };
    const { elements, metrics, basis } = seedFamilyPlanToElements(sf, { idPrefix: 'sfseed', house: true });
    const house = elements.find(e => e.type === 'building')!;
    expect(house.id).toBe('sfseed-bldg-1');
    expect(house.name).toBe('House · 1,236 sf');
    const mix = house.properties?.unitMix as Array<{ type: string; count: number }>;
    expect(mix).toHaveLength(1);
    expect(mix[0].count).toBe(1);
    const drive = elements.find(e => e.type === 'circulation')!;
    expect(drive.name).toBe('Driveway');
    expect(drive.id).toBe('sfseed-drive-1');
    expect(metrics?.totalBuiltSF).toBe(1236);
    expect(metrics?.totalUnits).toBe(1);
    expect(basis).toContain('single_family as-of-right');
    expect(validatePlanElements(elements).ok).toBe(true);
  });
});

describe('KpiStrip dual parking ratios + parking-limited chip (order-6 item 3)', () => {
  it('shows adequacy · ambition from the structured fields and hides unreported FAR/coverage', () => {
    const { metrics } = seedFamilyPlanToElements(SEED_RESP);
    const { getByText, queryByText } = render(
      React.createElement(KpiStrip, { metrics, investment: null })
    );
    expect(getByText('168 / 130')).toBeTruthy();
    expect(getByText('129% placed · 120% max')).toBeTruthy();
    // FAR/Coverage/Open are NOT in the seed payload — no fabricated zeros.
    expect(queryByText('FAR')).toBeNull();
    expect(queryByText('Coverage')).toBeNull();
    expect(queryByText(/parking-limited/)).toBeNull();
  });

  it('raises the amber parking-limited chip when the generator trimmed units', () => {
    const { metrics } = seedFamilyPlanToElements({
      ...SEED_RESP,
      metrics: { ...SEED_RESP.metrics, parking_limited: true },
    });
    const { getByText } = render(
      React.createElement(KpiStrip, { metrics, investment: null })
    );
    expect(getByText('parking-limited: units trimmed')).toBeTruthy();
  });
});
