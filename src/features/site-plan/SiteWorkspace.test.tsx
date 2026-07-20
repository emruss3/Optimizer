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
    // ground multifamily massing (2600 W Heiman shipped exactly that). The
    // MF generator is refused for BOTH snapshots; the error violation
    // auto-surfaces the docked Flags tab (3b) with the refusal chip.
    await waitFor(() => expect(screen.getByText('use-binding')).toBeTruthy());
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

describe('SiteWorkspace: enterprise trust gate (no context → no massing)', () => {
  it('a FAILED compile blocks the canvas outright — no generator runs — and Retry recompiles into a real plan', async () => {
    let attempt = 0;
    compileMock.mockImplementation(async () => {
      attempt += 1;
      return attempt === 1 ? null : ctxResp('multi_family', 'ctx-recovered');
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
    fireEvent.click(screen.getByText('Retry context compile'));
    await waitFor(() =>
      expect(genV2Mock).toHaveBeenCalledWith(669046, 'ctx-recovered', expect.anything()));
    expect(screen.queryByText('Massing blocked — zoning context unavailable')).toBeNull();
    expect(genLegacyMock).not.toHaveBeenCalled();
  });
});

describe('SiteWorkspace: worker parity (fallback carries the ACTIVE brief)', () => {
  it('when the server generators are unreachable, the worker solve receives Regrid priors and objective weights from the active context', async () => {
    compileMock.mockImplementation(async () => ctxResp('multi_family', 'ctx-mf'));
    genV2Mock.mockResolvedValue(null);     // v2 RPC unreachable
    genLegacyMock.mockResolvedValue(null); // legacy unreachable too

    render(<SiteWorkspace parcel={PARCEL} />);

    await waitFor(() => expect(optimizeSiteMock).toHaveBeenCalled());
    const brief = optimizeSiteMock.mock.calls[0][5] as Record<string, unknown>;
    expect(brief).toMatchObject({
      generationAllowed: true,
      precedent: {
        depthP50Ft: 99.8,
        lengthP75Ft: 163.7,
        coverageP75Pct: 31,
        buildingCountP50: 6,
        storiesP50: 2,
        storiesP75: 2,
        footprintP75SqFt: 9100,
        footprintP90SqFt: 12000,
        sampleSize: 5,
        confidence: 'high',
        selectionMode: 'exact_same_zoning',
      },
      programPrior: { averageUnitSqft: 950 },
      objectiveWeights: { financial_return: 0.2, precedent_fit: 0.3 },
    });

    // The worker plan carried the active v2 context → honest "Context applied"
    await waitFor(() => expect(screen.getByText('Context applied')).toBeTruthy());
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
