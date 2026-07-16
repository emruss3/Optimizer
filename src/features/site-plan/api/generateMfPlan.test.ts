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
    expect(getByText('Compliant')).toBeTruthy();
    expect(getByText('52 / 113')).toBeTruthy();
  });

  it('tolerates metrics missing optional fields entirely', () => {
    const bare = { totalBuiltSF: 1000, achievedFAR: 0.5 } as never;
    const { getByText } = render(React.createElement(KpiStrip, { metrics: bare, investment: null }));
    expect(getByText('Compliant')).toBeTruthy();
  });
});
