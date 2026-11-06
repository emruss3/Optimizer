/**
 * SiteWorkspace integration proofs for the planner_context_v2 contract:
 *
 *  - one active compiled context; a use switch clears it BEFORE generating
 *  - a stale compile response cannot overwrite a newer selected-use context
 *  - SF and MF on the same parcel display different precedent bases
 *  - generation_allowed=false blocks BOTH the server and the worker solver
 *  - the worker fallback receives the active brief (Regrid priors + weights)
 *  - saved candidates re-render under their STORED context id; regeneration
 *    under the current context is an explicit action
 *
 * Heavy leaves (map shell, worker, RPCs) are mocked; the workspace wiring,
 * ContextPanel, ContextLineage, and SchemesRail are real.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { PlannerContextResponse, PrecedentPriors } from './api/plannerContext';
import type { MfCandidate, MfPlanResponse } from './api/generateMfPlan';

// ── controllable async seams ────────────────────────────────────────────────

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const compileMock = vi.fn<(fid: number, use: string) => Promise<PlannerContextResponse | null>>();
const permittedUsesMock = vi.fn(async () => ['multi_family', 'single_family']);
const genV2Mock = vi.fn<(fid: number, ctxId: string, opts?: Record<string, unknown>) => Promise<MfPlanResponse | null>>();
const genLegacyMock = vi.fn(async (): Promise<MfPlanResponse | null> => null);
const genSfMock = vi.fn(async (): Promise<null> => null);
const listCandidatesMock = vi.fn(async (): Promise<MfCandidate[]> => []);
const optimizeSiteMock = vi.fn(async () => ({
  bestElements: [],
  bestMetrics: null,
  bestViolations: [],
  bestBuildings: [
    { id: 'b1', anchor: { x: 1000010, y: 4300010 }, widthM: 50, depthM: 18.3, rotationRad: 0, floors: 2 },
  ],
  finalScore: 0.7,
  top3Alternatives: [],
}));

vi.mock('./api/plannerContext', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/plannerContext')>()),
  compilePlannerContext: (fid: number, use: string) => compileMock(fid, use),
}));
vi.mock('./api/designContext', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/designContext')>()),
  fetchPermittedUses: () => permittedUsesMock(),
}));
vi.mock('./api/generateMfPlan', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/generateMfPlan')>()),
  generateMfSitePlanV2: (fid: number, ctxId: string, opts?: Record<string, unknown>) => genV2Mock(fid, ctxId, opts),
  generateMfSitePlan: () => genLegacyMock(),
  listMfCandidates: () => listCandidatesMock(),
  fetchMfMoney: async () => null,
  enrichCandidatesWithMoney: async (_fid: number, cands: MfCandidate[]) => cands,
}));
vi.mock('./api/generateSfPlan', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/generateSfPlan')>()),
  generateSfSitePlan: () => genSfMock(),
}));
const sfV1PlanMock = vi.fn(async (): Promise<Record<string, unknown> | null> => null);
const sfV1CandMock = vi.fn(async (): Promise<{ data: Record<string, unknown> | null; error: string | null }> => ({ data: null, error: 'not in this test' }));
// The plan-pattern layer is a network call; with a local stand-in running it
// answers for the real parcel 669046 (RM40), whose zoning would outrank the
// test parcel's. No pattern here: the parcel's own zoning decides the route.
vi.mock('./api/planPattern', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/planPattern')>()),
  fetchPlanPattern: async () => null,
}));
vi.mock('./api/sfV1Plan', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/sfV1Plan')>()),
  fetchSfV1Plan: (fid: number, opt: Record<string, unknown>) => (sfV1PlanMock as unknown as (f: number, o: Record<string, unknown>) => Promise<unknown>)(fid, opt),
  fetchSfV1Site: async () => null,
  fetchSfV1Candidates: () => sfV1CandMock(),
}));
const thV3Mock = vi.fn(async (): Promise<{ data: Record<string, unknown> | null; error: string | null }> => ({ data: null, error: 'not in this test' }));
vi.mock('./api/thV3Plan', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/thV3Plan')>()),
  fetchThV3Plan: () => thV3Mock(),
}));
vi.mock('./api/plannerFeedback', () => ({
  recordPlannerFeedback: vi.fn(async () => undefined),
}));
vi.mock('../../workers/workerManager', () => ({
  workerManager: {
    optimizeSite: (...args: unknown[]) => optimizeSiteMock(...(args as [])),
    initSite: vi.fn(async () => ({ elements: [], metrics: null, violations: [], buildings: [] })),
    updateBuilding: vi.fn(async () => ({ elements: [], metrics: null, violations: [], buildings: [] })),
    setBuildings: vi.fn(async () => ({ elements: [], metrics: null, violations: [], buildings: [] })),
  },
}));

// EPSG:3857 rectangle (magnitudes > 1000 so the workspace treats it as meters)
const RECT_3857 = {
  type: 'Polygon' as const,
  coordinates: [[
    [1000000, 4300000], [1000207, 4300000], [1000207, 4300133], [1000000, 4300133], [1000000, 4300000],
  ]],
};

vi.mock('./api/useBuildableEnvelope', () => ({
  useBuildableEnvelope: () => ({
    status: 'ready',
    envelope: RECT_3857,
    rpcMetrics: null,
    edgeClassifications: undefined,
    error: null,
  }),
}));
vi.mock('./state/useSitePlanState', async () => {
  const { useState } = await import('react');
  return {
    useSitePlanState: () => {
      const [config, setConfig] = useState({
        zoning: { maxFar: 2, maxHeightFt: 60, frontSetbackFt: 20, sideSetbackFt: 5, rearSetbackFt: 20, maxCoveragePct: 60 },
        designParameters: {
          buildingTypology: 'bar', targetFAR: 1.5, targetCoveragePct: 50,
          parking: { targetRatio: 1.5, stallWidthFt: 9, stallDepthFt: 18, aisleWidthFt: 24, adaPct: 2, evPct: 0 },
        },
      });
      const [output, setOutput] = useState<{ elements: unknown[]; metrics: unknown }>({ elements: [], metrics: null });
      return {
        config,
        updateConfig: (patch: Record<string, unknown>) => setConfig(c => ({ ...c, ...patch }) as never),
        elements: output.elements,
        metrics: output.metrics,
        setPlanOutput: (elements: unknown[], metrics: unknown) => setOutput({ elements, metrics }),
        alternatives: [],
        solveScores: [],
        selectedSolveIndex: 0,
        selectedSolve: null,
        selectSolve: () => undefined,
        applyAlternatives: () => undefined,
        normalizedGeometry: null,
        isValidParcel: true,
      };
    },
  };
});

// Presentational leaves that would otherwise need canvases/maps/3D
vi.mock('../../components/EnterpriseSitePlannerShell', () => ({
  default: () => <div data-testid="planner-shell" />,
}));
vi.mock('../../components/ErrorBoundary', () => ({
  SitePlannerErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./ui/Massing3D', () => ({ default: () => null }));
vi.mock('./ui/KpiStrip', () => ({ default: () => null }));
vi.mock('./ui/ParametersPanel', () => ({
  default: (props: { onGenerate: (n: number) => void }) => (
    <button onClick={() => props.onGenerate(0)}>Run generate</button>
  ),
}));
vi.mock('./ui/ResultsPanel', () => ({
  default: (props: { violations?: Array<{ code: string }> }) => (
    <div data-testid="violations">{(props.violations ?? []).map(v => v.code).join(',')}</div>
  ),
}));
vi.mock('../../hooks/useSitePlans', () => ({
  useSitePlans: () => ({
    plans: [], isLoading: false, error: null,
    save: vi.fn(), remove: vi.fn(), setFavorite: vi.fn(),
  }),
}));

import SiteWorkspace from './SiteWorkspace';

// ── fixtures ────────────────────────────────────────────────────────────────

const PARCEL = {
  ogc_fid: 669046,
  id: '669046',
  geometry: RECT_3857,
  sqft: 100000,
  parval: 500000,
  address: '123 Test St',
} as never;

const MF_PRIORS: PrecedentPriors = {
  sample_size: 5,
  confidence: 'high',
  selection: {
    mode: 'exact_same_zoning', requested_typology: 'multifamily', match_mode: 'exact',
    same_zoning_required: true, lot_band: '+/-50%', sample_size: 5, confidence: 'high',
  },
  footprint_sqft: { p50: 7536, p75: 9100, p90: 12000 },
  depth_ft: { p50: 99.8 },
  length_ft: { p75: 163.7 },
  stories: { p50: 2, p75: 2 },
  coverage_pct: { p75: 31 },
  building_count: { p50: 6 },
};

const SF_PRIORS: PrecedentPriors = {
  sample_size: 67,
  confidence: 'high',
  selection: {
    mode: 'exact_same_zoning', requested_typology: 'single_family', match_mode: 'exact',
    same_zoning_required: true, lot_band: '+/-50%', sample_size: 67, confidence: 'high',
  },
  footprint_sqft: { p50: 1435 },
  depth_ft: { p50: 31.1 },
  length_ft: { p75: 62.2 },
  stories: { p50: 1, p75: 1 },
};

function ctxResp(use: string, id: string, over: Record<string, unknown> = {}): PlannerContextResponse {
  const typology = use === 'single_family' ? 'single_family' : 'multifamily';
  return {
    context_id: id,
    context_version: 'planner_context_v2',
    context_hash: `hash-${id}`,
    created_at: 'now',
    generation_allowed: true,
    context: {
      schema_version: 'planner_context_v2',
      parcel_ogc_fid: 669046,
      selected_use: use,
      typology,
      generation_allowed: true,
      flags: [],
      legal: { permitted_as_of_right: true, zoning_base: 'RM40', confidence: 'high', max_far: { value: 1, source: 'ordinance' } },
      market: {},
      parking_strategy: 'surface',
      objective_profile: { profile: 'balanced', weights: {} },
      provenance: {},
    },
    solver_brief: {
      schema_version: 'planner_context_v2',
      parcel_ogc_fid: 669046,
      selected_use: use,
      typology,
      generation_allowed: true,
      flags: [],
      geometry: { front_edge_is_placeholder: true, access_method: 'road_proximity' },
      hard_constraints: {
        front_setback_ft: 20, side_setback_ft: 5, rear_setback_ft: 20,
        max_far: 1, max_height_ft: 45, max_density_du_acre: 40,
        max_coverage_pct: 60, min_open_space_pct: null, developable: true,
      },
      parking: {
        strategy: 'surface', ratio: 1.5, basis: 'per_unit',
        stall_width_ft: 9, stall_depth_ft: 18, aisle_width_ft: 24, permitted_angles_deg: [0, 60, 90],
      },
      precedent_priors: typology === 'multifamily' ? MF_PRIORS : SF_PRIORS,
      program_prior: { average_unit_sqft: { value: 950, source: 'bridge', confidence: 'low' } },
      program_prior_version: 'existing_engine_bridge_v0_1',
      objective_profile: { profile: 'balanced', weights: { financial_return: 0.2, precedent_fit: 0.3 } },
    },
    ...over,
  } as unknown as PlannerContextResponse;
}

const square4326 = (lon: number, lat: number, d = 0.0005) => ({
  type: 'Polygon',
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});

function serverResp(contextId: string): MfPlanResponse {
  return {
    parcel_ogc_fid: 669046,
    typology: 'multifamily',
    seed: 1,
    plan_basis: '2 garden bars · 2 floors',
    persisted: true,
    candidate_id: 'cand-generated',
    context_id: contextId,
    context_version: 'planner_context_v2',
    context_hash: `hash-${contextId}`,
    generator_version: 'mf_context_v2_regrid_typology_v1',
    score_version: 'context_score_v2',
    program_prior_version: 'existing_engine_bridge_v0_1',
    score_total: 0.83,
    score_components: { precedent_fit: 0.834 },
    buildings: [{ i: 1, footprint_sqft: 9600, floors: 2, geom: square4326(-86.81, 36.14) }],
    metrics: {
      bars: 2, floors: 2, footprint_sqft: 19215, gfa_sqft: 38430,
      units_est: 40, stalls: 60, stalls_required: 60,
      far: 0.5, coverage_pct: 20, parcel_sqft: 100000, open_space_pct: 60,
    },
    flags: [],
  } as MfPlanResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  permittedUsesMock.mockResolvedValue(['multi_family', 'single_family']);
  genV2Mock.mockImplementation(async (_fid, ctxId) => serverResp(ctxId));
  genLegacyMock.mockResolvedValue(null);
  genSfMock.mockResolvedValue(null);
  listCandidatesMock.mockResolvedValue([]);
  sfV1PlanMock.mockResolvedValue(null);
  sfV1CandMock.mockResolvedValue({ data: null, error: 'not in this test' });
  thV3Mock.mockResolvedValue({ data: null, error: 'not in this test' });
  compileMock.mockImplementation(() => new Promise(() => undefined)); // pending unless a test says otherwise
});

// ── proofs ──────────────────────────────────────────────────────────────────

describe('SiteWorkspace: selected-use transition owns exactly one context', () => {
  it('a use switch clears the old slot, a STALE compile cannot reclaim it, and generation waits for the new compile', async () => {
    const dMf = deferred<PlannerContextResponse | null>();
    const dSf = deferred<PlannerContextResponse | null>();
    compileMock.mockImplementation((_fid, use) =>
      use === 'multi_family' ? dMf.promise : dSf.promise);

    render(<SiteWorkspace parcel={PARCEL} />);

    // Default use corrects to the highest-intensity as-of-right use, then compiles
    await waitFor(() => expect(compileMock).toHaveBeenCalledWith(669046, 'multi_family'));

    // User switches use while the first compile is STILL in flight
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'single_family' } });
    await waitFor(() => expect(compileMock).toHaveBeenCalledWith(669046, 'single_family'));

    // The old compile settles LATE — it must not take the active slot
    await act(async () => { dMf.resolve(ctxResp('multi_family', 'ctx-mf')); });
    expect(screen.getAllByText(/Compiling local context/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/5 exact-use RM40 precedents/)).toBeNull();
    // …and it must not ground any generation
    expect(genV2Mock).not.toHaveBeenCalled();
    expect(optimizeSiteMock).not.toHaveBeenCalled();

    // The CURRENT use's compile settles → its context (and only its) applies
    await act(async () => { dSf.resolve(ctxResp('single_family', 'ctx-sf')); });
    await waitFor(() => expect(screen.getByText(/67 exact-use RM40 precedents · high confidence/)).toBeTruthy());
    expect(screen.queryByText(/5 exact-use RM40 precedents/)).toBeNull();
    // USE-BINDING INVARIANT: a single_family compiled context must NEVER
    // ground multifamily massing (2600 W Heiman shipped exactly that). Since
    // 2026-09-04 the workspace does not even ask: a use the user PICKED as
    // single-family routes to the lot fit, so the MF generator is called for
    // NEITHER snapshot and no refusal chip has to be raised.
    await waitFor(() => expect(genSfMock).toHaveBeenCalled());
    expect(screen.queryByText('use-binding')).toBeNull();
    expect(genV2Mock).not.toHaveBeenCalledWith(669046, 'ctx-sf', expect.anything());
    expect(genV2Mock).not.toHaveBeenCalledWith(669046, 'ctx-mf', expect.anything());
  });

  it('with a plan on canvas, switching use marks it stale and regenerates under the NEW context id', async () => {
    const dSecond = deferred<PlannerContextResponse | null>();
    compileMock.mockImplementation(async (_fid, use) => {
      if (use === 'multi_family') return ctxResp('multi_family', 'ctx-mf');
      return dSecond.promise;
    });

    render(<SiteWorkspace parcel={PARCEL} />);

    // First compile settles → server generation on the active snapshot
    await waitFor(() => expect(genV2Mock).toHaveBeenCalledWith(669046, 'ctx-mf', expect.anything()));
    // 2026-09-04: the lineage sits inside the collapsed plan-basis row — open it
    fireEvent.click(await screen.findByTestId('plan-basis-toggle'));
    await waitFor(() => expect(screen.getByText('Context applied')).toBeTruthy());
    // MF precedent basis is on screen (5 exact precedents, Regrid dimensions)
    expect(screen.getByText(/5 exact-use RM40 precedents · high confidence/)).toBeTruthy();
    expect(screen.getByText(/99\.8 ft/)).toBeTruthy();

    // Switch use → the plan is honestly stale, the old context leaves the panel
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'single_family' } });
    await waitFor(() => expect(screen.getByText(/Plan is stale — selected use or context has changed/)).toBeTruthy());
    expect(screen.getAllByText(/Compiling local context/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/5 exact-use RM40 precedents/)).toBeNull();
    expect(screen.queryByText('Context applied')).toBeNull();

    // New compile settles → the SF basis displays (different sample + dimensions)
    await act(async () => { dSecond.resolve(ctxResp('single_family', 'ctx-sf')); });
    await waitFor(() => expect(screen.getByText(/67 exact-use RM40 precedents · high confidence/)).toBeTruthy());
    expect(screen.getByText(/31\.1 ft/)).toBeTruthy();
  });
});

describe('SiteWorkspace: generation gate (generation_allowed=false)', () => {
  it('blocks BOTH solvers, says why, and keeps the use selector live', async () => {
    const blocked = ctxResp('multi_family', 'ctx-blocked', { generation_allowed: false });
    const dSf = deferred<PlannerContextResponse | null>();
    compileMock.mockImplementation(async (_fid, use) =>
      use === 'multi_family' ? blocked : dSf.promise);

    render(<SiteWorkspace parcel={PARCEL} />);

    await waitFor(() =>
      expect(screen.getByText('Generation blocked by legal or physical constraints')).toBeTruthy());
    expect(screen.getByText(/not permitted as-of-right — generation is blocked/)).toBeTruthy();
    // Neither generator ran — a blocked use is a rejection, not a candidate
    expect(genV2Mock).not.toHaveBeenCalled();
    expect(genLegacyMock).not.toHaveBeenCalled();
    expect(optimizeSiteMock).not.toHaveBeenCalled();

    // An explicit Generate click is refused with an explanation — the error
    // violation auto-surfaces the docked Flags tab (3b) with the code chip.
    fireEvent.click(screen.getByText('Run generate'));
    await waitFor(() => expect(screen.getByText('context')).toBeTruthy());
    expect(genV2Mock).not.toHaveBeenCalled();
    expect(optimizeSiteMock).not.toHaveBeenCalled();

    // The user can still pick another permitted use
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'single_family' } });
    await waitFor(() => expect(compileMock).toHaveBeenCalledWith(669046, 'single_family'));
  });
});

describe('SiteWorkspace: a physical block on a by-right parcel goes to the by-right generator (2026-11-04)', () => {
  it('0 Temple Rd: the floodplain, not the use — the generator answers and offers the fill scenario', async () => {
    permittedUsesMock.mockResolvedValue(['single_family']);
    const physicalBlock = ctxResp('single_family', 'ctx-flood', { generation_allowed: false });
    (physicalBlock as unknown as { context: Record<string, unknown> }).context = {
      ...(physicalBlock as unknown as { context: Record<string, unknown> }).context,
      generation_allowed: false,
      legal: { permitted_as_of_right: true, zoning_base: 'RS40', confidence: 'high' },
      physical: { developable: false, flood: { zone: 'AE' }, hazard_carve: { pct_land_hazard: 97.8, residual_sqft: 2703, min_residual_sqft: 15000 } },
    };
    compileMock.mockImplementation(async () => physicalBlock);
    sfV1PlanMock.mockResolvedValue({ status: 'skipped', reason: 'floodplain leaves no buildable piece', ogc_fid: 669046 });

    render(<SiteWorkspace parcel={{ ...(PARCEL as object), zoning: 'RS40' } as never} />);

    await waitFor(() => expect(sfV1PlanMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('sfv1-skipped').textContent).toContain('floodplain leaves no buildable piece'));
    expect(screen.getByTestId('sfv1-override-floodway')).toBeTruthy();
    // not reported as a use that is not permitted
    expect(screen.queryByText(/not permitted as-of-right — generation is blocked/)).toBeNull();
    expect(genV2Mock).not.toHaveBeenCalled();
  });
});

describe('SiteWorkspace: the competition\'s best goes on the sheet when the default draws nothing (2026-11-04)', () => {
  const setup = (cand: Record<string, unknown>) => {
    permittedUsesMock.mockResolvedValue(['single_family']);
    const sf = ctxResp('single_family', 'ctx-sf');
    (sf as unknown as { context: Record<string, unknown> }).context = {
      ...(sf as unknown as { context: Record<string, unknown> }).context,
      legal: { permitted_as_of_right: true, zoning_base: 'RS15', confidence: 'high' },
    };
    compileMock.mockImplementation(async () => sf);
    sfV1PlanMock.mockResolvedValue({ status: 'done', lots: 0, basis: 'by_right', reason: 'no lot of 15000 sf (85 x 180 ft) fits', ogc_fid: 669046 });
    sfV1CandMock.mockResolvedValue({ data: cand, error: null });
  };

  it('3905 Lunn Dr: 0 lots by the loop grammar, 2 buildable lots by the neighborhood — shown, and the panel says why', async () => {
    setup({
      status: 'done', best_requested: 'neighborhood', best_lots: 2, structured_lots: 2, lots_forgone_for_structure: 0,
      best_buildable: true, verdict: 'buildable as drawn', best_code_fails: [],
      candidates: [
        { requested: 'grid', pattern: 'grid', status: 'done', lots: 1, fails: [] },
        { requested: 'neighborhood', pattern: 'neighborhood', status: 'done', lots: 2, fails: [] },
        { requested: 'loop', pattern: null, status: 'done', lots: 0, fails: [] },
      ],
      best: { status: 'done', lots: 2, pattern: 'neighborhood', basis: 'by_right', fails: [] },
    });
    render(<SiteWorkspace parcel={{ ...(PARCEL as object), zoning: 'RS15' } as never} />);
    await waitFor(() => expect(screen.getByTestId('sfv1-auto-best').textContent).toContain('the neighborhood grammar'));
    expect(screen.getByTestId('sfv1-lots').textContent).toBe('2 lots');
    expect(screen.getByTestId('sfv1-basis').textContent).toBe('By right');
  });

  it('1019 Hitt Ln: the best fails a code test — the sheet keeps the default, the verdict is shown', async () => {
    setup({
      status: 'done', best_requested: 'grid', best_lots: 19, structured_lots: 19, lots_forgone_for_structure: 0,
      best_buildable: false, verdict: 'the best plan fails a code test: not buildable as drawn', best_code_fails: ['street.grade_max'],
      candidates: [
        { requested: 'grid', pattern: 'grid', status: 'done', lots: 19, fails: ['street.grade_max'] },
        { requested: 'neighborhood', pattern: 'neighborhood', status: 'done', lots: 19, fails: ['street.grade_max'] },
        { requested: 'loop', pattern: null, status: 'done', lots: 0, fails: [] },
      ],
      best: { status: 'done', lots: 19, pattern: 'grid', basis: 'by_right', fails: ['street.grade_max'] },
    });
    render(<SiteWorkspace parcel={{ ...(PARCEL as object), zoning: 'RS15' } as never} />);
    await waitFor(() => expect(screen.getByTestId('sfv1-competition-verdict').textContent).toContain('not buildable as drawn'));
    expect(screen.queryByTestId('sfv1-auto-best')).toBeNull();
    expect(screen.getByTestId('sfv1-lots').textContent).toBe('0 lots');
  });
});

describe('SiteWorkspace: the layout choice on multifamily land (the owner, 2026-11-04)', () => {
  // the competition on RM40 land: house-lot patterns and the townhome engine's candidate
  const cand = (thHomes: number) => ({
    status: 'done', best_requested: 'townhome', best_lots: thHomes, best_buildable: true, verdict: 'buildable as drawn', best_code_fails: [],
    homes_allowed_by_density: 129, attached_permitted: true, structured_lots: 10, lots_forgone_for_structure: thHomes - 10,
    candidates: [
      { requested: 'grid', pattern: 'grid', status: 'done', lots: 10, fails: ['cost.street_ft_per_lot'] },
      { requested: 'neighborhood', pattern: 'neighborhood', status: 'done', lots: 10, fails: ['cost.street_ft_per_lot'] },
      { requested: 'loop', pattern: 'frontage lots, no new street', status: 'done', lots: 6, fails: [] },
      { requested: 'townhome', pattern: 'townhomes (mews)', status: 'done', lots: thHomes, fails: [], product: 'attached', engine: 'v3' },
    ],
    best: { status: 'done', lots: thHomes, product: 'attached', engine: 'v3', full_plan_call: "fn_generate_th_site_plan_v3(ogc_fid, 'aor')" },
  });
  // the townhome engine's drawing: one footprint per home
  const thPlan = (homes: number) => ({
    data: {
      generator_version: 'th_v3', pattern: 'mews',
      buildings: Array.from({ length: homes }, (_, i) => ({ geom: square4326(-86.81 + i * 0.0002, 36.14, 0.0001), kind: 'courtyard', w_ft: 20, d_ft: 40 })),
      metrics: { homes, alleys: 1, street_ft: 0, unit_w_ft: 20, unit_d_ft: 40 }, tests: [], fails: [],
    },
    error: null,
  });

  beforeEach(() => {
    compileMock.mockImplementation(async (_fid, use) => ctxResp(use, `ctx-${use}`));
  });

  it('2622 W Heiman: apartments place more homes, so they stay; the neighborhood is one tap away, and back', async () => {
    sfV1CandMock.mockResolvedValue({ data: cand(32), error: null });
    thV3Mock.mockResolvedValue(thPlan(3));
    render(<SiteWorkspace parcel={PARCEL} />);
    await waitFor(() => expect(screen.getByTestId('layout-choice').getAttribute('data-default')).toBe('multifamily'));
    expect(screen.getByTestId('layout-choice').getAttribute('data-shown')).toBe('multifamily');
    expect(screen.getByTestId('layout-option-multifamily').textContent).toContain('40 homes');
    expect(screen.getByTestId('layout-option-neighborhood').textContent).toContain('32 homes');
    expect(screen.getByTestId('layout-sentence').textContent).toContain('40 apartments against the neighborhood\'s best of 32 townhomes');
    expect(thV3Mock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('layout-option-neighborhood'));
    await waitFor(() => expect(screen.getByTestId('layout-choice').getAttribute('data-shown')).toBe('neighborhood'));
    expect(screen.getByTestId('layout-thv3').textContent).toContain('3 townhomes on a mews');
    expect(screen.queryByTestId('layout-auto')).toBeNull();
    const before = genV2Mock.mock.calls.length;
    fireEvent.click(screen.getByTestId('layout-option-multifamily'));
    await waitFor(() => expect(screen.getByTestId('layout-choice').getAttribute('data-shown')).toBe('multifamily'));
    expect(genV2Mock.mock.calls.length).toBe(before + 1);
    // the same plan again, not a new saved scheme
    expect(genV2Mock.mock.calls.at(-1)?.[2]).toMatchObject({ persist: false });
  });

  it('5525 Mt View Rd: the neighborhood places more homes, so it takes the sheet by itself, with the way back', async () => {
    sfV1CandMock.mockResolvedValue({ data: cand(44), error: null });
    thV3Mock.mockResolvedValue(thPlan(44));
    render(<SiteWorkspace parcel={PARCEL} />);
    await waitFor(() => expect(screen.getByTestId('layout-choice').getAttribute('data-shown')).toBe('neighborhood'));
    expect(screen.getByTestId('layout-choice').getAttribute('data-default')).toBe('neighborhood');
    expect(screen.getByTestId('layout-auto').textContent).toContain('places more homes');
    expect(screen.getByTestId('layout-sentence').textContent).toContain('44 townhomes (mews) against 40 apartments');
    fireEvent.click(screen.getByTestId('layout-auto-back'));
    await waitFor(() => expect(screen.getByTestId('layout-choice').getAttribute('data-shown')).toBe('multifamily'));
    expect(screen.queryByTestId('layout-auto')).toBeNull();
  });

  it('a neighborhood that fails a code test never takes the sheet, however many homes', async () => {
    sfV1CandMock.mockResolvedValue({ data: { ...cand(60), best_buildable: false, best_code_fails: ['alley.street_to_street'], verdict: 'the best plan fails a code test: not buildable as drawn' }, error: null });
    render(<SiteWorkspace parcel={PARCEL} />);
    await waitFor(() => expect(screen.getByTestId('layout-sentence').textContent).toContain('fails a code test'));
    expect(screen.getByTestId('layout-choice').getAttribute('data-shown')).toBe('multifamily');
    expect(thV3Mock).not.toHaveBeenCalled();
  });
});

describe('SiteWorkspace: enterprise trust gate (no context → no massing)', () => {
  it('a FAILED compile blocks the canvas outright — no generator runs — and Retry recompiles into a real plan', async () => {
    // Deterministic per-use mock: every multi_family compile fails until the
    // Retry click flips the switch. (The HBU strip issues additional
    // compiles; in production they share the promise cache, but the mock
    // bypasses it, so attempt-counting would race.)
    let failMf = true;
    compileMock.mockImplementation(async (_fid, use) => {
      if (use !== 'multi_family') return new Promise<never>(() => undefined); // irrelevant use stays pending
      return failMf ? null : ctxResp('multi_family', 'ctx-recovered');
    });

    render(<SiteWorkspace parcel={PARCEL} />);

    // The failed compile (compilePlannerContext already retried internally)
    // blocks massing — the Retry screen renders and NOTHING is generated:
    // not the v2 server path, not the context-free legacy generator, not the
    // worker on default assumptions.
    await waitFor(() =>
      expect(screen.getByText('Massing blocked — zoning context unavailable')).toBeTruthy());
    expect(genV2Mock).not.toHaveBeenCalled();
    expect(genLegacyMock).not.toHaveBeenCalled();
    expect(optimizeSiteMock).not.toHaveBeenCalled();

    // An explicit Generate click while blocked must also refuse.
    fireEvent.click(screen.getByText('Run generate'));
    expect(genV2Mock).not.toHaveBeenCalled();
    expect(genLegacyMock).not.toHaveBeenCalled();
    expect(optimizeSiteMock).not.toHaveBeenCalled();

    // Retry → fresh compile succeeds → the block lifts and the plan renders
    // on the recovered context (and only on it).
    failMf = false;
    fireEvent.click(screen.getByText('Retry context compile'));
    await waitFor(() =>
      expect(genV2Mock).toHaveBeenCalledWith(669046, 'ctx-recovered', expect.anything()));
    expect(screen.queryByText('Massing blocked — zoning context unavailable')).toBeNull();
    expect(genLegacyMock).not.toHaveBeenCalled();
  });
});

describe('SiteWorkspace: pinned best-effort edits render with loud violations', () => {
  it('an edit that exceeds a cap still renders — the breach is a red violation in the auto-opened Flags dock, never a frozen canvas', async () => {
    compileMock.mockImplementation(async () => ctxResp('multi_family', 'ctx-mf'));
    genV2Mock.mockImplementation(async (_fid, ctxId) => ({
      ...serverResp(ctxId),
      flags: [
        'impervious_coverage_exceeded_pinned',
        'pinned_best_effort_v1',
        'parking_caps_units_below_program_min',
      ],
    }));

    render(<SiteWorkspace parcel={PARCEL} />);

    // The solve RENDERED (server generation succeeded)…
    await waitFor(() => expect(genV2Mock).toHaveBeenCalledWith(669046, 'ctx-mf', expect.anything()));
    // …and the exceeded cap surfaced as an error violation, which auto-opens
    // the Flags dock showing the red violation chip AND the generator's own
    // flag row (both carry the plain-language cap text — that's by design).
    await waitFor(() => expect(screen.getByText('impervious_coverage_exceeded')).toBeTruthy());
    expect(screen.getAllByText(/impervious area over the impervious-coverage cap/).length).toBeGreaterThanOrEqual(2);
  });
});

describe('SiteWorkspace: failed server plan → error card, never the improvised worker plan (order-6 item 5c)', () => {
  it('when the server generators are unreachable, the error card names the cause + Retry — and Retry re-solves into a real plan', async () => {
    compileMock.mockImplementation(async () => ctxResp('multi_family', 'ctx-mf'));
    genV2Mock.mockResolvedValue(null);     // v2 RPC unreachable
    genLegacyMock.mockResolvedValue(null); // legacy unreachable too

    render(<SiteWorkspace parcel={PARCEL} />);

    // Eric-decided (5c): the worker's improvised corner plan NEVER stands in
    // for a failed server solve — the card says what failed instead.
    const card = await screen.findByTestId('server-plan-error');
    expect(card.textContent).toContain('The massing service did not respond');
    expect(optimizeSiteMock).not.toHaveBeenCalled();

    // Retry with the service back → the real server plan renders.
    genV2Mock.mockResolvedValue(serverResp('ctx-mf'));
    fireEvent.click(screen.getByTestId('server-plan-retry'));
    await waitFor(() => expect(screen.queryByTestId('server-plan-error')).toBeNull());
    // 2026-09-04: the lineage sits inside the collapsed plan-basis row — open it
    fireEvent.click(await screen.findByTestId('plan-basis-toggle'));
    await waitFor(() => expect(screen.getByText('Context applied')).toBeTruthy());
    expect(optimizeSiteMock).not.toHaveBeenCalled();
  });
});

describe('SiteWorkspace: saved candidates keep their stored context', () => {
  it('viewing uses the candidate\'s STORED context id; "Regenerate with current context" is the explicit path to today\'s', async () => {
    compileMock.mockImplementation(async () => ctxResp('multi_family', 'ctx-mf'));
    listCandidatesMock.mockResolvedValue([{
      id: 'cand-older',
      createdAt: '2026-07-10T10:00:00Z',
      seed: 7,
      pins: [],
      parentId: null,
      metrics: { units_est: 75, stalls: 52, far: 0.7, gfa_sqft: 0 },
      contextId: 'ctx-old',
      contextHash: 'hash-ctx-old',
    }]);

    render(<SiteWorkspace parcel={PARCEL} />);

    // Auto-plan generated on the ACTIVE snapshot
    await waitFor(() => expect(genV2Mock).toHaveBeenCalledWith(669046, 'ctx-mf', expect.anything()));

    // Schemes live in the docked tab now (3b) — open it
    fireEvent.click(screen.getByTestId('dock-tab-schemes'));

    // The older candidate is flagged and offers the explicit action
    const regenBtn = await screen.findByText('Regenerate with current context');
    expect(screen.getByTitle(/Saved under an older context version/)).toBeTruthy();

    // VIEW → deterministic re-render under its stored context, not today's
    genV2Mock.mockClear();
    fireEvent.click(screen.getByText('75 u'));
    await waitFor(() => expect(genV2Mock).toHaveBeenCalledWith(
      669046, 'ctx-old', expect.objectContaining({ seed: 7, persist: false })));
    expect(genV2Mock).not.toHaveBeenCalledWith(669046, 'ctx-mf', expect.anything());

    // REGENERATE → a NEW candidate under the active context, descended from it
    genV2Mock.mockClear();
    fireEvent.click(regenBtn);
    await waitFor(() => expect(genV2Mock).toHaveBeenCalledWith(
      669046, 'ctx-mf', expect.objectContaining({ seed: 7, parentId: 'cand-older', persist: true })));
  });
});
