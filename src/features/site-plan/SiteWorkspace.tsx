import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import EnterpriseSitePlanner from '../../components/EnterpriseSitePlannerShell';
import { SitePlannerErrorBoundary } from '../../components/ErrorBoundary';
import type { InvestmentAnalysis, SelectedParcel } from '../../types/parcel';
import { createFallbackParcel, isValidParcel } from '../../types/parcel';
import { useBuildableEnvelope } from './api/useBuildableEnvelope';
import { useSitePlanState } from './state/useSitePlanState';
import { workerManager } from '../../workers/workerManager';
import type { Element, FeasibilityViolation } from '../../engine/types';
import type { EdgeClassification } from '../../engine/setbacks';
import { normalizeToPolygon, calculatePolygonCentroid, correctedAreaM2, buffer, intersection, polygons, areaM2 } from '../../engine/geometry';
import { feature4326To3857, feature3857To4326 } from '../../utils/reproject';
import { feetToMeters } from '../../engine/units';
import { typologyToBuildingType, generateDefaultUnitMix, generateUnitMixForCount, type BuildingSpec } from '../../engine/model';
import { placeBarsAlongEdges } from '../../engine/edgePlacement';
import { buildBuildingFootprint } from '../../engine/buildingGeometry';
import { computeProForma } from '../../engine/proforma';
import type { Polygon, MultiPolygon } from 'geojson';
import ParametersPanel from './ui/ParametersPanel';
import ResultsPanel from './ui/ResultsPanel';
import KpiStrip from './ui/KpiStrip';
import ContextPanel from './ui/ContextPanel';
import { CensusBanner } from './ui/CensusBanner';
import { routesToLotFit, fetchPermittedUses, normalizePermittedUses, permittedUsesStatus, pickDefaultUse, isNonResidentialOnly, defaultUseFromZoningBase, NON_RESIDENTIAL_USES, type DesignContext, type PermittedUsesStatus } from './api/designContext';
import { CommercialCapacityCard } from './ui/CommercialCapacityCard';
import { fetchPlanPattern, type PlanPattern } from './api/planPattern';
import { PlanPatternPanel } from './ui/PlanPatternPanel';
import { generateSfSitePlan, sfPlanToElements, isSfPlanElement } from './api/generateSfPlan';
import {
  generateSubdivision, subdivisionToElements, subdivisionSummaryLine,
  type SubdivisionParams, type SubdivisionSummary,
} from './api/generateSubdivision';
import { SubdivisionPanel, schemeParams, type SubdivisionScheme } from './ui/SubdivisionPanel';
import {
  fetchSfV1Plan, fetchSfV1Site, fetchPadFill, fetchBfeContour, earthworkHasFlood,
  sfV1ToElements, sfV1Route, isOverride, withoutPattern,
  fetchSfV1DeepSearch, deepSearchOpt, deepWinnerPrecedent,
  fetchSfV1Candidates, summarizeCandidates, competitionErrorText, patternPhrase,
  parcelHoles3857, lotsOnParcelHoles, chooseAutoBest, candidateOpt, RM_COMPETITION_TH_BUDGET_MS,
  accessBanner, isNoStreetAccess,
  type HoleOverlap, type SfV1AutoBest, type SfV1DeepProgress,
  type SfV1Options, type SfV1Summary, type SfV1Response, type SfV1Site, type SfV1CandidatesResponse, bestRequestedOf } from './api/sfV1Plan';
import { SfV1Panel } from './ui/SfV1Panel';
import type { SfV1CompetitionState } from './ui/SfV1Competition';
import { fetchThV3Plan, thV3ToElements, type ThV3Summary } from './api/thV3Plan';
import { chooseLayout, isFloodSkip, type LayoutKind } from './api/layoutChoice';
import { LayoutChoicePanel } from './ui/LayoutChoicePanel';
import { line2274To3857 } from './api/parcelTopo';
import { generateMfSitePlan, generateMfSitePlanV2, generateThSitePlan, mfPlanToElements, seedFamilyPlanToElements, isSeedFamilyResponse, isMfPlanElement, isContextContractError, listMfCandidates, fetchMfMoney, enrichCandidatesWithMoney, type MfCandidate, type MfPin, type MfMoney } from './api/generateMfPlan';
import { fetchSfSeed } from './api/sfSeed';
import { validatePlanElements } from '../../engine/validatePlan';
import TabulationPanel from './ui/TabulationPanel';
import FlagsPanel from './ui/FlagsPanel';
import HbuStrip from './ui/HbuStrip';
import BuiltHeadline from './ui/BuiltHeadline';
import ExportReport from './ui/ExportReport';
import MaxBuildoutHeadline from './ui/MaxBuildoutHeadline';
import { fetchMaxBuildout, type MaxBuildout } from './api/maxBuildout';
import { fetchPlannerNeighbors, type PlannerNeighbors } from './api/neighbors';
import { fetchParcelTopo, topoView, TopoGrid, type ParcelTopo } from './api/parcelTopo';
import { buildSheetAnnotations, buildSheetTitleBlock } from './api/sheetAnnotations';
import { StreetProfilePanel, buildStreetProfiles } from './ui/StreetProfile';
import {
  compilePlannerContext,
  plannerContextToDesignContext,
  plannerContextSummary,
  briefToZoningPatch,
  briefToParkingPatch,
  briefToWorkerBrief,
  describeContextFlag,
  physicalOnlyBlock,
  type PlannerContextResponse,
} from './api/plannerContext';
import { fetchParcelFrontage, type ParcelFrontage } from './api/parcelFrontage';
import { fetchParcelBuildability, isRefusal, type ParcelBuildability } from './api/parcelBuildability';
import { fetchSeedPlan, type SeedPlan } from './api/seedPlan';
import { seedToElements } from '../../engine/seedToElements';
import { RefusalCard } from './ui/RefusalCard';
import { fetchMassingProgram, type MassingProgram } from './api/massingProgram';
import { recordPlannerFeedback } from './api/plannerFeedback';
import ContextLineage, { resolveContextApplication, contextStateLabel, type PlanLineage } from './ui/ContextLineage';
import { PlanBasisDisclosure, type BasisTone } from './ui/PlanBasisDisclosure';
import { mfAccessSummary } from './api/mfAccess';
import SchemesRail, { schemeNames } from './ui/SchemesRail';
import SchemeCompare from './ui/SchemeCompare';
import { loadSchemeDrawing } from './api/schemeDrawing';
import { useSitePlans } from '../../hooks/useSitePlans';
import type { SavedSitePlan } from '../../lib/sitePlanStorage';
import { buildDrawingScene, sceneEvidence, selectionFor, type SelectionCache } from './scene/buildScene';
import { ExhibitSheets } from './ui/ExhibitSheets';
import { useArchStyle } from './ui/archStyle';
import { DOCK_KEY, INSPECTOR_KEY } from './ui/workspaceLayout';
const Massing3D = React.lazy(() => import('./ui/Massing3D'));

/**
 * Diagnostics-only escape hatch: when '1', context-free solves render as
 * watermarked, never-persisted DRAFTS (the pre-2026-07-20 behavior) instead of
 * being blocked outright. Never set in production builds — the enterprise
 * posture is that nothing renders without a compiled ordinance context.
 */

type SiteWorkspaceProps = {
  parcel: SelectedParcel;
};

const SiteWorkspace: React.FC<SiteWorkspaceProps> = ({ parcel }) => {
  const {
    config,
    updateConfig,
    elements,
    metrics,
    setPlanOutput,
    alternatives,
    solveScores,
    selectedSolveIndex,
    selectedSolve,
    selectSolve,
    applyAlternatives,
    normalizedGeometry,
    isValidParcel: hasValidGeometry
  } = useSitePlanState(parcel);
  // WO-1b/c: derived street frontage (fn_parcel_frontage). Brief-first: the
  // worker mapper prefers the compiled brief's front_edge once the compiler
  // maps it; until then this direct fetch powers street-edge-first massing,
  // the landlocked banner, and curb-cut suppression.
  const [frontage, setFrontage] = useState<ParcelFrontage | null>(null);
  const frontageRef = useRef<ParcelFrontage | null>(null);
  frontageRef.current = frontage;
  // WO3: the massing program (composition directive + rationale). Brief-first
  // like frontage; MF only (the TH product has its own grammar).
  const [massingProg, setMassingProg] = useState<MassingProgram | null>(null);
  const massingRef = useRef<MassingProgram | null>(null);
  massingRef.current = massingProg;
  const { status, envelope, rpcMetrics, edgeClassifications, error: envelopeError } = useBuildableEnvelope(parcel, frontage?.primary?.bearing_deg ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [violations, setViolations] = useState<FeasibilityViolation[]>([]);
  // Workspace shell (3b): the canvas is the workspace — parameters live in a
  // collapsible left rail, reporting in tabs docked under the canvas.
  // The drawing has the screen. The inspector beside it and the schedule under it start closed
  // and open on request; the choice is kept on the device.
  const remembered = (key: string): boolean | null => {
    try { const v = localStorage.getItem(key); return v === 'open' ? true : v === 'closed' ? false : null; } catch { return null; }
  };
  const remember = (key: string, open: boolean) => { try { localStorage.setItem(key, open ? 'open' : 'closed'); } catch { /* the choice holds for this visit */ } };
  const [leftRailCollapsed, setLeftRailCollapsedState] = useState(() => !(remembered(INSPECTOR_KEY) ?? false));
  const setLeftRailCollapsed = useCallback((next: boolean | ((c: boolean) => boolean)) => {
    setLeftRailCollapsedState(c => { const v = typeof next === 'function' ? next(c) : next; remember(INSPECTOR_KEY, !v); return v; });
  }, []);
  const [dockOpen, setDockOpenState] = useState(() => remembered(DOCK_KEY) ?? false);
  const setDockOpen = useCallback((open: boolean) => { remember(DOCK_KEY, open); setDockOpenState(open); }, []);
  const [dockTab, setDockTab] = useState<'tabulation' | 'schemes' | 'flags' | 'results' | 'profile'>('tabulation');
  // The drawing scene path (2026-11-11). `?drawing=classic` turns it off: the
  // plan, the 3D view and the export then draw exactly as they did before it.
  const classicDrawing = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('drawing') === 'classic'; } catch { return false; }
  }, []);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [sceneSelection, setSceneSelection] = useState<SelectionCache | null>(null);
  // Exit artifact (P1-5): print-ready scheme report with a plan snapshot.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPng, setExportPng] = useState<string | null>(null);
  const openExport = useCallback(() => {
    const canvas = document.querySelector('canvas[data-export="site-plan"]') as HTMLCanvasElement | null;
    try {
      setExportPng(canvas ? canvas.toDataURL('image/png') : null);
    } catch {
      setExportPng(null);
    }
    setExportOpen(true);
  }, []);
  // An ERROR-severity violation is never something to hunt for in a tab —
  // surface the Flags dock the moment one lands.
  useEffect(() => {
    if (violations.some(v => v.severity === 'error')) { setDockTab('flags'); setDockOpenState(true); }
  }, [violations]);

  // ── Design-context engine (brief Phase 1) ────────────────────────────────
  const contextOgcFid = useMemo(() => {
    const n = Number(parcel.ogc_fid);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [parcel.ogc_fid]);
  // Initial use is a placeholder — the workspace corrects it to the parcel's
  // highest-intensity as-of-right use unless the user picked one.
  const [contextUse, setContextUse] = useState('single_family');
  const userPickedUseRef = useRef(false);
  const handleUseChange = useCallback((use: string) => {
    userPickedUseRef.current = true;
    setContextUse(use);
  }, []);
  const appliedContextRef = useRef<string | null>(null);

  // WO-1b: frontage travels with the parcel, not the compile — fetch once
  // per parcel and cache (parcelFrontage module dedupes in-flight calls).
  useEffect(() => {
    let cancelled = false;
    setFrontage(null);
    if (contextOgcFid == null) return;
    fetchParcelFrontage(contextOgcFid).then(f => {
      if (!cancelled) setFrontage(f);
    });
    setMassingProg(null);
    fetchMassingProgram(contextOgcFid, 'multifamily').then(m => {
      if (!cancelled) setMassingProg(m);
    });
    return () => { cancelled = true; };
  }, [contextOgcFid]);

  // ── ONE compiled planner context (planner_context_v2) drives everything ──
  // ContextPanel display, server generation (v2), worker grounding, plan
  // lineage, and feedback events all read this snapshot. Nothing else fetches
  // context. Exactly one snapshot is active per parcel + selected use +
  // normalized intent; a use switch clears it before compiling the next one.
  const [plannerCtx, setPlannerCtx] = useState<PlannerContextResponse | null>(null);
  const plannerCtxRef = useRef<PlannerContextResponse | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [permittedUses, setPermittedUses] = useState<string[]>([]);
  // What the LAST generated plan said about its own basis (context id/version,
  // generator/score lineage, result summary). Drives the honest "Context
  // applied" strip — never inferred from the active context.
  const [planLineage, setPlanLineage] = useState<PlanLineage | null>(null);
  // Use/context changed after this plan was generated → it no longer reflects
  // the active planning basis. Cleared by the next successful generation.
  const [planStale, setPlanStale] = useState(false);
  const lastCompiledUseRef = useRef<string | null>(null);
  // The first compile must be for the FINAL default use — compiling while the
  // as-of-right correction is still in flight routed plans off a
  // wrong-use context (seen live: single_family compile racing multi_family
  // correction on an RM40 parcel).
  const [useResolved, setUseResolved] = useState(false);
  const [generationBlocked, setGenerationBlocked] = useState(false);
  const generationBlockedRef = useRef(false);

  // ── SF lot generator (brief Phase 2) ─────────────────────────────────────
  const [isGeneratingLots, setIsGeneratingLots] = useState(false);
  // Per-task timings and outcomes for the evidence hook (the cohort retest,
  // 2026-11-09: "record timings and reason codes for context compile, solve,
  // fallback"): each task's last duration, read off its own busy flag.
  const taskTimingsRef = useRef<{ compileMs: number | null; massingMs: number | null; lotFitMs: number | null; compileStarted: number | null; massingStarted: number | null; lotFitStarted: number | null }>({
    compileMs: null, massingMs: null, lotFitMs: null, compileStarted: null, massingStarted: null, lotFitStarted: null,
  });
  const [taskTimingsVersion, setTaskTimingsVersion] = useState(0);
  const [lotFitSummary, setLotFitSummary] = useState<string | null>(null);
  // Subdivision generator (2026-09-03): the neighbourhood the server drew and
  // the scheme it was asked for (district lots / SP 25-ft / SP + amenity).
  const [subdivisionSummary, setSubdivisionSummary] = useState<SubdivisionSummary | null>(null);
  const [subdivisionScheme, setSubdivisionScheme] = useState<SubdivisionScheme>('district');
  const subdivisionParamsRef = useRef<SubdivisionParams>({});
  // By-right subdivision (sf_v1, 2026-10-27): what the district's own
  // standards draw, its self-grading tests, and the override the user asked
  // for (a lot module, the floodway-only fill scenario) — never the default.
  const [sfV1Summary, setSfV1Summary] = useState<SfV1Summary | null>(null);
  const [sfV1Override, setSfV1Override] = useState<SfV1Options>({});
  const sfV1OverrideRef = useRef<SfV1Options>({});
  // The ground-at-BFE contour of the earthwork view (EPSG:2274 lines from the DEM).
  const [bfeContour, setBfeContour] = useState<{ bfeFt: number; lines: number[][][] } | null>(null);
  // The site the generator worked on (what the flood hold took out) for the shown answer.
  const [sfV1Site, setSfV1Site] = useState<SfV1Site | null>(null);
  // The pattern competition (fn_sf_v1_candidates, 2026-11-04): grid,
  // neighborhood and the loop grammar side by side; `best` and `structured`
  // can each be put on the sheet. `sfV1Shown` names the grammar on the sheet
  // ('loop' = the default by-right answer).
  const [sfV1Competition, setSfV1Competition] = useState<SfV1CompetitionState | null>(null);
  const [sfV1Shown, setSfV1Shown] = useState<string>('loop');
  const sfV1CandidatesRef = useRef<SfV1CandidatesResponse | null>(null);
  const sfV1DefaultRespRef = useRef<SfV1Response | null>(null);
  const competitionSeqRef = useRef(0);
  // The deep search (engine g41): keeps looking after the plan is on the sheet and swaps in a plan with more lots.
  const [sfV1Deep, setSfV1Deep] = useState<SfV1DeepProgress | null>(null);
  useEffect(() => { setSfV1Deep(null); }, [contextOgcFid]);
  // Every massing call carries a run number; a response that comes back
  // after a newer call started, or after the parcel changed, is discarded
  // (the scope's P0.1: a delayed response from an old parcel or scheme cannot
  // replace the current plan).
  const mfRunSeqRef = useRef(0);
  useEffect(() => { mfRunSeqRef.current += 1; }, [contextOgcFid]);
  // The single-family seed was asked for the one house and could not place it.
  const [sfSeedError, setSfSeedError] = useState<string | null>(null);
  // The compile's physical verdict when it blocks a by-right use (the floodplain).
  const [physicalBlockReason, setPhysicalBlockReason] = useState<string | null>(null);
  // Drawn lots lying in the parcel's holes (other owners' lots inside it: 0 Longwood Pl).
  const [sfV1HoleOverlap, setSfV1HoleOverlap] = useState<HoleOverlap | null>(null);
  // The competition's best on the sheet in place of the default answer, and why
  // (the default drew no lots, the same lots on a worse plan, or fewer lots).
  const [sfV1AutoBest, setSfV1AutoBest] = useState<SfV1AutoBest | null>(null);
  const sfV1ShownRef = useRef<string>('loop');
  const renderSfV1Ref = useRef<((resp: SfV1Response, opt: SfV1Options, shown: string) => Promise<void>) | null>(null);
  const elementsRef = useRef<Element[]>([]);
  const metricsRef = useRef<typeof metrics>(metrics);
  // The layout choice on multifamily land (the owner, 2026-11-04): the
  // multifamily plan by default where it places more homes, with a switch to
  // the neighborhood layout (the competition's best: townhomes from th_v3, or
  // house lots). The multifamily side is the plan last drawn by the massing
  // engine; `layoutAuto` = the neighborhood went on the sheet by itself.
  const [mfLayoutHomes, setMfLayoutHomes] = useState<{ homes: number | null; product: 'apartments' | 'townhomes'; failed: boolean } | null>(null);
  const mfLayoutHomesRef = useRef<{ homes: number | null; product: 'apartments' | 'townhomes'; failed: boolean } | null>(null);
  const [layoutAuto, setLayoutAuto] = useState(false);
  const layoutUserChoseRef = useRef(false);
  const layoutCompetitionRanRef = useRef(false);
  const [thV3Summary, setThV3Summary] = useState<ThV3Summary | null>(null);
  const [thV3Error, setThV3Error] = useState<string | null>(null);
  const drawNeighborhoodRef = useRef<((requested: string) => Promise<boolean>) | null>(null);
  const runLayoutCompetitionRef = useRef<((fid: number) => void) | null>(null);
  const layoutChoiceRef = useRef<ReturnType<typeof chooseLayout> | null>(null);

  // ── HBU / regime plan routing ─────────────────────────────────────────────
  // What we planned and WHY, shown under the KPI bar ("Plan basis: …").
  const [planBasis, setPlanBasis] = useState<string | null>(null);
  // 'sf' = lot generator; 'mf' = client massing engine (fallback);
  // 'mf-server' = server-generated site system (bars + drives + parking +
  // courts from fn_generate_mf_site_plan). Static modes ('sf', 'mf-server')
  // guard the live re-solver and drag pump — those plans vary by
  // REGENERATION (candidate tree), not by local re-packing.
  const planModeRef = useRef<'sf' | 'mf' | 'mf-server' | null>(null);
  const mfSeedRef = useRef(1);
  // Product within the multifamily legal basis: stacked apartments (mf
  // generator) or attached townhomes (th generator, attached-dwelling
  // ordinance standards). Both route through the same compiled context.
  const [product, setProduct] = useState<'apartments' | 'townhomes'>('apartments');
  const productRef = useRef<'apartments' | 'townhomes'>('apartments');
  // A2 edit-as-regeneration state: current pins + the candidate the next
  // variation descends from; A1 rail data.
  const mfPinsRef = useRef<MfPin[]>([]);
  const mfRegenInFlightRef = useRef(false);
  // Degraded-mode honesty: true when the visible plan was built on default
  // assumptions (context unavailable/timed out). Drafts are watermarked and
  // never persisted — degraded output must not look authoritative.
  // ENTERPRISE POSTURE (default): context-free massing does not render AT ALL —
  // a failed/hung compile blocks the canvas behind a Retry screen instead of
  // drafting. The watermarked-draft path survives only behind this diagnostics
  // flag; the one draft that remains without it is the explicit replay of a
  // pre-contract saved scheme (its stored basis IS the legacy generator).
  const [draftMode, setDraftMode] = useState(false);
  const draftModeRef = useRef(false);
  const markDraft = useCallback((v: boolean) => {
    draftModeRef.current = v;
    setDraftMode(v);
  }, []);
  // Massing blocked because no compiled context exists (compile failed or hung).
  // Distinct from generationBlocked (use not permitted): this is "we don't KNOW
  // the rules yet", that is "the rules say no".
  const [compileBlocked, setCompileBlocked] = useState<string | null>(null);
  const compileBlockedRef = useRef<string | null>(null);
  const markCompileBlocked = useCallback((reason: string | null) => {
    compileBlockedRef.current = reason;
    setCompileBlocked(reason);
  }, []);
  // Order-6 item 5c (Eric-decided): a FAILED server plan shows an error card
  // naming its cause + Retry — never the improvised worker corner plan. This
  // is what makes distinct failures look distinct: compile failed (Retry
  // screen) ≠ use not permitted (generation blocked) ≠ parcel refuses
  // (RefusalCard) ≠ massing failed (THIS card).
  const [serverPlanError, setServerPlanError] = useState<string | null>(null);
  // The cause travels by ref from the failure site inside runServerMfPlan to
  // whichever caller decides to show the card.
  const serverFailCauseRef = useRef<string | null>(null);
  // Zero-overlap gate bookkeeping: one silent re-solve per gesture on the
  // server path; rejected worker candidates surface in the solves rail.
  const serverGeoRetryRef = useRef(false);
  // Why the last server solve was rejected by the geometry gate (null = it
  // wasn't). The auto-plan's worker fallback re-surfaces this AFTER the worker
  // result lands, so a rejected server plan never silently becomes a worker
  // plan with no explanation.
  const serverRejectRef = useRef<string | null>(null);
  const [solveRejected, setSolveRejected] = useState<{ count: number; reasons: string[] } | null>(null);
  // Bumping this recompiles the context (the Retry button on the amber banner)
  const [compileNonce, setCompileNonce] = useState(0);
  // SF-first objective: the lot's legal max-buildout envelope (fn_max_buildout)
  const [maxBuildout, setMaxBuildout] = useState<MaxBuildout | null>(null);
  // Neighborhood context: neighbor parcels/buildings/streets (display-only)
  const [neighbors, setNeighbors] = useState<PlannerNeighbors | null>(null);
  // Existing topography (USGS 3DEP via fn_parcel_topo): contours on the sheet,
  // spot grades at the stations, the street profiles. Display and profiling
  // only — no generator reads it yet.
  const [topo, setTopo] = useState<ParcelTopo | null>(null);
  const [showTopo, setShowTopo] = useState(true);
  // J1: the engine's buildability verdict — a refused parcel is a first-class
  // result (RefusalCard), fetched the moment the parcel opens.
  const [buildability, setBuildability] = useState<ParcelBuildability | null>(null);
  // Order-8: the parcel permits commercial/industrial but NO residential use
  // as-of-right — the massing engines cannot serve it; the capacity card can.
  const [nonResidentialOnly, setNonResidentialOnly] = useState(false);
  // The selected use is permitted but no massing engine draws it (commercial,
  // industrial): the compile is not attempted, no solver is dispatched, the
  // capacity card carries the ordinance caps (the scope's P0.3, 2026-11-09).
  const [unsupportedUse, setUnsupportedUse] = useState<string | null>(null);
  // An SP parcel whose ordinance is not loaded: the resolver names the bill
  // and the case; no use resolves, so nothing compiles or seeds (2026-11-09).
  const [spOrdinance, setSpOrdinance] = useState<PermittedUsesStatus | null>(null);
  const spOrdinanceRef = useRef<PermittedUsesStatus | null>(null);
  // Plan-organization layer (fn_plan_pattern): how this site should be
  // organized, with precedent plans and an honest generator-alignment verdict.
  const [planPattern, setPlanPattern] = useState<PlanPattern | null>(null);
  // Stage-1+2 seed plan (order-4 item 1): the engine's placed composition,
  // drawn stage-ordered behind the Seed toggle.
  const [seedPlan, setSeedPlan] = useState<SeedPlan | null>(null);
  const [showSeed, setShowSeed] = useState(false);
  // Live-drag pump (dynamic site plans): drag events coalesce latest-wins
  // into preview solves (persist=false); the release commits the candidate.
  const pendingMfRegenRef = useRef<{ pins: MfPin[]; final: boolean; dropPinIndex: number | null } | null>(null);
  const dragPinRef = useRef<{
    elementId: string;
    pinIndex: number;
    /** Gesture-start dims — the release compares against these to record the
     *  honest feedback event type (moved vs resized vs rotated). */
    startW?: number;
    startD?: number;
    startRot?: number;
  } | null>(null);
  // A3: local-sales valuation of the CURRENT scheme — ticks during drags
  const [serverMoney, setServerMoney] = useState<MfMoney | null>(null);
  const moneyInFlightRef = useRef(false);
  const loadMoney = useCallback((gfaSqft?: number, units?: number) => {
    if (contextOgcFid == null || !gfaSqft || moneyInFlightRef.current) return;
    moneyInFlightRef.current = true;
    fetchMfMoney(contextOgcFid, gfaSqft, units)
      .then(m => { if (m) setServerMoney(m); })
      .catch(() => undefined)
      .finally(() => { moneyInFlightRef.current = false; });
  }, [contextOgcFid]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [mfCandidates, setMfCandidates] = useState<MfCandidate[]>([]);
  const ctxSettledRef = useRef<DesignContext | null | 'pending'>('pending');

  // ── Undo / redo ───────────────────────────────────────────────────────────
  // The undo unit is the worker's canonical BuildingSpec[] — restoring a
  // snapshot replays it through the worker (SET_BUILDINGS) so parking, metrics
  // and pro forma all regenerate consistently. Max 50 steps.
  const currentBuildingsRef = useRef<BuildingSpec[]>([]);
  const pastRef = useRef<BuildingSpec[][]>([]);
  const futureRef = useRef<BuildingSpec[][]>([]);
  const gestureActiveRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const trackBuildings = useCallback((buildings?: BuildingSpec[]) => {
    if (buildings) currentBuildingsRef.current = buildings;
  }, []);

  const pushHistory = useCallback(() => {
    pastRef.current.push(structuredClone(currentBuildingsRef.current));
    if (pastRef.current.length > 50) pastRef.current.shift();
    futureRef.current = [];
    setHistoryVersion(v => v + 1);
  }, []);
  const [investmentAnalysis, setInvestmentAnalysis] = useState<InvestmentAnalysis | null>(null);
  const [solverReady, setSolverReady] = useState(false);
  const hasAutoGeneratedRef = useRef(false);
  const lastParcelIdRef = useRef<string | number | null>(null);

  // Plan persistence
  const parcelIdStr = String(parcel.ogc_fid ?? parcel.id ?? 'unknown');
  const {
    plans: savedPlans,
    isLoading: savedPlansLoading,
    error: savedPlansError,
    save: savePlanToDb,
    remove: deletePlanFromDb,
    setFavorite: togglePlanFavorite,
  } = useSitePlans(parcelIdStr);

  const handleSavePlan = useCallback(
    (name: string) => {
      // Draft plans (default assumptions) are never persisted — saving one
      // would launder degraded output into an authoritative-looking scheme.
      // Same while massing is blocked: whatever is on canvas predates the block.
      if (draftModeRef.current || compileBlockedRef.current) {
        setViolations(v => [...v, {
          code: 'draft-not-saved',
          message: 'This plan uses default assumptions (context unavailable) — retry the context compile before saving.',
          severity: 'warning',
        }]);
        return;
      }
      savePlanToDb({
        parcel_id: parcelIdStr,
        name,
        config,
        elements,
        metrics,
        violations,
        investment: investmentAnalysis,
      });
      void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'candidate_saved', activeCandidateId, { name });
    },
    [savePlanToDb, parcelIdStr, config, elements, metrics, violations, investmentAnalysis, activeCandidateId]
  );

  const handleLoadPlan = useCallback(
    (plan: SavedSitePlan) => {
      setPlanOutput(plan.elements ?? [], plan.metrics ?? null);
      setViolations(plan.violations ?? []);
      setInvestmentAnalysis(plan.investment ?? null);
    },
    [setPlanOutput]
  );

  const envelopeMeters = useMemo(() => {
    // Step 1: Get the parcel polygon in EPSG:3857 (needed for all paths)
    let parcelPoly3857: Polygon | null = null;
    try {
      if (parcel?.geometry) {
        const geom = parcel.geometry as Polygon | MultiPolygon;
        const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
        const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
        const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
        parcelPoly3857 = normalizeToPolygon(reprojected);
      }
    } catch { /* parcel geometry is invalid */ }

    // Step 2: Try to use the RPC envelope
    let env: Polygon | null = null;
    if (envelope && status === 'ready') {
      try {
        const geom = envelope as Polygon | MultiPolygon;
        const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
        const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
        const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
        env = normalizeToPolygon(reprojected);
      } catch { /* RPC envelope is invalid */ }
    }

    // Step 3: If no RPC envelope, create one by insetting the parcel by 6m (~20ft)
    if (!env && parcelPoly3857) {
      try {
        const inset = buffer(parcelPoly3857, -feetToMeters(20));
        if (inset.coordinates?.[0]?.length >= 4) {
          env = inset;
        }
      } catch { /* buffer failed */ }
    }

    // Step 4: CRITICAL — clip envelope to parcel boundary.
    // The envelope must NEVER extend beyond the parcel.
    if (env && parcelPoly3857) {
      try {
        const clipped = intersection(parcelPoly3857, env);
        const clippedPolys = polygons(clipped);
        if (clippedPolys.length > 0) {
          let best = clippedPolys[0];
          let bestArea = areaM2(best);
          for (let i = 1; i < clippedPolys.length; i++) {
            const a = areaM2(clippedPolys[i]);
            if (a > bestArea) { bestArea = a; best = clippedPolys[i]; }
          }
          return best;
        }
      } catch (err) {
        console.warn('[envelopeMeters] intersection failed, using buffer fallback:', err);
      }

      // Intersection failed — fall back to buffer(parcel, -6m)
      try {
        const inset = buffer(parcelPoly3857, -feetToMeters(20));
        if (inset.coordinates?.[0]?.length >= 4) {
          return inset;
        }
      } catch { /* buffer also failed */ }

      // Last resort: use the parcel polygon itself (no setbacks, but at least it's correct)
      return parcelPoly3857;
    }

    // If we have env but no parcel (shouldn't happen), return env
    if (env) return env;

    // No envelope at all
    return parcelPoly3857;
  }, [envelope, status, parcel?.geometry]);

  // Fallback = the envelope fetch SETTLED without a usable RPC envelope.
  // (While status is 'loading' the banner shows loading — previously this
  // flashed a misleading "fallback" banner during the ~600ms fetch.)
  const usingFallbackEnvelope = !!(envelopeMeters && status !== 'loading' && !(envelope && status === 'ready'));

  // Elements and envelope stay in EPSG:3857 meters — no feet conversion.
  // The canvas viewport fits to processedGeometry (also EPSG:3857 meters).

  /**
   * Beat-TestFit M2: server-generated site system. The backend plans the
   * whole site — entry drive off the primary frontage, bar rows, parking
   * streets, green courts, amenity — with EPSG:2274-true areas, and persists
   * a siteplanner_candidate. Returns false when unreachable or the parcel
   * defeats the generator, so the client engine can take over.
   */
  const refreshCandidates = useCallback(() => {
    if (contextOgcFid == null) return;
    const fid = contextOgcFid;
    listMfCandidates(fid)
      .then(cands => {
        setMfCandidates(cands); // show immediately…
        return enrichCandidatesWithMoney(fid, cands); // …then rank by market margin
      })
      .then(setMfCandidates)
      .catch(() => undefined);
  }, [contextOgcFid]);

  const runServerMfPlan = useCallback(async (opts: {
    seed: number;
    pins?: MfPin[];
    parentId?: string | null;
    persist?: boolean;
    /** Live-drag: omit this pin's bar from the render — the user's hand
     *  (the Shell's locally-dragged element) is the source of truth for it */
    dropPinIndex?: number | null;
    /** Saved-candidate view: undefined = active snapshot; a string = that
     *  candidate's STORED context; null = force the legacy path (candidate
     *  predates the context contract — today's context must not silently
     *  rewrite what it meant). */
    contextId?: string | null;
    /** Explicit product override (candidate replays); defaults to the
     *  active product selection. */
    product?: 'apartments' | 'townhomes';
  }): Promise<boolean> => {
    if (contextOgcFid == null) return false;
    serverRejectRef.current = null;
    const run = ++mfRunSeqRef.current;
    const stale = () => run !== mfRunSeqRef.current;
    const snapshot = plannerCtxRef.current;
    const effectiveContextId = opts.contextId !== undefined
      ? opts.contextId
      : snapshot?.context_id ?? null;
    const effectiveProduct = opts.product ?? productRef.current;
    // USE-BINDING INVARIANT: the use compiled must equal the use being
    // massed. Massing an MF/TH product under a non-multifamily ACTIVE
    // snapshot shipped SF setbacks beneath apartment bars (2600 W Heiman).
    // Stored-candidate replays (explicit contextId) are exempt — their
    // stored context IS the massing context and the UI marks them stale.
    if (
      opts.contextId === undefined &&
      snapshot &&
      snapshot.context.typology !== 'multifamily'
    ) {
      console.error(
        `[use-binding] server solve: refusing to mass '${effectiveProduct}' under a '${snapshot.context.typology}' compiled context (${snapshot.context_id}). Compile use and massing use must match.`
      );
      setViolations([{
        code: 'use-binding',
        message: `Use mismatch: the compiled context is '${snapshot.context.typology}' but the solver was asked for multifamily massing. Pick the multifamily use (or generate lots) instead.`,
        severity: 'error',
      }]);
      serverFailCauseRef.current = `Use mismatch — the compiled context is '${snapshot.context.typology}', not multifamily. Pick the multifamily use and retry.`;
      return false;
    }
    let resp = effectiveContextId
      ? effectiveProduct === 'townhomes'
        ? await generateThSitePlan(contextOgcFid, effectiveContextId, {
            seed: opts.seed,
            pins: opts.pins,
            parentId: opts.parentId,
            persist: opts.persist,
          })
        : await generateMfSitePlanV2(contextOgcFid, effectiveContextId, {
            seed: opts.seed,
            pins: opts.pins,
            parentId: opts.parentId,
            persist: opts.persist,
            typology: snapshot?.context.typology,
          })
      : null;
    // A newer run or another parcel has taken over: this answer is nobody's.
    if (stale()) return false;
    // Townhomes have no legacy fallback: silently rendering apartments in
    // their place would misrepresent the selected product.
    if (!resp && effectiveProduct === 'townhomes') {
      serverFailCauseRef.current = 'The townhome service did not respond.';
      return false;
    }
    if (resp?.error === 'planner_generation_not_allowed') {
      generationBlockedRef.current = true;
      setGenerationBlocked(true);
      setPlanBasis(`Generation blocked — selected use not permitted as-of-right${snapshot ? ` · ${plannerContextSummary(snapshot)}` : ''}`);
      return true; // handled: a rejection, not a fallback case
    }
    // Context-contract errors are surfaced, never papered over with the
    // legacy generator: a v1 fallback here would render a plan that ignores
    // the compiled context while the UI still displays one.
    if (effectiveContextId && resp && isContextContractError(resp.error)) {
      setViolations([{
        code: 'context-contract',
        message: `Context contract error (${resp.error}) — the plan was not regenerated. Re-select the use or reload to compile a fresh context.`,
        severity: 'error',
      }]);
      setPlanBasis(`Context contract error — ${describeContextFlag(resp.error ?? '')}`);
      return true; // handled: an explicit rejection, not a fallback case
    }
    let degraded = false;
    if (!resp) {
      // Explicit replay of a pre-contract saved scheme: its stored basis IS
      // the legacy generator, so the replay stays on it (rendered as a draft,
      // never persisted). This is the ONLY context-free render that survives
      // the enterprise gate — it is historical data, labeled stale in the rail.
      const legacyReplay = opts.contextId === null;
      if (!legacyReplay) {
        if (effectiveContextId) {
          // The massing SERVICE is unreachable. Order-6 item 5c: no caller
          // improvises a worker plan in its place any more — the cause
          // travels to the error card.
          serverFailCauseRef.current = 'The massing service did not respond (transport failure).';
          return false;
        }
        // No compiled context at all: nothing may render. Block with Retry.
        markCompileBlocked('The zoning context has not compiled for this parcel.');
        return true; // handled: an explicit refusal, not a fallback case
      }
      // v2 RPC unreachable (transport failure / not yet deployed) → the
      // deliberate deployment-compatibility window: the legacy six-argument
      // generator. Context-free = DRAFT: watermarked, never persisted.
      degraded = true;
      resp = await generateMfSitePlan(contextOgcFid, {
        seed: opts.seed,
        pins: opts.pins,
        parentId: opts.parentId,
        persist: false,
      });
      if (stale()) return false;
    }
    if (!resp || !resp.buildings || resp.buildings.length === 0) {
      serverFailCauseRef.current = resp
        ? `The generator returned no plan${resp.generation ? ` — ${resp.generation}` : resp.error ? ` — ${resp.error}` : ''}.`
        : 'The massing service did not respond.';
      return false;
    }
    // Two payload families render here: the default seed generator (native
    // EPSG:2274 structures[], dual parking ratios) and the legacy search
    // core at *_search (4326 geoms, full metrics). Family-aware mapping.
    const mapped = isSeedFamilyResponse(resp)
      ? seedFamilyPlanToElements(resp)
      : mfPlanToElements(resp);

    // Zero-overlap invariant: server plans are validated before they can
    // render, same as the worker path. An invalid candidate is re-solved once
    // with a different seed; if that also fails it is REJECTED, not rendered.
    const validation = validatePlanElements(mapped.elements);
    if (!validation.ok) {
      if (!serverGeoRetryRef.current) {
        serverGeoRetryRef.current = true;
        setPlanBasis(`Plan rejected: ${validation.reason} — re-solving`);
        const ok = await runServerMfPlan({ ...opts, seed: opts.seed + 13 });
        serverGeoRetryRef.current = false;
        return ok;
      }
      console.warn(
        `[server-plan] rejected by the geometry gate after retry: ${validation.reason}`,
        validation.overlaps.slice(0, 4)
      );
      serverRejectRef.current = validation.reason;
      setViolations([{
        code: 'geometry-overlap',
        message: `Plan rejected: ${validation.reason}. Generate again for a new variation.`,
        severity: 'error',
      }]);
      setPlanBasis(`Plan rejected: ${validation.reason}`);
      serverFailCauseRef.current = `The plan failed the geometry gate after a retry: ${validation.reason}.`;
      return false;
    }
    serverGeoRetryRef.current = false;
    serverFailCauseRef.current = null;
    setServerPlanError(null);
    markDraft(degraded || !effectiveContextId);

    // Post-solve assertion: the generator's declared typology must match the
    // product that was requested. This can only diverge on a server bug —
    // scream, never silently render it as something it isn't.
    const expectedFamily = effectiveProduct === 'townhomes' ? 'townhome' : 'multifamily';
    if (resp.typology && resp.typology !== expectedFamily) {
      console.error(
        `[use-binding] server returned typology '${resp.typology}' for a '${effectiveProduct}' solve (context ${resp.context_id ?? 'none'}).`
      );
    }

    const { metrics: serverMetrics, basis, flags } = mapped;
    let generated = mapped.elements;
    if (opts.dropPinIndex != null) {
      generated = generated.filter(
        el => !(el.properties?.pinned && el.properties?.pinIndex === opts.dropPinIndex)
      );
    }
    if (generated.length === 0) return false;
    planModeRef.current = 'mf-server';
    mfSeedRef.current = opts.seed;
    mfPinsRef.current = resp.pins ?? [];
    if (resp.candidate_id) setActiveCandidateId(resp.candidate_id);
    const base = elements.filter(el => !isMfPlanElement(el) && !isSfPlanElement(el));
    setPlanOutput([...base, ...generated], serverMetrics ?? metrics);
    // The multifamily side of the layout choice is the plan last drawn here;
    // a neighborhood plan's panels leave the sheet with the neighborhood.
    const mfHomes = { homes: serverMetrics?.totalUnits ?? null, product: effectiveProduct, failed: false };
    mfLayoutHomesRef.current = mfHomes;
    setMfLayoutHomes(mfHomes);
    setSfV1Summary(null);
    setThV3Summary(null);
    setSfV1HoleOverlap(null);
    setBfeContour(null);
    // Pinned best-effort honesty: any cap the user's placed building EXCEEDED
    // is a red violation on a rendered plan — the edit shows, the breach is
    // loud (and auto-surfaces the Flags dock). Clamps stay amber in the KPI.
    const exceededFlags = flags.filter(f => f.endsWith('_exceeded_pinned'));
    setViolations(exceededFlags.map(f => ({
      code: f.replace(/_pinned$/, ''),
      message: describeContextFlag(f),
      severity: 'error' as const,
    })));
    // Plan lineage — what THIS plan reports about its own basis. The
    // "Context applied" strip compares these against the active snapshot.
    const mNum = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    setPlanLineage({
      solvedBy: 'server',
      contextId: resp.context_id ?? null,
      contextVersion: resp.context_version ?? null,
      contextHash: resp.context_hash ?? null,
      generatorVersion: resp.generator_version ?? null,
      scoreVersion: resp.score_version ?? null,
      programPriorVersion: resp.program_prior_version ?? null,
      scoreTotal: resp.score_total ?? null,
      scoreComponents: resp.score_components ?? null,
      flags,
      // Seed-family payloads name these differently (structures / stories /
      // per-structure footprints) — fall through so the lineage strip stays
      // populated for both families.
      buildings: mNum(resp.metrics?.bars) ?? (resp.buildings?.length || null),
      floors: mNum(resp.metrics?.floors) ?? mNum(resp.metrics?.stories),
      footprintSqft: mNum(resp.metrics?.footprint_sqft)
        ?? (resp.buildings?.length
          ? resp.buildings.reduce((s, b) => s + (mNum((b as { footprint_sqft?: unknown }).footprint_sqft) ?? 0), 0) || null
          : null),
    });
    setPlanStale(false);
    const parkingNote = flags.includes('parking_below_ratio') ? ' · ⚠ parking below target ratio' : '';
    const clampCount = flags.filter(f => f.includes('clamp')).length;
    const clampNote = clampCount > 0 ? ` · ${clampCount} clamp${clampCount === 1 ? '' : 's'}` : '';
    const scoreNote = typeof resp.score_total === 'number' ? ` · score ${resp.score_total}` : '';
    // Stage-5 napkin honesty: when the solver relaxed the massing directive,
    // the basis line says HOW it stayed in-family (or that it free-packed).
    const relaxNote = (() => {
      const cleaned = [...new Set(
        flags
          .filter(f => f.startsWith('massing_program_relaxed_') || f.startsWith('massing_program_free_pack'))
          .map(f => f
            .replace('massing_program_relaxed_', '')
            .replace('massing_program_', '')
            .replace(/_selected(_v\d+)?$/, '')
            .replace(/_v\d+$/, '')
            .replace(/_/g, ' '))
      )];
      if (!cleaned.length) return '';
      // Free-pack is the LAST rung, not in-family — say which one it was.
      const label = cleaned.some(c => c.includes('free pack')) ? 'relaxed' : 'in-family';
      return ` · ${label}: ${cleaned.join(', ')}`;
    })();
    setPlanBasis(`${basis ?? 'Server-generated site plan'}${scoreNote}${clampNote}${parkingNote}${relaxNote}`);
    // A3: value the scheme against local sales — the margin ticks live
    loadMoney(serverMetrics?.totalBuiltSF, serverMetrics?.totalUnits);
    if (opts.persist !== false) {
      refreshCandidates();
      if (resp.candidate_id) {
        void recordPlannerFeedback(resp.context_id ?? plannerCtxRef.current?.context_id, 'candidate_generated', resp.candidate_id, { seed: opts.seed, pins: opts.pins?.length ?? 0 });
      }
    }
    return true;
  }, [contextOgcFid, elements, metrics, setPlanOutput, refreshCandidates, loadMoney, markCompileBlocked]);

  /** Drain the live-drag queue: exactly one solve in flight, latest wins.
   *  Preview solves render silently; the final (release) solve persists the
   *  candidate and shows the generating state. */
  const pumpMfRegen = useCallback(() => {
    if (mfRegenInFlightRef.current) return;
    const pending = pendingMfRegenRef.current;
    if (!pending) return;
    pendingMfRegenRef.current = null;
    mfRegenInFlightRef.current = true;
    if (pending.final) setIsGenerating(true);
    runServerMfPlan({
      seed: mfSeedRef.current,
      pins: pending.pins,
      parentId: activeCandidateId,
      persist: pending.final,
      dropPinIndex: pending.dropPinIndex,
    })
      .catch(() => undefined)
      .finally(() => {
        mfRegenInFlightRef.current = false;
        if (pending.final) setIsGenerating(false);
        pumpMfRegen(); // drain whatever arrived while solving
      });
  }, [runServerMfPlan, activeCandidateId]);

  /** Product switch within the multifamily basis: re-solve the site as
   *  apartments or townhomes. Pins don't carry across products — an
   *  apartment bar is not a townhome row. */
  const handleProductChange = useCallback((next: 'apartments' | 'townhomes') => {
    if (productRef.current === next) return;
    productRef.current = next;
    setProduct(next);
    mfPinsRef.current = [];
    mfSeedRef.current = 1;
    void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'parameter_changed', activeCandidateId, { product: next });
    if (generationBlockedRef.current) return;
    setIsGenerating(true);
    runServerMfPlan({ seed: 1, pins: [], product: next })
      .catch(() => undefined)
      .finally(() => setIsGenerating(false));
  }, [runServerMfPlan, activeCandidateId]);

  const handleGenerate = useCallback(async (iterations?: unknown) => {
    if (!envelopeMeters) return;
    // Generation gate: a blocked use is a REJECTION — neither the server nor
    // the worker may lay it out. The use selector stays live to pick another.
    if (generationBlockedRef.current) {
      setViolations([{
        code: 'context',
        message: 'Generation blocked: the selected use is not permitted as-of-right. Pick a permitted use in the Design Context panel.',
        severity: 'error',
      }]);
      return;
    }
    // Server plans vary by regeneration (a new candidate), not local SA.
    // Pins carry through: your placed buildings survive every variation.
    if (planModeRef.current === 'mf-server') {
      setIsGenerating(true);
      try {
        const ok = await runServerMfPlan({
          seed: mfSeedRef.current + 1,
          pins: mfPinsRef.current,
          parentId: activeCandidateId,
        });
        if (!ok) {
          // Regeneration failure mid-session: the CURRENT plan (a real server
          // plan) stays exactly as it is — name the cause rather than
          // silently doing nothing. No card here: a rendered plan + a loud
          // warning beats blanking the canvas the user is working in.
          setViolations(v => [...v, {
            code: 'server-unreachable',
            message: `${serverFailCauseRef.current ?? 'The massing service did not respond.'} The current plan is unchanged — try again.`,
            severity: 'warning',
          }]);
        }
      } finally {
        setIsGenerating(false);
      }
      return;
    }
    // Guard: button handlers pass the click event — only numbers count.
    const iters = typeof iterations === 'number' ? iterations : 50;
    // USE-BINDING INVARIANT (worker path): never MF-mass a single-family
    // compiled context — that pairing shipped Table-A SF setbacks under
    // apartment massing. Route to the lot generator the context calls for.
    const boundSnapshot = plannerCtxRef.current;
    if (boundSnapshot && boundSnapshot.context.typology === 'single_family') {
      console.error(
        `[use-binding] worker solve: refusing multifamily massing under a 'single_family' compiled context (${boundSnapshot.context_id}); routing to lot fit.`
      );
      setPlanBasis('Single-family context — routing to lot fit (multifamily massing requires a multifamily use).');
      handleGenerateLots().catch(() => undefined);
      return;
    }
    // Order-6 item 5c: with a compiled multifamily context in hand, massing is
    // SERVER-ONLY. A prior server failure no longer drops this branch into the
    // worker's improvised corner plan — Generate retries the server, and a
    // failure shows the error card naming its cause.
    if (boundSnapshot && boundSnapshot.context.typology === 'multifamily') {
      setIsGenerating(true);
      try {
        const ok = await runServerMfPlan({ seed: mfSeedRef.current, pins: mfPinsRef.current });
        if (!ok) {
          setServerPlanError(serverFailCauseRef.current ?? 'The massing service did not respond.');
        }
      } finally {
        setIsGenerating(false);
      }
      return;
    }
    const ctx = ctxSettledRef.current;
    const zoningLabel = ctx && ctx !== 'pending' && ctx.zoningBase ? ctx.zoningBase : null;
    if (!zoningLabel && !plannerCtxRef.current) {
      // No settled context. Enterprise gate: the worker never masses on
      // default assumptions — block (or explain that the compile is still
      // running). With the diagnostics flag, fall through as a DRAFT.
      if (ctxSettledRef.current === 'pending') {
        setViolations(v => [...v, {
          code: 'context-pending',
          message: 'The zoning context is still compiling — massing starts automatically when it settles.',
          severity: 'warning',
        }]);
      } else {
        markCompileBlocked('The zoning context is unavailable for this parcel.');
      }
      return;
    } else {
      markDraft(false);
    }
    planModeRef.current = 'mf';
    setPlanBasis(
      `Multifamily massing (${config.designParameters.buildingTypology})` +
      (zoningLabel ? ` — ${zoningLabel}` : ' — default assumptions') +
      (iters > 0 ? ' · SA-refined' : '')
    );
    // A generate replaces the layout — snapshot it so it's one undo step.
    if (currentBuildingsRef.current.length > 0) pushHistory();
    setIsGenerating(true);
    try {
      const parkingSpec = {
        stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
        stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
        aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
        anglesDeg: [0, 60, 90]
      };

      // The ACTIVE snapshot's brief travels explicitly with the solve — the
      // worker fallback grounds on the same Regrid priors, program prior,
      // and objective weights as the server generator (worker parity).
      const snapshot = plannerCtxRef.current;
      const workerBrief = snapshot ? briefToWorkerBrief(snapshot, frontageRef.current, massingRef.current) : undefined;

      // Use the optimizer for "Generate Plan" — it runs simulated annealing
      const result = await workerManager.optimizeSite(
        envelopeMeters,
        config.zoning,
        config.designParameters,
        parkingSpec,
        iters, // 0 = instant constructive solve; >0 = SA refinement
        workerBrief
      );

      // Rejected candidates (zero-overlap gate) surface in the solves rail —
      // they were never rendered.
      setSolveRejected(result.rejected ?? null);

      // Feed best result into the plan output (already in EPSG:3857 meters)
      setPlanOutput(
        result.bestElements || [],
        result.bestMetrics || null
      );
      setViolations(result.bestViolations || []);
      trackBuildings(result.bestBuildings);
      // Worker lineage: honest about whether the active context was in hand.
      setPlanLineage({
        solvedBy: 'worker',
        contextId: snapshot?.context_id ?? null,
        contextVersion: snapshot?.context_version ?? null,
        contextHash: snapshot?.context_hash ?? null,
        scoreTotal: result.finalScore ?? null,
        workerUsedActiveContext: !!workerBrief,
        // WO-0b receipt: which inputs the worker took from the brief vs the
        // legacy side-channel args — legacy use while a brief exists is a flag.
        flags: result.contract
          ? (result.contract.legacyFieldsUsed.length
              ? [`worker_legacy_inputs_used:${result.contract.legacyFieldsUsed.join('+')}`]
              : ['worker_brief_inputs_v2'])
          : [],
        buildings: result.bestBuildings?.length ?? null,
        floors: result.bestBuildings?.length
          ? Math.max(...result.bestBuildings.map(b => b.floors ?? 1))
          : null,
        footprintSqft: result.bestBuildings?.length
          ? Math.round(result.bestBuildings.reduce((s, b) => s + (b.widthM ?? 0) * (b.depthM ?? 0), 0) * 10.7639)
          : null,
      });
      setPlanStale(false);
      // WO3-1a: the massing rationale is the plan-basis napkin sentence for
      // worker solves — the engine's own words, never a client synthesis.
      if (massingRef.current?.rationale) {
        setPlanBasis(massingRef.current.rationale);
      }

      // Surface the optimizer's best + ranked alternatives in the solve table.
      // (Replaces the deprecated legacy-planner "generateAlternatives" path.)
      const optimizerPlans = [
        { elements: result.bestElements || [], metrics: result.bestMetrics || null },
        ...(result.top3Alternatives || []).map(alt => ({
          elements: alt.elements || [],
          metrics: alt.metrics || null,
        })),
      ];
      const optimizerScores = [
        result.finalScore ?? 0,
        ...(result.top3Alternatives || []).map(alt => alt.score ?? 0),
      ];
      applyAlternatives(optimizerPlans as Parameters<typeof applyAlternatives>[0], optimizerScores);
      // Worker state is already synced with the optimizer's best buildings
      // (the OPTIMIZE handler sets siteState after optimize() returns)
      setSolverReady(true);
    } catch (error) {
      console.error('Failed to run optimizer:', error);
      // Fallback to basic initSite if optimizer fails
      try {
        const fallbackResult = await workerManager.initSite(envelopeMeters, config.zoning, undefined, {
          stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
          stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
          aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
          anglesDeg: [0, 60, 90]
        }, typologyToBuildingType(config.designParameters.buildingTypology),
        plannerCtxRef.current ? briefToWorkerBrief(plannerCtxRef.current, frontageRef.current, massingRef.current) : undefined);
        setPlanOutput(fallbackResult.elements || [], fallbackResult.metrics || null);
        setViolations(fallbackResult.violations || []);
        setSolverReady(true);
      } catch (fallbackErr) {
        setSolverReady(false);
        setViolations([{
          code: 'worker',
          message: `Failed to generate plan: ${String(error)}`,
          severity: 'error'
        }]);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [config, envelopeMeters, setPlanOutput, applyAlternatives, pushHistory, trackBuildings, runServerMfPlan, markDraft, markCompileBlocked]);

  // Live re-solve: a fast, deterministic constructive solve (no annealing) run
  // when the user nudges parameter sliders, so the plan updates without clicking
  // "Generate". Quietly no-ops on failure — it's a preview, not a commit.
  const liveResolve = useCallback(async () => {
    if (!envelopeMeters) return;
    // The generation gate applies to previews too — a blocked use never lays out.
    if (generationBlockedRef.current) return;
    // Static plans (SF lot fit, server-generated site system) aren't
    // massing-resolved — they change by regeneration.
    if (planModeRef.current === 'sf' || planModeRef.current === 'mf-server') return;
    try {
      const parkingSpec = {
        stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
        stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
        aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
        anglesDeg: [0, 60, 90],
      };
      // 0 iterations → constructive solve: target-FAR layout + parking + metrics.
      // The active snapshot's brief is passed explicitly, like every solve.
      const result = await workerManager.optimizeSite(
        envelopeMeters,
        config.zoning,
        config.designParameters,
        parkingSpec,
        0,
        plannerCtxRef.current ? briefToWorkerBrief(plannerCtxRef.current, frontageRef.current, massingRef.current) : undefined
      );
      setPlanOutput(result.bestElements || [], result.bestMetrics || null);
      setViolations(result.bestViolations || []);
      trackBuildings(result.bestBuildings);
      const plans = [
        { elements: result.bestElements || [], metrics: result.bestMetrics || null },
        ...(result.top3Alternatives || []).map(alt => ({
          elements: alt.elements || [],
          metrics: alt.metrics || null,
        })),
      ];
      const scores = [
        result.finalScore ?? 0,
        ...(result.top3Alternatives || []).map(alt => alt.score ?? 0),
      ];
      applyAlternatives(plans as Parameters<typeof applyAlternatives>[0], scores);
    } catch {
      /* live preview failure is non-fatal — the user can still click Generate */
    }
  }, [config, envelopeMeters, setPlanOutput, applyAlternatives, trackBuildings]);

  // ── Dynamic drag re-solve ────────────────────────────────────────────────
  // The Shell streams building updates on EVERY mouse move. We coalesce them
  // latest-wins and keep exactly one solve in flight, so the plan re-packs
  // around the drag at whatever rate the engine can actually deliver — the
  // TestFit "co-creation" feel — without ever queueing a backlog.
  type BuildingUpdate = {
    id: string;
    anchor: { x: number; y: number };
    rotationRad: number;
    widthFt: number;
    depthFt: number;
    floors?: number;
  };
  const updateInFlightRef = useRef(false);
  const pendingUpdateRef = useRef<BuildingUpdate | null>(null);

  const pumpBuildingUpdates = useCallback(() => {
    if (updateInFlightRef.current) return;
    const update = pendingUpdateRef.current;
    if (!update) return;
    pendingUpdateRef.current = null;
    updateInFlightRef.current = true;

    // Canvas coordinates are already in EPSG:3857 meters — pass directly to
    // worker. (The Shell field names say "Ft" but they carry meters.)
    workerManager
      .updateBuilding(update.id, {
        anchorX: update.anchor.x,
        anchorY: update.anchor.y,
        rotationRad: update.rotationRad,
        widthM: update.widthFt,
        depthM: update.depthFt,
        floors: update.floors,
      })
      .then(result => {
        setPlanOutput(result.elements || [], result.metrics || null);
        setViolations(result.violations || []);
        trackBuildings(result.buildings);
      })
      .catch(err => {
        console.error('Building update failed:', err);
        setViolations([{ code: 'worker', message: String(err), severity: 'error' }]);
      })
      .finally(() => {
        updateInFlightRef.current = false;
        pumpBuildingUpdates(); // drain whatever arrived while solving
      });
  }, [setPlanOutput]);

  const handleBuildingUpdate = useCallback(
    (update: BuildingUpdate, options?: { final?: boolean }) => {
      if (!envelopeMeters) return;
      if (planModeRef.current === 'sf') return;
      // DYNAMIC site plans (A2+): every drag event streams the bar's live
      // footprint as a pin. Mid-drag events coalesce (latest-wins) into
      // preview solves — parking streets, courts, and drives re-flow around
      // the bar in your hand at solver speed — and the release commits the
      // real candidate. Same pump pattern as the client engine, pointed at
      // the server generator.
      if (planModeRef.current === 'mf-server') {
        if (!update.id.startsWith('mfgen-bldg-') && !update.id.startsWith('mfgen-pin-')) return;
        const el = elements.find(e => e.id === update.id);
        const fp3857 = buildBuildingFootprint({
          id: update.id,
          anchor: update.anchor,
          widthM: update.widthFt,   // Shell field names are legacy — meters
          depthM: update.depthFt,
          rotationRad: update.rotationRad,
          floors: update.floors ?? 3,
        } as BuildingSpec);
        const newPin: MfPin = {
          geom: feature3857To4326(fp3857),
          floors: Math.max(1, Math.round(update.floors ?? (el?.properties?.floors as number) ?? 3)),
        };
        // One pin slot per gesture: first event claims it (an already-pinned
        // bar reuses its slot), every later event overwrites it. Without the
        // gesture ref, each mousemove would append another pin.
        const pins = [...mfPinsRef.current];
        let pinIndex: number;
        if (dragPinRef.current?.elementId === update.id) {
          pinIndex = dragPinRef.current.pinIndex;
        } else {
          const existing = el?.properties?.pinIndex as number | undefined;
          pinIndex = existing != null && existing >= 0 && existing < pins.length ? existing : pins.length;
          dragPinRef.current = {
            elementId: update.id,
            pinIndex,
            startW: update.widthFt,
            startD: update.depthFt,
            startRot: update.rotationRad,
          };
        }
        if (pinIndex < pins.length) pins[pinIndex] = newPin;
        else pins.push(newPin);

        pendingMfRegenRef.current = {
          pins,
          final: !!options?.final,
          // Mid-drag: the Shell's locally-dragged element IS this pin's bar —
          // drop the server's copy so it doesn't ghost behind the cursor.
          dropPinIndex: options?.final ? null : pinIndex,
        };
        if (options?.final) {
          const start = dragPinRef.current;
          dragPinRef.current = null;
          // Honest event taxonomy: dims changed => resized, rotation changed
          // => rotated, else moved. One event per gesture, at release.
          const resized =
            start?.startW != null &&
            (Math.abs((update.widthFt ?? start.startW) - start.startW) > 0.01 ||
              Math.abs((update.depthFt ?? (start.startD ?? 0)) - (start.startD ?? 0)) > 0.01);
          const rotated =
            !resized &&
            start?.startRot != null &&
            Math.abs((update.rotationRad ?? start.startRot) - start.startRot) > 0.005;
          void recordPlannerFeedback(
            plannerCtxRef.current?.context_id,
            resized ? 'building_resized' : rotated ? 'building_rotated' : 'building_moved',
            activeCandidateId,
            {
              pin_index: pinIndex,
              element_id: update.id,
            }
          );
        }
        pumpMfRegen();
        return;
      }
      // Snapshot once at the START of each gesture (first update after idle)
      // so a whole drag/rotate undoes in one step.
      if (!options?.final && !gestureActiveRef.current) {
        gestureActiveRef.current = true;
        pushHistory();
      }
      if (options?.final) {
        if (!gestureActiveRef.current) pushHistory(); // click-placed (no move phase)
        gestureActiveRef.current = false;
      }
      pendingUpdateRef.current = update; // latest-wins (the final release update is always last)
      pumpBuildingUpdates();
    },
    [envelopeMeters, pumpBuildingUpdates, pushHistory, elements, pumpMfRegen]
  );

  /** Undo/redo restore + real deletes: replay a building set through the worker. */
  const applyBuildingSet = useCallback(async (buildings: BuildingSpec[]) => {
    try {
      const result = await workerManager.setBuildings(buildings);
      setPlanOutput(result.elements || [], result.metrics || null);
      setViolations(result.violations || []);
      trackBuildings(result.buildings ?? buildings);
    } catch (err) {
      console.error('Building-set restore failed:', err);
      setViolations([{ code: 'worker', message: String(err), severity: 'error' }]);
    }
  }, [setPlanOutput, trackBuildings]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(structuredClone(currentBuildingsRef.current));
    setHistoryVersion(v => v + 1);
    void applyBuildingSet(prev);
  }, [applyBuildingSet]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(structuredClone(currentBuildingsRef.current));
    setHistoryVersion(v => v + 1);
    void applyBuildingSet(next);
  }, [applyBuildingSet]);

  const handleDeleteBuildings = useCallback((ids: string[]) => {
    // Server plans: deleting a PINNED bar releases its pin and re-solves the
    // site (delete is an edit); anything else is a local element removal.
    if (planModeRef.current === 'mf-server') {
      const pinIdxs = elements
        .filter(el => ids.includes(el.id) && el.properties?.pinned)
        .map(el => el.properties?.pinIndex as number)
        .filter(i => i != null && i >= 0);
      if (pinIdxs.length > 0) {
        const pins = mfPinsRef.current.filter((_, i) => !pinIdxs.includes(i));
        pendingMfRegenRef.current = { pins, final: true, dropPinIndex: null };
        void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'building_deleted', activeCandidateId, {
          pin_indexes: pinIdxs,
        });
        pumpMfRegen();
        return;
      }
      setPlanOutput(elements.filter(el => !ids.includes(el.id)), metrics);
      return;
    }
    if (planModeRef.current === 'sf') {
      setPlanOutput(elements.filter(el => !ids.includes(el.id)), metrics);
      return;
    }
    const remaining = currentBuildingsRef.current.filter(b => !ids.includes(b.id));
    if (remaining.length === currentBuildingsRef.current.length) return;
    pushHistory();
    void applyBuildingSet(remaining);
  }, [applyBuildingSet, pushHistory, elements, metrics, setPlanOutput, pumpMfRegen]);

  /** Paste: clone buildings through the worker so the copies are real
   *  (solver-tracked, undoable) — a local canvas copy would vanish on the
   *  next re-solve. Clones land slightly offset and position-locked. */
  const handleCloneBuildings = useCallback((ids: string[]) => {
    if (planModeRef.current === 'sf' || planModeRef.current === 'mf-server') return;
    const current = currentBuildingsRef.current;
    const toClone = current.filter(b => ids.includes(b.id));
    if (toClone.length === 0) return;
    pushHistory();
    const stamp = Date.now().toString(36);
    const clones = toClone.map((b, i) => {
      const clone = structuredClone(b);
      clone.id = `${b.id}-copy-${stamp}${i > 0 ? `-${i}` : ''}`;
      clone.anchor = {
        x: b.anchor.x + (b.widthM ?? 20) * 0.25 + 3,
        y: b.anchor.y - (b.depthM ?? 15) * 0.5 - 3,
      };
      clone.locked = { position: true, rotation: true, dimensions: true };
      return clone;
    });
    void applyBuildingSet([...current, ...clones]);
  }, [applyBuildingSet, pushHistory]);

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /**
   * Ground the solver in the context engine's zoning values (once per
   * parcel+use): the FIRST auto-solve then runs on real setbacks/FAR/height
   * instead of hardcoded defaults. Fail-soft: no context → defaults stand.
   */
  /** Ground the solver config in the compiled solver brief (once per snapshot):
   *  hard constraints → zoning, brief parking → stall/aisle/ratio. The client
   *  fallback engine then runs on the SAME values as the server generator. */
  const applyBriefDefaults = useCallback(
    (resp: PlannerContextResponse) => {
      if (appliedContextRef.current === resp.context_hash) return;
      appliedContextRef.current = resp.context_hash;
      const zoningPatch = briefToZoningPatch(resp.solver_brief);
      const parkingPatch = briefToParkingPatch(resp.solver_brief);
      if (Object.keys(zoningPatch).length === 0 && Object.keys(parkingPatch).length === 0) return;
      updateConfig({
        zoning: { ...config.zoning, ...zoningPatch },
        designParameters: {
          ...config.designParameters,
          parking: { ...config.designParameters.parking, ...parkingPatch },
        },
      });
    },
    [config.zoning, config.designParameters, updateConfig]
  );

  /**
   * Zero-overlap gate for every NON-GESTURE render path — the same
   * validatePlanElements matrix the server path runs (circulation×building
   * included: the Davis frame). Gesture flows (drags/undo) stay render-loud
   * by design — a mid-drag overlap is the user's hand, not a generator
   * defect. Returns true when the plan may render; false blocks it LOUD.
   *
   * Honesty note: PR #86 shipped only the call site — this definition was
   * missing, so the lot-fit path carried a latent ReferenceError and no
   * non-server path was actually gated until now. Caught by order-6's tsc
   * sweep; the repo has no typecheck gate (root tsconfig checks no files).
   */
  const gateNonGesturePlan = useCallback((generated: Element[], label: string): boolean => {
    const v = validatePlanElements(generated);
    if (v.ok) return true;
    console.warn(`[${label}] rejected by the geometry gate: ${v.reason}`, v.overlaps.slice(0, 4));
    setViolations(prev => [...prev, {
      code: 'geometry-overlap',
      message: `${label} rejected: ${v.reason}. Nothing was drawn — regenerate for a new variation.`,
      severity: 'error' as const,
    }]);
    setPlanBasis(`Plan rejected: ${v.reason}`);
    return false;
  }, []);

  /**
   * Put one by-right answer on the sheet — the default plan, an override, or a
   * candidate of the pattern competition — through one path. The site layers
   * (the wetlands, the land the flood hold takes out), the per-pad fill and the
   * ground-at-BFE line are fetched together, not one after another, so the
   * plan waits for the slowest of them, not their sum.
   *
   * An answer with nothing to draw — 0 lots (Martingale Dr, 0 Harding Pl) or
   * skipped (1023 Wellmoor Ct, landlocked) — IS the by-right answer: the
   * generated plan is cleared, the page settles (a skip once left the header on
   * "Generating plan…"), the reason stands, and the wetlands and the flood hold
   * stay on the sheet as context (1083 B Lakewalk Dr once titled its 0-lot
   * sheet "CONCEPT LAYOUT PLAN · 0 lots" because the hatch counted as a plan).
   */
  const renderSfV1Answer = useCallback(async (resp: SfV1Response, opt: SfV1Options, shown: string): Promise<void> => {
    if (contextOgcFid == null) return;
    const settleEmpty = (s: SfV1Summary, warnings: string[], context: Element[] = []) => {
      const base0 = elements.filter(el => !isSfPlanElement(el) && !isMfPlanElement(el));
      setPlanOutput([...base0, ...context], {
        totalBuiltSF: 0, siteCoveragePct: 0, achievedFAR: 0, parkingRatio: 0, openSpacePct: 0,
        totalUnits: 0, unitMixSummary: s.status === 'skipped' ? 'skipped' : '0 lots', zoningCompliant: true,
        violations: [] as string[], warnings, optimizationStatus: s.generatorVersion ?? 'sf_v1',
      } as NonNullable<typeof metrics>);
      setSubdivisionSummary(null);
      setSfV1Summary(s);
      setViolations([]);
      setPlanLineage({
        solvedBy: 'server', contextId: null, generatorVersion: s.generatorVersion ?? 'sf_v1',
        flags: [...(s.status === 'skipped' ? ['skipped'] : []), ...(s.basis === 'override' ? ['override'] : [])],
        buildings: 0, floors: null, footprintSqft: null, standardsDirect: true,
      });
      setPlanStale(false);
      setServerPlanError(null);
      setPlanBasis(s.basisLine);
      setLotFitSummary(s.basisLine);
    };
    setSfV1Shown(shown);
    sfV1ShownRef.current = shown;
    if (resp.status === 'skipped' || resp.error) {
      setSfV1HoleOverlap(null);
      setBfeContour(null);
      // Engine g13: the site layers come back even when the plan skips, so the
      // flood hold that is the reason goes on the sheet (0 Hickory Bend Dr:
      // all 5.24 ac in the SFHA; the sheet used to be blank beside "skipped").
      const site = resp.status === 'skipped' ? await fetchSfV1Site(contextOgcFid, opt.flood ?? null) : null;
      setSfV1Site(site);
      const { elements: context, summary: skipped } = sfV1ToElements(resp, {
        holdWkt: site?.holdWkt ?? null,
        nobuildWkt: site?.nobuildWkt ?? null,
        overrideRequested: isOverride(opt),
      });
      settleEmpty(skipped, skipped.reason ? [skipped.reason] : [], context.filter(e => e.type === 'greenspace'));
      return;
    }
    // The earthwork view. The ground-at-BFE line is context wherever the parcel
    // has a BFE (it shows why the flood land is held out); the pads are coloured
    // by their fill only when the plan builds in the flood hazard area. All fail soft.
    const ew = resp.earthwork ?? null;
    const padTarget = ew && earthworkHasFlood(ew) && typeof ew.pad_target_ft === 'number' && typeof resp.pads_wkt === 'string' ? ew.pad_target_ft : null;
    const bfeFt = ew && typeof ew.bfe_ft === 'number' ? ew.bfe_ft : null;
    const [site, padFill, bfeLines] = await Promise.all([
      fetchSfV1Site(contextOgcFid, opt.flood ?? null),
      padTarget != null ? fetchPadFill(contextOgcFid, resp.pads_wkt as string, padTarget) : Promise.resolve(null),
      bfeFt != null ? fetchBfeContour(contextOgcFid, bfeFt) : Promise.resolve(null),
    ]);
    setSfV1Site(site);
    setBfeContour(bfeFt != null && bfeLines ? { bfeFt, lines: bfeLines.map(l => l.coordinates as number[][]) } : null);
    const { elements: drawn, summary: answer } = sfV1ToElements(resp, {
      nobuildWkt: site?.nobuildWkt ?? null,
      holdWkt: site?.holdWkt ?? null,
      overrideRequested: isOverride(opt),
      padFillFt: padFill,
    });
    if (shown !== 'loop') answer.basisLine = `${answer.basisLine} · from the pattern competition`;
    // Lots on land that is not this parcel: its holes (other owners' lots inside it).
    try {
      const geom = parcel?.geometry as Polygon | MultiPolygon | undefined;
      const c0 = geom ? (geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0]?.[0]) : null;
      const is3857 = Math.abs(c0?.[0]?.[0] ?? 0) > 1000 || Math.abs(c0?.[0]?.[1] ?? 0) > 1000;
      const g3857 = geom ? (is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon)) : null;
      const lotPolys = drawn.filter(e => e.id.startsWith('sfv1-lot-')).map(e => e.geometry as Polygon);
      setSfV1HoleOverlap(lotsOnParcelHoles(lotPolys, parcelHoles3857(g3857), (a, b) => polygons(intersection(a, b))));
    } catch {
      setSfV1HoleOverlap(null);
    }
    if (answer.lots === 0 || drawn.length === 0) {
      settleEmpty(answer, answer.notes, drawn.filter(e => e.type === 'greenspace'));
      return;
    }
    if (!gateNonGesturePlan(drawn, 'By-right subdivision')) return;
    const base = elements.filter(el => !isSfPlanElement(el) && !isMfPlanElement(el));
    // KPI strip: lots and land, the server's counts verbatim; the plan's
    // own failed tests and notes are its warnings.
    const answerMetrics = {
      totalBuiltSF: 0, siteCoveragePct: 0, achievedFAR: 0, parkingRatio: 0,
      openSpacePct: answer.openPct ?? 0,
      totalUnits: answer.lots,
      unitMixSummary:
        `${answer.lots} lot${answer.lots === 1 ? '' : 's'}` +
        (answer.lotWFt != null && answer.lotDFt != null ? ` · ${answer.lotWFt}×${answer.lotDFt} ft` : ''),
      zoningCompliant: answer.fails.length === 0,
      violations: [] as string[],
      warnings: [...answer.fails.map(f => `fails ${f}`), ...answer.notes],
      optimizationStatus: answer.generatorVersion ?? 'sf_v1',
    } as NonNullable<typeof metrics>;
    setPlanOutput([...base, ...drawn], answerMetrics);
    setSubdivisionSummary(null);
    setSfV1Summary(answer);
    setViolations([]);
    setPlanLineage({
      solvedBy: 'server',
      contextId: null,
      generatorVersion: answer.generatorVersion ?? 'sf_v1',
      flags: [...answer.fails, ...(answer.basis === 'override' ? ['override'] : [])],
      buildings: drawn.filter(e => e.type === 'building').length,
      floors: null,
      footprintSqft: null,
      // the generator reads the district standards itself (jurisdiction_zoning_standards, planning_principle)
      standardsDirect: true,
    });
    setPlanStale(false);
    setServerPlanError(null);
    setPlanBasis(answer.basisLine);
    setLotFitSummary(answer.basisLine);
  }, [contextOgcFid, elements, setPlanOutput, gateNonGesturePlan, parcel?.geometry]);
  renderSfV1Ref.current = renderSfV1Answer;
  elementsRef.current = elements;
  metricsRef.current = metrics;

  /** The pattern competition for the parcel and the option set (cached per
   *  parcel in the client). A newer ask — a new parcel, a new override —
   *  supersedes an older one still in flight. */
  const runCompetition = useCallback((fid: number, opt: SfV1Options) => {
    const seq = ++competitionSeqRef.current;
    setSfV1AutoBest(null);
    sfV1CandidatesRef.current = null;
    setSfV1Competition({ state: 'loading', data: null, error: null });
    void fetchSfV1Candidates(fid, opt).then(r => {
      if (seq !== competitionSeqRef.current) return;
      if (r.error || !r.data) {
        setSfV1Competition({ state: 'error', data: null, error: competitionErrorText(r.error ?? 'the engine returned nothing') });
        return;
      }
      sfV1CandidatesRef.current = r.data;
      setSfV1Competition({ state: 'done', data: summarizeCandidates(r.data), error: null });
      // 2026-11-04 (1019 Hitt Ln: 0 lots by the default grammar, 19 by the
      // grid; five of ten parcels like it): when the default answer draws no
      // lots and the competition's best draws a subdivision, the best goes on
      // the sheet — still by right, a pattern choice — and the panel says why.
      // A one-lot "best" is the lot of record, not a subdivision; a plan the
      // user already chose (a house, another row) is left alone.
      // Third audit: only a plan the engine calls buildable (best_buildable,
      // no code fails) goes on the sheet unasked; a best that fails a code
      // test stays in the competition with the engine's verdict beside it.
      // Engine g13 (0 Union Hill Rd: the loop's 3 lots on 699 ft of street,
      // the neighborhood's 3 on 384 ft): the best also takes the sheet when
      // it draws at least the default's lots and is buildable, or the same
      // lots; the default stays only when it draws strictly more.
      const auto = chooseAutoBest(r.data, sfV1DefaultRespRef.current);
      const seedDrawn = elementsRef.current.some(e => e.id.startsWith('sfseed-'));
      let sheetLots = sfV1DefaultRespRef.current?.lots ?? 0;
      if (auto && r.data.best && sfV1ShownRef.current === 'loop' && !seedDrawn && renderSfV1Ref.current) {
        setSfV1AutoBest(auto);
        void renderSfV1Ref.current(r.data.best, opt, auto.requested);
        sheetLots = Math.max(sheetLots, r.data.best.lots ?? 0);
      }
      // under the fill scenario every run is the heavy one, so the search waits to be asked (as the comparison does)
      if (!opt.flood) void runDeepSearch(fid, opt, seq, sheetLots);
    });
  }, []);

  /** The deep search: after the comparison, the engine keeps trying layouts
   *  (its patterns, street layouts adapted from built subdivisions, varied
   *  settings) a few seconds per call. A plan with more lots and no code
   *  failure replaces the one on the sheet, unless the user has since chosen
   *  a plan themselves. A newer ask (competitionSeqRef) ends the loop. */
  const runDeepSearch = async (fid: number, opt: SfV1Options, seq: number, sheetLots0: number): Promise<void> => {
    const live = () => seq === competitionSeqRef.current;
    const shownAtStart = sfV1ShownRef.current;
    let sheetLots = sheetLots0;
    let searchId: string | null = null;
    let onSheet = false;
    let precedentFrom: string | null = null;
    let failures = 0;
    let skipNext = false;
    let last: SfV1DeepProgress = { done: false, triesDone: 0, triesTotal: 0, baselineLots: null, bestLots: null, onSheet: false, precedentFrom: null, stopped: false };
    setSfV1Deep(last);
    // the reply carries tries_total; the cap only stops a loop that makes no progress
    for (let call = 0; call < 200; call += 1) {
      const first = searchId == null;
      const res = await fetchSfV1DeepSearch(fid, first ? deepSearchOpt(opt) : (skipNext ? { skip_try: 'true' } : {}), searchId);
      if (!live()) return;
      skipNext = false;
      const d = res.data;
      if (!d || d.error) {
        failures += 1;
        if (first || failures >= 3) { last = { ...last, stopped: true }; setSfV1Deep(last); return; }
        skipNext = res.timedOut;
        continue;
      }
      failures = 0;
      searchId = d.search_id ?? searchId;
      const userChose = sfV1ShownRef.current !== shownAtStart && sfV1ShownRef.current !== 'deep search';
      const seedDrawn = elementsRef.current.some(e => e.id.startsWith('sfseed-'));
      if (d.plan && (d.best_try ?? 0) > 0 && (d.best_lots ?? 0) > sheetLots && !userChose && !seedDrawn && renderSfV1Ref.current) {
        await renderSfV1Ref.current(d.plan, opt, 'deep search');
        if (!live()) return;
        sheetLots = d.best_lots ?? sheetLots;
        onSheet = true;
        precedentFrom = deepWinnerPrecedent(d);
      }
      last = {
        done: !!d.done, triesDone: d.tries_done ?? last.triesDone, triesTotal: d.tries_total ?? last.triesTotal,
        baselineLots: sheetLots0, bestLots: onSheet ? sheetLots : (d.best_lots ?? null), onSheet, precedentFrom, stopped: false,
      };
      setSfV1Deep(last);
      if (d.done) return;
      if (!searchId) { last = { ...last, stopped: true }; setSfV1Deep(last); return; }
    }
    setSfV1Deep({ ...last, stopped: true });
  };

  /**
   * Brief Phase 2: market-grounded SF lot fit, appended to the plan.
   *
   * 2026-09-03: on a subdivision-pattern parcel (the plan-organization layer
   * says `subdivision_*`) the NEIGHBOURHOOD generator draws the civil's
   * organization instead — streets first, rear alleys, whole lots on every
   * street face, courts, an amenity on request — never strips sliced across
   * the parcel. The pattern lookup is cached, so this costs no extra RPC.
   */
  const handleGenerateLots = useCallback(async () => {
    planModeRef.current = 'sf';
    if (contextOgcFid == null) {
      setLotFitSummary('Lot fit needs a numeric parcel id.');
      return;
    }
    setIsGeneratingLots(true);
    try {
      const pattern = await fetchPlanPattern(contextOgcFid).catch(() => null);
      // 2026-10-27, the owner's routing rule: BY RIGHT by default, from the
      // base district. R / RS → fn_sf_v1_plan draws the subdivision the
      // district's own standards allow; an override (a lot module, the
      // floodway-only fill scenario) is a second, flagged answer. A skip is
      // shown with its reason, never papered over; only an unreachable
      // service falls through to the legacy generators, and the strip says so.
      const zoningBase =
        (pattern?.selection_basis?.zoning_base as string | undefined)
        ?? (typeof parcel.zoning === 'string' ? parcel.zoning : undefined)
        ?? null;
      if (sfV1Route(zoningBase) === 'sf_v1') {
        const opt = sfV1OverrideRef.current;
        const resp = await fetchSfV1Plan(contextOgcFid, opt);
        if (resp) {
          sfV1DefaultRespRef.current = resp;
          await renderSfV1Answer(resp, opt, 'loop');
          // The pattern competition runs after the plan is on the sheet, never
          // in front of it (three plan runs, 3–20 s). Under the fill scenario
          // each run is the heavy one, so it waits to be asked.
          if (resp.status === 'skipped' || resp.error) {
            competitionSeqRef.current += 1;
            sfV1CandidatesRef.current = null;
            setSfV1Competition(null);
          } else if (opt.flood) {
            competitionSeqRef.current += 1;
            sfV1CandidatesRef.current = null;
            setSfV1Competition({ state: 'idle', data: null, error: null });
          } else {
            runCompetition(contextOgcFid, opt);
          }
          return;
        }
        setSfV1Summary(null);
        setSfV1Competition(null);
        setBfeContour(null);
        setLotFitSummary('By-right generator (fn_sf_v1_plan) not reachable — drawing with the legacy generator.');
      } else {
        setSfV1Summary(null);
        setBfeContour(null);
      }
      if (pattern?.pattern?.startsWith('subdivision')) {
        const sub = await generateSubdivision(contextOgcFid, subdivisionParamsRef.current);
        if (!sub) {
          setLotFitSummary('Subdivision generator unavailable — backend RPC not reachable.');
          return;
        }
        if (sub.error) {
          setSubdivisionSummary(null);
          setLotFitSummary(`Subdivision generator refused: ${sub.error.replace(/_/g, ' ')}.`);
          return;
        }
        const { elements: drawn, summary: subSummary } = subdivisionToElements(sub);
        if (drawn.length === 0) {
          setLotFitSummary('Subdivision generator returned no drawable streets or lots for this parcel.');
          return;
        }
        if (!gateNonGesturePlan(drawn, 'Subdivision plan')) return;
        const base = elements.filter(el => !isSfPlanElement(el) && !isMfPlanElement(el));
        // KPI strip: a subdivision's numbers are lots and land, not GSF and
        // stalls — the server's counts travel verbatim; nothing is re-measured.
        const subMetrics = {
          totalBuiltSF: 0, siteCoveragePct: 0, achievedFAR: 0, parkingRatio: 0,
          openSpacePct: subSummary.pctOpen ?? 0,
          totalUnits: subSummary.lots,
          unitMixSummary:
            `${subSummary.lots} lots` +
            (subSummary.lotWidthFt != null && subSummary.lotDepthFt != null ? ` · ${subSummary.lotWidthFt}×${subSummary.lotDepthFt} ft` : ''),
          zoningCompliant: (subSummary.buildableDepthFt ?? 0) > 0,
          violations: [] as string[],
          warnings: subSummary.flags,
          optimizationStatus: sub.generator_version ?? 'subdivision_v1',
        } as NonNullable<typeof metrics>;
        setPlanOutput([...base, ...drawn], subMetrics);
        setSubdivisionSummary(subSummary);
        setViolations([]);
        setPlanLineage({
          solvedBy: 'server',
          contextId: null,
          generatorVersion: sub.generator_version ?? 'subdivision_v1',
          flags: subSummary.flags,
          buildings: 0,
          floors: null,
          footprintSqft: null,
          // The generator reads the district standards straight from the
          // ordinance resolver (fn_resolve_design_context), not the compiled
          // planner brief — say so instead of "not verified".
          standardsDirect: true,
        });
        setPlanStale(false);
        setServerPlanError(null);
        setPlanBasis(subSummary.basis || subdivisionSummaryLine(subSummary));
        setLotFitSummary(subdivisionSummaryLine(subSummary));
        return;
      }
      setSubdivisionSummary(null);
      const resp = await generateSfSitePlan(contextOgcFid);
      if (!resp) {
        setLotFitSummary('Lot generator unavailable — backend RPC not reachable.');
        return;
      }
      const { elements: generated, summary } = sfPlanToElements(resp);
      if (generated.length === 0) {
        setLotFitSummary('Generator returned no drawable lots for this parcel.');
        return;
      }
      if (!gateNonGesturePlan(generated, 'Lot plan')) return;
      // Additive per the brief — but idempotent: a re-generate REPLACES the
      // previous lot fit (matching id prefixes) instead of stacking a second
      // subdivision on top of the first.
      // A generated plan replaces the generated plan — of EITHER family.
      // (SF pads once stacked on top of MF bars: Elements 43.)
      const base = elements.filter(el => !isSfPlanElement(el) && !isMfPlanElement(el));
      // The legacy generator's answer is provisional: it ran because the
      // by-right generator was unreachable, and no code test ran on its lots.
      // Its metrics say lots, not GSF, and never "compliant" (the scope's P0.3).
      const legacyMetrics = {
        totalBuiltSF: 0, siteCoveragePct: 0, achievedFAR: 0, parkingRatio: 0, openSpacePct: 0,
        totalUnits: summary.lots,
        unitMixSummary: `${summary.lots} lots · legacy lot generator · provisional`,
        zoningCompliant: false,
        violations: [] as string[],
        warnings: summary.flags,
        optimizationStatus: 'legacy_lot_fit_provisional',
      } as NonNullable<typeof metrics>;
      planModeRef.current = 'sf';
      setPlanOutput([...base, ...generated], legacyMetrics);
      setPlanBasis(`Legacy lot generator · ${summary.lots} lots · provisional: drawn while the by-right generator was unreachable, no code tests ran`);
      const flagsNote = summary.flags.length > 0 ? ` · ⚠ ${summary.flags.join(', ')}` : '';
      setLotFitSummary(
        `${summary.lots} lots · lot target ${summary.targetLotSqft?.toLocaleString() ?? '—'} SF, ` +
        `footprint ${summary.targetFootprintSqft?.toLocaleString() ?? '—'} SF ` +
        `(${summary.targetSource ?? 'n/a'}) · confidence ${summary.confidence ?? 'n/a'}${flagsNote}`
      );
    } finally {
      setIsGeneratingLots(false);
    }
  }, [contextOgcFid, elements, metrics, setPlanOutput, gateNonGesturePlan, parcel.zoning, renderSfV1Answer, runCompetition]);

  /** Scheme switch on the neighbourhood panel: re-draws with the scheme's
   *  parameters (district lots / SP 25-ft townhomes / SP + amenity 10%). */
  const handleSubdivisionScheme = useCallback((scheme: SubdivisionScheme) => {
    setSubdivisionScheme(scheme);
    subdivisionParamsRef.current = schemeParams(scheme);
    handleGenerateLots().catch(() => undefined);
  }, [handleGenerateLots]);

  /** The override control on the by-right panel (2026-10-27): a lot module or
   *  the floodway-only fill scenario re-runs fn_sf_v1_plan, and the answer
   *  comes back labelled an override. An empty option set is by right again. */
  const handleSfV1Override = useCallback((opt: SfV1Options) => {
    sfV1OverrideRef.current = opt;
    setSfV1Override(opt);
    handleGenerateLots().catch(() => undefined);
  }, [handleGenerateLots]);

  /** "View this plan" on a row of the pattern competition: `best` and
   *  `structured` arrive whole with the competition; the default is the plan
   *  already drawn; any other row is drawn on request (opt.pattern — still by
   *  right, the engine's own standards). The override the user set carries. */
  const handleViewSfV1Candidate = useCallback(async (requested: string) => {
    if (contextOgcFid == null) return;
    setSfV1AutoBest(null);
    const opt = withoutPattern(sfV1OverrideRef.current);
    const raw = sfV1CandidatesRef.current;
    let resp: SfV1Response | null = null;
    if (requested === 'loop' && sfV1DefaultRespRef.current) resp = sfV1DefaultRespRef.current;
    else if (raw?.best && bestRequestedOf(raw) === requested) resp = raw.best;
    else if (raw?.structured && requested === 'neighborhood') resp = raw.structured;
    setIsGeneratingLots(true);
    try {
      // the competition's own option set for the grammar (the drive carries its section)
      if (!resp) resp = await fetchSfV1Plan(contextOgcFid, candidateOpt(requested, opt));
      if (!resp) {
        setViolations(v => [...v, {
          code: 'sfv1-candidate',
          message: `Could not draw that plan: the by-right service did not respond. The plan on the sheet is unchanged.`,
          severity: 'warning',
        }]);
        return;
      }
      planModeRef.current = 'sf';
      await renderSfV1Answer(resp, opt, requested);
    } finally {
      setIsGeneratingLots(false);
    }
  }, [contextOgcFid, renderSfV1Answer]);

  /** Run (or re-run) the competition for the options on the panel. */
  const handleRunCompetition = useCallback(() => {
    if (contextOgcFid == null) return;
    runCompetition(contextOgcFid, withoutPattern(sfV1OverrideRef.current));
  }, [contextOgcFid, runCompetition]);

  /**
   * The townhome engine's plan on the sheet (th_v3): the neighborhood layout
   * on multifamily land when its best plan is the townhome candidate. The
   * candidate itself carries metrics only; this is its full_plan_call. False
   * when nothing was drawn: the reason goes to the layout panel and the plan
   * on the sheet stays.
   */
  const renderThV3Plan = useCallback(async (): Promise<boolean> => {
    if (contextOgcFid == null) return false;
    const r = await fetchThV3Plan(contextOgcFid);
    if (r.error || !r.data) {
      setThV3Error(r.error ?? 'the townhome engine did not answer');
      return false;
    }
    const { elements: drawn, summary } = thV3ToElements(r.data);
    if (summary.status !== 'done' || summary.homes === 0 || drawn.length === 0) {
      setThV3Error(summary.status === 'searching' ? 'its search has not finished yet — try again' : summary.reason ?? 'it placed no homes');
      return false;
    }
    if (!gateNonGesturePlan(drawn, 'Townhome plan')) {
      setThV3Error('its drawing failed the overlap check');
      return false;
    }
    const base = elementsRef.current.filter(el => !isSfPlanElement(el) && !isMfPlanElement(el));
    // KPI strip: homes and land, the engine's counts verbatim; its failed
    // required tests are the warnings. No GSF: the engine plans footprints.
    const thMetrics = {
      totalBuiltSF: 0, siteCoveragePct: 0, achievedFAR: 0, parkingRatio: 0,
      openSpacePct: summary.usableOpenPct ?? 0,
      totalUnits: summary.homes,
      unitMixSummary: `${summary.homes} townhomes${summary.unitWFt != null && summary.unitDFt != null ? ` · ${summary.unitWFt}×${summary.unitDFt} ft` : ''}`,
      zoningCompliant: summary.requiredFails.length === 0,
      violations: [] as string[],
      warnings: [...summary.requiredFails.map(f => `fails ${f}`), ...summary.notes],
      optimizationStatus: summary.generatorVersion,
    } as NonNullable<typeof metrics>;
    planModeRef.current = 'sf';
    setPlanOutput([...base, ...drawn], thMetrics);
    setThV3Error(null);
    setThV3Summary(summary);
    setSfV1Summary(null);
    setSfV1HoleOverlap(null);
    setBfeContour(null);
    setSubdivisionSummary(null);
    setViolations([]);
    setPlanLineage({
      solvedBy: 'server',
      contextId: null,
      generatorVersion: summary.generatorVersion,
      flags: summary.requiredFails,
      buildings: summary.homes,
      floors: null,
      footprintSqft: null,
      // the engine reads the attached-home standards itself (fn_attached_home_rules)
      standardsDirect: true,
    });
    setPlanStale(false);
    setServerPlanError(null);
    setPlanBasis(summary.basisLine);
    sfV1ShownRef.current = 'townhome';
    setSfV1Shown('townhome');
    return true;
  }, [contextOgcFid, gateNonGesturePlan, setPlanOutput]);

  /** One neighborhood plan of the competition on the sheet: the townhome
   *  engine's, or a street pattern's house lots (still by right). */
  const drawNeighborhood = useCallback(async (requested: string): Promise<boolean> => {
    if (requested === 'townhome') {
      setIsGeneratingLots(true);
      try {
        return await renderThV3Plan();
      } finally {
        setIsGeneratingLots(false);
      }
    }
    setThV3Summary(null);
    await handleViewSfV1Candidate(requested);
    return true;
  }, [renderThV3Plan, handleViewSfV1Candidate]);

  /**
   * The competition on multifamily land, after the multifamily plan is on the
   * sheet (never in front of it). When it settles, the neighborhood goes on
   * the sheet by itself only if it places more homes, the engine calls it
   * buildable, the sheet can draw it, and the user has not picked a layout.
   */
  const runLayoutCompetition = useCallback((fid: number) => {
    const seq = ++competitionSeqRef.current;
    layoutCompetitionRanRef.current = true;
    sfV1CandidatesRef.current = null;
    setSfV1Competition({ state: 'loading', data: null, error: null });
    // Engine g13: the townhome search gets ~8 s inside the competition (its own
    // default is 15 s), so the whole competition stays under the anon role's 20 s cold.
    void fetchSfV1Candidates(fid, { th_budget_ms: RM_COMPETITION_TH_BUDGET_MS }).then(r => {
      if (seq !== competitionSeqRef.current) return;
      if (r.error || !r.data) {
        setSfV1Competition({ state: 'error', data: null, error: competitionErrorText(r.error ?? 'the engine returned nothing') });
        return;
      }
      sfV1CandidatesRef.current = r.data;
      const comp = summarizeCandidates(r.data);
      setSfV1Competition({ state: 'done', data: comp, error: null });
      // 0 Todd Preis Dr (2026-11-09): the competition skipped because the flood
      // hazard area leaves no buildable piece, while the multifamily engine,
      // which does not hold it out yet, drew 94 apartments on it. The hold goes
      // on the sheet beside that plan so the sheet shows what the plan stands in.
      if (comp.status === 'skipped' && isFloodSkip(comp.reason)) {
        void fetchSfV1Site(fid, null).then(site => {
          if (seq !== competitionSeqRef.current || !site?.holdWkt) return;
          const { elements: context } = sfV1ToElements(
            { status: 'skipped', reason: comp.reason, ogc_fid: fid } as SfV1Response,
            { holdWkt: site.holdWkt, nobuildWkt: site.nobuildWkt ?? null },
          );
          const holds = context.filter(e => e.type === 'greenspace');
          if (holds.length === 0) return;
          setSfV1Site(site);
          setPlanOutput([...elementsRef.current.filter(e => !e.id.startsWith('sfv1-hold-')), ...holds], metricsRef.current);
        }).catch(() => undefined);
      }
      const mf = mfLayoutHomesRef.current;
      const choice = chooseLayout({ multifamilyHomes: mf?.homes ?? null, multifamilyProduct: mf?.product ?? 'apartments', multifamilyFailed: mf?.failed ?? true, competition: comp });
      const neighborhoodOnSheet = elementsRef.current.some(e => isSfPlanElement(e));
      if (choice.defaultKind === 'neighborhood' && choice.neighborhood && !layoutUserChoseRef.current && !neighborhoodOnSheet) {
        setLayoutAuto(true);
        // the newest draw (the sheet it lands on has moved on since the ask)
        void drawNeighborhoodRef.current?.(choice.neighborhood.requested);
      }
    });
  }, []);
  drawNeighborhoodRef.current = drawNeighborhood;
  runLayoutCompetitionRef.current = runLayoutCompetition;

  /**
   * The layout switch. The neighborhood draws the competition's best plan
   * (the rows below it draw the others); multifamily re-draws the massing
   * plan from its own seed and pins (deterministic, not persisted again).
   * Either is the user's choice from here on: nothing switches by itself.
   */
  const handleLayoutChoose = useCallback((kind: LayoutKind) => {
    layoutUserChoseRef.current = true;
    setLayoutAuto(false);
    const onSheet = elementsRef.current.some(e => isMfPlanElement(e)) ? 'multifamily'
      : elementsRef.current.some(e => isSfPlanElement(e)) ? 'neighborhood' : null;
    if (kind === onSheet) return;
    if (kind === 'neighborhood') {
      const nb = layoutChoiceRef.current?.neighborhood;
      if (!nb || !nb.drawable) return;
      void drawNeighborhood(nb.requested);
      return;
    }
    if (generationBlockedRef.current) return;
    setIsGenerating(true);
    runServerMfPlan({ seed: mfSeedRef.current, pins: mfPinsRef.current, persist: false, product: mfLayoutHomesRef.current?.product ?? productRef.current })
      .then(ok => {
        if (!ok && !generationBlockedRef.current && !compileBlockedRef.current) {
          setServerPlanError(serverFailCauseRef.current ?? 'The massing service did not respond.');
        }
      })
      .catch(() => undefined)
      .finally(() => setIsGenerating(false));
  }, [drawNeighborhood, runServerMfPlan]);

  /** A row of the neighborhood plans: the user's pick of layout and plan. */
  const handleViewNeighborhood = useCallback((requested: string) => {
    layoutUserChoseRef.current = true;
    setLayoutAuto(false);
    void drawNeighborhood(requested);
  }, [drawNeighborhood]);

  /**
   * Order-6 item 1: the RefusalCard's pre-verified typology switch. Where MF
   * refuses but the server says a house fits (`suggested_typology`), one tap
   * draws the single-family seed — house + driveway, engine EPSG:2274 truth
   * through the same family mapper as the MF seed. A refused seed shows its
   * verdict; a dead spinner is never the answer.
   */
  const handleDrawSfSeed = useCallback(async () => {
    if (contextOgcFid == null) return;
    setIsGenerating(true);
    try {
      const seed = await fetchSfSeed(contextOgcFid);
      if (!seed || seed.error || !seed.buildings?.length) {
        const why = seed?.error === 'sf_unbuildable'
          ? `the single-family check refused — ${(seed.buildability as { reason?: string } | null)?.reason ?? 'unbuildable'}`
          : 'the seed service did not respond';
        setSfSeedError(`${why}.`);
        setViolations(v => [...v, {
          code: 'sf-seed',
          message: `Could not draw the house: ${why}.`,
          severity: 'warning',
        }]);
        return;
      }
      const mapped = seedFamilyPlanToElements(seed, { idPrefix: 'sfseed', house: true });
      if (mapped.elements.length === 0) {
        // 1023 Wellmoor Ct (2026-11-03), 1083 B Lakewalk Dr (2026-11-04): the
        // seed answered "1 house" with no house geometry and no size — a click
        // that drew nothing must say so, in the panel where it was clicked.
        setSfSeedError('it returned a house with no footprint for this parcel.');
        setViolations(v => [...v, {
          code: 'sf-seed',
          message: 'Could not draw the house: the single-family seed returned a house with no footprint for this parcel.',
          severity: 'warning',
        }]);
        return;
      }
      if (!gateNonGesturePlan(mapped.elements, 'SF seed')) return;
      setSfSeedError(null);
      planModeRef.current = 'sf';
      const base = elements.filter(el => !isMfPlanElement(el) && !isSfPlanElement(el));
      // The house after a landlocked or flood skip stands on an assumption the
      // sheet has not verified: Conditional on the badge, the basis line and
      // the handoff (1289 Currey Rd, 2026-11-09: "Code compliant" on a house
      // that assumes an easement across a neighbour).
      const skipReason = sfV1Summary?.status === 'skipped' ? (sfV1Summary.reason ?? '') : '';
      const conditional = /landlocked/i.test(skipReason)
        ? 'assumes an access easement across a neighbour (no mapped street contact)'
        : /flood/i.test(skipReason)
          ? 'stands in the flood hazard area: fill to the base flood elevation and a floodplain permit'
          : null;
      const houseMetrics = mapped.metrics
        ? ({ ...mapped.metrics, conditional } as NonNullable<typeof metrics>)
        : metrics
          ? ({ ...metrics, conditional } as NonNullable<typeof metrics>)
          : metrics;
      setPlanOutput([...base, ...mapped.elements], houseMetrics);
      setViolations([]);
      setPlanLineage({
        solvedBy: 'server',
        contextId: null,
        generatorVersion: seed.generator_version ?? 'sf_seed_v1',
        flags: mapped.flags,
        buildings: seed.buildings.length,
        floors: typeof seed.metrics?.stories === 'number' ? seed.metrics.stories : null,
        footprintSqft: seed.buildings.reduce(
          (s, b) => s + (typeof b.footprint_sqft === 'number' ? b.footprint_sqft : 0), 0
        ) || null,
      });
      setPlanStale(false);
      setServerPlanError(null);
      setPlanBasis(`${mapped.basis ?? 'Single-family seed — house + driveway'}${conditional ? ` · conditional: ${conditional}` : ''}`);
      void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'parameter_changed', null, { action: 'sf_seed_drawn' });
    } finally {
      setIsGenerating(false);
    }
  }, [contextOgcFid, elements, metrics, setPlanOutput, gateNonGesturePlan, sfV1Summary]);

  const handleAddBuilding = useCallback(async () => {
    if (!envelopeMeters) {
      setViolations([{
        code: 'envelope',
        message: 'Buildable envelope not available. Please wait for envelope to load.',
        severity: 'error'
      }]);
      return;
    }
    // Server plans: a manual add is an edit — pin a new bar at a legal open
    // slot and regenerate. The generator keeps pins verbatim and re-flows
    // drives/parking/courts around them.
    if (planModeRef.current === 'mf-server') {
      const avoid = elements
        .filter(el => el.type === 'building')
        .map(el => el.geometry as Polygon);
      const slot = placeBarsAlongEdges(envelopeMeters, {
        widthM: feetToMeters(100),
        depthM: feetToMeters(60),
        count: 1,
        avoidFootprints: avoid,
      })[0];
      if (!slot) {
        setViolations([{
          code: 'plan-mode',
          message: 'No open slot for another building — move or delete a bar first, or Generate a new variation.',
          severity: 'warning'
        }]);
        return;
      }
      const newPin: MfPin = {
        geom: feature3857To4326(buildBuildingFootprint(slot)),
        floors: 3,
      };
      pendingMfRegenRef.current = {
        pins: [...mfPinsRef.current, newPin],
        final: true,
        dropPinIndex: null,
      };
      void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'building_moved', activeCandidateId, {
        action: 'building_added',
      });
      pumpMfRegen();
      return;
    }

    // If solver not ready, initialize it first
    if (!solverReady) {
      try {
        const parkingSpec = {
          stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
          stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
          aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
          anglesDeg: [0, 60, 90] as number[]
        };
        const init = await workerManager.initSite(
          envelopeMeters, config.zoning, undefined, parkingSpec, undefined,
          plannerCtxRef.current ? briefToWorkerBrief(plannerCtxRef.current, frontageRef.current, massingRef.current) : undefined
        );
        setPlanOutput(init.elements || [], init.metrics || null);
        trackBuildings(init.buildings);
        setViolations(init.violations || []);
        setSolverReady(true);
      } catch (error) {
        console.error('Failed to initialize solver:', error);
        setViolations([{
          code: 'worker',
          message: `Failed to initialize solver: ${String(error)}`,
          severity: 'error'
        }]);
        setSolverReady(false);
        return;
      }
    }
    
    // Default dimensions in meters (convert from design defaults in feet)
    const defaultWidthM = feetToMeters(100);
    const defaultDepthM = feetToMeters(50);
    const defaultFloors = 3;

    // Place the new building at a LEGAL spot: flush along an open envelope
    // edge, avoiding existing buildings. The old envelope-centroid anchor sat
    // near/over the boundary on irregular parcels — and since user-added
    // buildings are pinned, the engine faithfully kept the bad spot.
    const existingFootprints = currentBuildingsRef.current.map(b => buildBuildingFootprint(b));
    const slot = placeBarsAlongEdges(envelopeMeters, {
      widthM: defaultWidthM,
      depthM: defaultDepthM,
      count: 1,
      avoidFootprints: existingFootprints,
    })[0];
    const centroid = calculatePolygonCentroid(envelopeMeters.coordinates[0]);
    const anchor = slot ? slot.anchor : { x: centroid[0], y: centroid[1] };
    const rotationRad = slot ? slot.rotationRad : 0;

    // Find next available building ID
    const existingIds = elements.filter(e => e.type === 'building').map(e => e.id);
    let buildingNum = 1;
    while (existingIds.includes(`building-${buildingNum}`)) {
      buildingNum++;
    }
    const newId = `building-${buildingNum}`;

    // handleBuildingUpdate now passes values directly to worker (already in meters)
    handleBuildingUpdate({
      id: newId,
      anchor,
      rotationRad,
      widthFt: defaultWidthM,   // actually meters — Shell field name is legacy
      depthFt: defaultDepthM,   // actually meters — Shell field name is legacy
      floors: defaultFloors
    }, { final: true });
  }, [envelopeMeters, elements, handleBuildingUpdate, solverReady, config, setPlanOutput, pumpMfRegen, activeCandidateId]);

  const derivedInvestmentAnalysis = useMemo<InvestmentAnalysis | null>(() => {
    if (!metrics) return null;
    const gfa = metrics.totalBuiltSF || 0;
    if (gfa <= 0) return null;

    // Single source of truth for underwriting — the same engine the optimizer
    // scores with. When the plan metrics carry a (depth-aware) unit count, build
    // the mix from that exact count so the pro forma's revenue line agrees with
    // the "Units" figure on screen; otherwise fall back to the GFA heuristic.
    const siteAreaSqft = envelopeMeters ? correctedAreaM2(envelopeMeters) * 10.7639 : 0;
    const unitMix = metrics.totalUnits && metrics.totalUnits > 0
      ? generateUnitMixForCount(metrics.totalUnits)
      : generateDefaultUnitMix(gfa);
    const pf = computeProForma({
      totalGFASqft: gfa,
      siteAreaSqft,
      unitMix,
      surfaceStalls: metrics.stallsProvided ?? 0,
      structuredStalls: 0,
      landCost: parcel.parval ?? 0,
    });

    return {
      grossPotentialRent: pf.grossPotentialRent,
      vacancyLoss: pf.vacancyLoss,
      effectiveGrossIncome: pf.effectiveGrossIncome,
      operatingExpenses: pf.operatingExpenses,
      netOperatingIncome: pf.netOperatingIncome,
      totalDevelopmentCost: pf.totalDevelopmentCost,
      totalHardCosts: pf.totalHardCosts,
      softCosts: pf.softCosts,
      contingency: pf.contingency,
      financingCosts: pf.financingCosts,
      landCost: pf.landCost,
      yieldOnCost: pf.yieldOnCost,
      stabilizedValue: pf.stabilizedValue,
      profit: pf.profit,
      equityMultiple: pf.equityMultiple,
      cashOnCash: pf.cashOnCash,
      costPerUnit: pf.costPerUnit,
      costPerSF: pf.costPerSF,
      // Legacy aliases (kept for backward compat with older panels)
      totalInvestment: pf.totalDevelopmentCost,
      projectedRevenue: pf.grossPotentialRent,
      capRate: 0.055,
      // NOTE: a true IRR needs time-phased cash flows (a later phase). Until then
      // expose 0 rather than mislabeling unlevered yield-on-cost as IRR.
      irr: 0,
      paybackPeriod: pf.netOperatingIncome > 0 ? pf.totalDevelopmentCost / pf.netOperatingIncome : 0,
      riskAssessment: pf.yieldOnCost > 0.07 ? 'low' : pf.yieldOnCost > 0.05 ? 'medium' : 'high',
    };
  }, [metrics, envelopeMeters, parcel.parval]);

  useEffect(() => {
    setInvestmentAnalysis(derivedInvestmentAnalysis);
  }, [derivedInvestmentAnalysis]);

  // Reset auto-generation flag when parcel changes
  useEffect(() => {
    const currentId = parcel.ogc_fid ?? parcel.id ?? null;
    if (lastParcelIdRef.current !== currentId) {
      lastParcelIdRef.current = currentId;
      hasAutoGeneratedRef.current = false;
      setSolverReady(false);
      planModeRef.current = null;
      mfSeedRef.current = 1;
      mfPinsRef.current = [];
      productRef.current = 'apartments';
      setProduct('apartments');
      draftModeRef.current = false;
      setDraftMode(false);
      compileBlockedRef.current = null;
      setCompileBlocked(null);
      serverGeoRetryRef.current = false;
      serverFailCauseRef.current = null;
      setServerPlanError(null);
      setSolveRejected(null);
      setMaxBuildout(null);
      setActiveCandidateId(null);
      setMfCandidates([]);
      ctxSettledRef.current = 'pending';
      userPickedUseRef.current = false;
      setServerMoney(null);
      plannerCtxRef.current = null;
      setPlannerCtx(null);
      setPermittedUses([]);
      generationBlockedRef.current = false;
      setGenerationBlocked(false);
      appliedContextRef.current = null;
      setPlanBasis(null);
      setPlanLineage(null);
      setPlanStale(false);
      lastCompiledUseRef.current = null;
    }
  }, [parcel.ogc_fid, parcel.id]);

  // Neighborhood context loads once per parcel (fail-soft, cached).
  useEffect(() => {
    if (contextOgcFid == null) {
      setNeighbors(null);
      return;
    }
    let cancelled = false;
    fetchPlannerNeighbors(contextOgcFid).then(n => {
      if (!cancelled) setNeighbors(n);
    });
    return () => { cancelled = true; };
  }, [contextOgcFid]);

  useEffect(() => {
    const t = taskTimingsRef.current;
    if (plannerLoading) t.compileStarted = performance.now();
    else if (t.compileStarted != null) { t.compileMs = Math.round(performance.now() - t.compileStarted); t.compileStarted = null; setTaskTimingsVersion(v => v + 1); }
  }, [plannerLoading]);
  useEffect(() => {
    const t = taskTimingsRef.current;
    if (isGenerating) t.massingStarted = performance.now();
    else if (t.massingStarted != null) { t.massingMs = Math.round(performance.now() - t.massingStarted); t.massingStarted = null; setTaskTimingsVersion(v => v + 1); }
  }, [isGenerating]);
  useEffect(() => {
    const t = taskTimingsRef.current;
    if (isGeneratingLots) t.lotFitStarted = performance.now();
    else if (t.lotFitStarted != null) { t.lotFitMs = Math.round(performance.now() - t.lotFitStarted); t.lotFitStarted = null; setTaskTimingsVersion(v => v + 1); }
  }, [isGeneratingLots]);

  // Topography loads once per parcel (fail-soft; the first fetch of a parcel
  // makes the database sample the DEM, which can take tens of seconds on a
  // large site — the sheet fills in when it lands).
  useEffect(() => {
    if (contextOgcFid == null) {
      setTopo(null);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    fetchParcelTopo(contextOgcFid).then(t => {
      if (cancelled) return;
      setTopo(t);
      // The engine blocks a re-fetch for 90 s after a real USGS failure and
      // retries 3DEP itself; a miss here usually succeeds a minute later
      // (engine handoff, 2026-11-09). One automatic retry, then the note stands.
      if (!t) {
        retry = setTimeout(() => {
          fetchParcelTopo(contextOgcFid).then(t2 => { if (!cancelled && t2) setTopo(t2); });
        }, 95_000);
      }
    });
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, [contextOgcFid]);

  useEffect(() => {
    if (contextOgcFid == null) {
      setBuildability(null);
      return;
    }
    let cancelled = false;
    fetchParcelBuildability(contextOgcFid).then(b => {
      if (!cancelled) setBuildability(b);
    });
    setPlanPattern(null);
    fetchPlanPattern(contextOgcFid).then(pp => {
      if (!cancelled) setPlanPattern(pp);
    });
    // a new parcel starts by right: no override, no competition, no seed verdict carries over
    setSfV1Summary(null);
    setSfV1Override({});
    sfV1OverrideRef.current = {};
    setBfeContour(null);
    setSfV1Site(null);
    competitionSeqRef.current += 1;
    sfV1CandidatesRef.current = null;
    sfV1DefaultRespRef.current = null;
    setSfV1Competition(null);
    setSfV1Shown('loop');
    sfV1ShownRef.current = 'loop';
    setSfV1AutoBest(null);
    setSfV1HoleOverlap(null);
    setSfSeedError(null);
    // nor a layout choice: the new parcel's multifamily plan and neighborhood are its own
    mfLayoutHomesRef.current = null;
    setMfLayoutHomes(null);
    setLayoutAuto(false);
    layoutUserChoseRef.current = false;
    layoutCompetitionRanRef.current = false;
    setThV3Summary(null);
    setThV3Error(null);
    return () => { cancelled = true; };
  }, [contextOgcFid]);

  useEffect(() => {
    if (contextOgcFid == null) {
      setSeedPlan(null);
      setShowSeed(false);
      return;
    }
    let cancelled = false;
    fetchSeedPlan(contextOgcFid).then(sp => {
      if (!cancelled) setSeedPlan(sp);
    });
    return () => { cancelled = true; };
  }, [contextOgcFid]);

  // Max-buildout envelope for multifamily contexts — the SF-first headline
  // and the KPI utilization stat. Fail-soft; absent for other typologies.
  useEffect(() => {
    const typology = plannerCtx?.context.typology;
    if (contextOgcFid == null || typology !== 'multifamily') {
      setMaxBuildout(null);
      return;
    }
    let cancelled = false;
    fetchMaxBuildout(contextOgcFid, 'multifamily').then(b => {
      if (!cancelled) setMaxBuildout(b);
    });
    return () => { cancelled = true; };
  }, [contextOgcFid, plannerCtx?.context.typology]);

  /** MF branch of the auto-plan: the server site system, full stop.
   *  Order-6 item 5c (Eric-decided): a failed server plan shows an error
   *  card naming its cause + Retry — the worker's improvised corner plan
   *  never stands in for it again. Distinct failures now look distinct. */
  const autoPlanMf = useCallback((ctx: DesignContext | null) => {
    planModeRef.current = 'mf';
    void (async () => {
      // User pins carry through a re-plan (use switch, context refresh) —
      // same parcel, so they remain valid until geometry says otherwise.
      const ok = await runServerMfPlan({ seed: 1, pins: mfPinsRef.current }).catch(e => {
        // A throw here is a client bug, not a solver verdict — name it on
        // the card rather than hiding it behind a different plan.
        console.error('[autoPlanMf] server massing path threw:', e);
        serverFailCauseRef.current = `Client error while rendering the server plan: ${String(e).slice(0, 160)}`;
        return false;
      });
      // runServerMfPlan returns true for HANDLED rejections (generation
      // blocked, context-contract error, compile blocked) — those screens
      // already name themselves. false = the card-worthy failures.
      if (!ok && !generationBlockedRef.current && !compileBlockedRef.current) {
        setServerPlanError(serverFailCauseRef.current ?? 'The massing service did not respond.');
        const failed = { homes: null, product: productRef.current, failed: true };
        mfLayoutHomesRef.current = failed;
        setMfLayoutHomes(failed);
      }
      // The layout choice (the owner, 2026-11-04): on multifamily land the
      // neighborhood plans are drawn next, once per parcel, to weigh against
      // the plan just drawn (or the one that failed).
      const zoningBase = ctx?.zoningBase ?? (typeof parcel.zoning === 'string' ? parcel.zoning : null);
      if (contextOgcFid != null && !generationBlockedRef.current && !compileBlockedRef.current
        && sfV1Route(zoningBase) === 'th' && !layoutCompetitionRanRef.current) {
        runLayoutCompetitionRef.current?.(contextOgcFid);
      }
    })();
  }, [runServerMfPlan, contextOgcFid, parcel.zoning]);

  /**
   * HBU-routed auto-plan: the resolved USE/TYPOLOGY decides WHAT gets planned
   * (single/two-family → market-grounded lot fit; multifamily → massing
   * engine). The context's `regime` deliberately does NOT route here — it
   * describes parking structure (surface vs structured), and reading it as
   * "SF vs MF" is how an RM40 parcel once got tiled with house pads.
   */
  const autoPlan = useCallback((ctx: DesignContext | null) => {
    if (hasAutoGeneratedRef.current || !envelopeMeters || !hasValidGeometry) return;
    // Defense in depth: while massing is blocked (no compiled context), no
    // auto-path may lay anything out. Retry / a late settle re-arms.
    if (compileBlockedRef.current) return;
    // USE-BINDING (2026-09-04, 2622 W Heiman console): a single-family
    // context on multifamily land is the boot placeholder still resolving —
    // massing apartments on it only trips the solver's guard (three red
    // "refusing to mass" errors per visit). Plan nothing; the multifamily
    // compile that follows re-arms the auto-plan. A use the user PICKED is
    // honoured: single-family on RM land routes to the lot fit.
    const sfContext = ctx?.typology === 'single_family';
    if (ctx && sfContext && !routesToLotFit(ctx) && !userPickedUseRef.current) return;
    hasAutoGeneratedRef.current = true;
    if (ctx && (routesToLotFit(ctx) || sfContext)) {
      planModeRef.current = 'sf';
      setPlanBasis(
        `Single-family lot fit — ${ctx.zoningBase ?? 'zoning'} as-of-right · lots sized from local comps`
      );
      handleGenerateLots().catch(() => undefined);
    } else {
      autoPlanMf(ctx);
    }
  }, [envelopeMeters, hasValidGeometry, handleGenerateLots, autoPlanMf]);

  /** Compile settle → grounding + routing. generation_allowed=false BLOCKS
   *  generation (a rejection, not a fallback); a later allowed compile
   *  (use switch) re-arms the auto-plan. */
  const handleCompileSettled = useCallback((resp: PlannerContextResponse | null) => {
    const ctx = resp ? plannerContextToDesignContext(resp) : null;
    ctxSettledRef.current = ctx;
    const physical = physicalOnlyBlock(resp);
    // 2026-11-04 (0 Temple Rd, 0 River Landing Way): a PHYSICAL block on an
    // R / RS parcel — the use is by right, the context engine calls the site
    // undevelopable as mapped (the floodplain) — goes to the by-right
    // generator, which judges the site itself: its own flood hold, its own
    // reason, and the fill scenario as an override (River Landing Way: 10 lots).
    // Blocking it left "Generating plan…" and "pick a permitted use" on a lot
    // whose only use is the one selected.
    const physicalByRight = !!physical && sfV1Route(resp?.context?.legal?.zoning_base ?? (typeof parcel.zoning === 'string' ? parcel.zoning : null)) === 'sf_v1';
    setPhysicalBlockReason(physical?.reason ?? null);
    if (resp && !resp.generation_allowed && !physicalByRight) {
      generationBlockedRef.current = true;
      setGenerationBlocked(true);
      hasAutoGeneratedRef.current = true; // suppress auto-plan while blocked
      planModeRef.current = null;
      setPlanBasis(physical
        ? `Generation blocked — the site is not developable as mapped: ${physical.reason} · ${plannerContextSummary(resp)}`
        : `Generation blocked — selected use not permitted as-of-right · ${plannerContextSummary(resp)}`);
      return;
    }
    if (generationBlockedRef.current) {
      // blocked → allowed transition (user picked a permitted use): re-arm
      generationBlockedRef.current = false;
      setGenerationBlocked(false);
      hasAutoGeneratedRef.current = false;
    }
    // ENTERPRISE TRUST GATE: a failed compile (after the client's retry)
    // blocks massing outright — nothing renders on default assumptions.
    // The Retry screen re-compiles; a later success lands below and re-arms.
    if (!resp) {
      // An R / RS parcel's by-right generator reads the district standards
      // itself (standardsDirect): the massing context's failure blocks the
      // massing, not the lot fit (0 W Trinity Ln, the cohort retest: the
      // block curtained a finished zero-lot answer). It runs, under a banner.
      const byRightRoute = sfV1Route(typeof parcel.zoning === 'string' ? parcel.zoning : null) === 'sf_v1';
      markCompileBlocked('The zoning context compile failed for this parcel.');
      hasAutoGeneratedRef.current = true; // no massing auto-plan may run while blocked
      planModeRef.current = null;
      setPlanBasis(byRightRoute
        ? 'Massing context unavailable — the by-right generator answers from the district standards directly.'
        : 'Massing blocked — zoning context unavailable.');
      if (byRightRoute) handleGenerateLots().catch(() => undefined);
      return;
    }
    // A real context arrived (retry succeeded, or a hung compile settled
    // late) → lift the block and plan on it.
    if (resp && compileBlockedRef.current) {
      markCompileBlocked(null);
      hasAutoGeneratedRef.current = false;
    }
    // A LATE compile settle must REPLACE any degraded draft that rendered
    // while it was in flight — "Context unavailable" beside a fully compiled
    // panel shipped a degraded solve wearing authoritative reporting.
    if (resp && draftModeRef.current) {
      markDraft(false);
      hasAutoGeneratedRef.current = false;
    }
    autoPlan(ctx);
  }, [autoPlan, markDraft, markCompileBlocked, parcel.zoning, handleGenerateLots]);

  // Resolve the parcel's as-of-right uses once; correct the default use
  // BEFORE compiling so the first snapshot is for the right use.
  // DENSITY-FIRST: the default is the densest as-of-right use — users flip
  // DOWN to single-family if they want; a failed lookup must never silently
  // leave an RM parcel on the single_family boot default (2622 W Heiman).
  useEffect(() => {
    if (contextOgcFid == null) return;
    let cancelled = false;
    setUseResolved(false);
    (async () => {
      let raw = await fetchPermittedUses(contextOgcFid);
      if (cancelled) return;
      if (raw == null) {
        // Transient failure (cold cache / 503): one retry on warm buffers.
        raw = await fetchPermittedUses(contextOgcFid);
        if (cancelled) return;
      }
      const list = normalizePermittedUses(raw);
      const status = permittedUsesStatus(raw);
      const sp = status?.status === 'sp_ordinance_not_loaded' ? status : null;
      spOrdinanceRef.current = sp;
      setSpOrdinance(sp);
      // Order-5 item 2a: the string-inference fallback is DELETED. When the
      // RPC has no list, the selector shows only the compiled use (bootstrap
      // default) — never uses inferred from a zoning-string prefix. The
      // compile still proceeds; the rail says the list is unavailable.
      setPermittedUses(list);
      // Order-8 audit (2405 12th Ave, CS): a commercial-only lot keeps the
      // bootstrap compile (which returns the ordinance caps with
      // generation_allowed=false) and shows the capacity card — it never
      // defaults to a use the compiler cannot type ('commercial').
      setNonResidentialOnly(isNonResidentialOnly(list));
      if (!userPickedUseRef.current && list.length > 0) {
        const preferred = pickDefaultUse(list);
        if (preferred && preferred !== contextUse) setContextUse(preferred);
      }
      if (list.length === 0) {
        console.warn('[permitted-uses] list unavailable after retry — selector limited to the compiled use (no inference).');
        // The default use still has to be the parcel's own: with no list, the
        // zoning base decides (RM → multi_family), so the first compile is
        // never the single_family boot placeholder on an apartment parcel.
        const zoned = defaultUseFromZoningBase(parcel.zoning as string | undefined);
        if (!userPickedUseRef.current && zoned && zoned !== contextUse) setContextUse(zoned);
      }
      setUseResolved(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextOgcFid]);

  // Compile the planner context (cached per parcel+use+intent); the first
  // auto-solve waits for this settle or the existing fail-soft timeout below.
  useEffect(() => {
    if (contextOgcFid == null || !useResolved) return;
    let cancelled = false;
    // Selected-use TRANSITION: the old snapshot must not ground any solve for
    // the new use (an SF context on an MF solve, or vice versa). Clear it,
    // invalidate the applied-config marker, mark the on-canvas plan stale,
    // and re-arm generation so the plan regenerates only after the NEW
    // compile settles. User pins survive — same parcel, and both generators
    // drop pins that no longer fit the envelope.
    const isUseTransition =
      lastCompiledUseRef.current != null && lastCompiledUseRef.current !== contextUse;
    lastCompiledUseRef.current = contextUse;
    if (isUseTransition) {
      plannerCtxRef.current = null;
      setPlannerCtx(null);
      appliedContextRef.current = null;
      if (planModeRef.current != null) setPlanStale(true);
      hasAutoGeneratedRef.current = false;
    }
    if (spOrdinanceRef.current) {
      // The district alone resolves no use: the SP ordinance sets them and it
      // is not loaded. A terminal state with the bill number, not a compile
      // of a boot default and not "zoning context unavailable".
      const sp = spOrdinanceRef.current;
      plannerCtxRef.current = null;
      setPlannerCtx(null);
      appliedContextRef.current = null;
      setPlannerLoading(false);
      hasAutoGeneratedRef.current = true;
      planModeRef.current = null;
      setServerPlanError(null);
      setViolations([]);
      setPlanStale(false);
      setPlanBasis(`Specific Plan — ${sp.ordinance ?? 'the SP ordinance'}${sp.caseNo ? ` (${sp.caseNo})` : ''} is not loaded: no as-of-right use resolves from the district alone, so nothing is compiled or drawn.`);
      return;
    }
    if (NON_RESIDENTIAL_USES.has(contextUse)) {
      // fn_compile_planner_context has no typology for 'commercial' (it hung
      // past the statement timeout on 1360 Brick Church Pike, 2026-11-09) and
      // no engine draws commercial geometry. Terminal state, not a spinner:
      // the card below carries the ordinance caps, the strip says what to do.
      plannerCtxRef.current = null;
      setPlannerCtx(null);
      appliedContextRef.current = null;
      setPlannerLoading(false);
      hasAutoGeneratedRef.current = true;
      planModeRef.current = null;
      setUnsupportedUse(contextUse);
      // the previous use's failure and its staleness are not this use's state
      setServerPlanError(null);
      setViolations([]);
      setPlanStale(false);
      setPlanBasis(`${contextUse.replace(/_/g, ' ')} selected — permitted here, but no massing engine draws ${contextUse.replace(/_/g, ' ')} geometry; the capacity card carries the ordinance caps.`);
      return;
    }
    setUnsupportedUse(prev => {
      // leaving an unsupported use: its basis line is not this use's
      if (prev) setPlanBasis(null);
      return null;
    });
    setPlannerLoading(true);
    compilePlannerContext(contextOgcFid, contextUse)
      .then(resp => {
        // `cancelled` = a newer selected use owns the active-context slot;
        // this stale compile response must not overwrite it.
        if (cancelled) return;
        plannerCtxRef.current = resp;
        setPlannerCtx(resp);
        setPlannerLoading(false);
        if (resp) {
          applyBriefDefaults(resp);
          void recordPlannerFeedback(resp.context_id, 'context_loaded');
        }
        handleCompileSettled(resp);
      })
      .catch(() => {
        if (cancelled) return;
        setPlannerLoading(false);
        handleCompileSettled(null);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextOgcFid, contextUse, useResolved, compileNonce]);

  // A1: load the parcel's scheme history on entry
  useEffect(() => {
    refreshCandidates();
  }, [refreshCandidates]);

  /** View a saved scheme: deterministic re-render from its seed + pins (no
   *  new candidate row); future variations descend from the viewed scheme.
   *  The render uses the candidate's STORED context id (or the legacy path
   *  when it predates the contract) — never silently today's context, so the
   *  scheme stays explainable from the context that produced it. */
  const handleViewCandidate = useCallback((c: MfCandidate) => {
    if (mfRegenInFlightRef.current) return;
    mfRegenInFlightRef.current = true;
    setIsGenerating(true);
    void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'candidate_viewed', c.id);
    // Townhome candidates are recognized by their unit-form metrics (only
    // th_context_v1 writes unit_w_ft) so a replay re-runs the SAME product,
    // and later edits stay in that product.
    const candidateProduct: 'apartments' | 'townhomes' =
      c.metrics.unit_w_ft != null ? 'townhomes' : 'apartments';
    if (productRef.current !== candidateProduct) {
      productRef.current = candidateProduct;
      setProduct(candidateProduct);
    }
    runServerMfPlan({
      seed: c.seed,
      pins: c.pins,
      parentId: c.parentId,
      persist: false,
      contextId: c.contextId ?? null,
      product: candidateProduct,
    })
      .then(ok => {
        if (ok) {
          setActiveCandidateId(c.id);
          void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'candidate_selected', c.id);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        mfRegenInFlightRef.current = false;
        setIsGenerating(false);
      });
  }, [runServerMfPlan]);

  /** Underwrite a saved scheme: put it on the sheet if it is not there
   *  already, then open its pro forma. The figures follow the sheet. */
  const handleUnderwriteCandidate = useCallback((c: MfCandidate) => {
    if (c.id !== activeCandidateId) handleViewCandidate(c);
    setDockTab('results');
    setDockOpen(true);
  }, [activeCandidateId, handleViewCandidate, setDockOpen]);

  const [comparing, setComparing] = useState<MfCandidate[] | null>(null);
  const loadCompareDrawing = useCallback(
    (c: MfCandidate) => (contextOgcFid == null ? Promise.resolve(null) : loadSchemeDrawing(contextOgcFid, c)),
    [contextOgcFid],
  );

  /** Explicit "Regenerate with current context": a NEW candidate descended
   *  from the saved one, planned on the ACTIVE snapshot. The saved scheme
   *  itself is never silently rewritten. */
  const handleRegenerateCandidate = useCallback((c: MfCandidate) => {
    if (mfRegenInFlightRef.current) return;
    mfRegenInFlightRef.current = true;
    setIsGenerating(true);
    runServerMfPlan({
      seed: c.seed,
      pins: c.pins,
      parentId: c.id,
      persist: true,
      product: c.metrics.unit_w_ft != null ? 'townhomes' : 'apartments',
    })
      .catch(() => undefined)
      .finally(() => {
        mfRegenInFlightRef.current = false;
        setIsGenerating(false);
      });
  }, [runServerMfPlan]);

  // Fallback: generation AWAITS the compile settle (handleCompileSettled is
  // the only auto-plan trigger on the happy path) — no shorter timer ever
  // races it into a degraded solve. This single timeout is the hung-compile
  // escape hatch only, sized ABOVE the compile p95 (~8s cold) plus the
  // client's one retry. If it ever fires while the compile is genuinely
  // still pending, massing is BLOCKED behind the Retry screen (a late settle
  // lifts the block); only the diagnostics flag renders a DRAFT instead.
  useEffect(() => {
    if (!hasValidGeometry || !envelopeMeters) return;
    if (hasAutoGeneratedRef.current) return;
    let second: number | undefined;
    const timer = window.setTimeout(() => {
      if (hasAutoGeneratedRef.current || compileBlockedRef.current) return;
      if (ctxSettledRef.current !== 'pending') {
        autoPlan(ctxSettledRef.current);
        return;
      }
      second = window.setTimeout(() => {
        if (hasAutoGeneratedRef.current || compileBlockedRef.current) return;
        if (ctxSettledRef.current !== 'pending') {
          autoPlan(ctxSettledRef.current);
          return;
        }
        // Compile still hung past both windows: with 11 ms warm compiles
        // (snapshot reuse), a hang is a real outage — ALWAYS block. The
        // degraded-draft bypass is gone (night WO item 1).
        markCompileBlocked('The zoning context compile is not responding.');
        hasAutoGeneratedRef.current = true;
        return;
      }, 8000);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
      if (second !== undefined) window.clearTimeout(second);
    };
    // compileNonce: each explicit Retry re-arms the escape hatch, so a retried
    // compile that hangs re-blocks instead of spinning forever.
  }, [hasValidGeometry, envelopeMeters, autoPlan, markCompileBlocked, compileNonce]);

  // Live re-solve when a design parameter changes (FAR, coverage, parking,
  // typology) — but only after the first plan exists. Debounced so dragging a
  // slider doesn't fire a solve per pixel. Reads the latest solverReady /
  // liveResolve from the fresh closure created on each parameter change.
  const liveResolveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!solverReady || !envelopeMeters) return;
    if (liveResolveTimer.current) window.clearTimeout(liveResolveTimer.current);
    liveResolveTimer.current = window.setTimeout(() => {
      liveResolve();
      void recordPlannerFeedback(plannerCtxRef.current?.context_id, 'parameter_changed');
    }, 350);
    return () => {
      if (liveResolveTimer.current) window.clearTimeout(liveResolveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.designParameters, config.zoning]);

  // Seed view: display swap only — the solver plan and its handlers are
  // untouched underneath; toggling back restores them exactly.
  const seedRender = useMemo(() => (seedPlan ? seedToElements(seedPlan) : null), [seedPlan]);
  // The quick massing is the multifamily solve's first pass. It is only an
  // alternative view of the plan on the sheet when that plan IS a multifamily
  // massing: on 2915 Hillhurst Dr (RS10, three by-right lots, 2026-11-09) the
  // toggle swapped a 25-unit apartment building under a "3 lots · All tests
  // pass" header, and the table read 133% / 500% against the lots' count.
  const quickMassingAvailable = !!seedRender && seedRender.elements.length > 0 && elements.some(e => isMfPlanElement(e));
  const seedViewOn = showSeed && quickMassingAvailable;
  useEffect(() => {
    if (!quickMassingAvailable) setShowSeed(false);
  }, [quickMassingAvailable]);
  const displayElements = seedViewOn && seedRender ? seedRender.elements : elements;
  const displayBasis = seedViewOn && seedRender
    ? seedRender.basis + (seedRender.inFamily ? ` · in-family: ${seedRender.inFamily}` : '')
    : planBasis;

  // The civil sheet's layers (2026-09-04): contours in the canvas frame, the
  // sample grid for spot grades and profiles, the callouts written on the
  // plan, the profile of every through-street, and the title block.
  const topoCanvas = useMemo(() => {
    const view = topo ? topoView(topo) : null;
    if (!view || !bfeContour) return view;
    // 2026-11-03: the ground-at-BFE line rides with the contours, drawn blue
    const lines: number[][][] = [];
    for (const l of bfeContour.lines) {
      try { lines.push(line2274To3857(l as never) as number[][]); } catch { /* one bad piece never sinks the layer */ }
    }
    if (lines.length === 0) return view;
    return { ...view, contours: [...view.contours, { elevationFt: bfeContour.bfeFt, index: true, bfe: true, lines }] };
  }, [topo, bfeContour]);
  const topoGrid = useMemo(() => (topo ? new TopoGrid(topo) : null), [topo]);
  const sheetAnnotations = useMemo(() => buildSheetAnnotations(displayElements, topoGrid), [displayElements, topoGrid]);
  const streetProfiles = useMemo(() => buildStreetProfiles(displayElements, topoGrid), [displayElements, topoGrid]);
  const subdivisionOnSheet = !!subdivisionSummary && displayElements.some(e => e.id.startsWith('subdiv-'));
  // A 0-lot answer keeps its wetland hatch and flood hold on the sheet as
  // context; that is existing conditions, not a layout plan.
  const sfV1OnSheet = !!sfV1Summary && sfV1Summary.status !== 'skipped' && sfV1Summary.lots > 0 && displayElements.some(e => e.id.startsWith('sfv1-lot-'));
  // Whether a street reaches the parcel: the engine's access reading (on every plan and competition answer
  // from g21) once an answer is in, the frontage layer until then. The two disagree where the frontage
  // layer takes an edge no neighbour shares for a street (262 Martingale Dr: 404 ft of railroad).
  const engineAccess = sfV1Summary?.access ?? (sfV1Competition?.state === 'done' ? sfV1Competition.data?.access ?? null : null);
  const noStreetAccess = engineAccess ? isNoStreetAccess(engineAccess) : frontage?.landlocked === true;
  const accessNote = accessBanner(engineAccess, frontage?.landlocked === true);
  // The layout choice on multifamily land: what the sheet shows, and which side the default is.
  const thV3OnSheet = !!thV3Summary && displayElements.some(e => e.id.startsWith('thv3-home-'));
  // The legacy lot generator's lots (gen-lot-N): on the sheet only when the
  // by-right generator was unreachable; the strip labels them provisional.
  const legacyLotCount = displayElements.filter(e => e.id.startsWith('gen-lot-')).length;
  // a by-right / lot-fit / house result on the sheet: complete in itself, whatever the massing context does
  const sfPlanOnSheet = displayElements.some(e => isSfPlanElement(e));
  const legacyLots = legacyLotCount > 0 ? legacyLotCount : null;
  const layoutZoningBase = plannerCtx?.context?.legal?.zoning_base ?? (typeof parcel.zoning === 'string' ? parcel.zoning : null);
  const isRmLayout = sfV1Route(layoutZoningBase) === 'th' && plannerCtx?.context.typology === 'multifamily' && sfV1Competition != null;
  const layoutShown: LayoutKind | null = displayElements.some(e => isMfPlanElement(e)) ? 'multifamily'
    : displayElements.some(e => e.id.startsWith('thv3-home-') || e.id.startsWith('sfv1-lot-')) ? 'neighborhood'
    : null;
  const layoutShownRequested = layoutShown === 'neighborhood' ? (thV3OnSheet ? 'townhome' : sfV1Shown) : null;
  const layoutChoice = useMemo(
    () => (isRmLayout
      ? chooseLayout({
          multifamilyHomes: mfLayoutHomes?.homes ?? null,
          multifamilyProduct: mfLayoutHomes?.product ?? 'apartments',
          multifamilyFailed: mfLayoutHomes?.failed ?? true,
          competition: sfV1Competition?.state === 'done' ? sfV1Competition.data : null,
        })
      : null),
    [isRmLayout, mfLayoutHomes, sfV1Competition],
  );
  layoutChoiceRef.current = layoutChoice;
  // The mapped area of the parcel polygon on the sheet (Mercator-corrected);
  // the assessor's acreage rides along when it disagrees (930 Morton Mill Rd:
  // 4.47 ac drawn, 7.70 on the record).
  const mappedAcres = useMemo((): number | null => {
    try {
      if (!parcel?.geometry) return null;
      const geom = parcel.geometry as Polygon | MultiPolygon;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0]?.[0];
      const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
      const g3857 = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
      const polys: Polygon[] = g3857.type === 'Polygon' ? [g3857] : g3857.coordinates.map(c => ({ type: 'Polygon', coordinates: c }) as Polygon);
      // the holes are not the parcel's (0 Longwood Pl: 8.30 ac outer ring, 4.41 ac owned)
      const m2 = polys.reduce((a, p) => a + correctedAreaM2(p)
        - (p.coordinates as number[][][]).slice(1).reduce((h, ring) => h + correctedAreaM2({ type: 'Polygon', coordinates: [ring] }), 0), 0);
      return m2 > 0 ? m2 / 4046.8564224 : null;
    } catch {
      return null;
    }
  }, [parcel?.geometry]);
  const sheetTitle = useMemo(
    () =>
      buildSheetTitleBlock({
        address: parcel.address ?? null,
        parcelId: parcel.ogc_fid ?? parcel.id ?? null,
        zoning: (parcel.zoning as string | undefined) ?? null,
        acres: mappedAcres ?? (typeof parcel.deeded_acres === 'number' ? parcel.deeded_acres : null),
        assessorAcres: typeof parcel.deeded_acres === 'number' ? parcel.deeded_acres : null,
        subdivision: subdivisionOnSheet && subdivisionSummary
          ? {
              lots: subdivisionSummary.lots,
              network: subdivisionSummary.network,
              pctRow: subdivisionSummary.pctRow,
              pctHazard: subdivisionSummary.pctHazard,
              hazardCoverage: subdivisionSummary.hazardCoverage,
              crossingFt: subdivisionSummary.crossingFt,
            }
          : sfV1OnSheet && sfV1Summary
            ? {
                lots: sfV1Summary.lots,
                network: sfV1Summary.pattern ?? 'by right',
                // "7 lots · single street · by right", not "single street (by right) network"
                networkLabel: `${sfV1Summary.pattern ?? 'no new street'} · ${sfV1Summary.basis === 'override' ? 'OVERRIDE' : 'by right'}`,
                pctRow: sfV1Summary.rowPct,
                // the generator holds out real FEMA / NWI geometry (hazard_flood_2274, the site's no-build land)
                pctHazard: sfV1Summary.heldPct,
                hazardCoverage: 'ingested',
                crossingFt: (sfV1Summary.streetInWetlandFt ?? 0) > 0 ? sfV1Summary.streetInWetlandFt : null,
              }
            : thV3OnSheet && thV3Summary
              ? {
                  lots: thV3Summary.homes,
                  unit: 'townhome' as const,
                  network: thV3Summary.pattern ?? 'townhomes',
                  networkLabel: `${thV3Summary.pattern ?? 'townhomes'} · by right`,
                  pctRow: null,
                  // the land drawn as held out (the stream buffer at 2622 W Heiman), not only the flood hold
                  pctHazard: thV3Summary.heldOutAcres != null && thV3Summary.siteAcres != null && thV3Summary.siteAcres > 0
                    ? Math.round((thV3Summary.heldOutAcres / Math.max(thV3Summary.siteAcres, thV3Summary.heldOutAcres)) * 1000) / 10
                    : null,
                  hazardCoverage: 'ingested',
                  crossingFt: null,
                }
              : null,
        hasPlan: displayElements.some(e => e.type === 'building' || e.type === 'parking'),
        topo: topoCanvas
          ? {
              source: topoCanvas.source,
              spacingFt: topo?.spacing_ft ?? 20,
              zMinFt: topoCanvas.zMinFt,
              zMaxFt: topoCanvas.zMaxFt,
              meanSlopePct: topoCanvas.meanSlopePct,
              maxSlopePct: topoCanvas.maxSlopePct,
            }
          : null,
      }),
    [parcel.address, parcel.ogc_fid, parcel.id, parcel.zoning, parcel.deeded_acres, mappedAcres, subdivisionOnSheet, subdivisionSummary, sfV1OnSheet, sfV1Summary, thV3OnSheet, thV3Summary, displayElements, topoCanvas, topo],
  );

  // The one-line plan-basis row (2026-09-04): the context state, the two lead
  // segments of the basis, the upper bound and the capture.
  // The drawing scene: one description of the plan on the sheet, built once,
  // read by the plan, the 3D view and the printed sheets. Solver outputs go in
  // and nothing comes back: no view changes an element through it.
  const sceneSchemeId = seedViewOn
    ? 'quick-massing'
    : layoutShown === 'multifamily'
      ? `mf:${activeCandidateId ?? planLineage?.generatorVersion ?? 'plan'}`
      : layoutShown === 'neighborhood'
        ? `neighborhood:${layoutShownRequested ?? 'plan'}`
        : subdivisionOnSheet ? 'subdivision' : 'plan';
  const scene = useMemo(
    () => (classicDrawing || displayElements.length === 0
      ? null
      : buildDrawingScene({
          parcelId: parcel.ogc_fid ?? 'unknown',
          schemeId: sceneSchemeId,
          elements: displayElements,
          parcelGeometry: (parcel.geometry as import('geojson').Polygon | import('geojson').MultiPolygon | undefined) ?? null,
          envelope: envelopeMeters ?? null,
          context: neighbors,
          schedule: seedViewOn ? null : { units: metrics?.totalUnits ?? null, stalls: metrics?.stallsDrawn ?? metrics?.stallsProvided ?? null },
          generator: planLineage?.generatorVersion ?? null,
        })),
    [classicDrawing, displayElements, parcel.ogc_fid, parcel.geometry, sceneSchemeId, envelopeMeters, neighbors, seedViewOn, metrics?.totalUnits, metrics?.stallsDrawn, metrics?.stallsProvided, planLineage?.generatorVersion],
  );
  // One selection for the plan and the 3D view, remembered for this parcel and scheme.
  const sceneSelectedIds = useMemo(() => selectionFor(scene, sceneSelection), [scene, sceneSelection]);
  const sceneKey = scene?.identity.key ?? null;
  const handleSceneSelection = useCallback((ids: string[]) => {
    if (!sceneKey) return;
    setSceneSelection(prev => (prev && prev.key === sceneKey && prev.ids.length === ids.length && prev.ids.every((id, i) => id === ids[i])
      ? prev
      : { key: sceneKey, ids }));
  }, [sceneKey]);
  const sheetsTitle = useMemo(() => {
    // the site data table: the scheme's own figures, as the header states them
    const acres = mappedAcres ?? (typeof parcel.deeded_acres === 'number' ? parcel.deeded_acres : null);
    const units = metrics?.totalUnits ?? null;
    const stalls = metrics?.stallsDrawn ?? metrics?.stallsProvided ?? null;
    const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
    const data: Array<{ label: string; value: string }> = [];
    if (parcel.zoning) data.push({ label: 'Zoning', value: String(parcel.zoning) });
    if (acres) data.push({ label: 'Site area', value: `${n(acres, 2)} ac` });
    if (units) data.push({ label: sfPlanOnSheet ? 'Lots' : 'Homes', value: n(units) });
    if (units && acres) data.push({ label: 'Density', value: `${n(units / acres, 1)} per acre` });
    if (!sfPlanOnSheet && metrics?.totalBuiltSF) data.push({ label: 'Gross floor area', value: `${n(metrics.totalBuiltSF)} sf` });
    if (!sfPlanOnSheet && metrics?.achievedFAR) data.push({ label: 'Floor area ratio', value: n(metrics.achievedFAR, 2) });
    if (!sfPlanOnSheet && metrics?.siteCoveragePct) data.push({ label: 'Building coverage', value: `${n(metrics.siteCoveragePct)}%` });
    if (stalls) data.push({ label: 'Parking', value: `${n(stalls)} stalls${units ? ` · ${n(stalls / units, 2)} per home` : ''}` });
    return { project: sheetTitle.project, subtitle: sheetTitle.subtitle, date: sheetTitle.date, notes: sheetTitle.notes, data: seedViewOn ? [] : data };
  }, [sheetTitle, mappedAcres, parcel.deeded_acres, parcel.zoning, metrics, sfPlanOnSheet, seedViewOn]);
  // The sheet's picture: the ground it shows, rendered from above from the
  // same model the 3D view draws. Loaded when a sheet first asks for it.
  const archStyle = useArchStyle();
  const sheetModelData = useCallback(async () => {
    if (!scene) throw new Error('no scene');
    const { buildMassingData } = await import('./ui/massingData');
    return buildMassingData(displayElements, {
      style: archStyle,
      ...(scene.parcel?.polygons[0]?.[0] ? { parcelRing: scene.parcel.polygons[0][0].map(p => scene.frame.fromFeet(p)) } : {}),
      ...(neighbors?.buildings ? { contextBuildings: neighbors.buildings } : {}),
      ...(neighbors?.parcels ? { contextParcels: neighbors.parcels } : {}),
      ...(neighbors?.roads ? { contextRoads: neighbors.roads } : {}),
      treePoints: scene.landscape.trees.map(t => ({ at: scene.frame.fromFeet(t.at), radiusM: t.radiusFt * 0.3048 })),
    });
  }, [scene, displayElements, neighbors, archStyle]);
  const renderSheetUnderlay = useCallback(async (layout: import('./scene/sheetSvg').SheetLayout, widthPx: number): Promise<string> => {
    if (!scene) throw new Error('no scene');
    const [{ renderPlanImage }, data] = await Promise.all([import('./render3d/still'), sheetModelData()]);
    const a = data.toLocal(scene.frame.fromFeet([layout.ground.minX, layout.ground.minY]));
    const b = data.toLocal(scene.frame.fromFeet([layout.ground.maxX, layout.ground.maxY]));
    return renderPlanImage({ data, bounds: { minX: a[0] ?? 0, minY: a[1] ?? 0, maxX: b[0] ?? 0, maxY: b[1] ?? 0 }, widthPx });
  }, [scene, sheetModelData]);
  // the photoreal pass over the sheet's rendering: the picture goes to the app's own function
  const paintSheetView = useCallback(async (image: string): Promise<string> => {
    if (!scene) throw new Error('no scene');
    const { requestPhotoreal, describeScene } = await import('./render3d/photoreal');
    return (await requestPhotoreal({ image, view: 'aerial', style: archStyle, ...describeScene(scene) })).image;
  }, [scene, archStyle]);
  const renderSheetView = useCallback(async (widthPx: number, heightPx: number): Promise<string> => {
    const [{ renderAerialImage }, data] = await Promise.all([import('./render3d/still'), sheetModelData()]);
    return renderAerialImage({ data, widthPx, heightPx });
  }, [sheetModelData]);
  const contextState = resolveContextApplication({
    compiling: plannerLoading,
    blocked: generationBlocked,
    planStale,
    activeContext: plannerCtx,
    lineage: planLineage,
  });
  const basisSummary = useMemo(() => {
    const parts: string[] = [];
    if (displayBasis) parts.push(displayBasis.split(' · ').slice(0, 2).join(' · '));
    // the precondition a sketch rests on is part of the one-line answer, not a receipt (1289 Currey Rd, 2026-11-09)
    if (metrics?.conditional && !seedViewOn) parts.push(`conditional: ${metrics.conditional}`);
    parts.push(contextStateLabel(contextState));
    if (maxBuildout && !draftMode && maxBuildout.max_gsf > 0) {
      parts.push(`${Math.round(maxBuildout.max_gsf).toLocaleString()} GSF upper bound`);
      if (metrics?.totalBuiltSF) parts.push(`${Math.round((metrics.totalBuiltSF / maxBuildout.max_gsf) * 100)}% capture`);
    }
    return parts;
  }, [displayBasis, contextState, maxBuildout, draftMode, metrics, seedViewOn]);
  const basisTone: BasisTone =
    contextState === 'applied' || contextState === 'standards-direct' ? 'ok'
    : contextState === 'blocked' ? 'bad'
    : contextState === 'unavailable' ? 'neutral'
    : 'warn';

  // The parcel line in the canvas frame, for the access check (does a drive
  // reach the curb?).
  const parcelRing3857 = useMemo((): number[][] | null => {
    try {
      if (!parcel?.geometry) return null;
      const geom = parcel.geometry as Polygon | MultiPolygon;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
      const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
      return normalizeToPolygon(reprojected)?.coordinates?.[0] ?? null;
    } catch {
      return null;
    }
  }, [parcel?.geometry]);
  // 2026-09-04 (Eric: "random parking, with no road to get to it"): does a
  // drive reach the curb, and does one touch every bay?
  const mfAccess = useMemo(() => mfAccessSummary(displayElements, parcelRing3857), [displayElements, parcelRing3857]);

  // Test evidence hook (dev builds only): the headless battery gate reads
  // what ACTUALLY rendered — who solved it, the basis line, the violation
  // codes, the capture — instead of scraping pixels. Production bundles
  // never ship it.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __planEvidence?: object }).__planEvidence = {
      solvedBy: planLineage?.solvedBy ?? null,
      basis: planBasis,
      violationCodes: violations.map(v => v.code),
      envelopeSource: rpcMetrics?.envelopeSource ?? null,
      buildabilityVerdict: buildability?.verdict ?? null,
      suggestedTypology: buildability?.suggested_typology ?? null,
      serverPlanError,
      nonResidentialLot: nonResidentialOnly,
      planPattern: planPattern?.pattern ?? null,
      planPatternAligned: planPattern?.generator_alignment?.aligned ?? null,
      subdivisionLots: subdivisionSummary?.lots ?? null,
      subdivisionNetwork: subdivisionSummary?.network ?? null,
      subdivisionPctRow: subdivisionSummary?.pctRow ?? null,
      subdivisionPctHazard: subdivisionSummary?.pctHazard ?? null,
      subdivisionHazardCoverage: subdivisionSummary?.hazardCoverage ?? null,
      // v1.2: where the streets stop (boundary | greenway) and the held-out land they cross
      subdivisionStreetEnds: subdivisionSummary?.streetEnds ?? null,
      subdivisionCrossingFt: subdivisionSummary?.crossingFt ?? null,
      subdivisionDeclinedCrossingFt: subdivisionSummary?.declinedCrossingFt ?? null,
      subdivisionScheme: subdivisionSummary ? subdivisionScheme : null,
      // 2026-10-27 by-right subdivision (sf_v1): what the district draws, its own grade, whether an override was asked for
      sfV1: sfV1Summary
        ? {
            status: sfV1Summary.status,
            lots: sfV1Summary.lots,
            pattern: sfV1Summary.pattern,
            basis: sfV1Summary.basis,
            floodHold: sfV1Summary.floodHold,
            fails: sfV1Summary.fails,
            tests: sfV1Summary.tests.length,
            notes: sfV1Summary.notes.length,
            earthwork: !!sfV1Summary.earthwork,
            hasFlood: sfV1Summary.hasFlood,
            fillView: sfV1Summary.fillView,
            bfeContour: !!bfeContour,
            streetGradeMaxPct: sfV1Summary.streetGrade?.maxPct ?? null,
            densityDuAc: sfV1Summary.densityDuAc,
            ms: sfV1Summary.ms,
            heldLayer: displayElements.some(e => e.id.startsWith('sfv1-hold-')),
            // engine g14: the hillside hold as geometry, and what is left after every hold
            hillsideLayer: displayElements.some(e => e.id.startsWith('sfv1-hillside-')),
            hillsideAcres: sfV1Summary.hillsideAcres,
            buildableAfterHoldsAc: sfV1Summary.buildableAfterHoldsAc,
            autoBest: sfV1AutoBest,
            lotsOnHoles: sfV1HoleOverlap?.lotsOnHoles ?? null,
            shown: sfV1Shown,
            competition: sfV1Competition
              ? {
                  state: sfV1Competition.state,
                  bestRequested: sfV1Competition.data?.bestRequested ?? null,
                  bestLots: sfV1Competition.data?.bestLots ?? null,
                  structuredLots: sfV1Competition.data?.structuredLots ?? null,
                  forgone: sfV1Competition.data?.forgone ?? null,
                  verdict: sfV1Competition.data?.verdict ?? null,
                  bestBuildable: sfV1Competition.data?.bestBuildable ?? null,
                  rows: sfV1Competition.data?.rows.map(r => ({ requested: r.requested, pattern: r.pattern, lots: r.lots, fails: r.fails.length })) ?? [],
                  error: sfV1Competition.error,
                }
              : null,
          }
        : null,
      // 2026-11-04 the layout choice on multifamily land: what the sheet shows, the default and why
      layout: layoutChoice
        ? {
            shown: layoutShown,
            shownRequested: layoutShownRequested,
            defaultKind: layoutChoice.defaultKind,
            auto: layoutAuto,
            multifamilyHomes: layoutChoice.multifamilyHomes,
            neighborhoodHomes: layoutChoice.neighborhood?.homes ?? null,
            neighborhoodRequested: layoutChoice.neighborhood?.requested ?? null,
            neighborhoodBuildable: layoutChoice.neighborhood?.buildable ?? null,
            neighborhoodDrawable: layoutChoice.neighborhood?.drawable ?? null,
            densityCap: layoutChoice.densityCap,
            competitionState: sfV1Competition?.state ?? null,
            sentence: layoutChoice.sentence,
            // 0 Todd Preis Dr: the floodplain leaves no buildable piece; the hold is hatched over the multifamily plan
            floodHold: layoutChoice.floodHold,
            accessCaution: layoutChoice.accessCaution?.type ?? null,
            holdOnSheet: displayElements.some(e => e.id.startsWith('sfv1-hold-')),
          }
        : null,
      thV3: thV3OnSheet && thV3Summary
        ? {
            homes: thV3Summary.homes,
            pattern: thV3Summary.pattern,
            requiredFails: thV3Summary.requiredFails,
            homesDrawn: displayElements.filter(e => e.id.startsWith('thv3-home-')).length,
            alleys: displayElements.filter(e => e.id.startsWith('thv3-alley-')).length,
            greens: displayElements.filter(e => e.id.startsWith('thv3-green-')).length,
            overDensityBy: thV3Summary.overDensityBy,
          }
        : null,
      thV3Error,
      commercialAllowableGsf:
        nonResidentialOnly && typeof plannerCtx?.context.entitlement_capacity?.max_gfa_sqft === 'number'
          ? (plannerCtx.context.entitlement_capacity.max_gfa_sqft as number)
          : null,
      seedAvailable: quickMassingAvailable,
      seedShown: seedViewOn,
      seedComposition: seedPlan?.composition ?? null,
      neighborsLoaded: neighbors
        ? { parcels: neighbors.parcels.length, buildings: neighbors.buildings.length, roads: neighbors.roads.length }
        : null,
      // 2026-09-04 civil sheet: the topography that rendered and what was written on the plan
      topoLoaded: topoCanvas
        ? {
            source: topoCanvas.source,
            samples: topo?.n_samples ?? topo?.samples.length ?? 0,
            contours: topoCanvas.contours.length,
            zMinFt: topoCanvas.zMinFt,
            zMaxFt: topoCanvas.zMaxFt,
            meanSlopePct: topoCanvas.meanSlopePct,
          }
        : null,
      sheetAnnotations: {
        stations: sheetAnnotations.filter(a => a.kind === 'station').length,
        spots: sheetAnnotations.filter(a => a.kind === 'spot').length,
        labels: sheetAnnotations.filter(a => a.kind === 'label' || a.kind === 'radius').length,
      },
      profileStreets: streetProfiles.length,
      sheetTitle: sheetTitle.title,
      // the drawing scene (2026-11-11): what the plan, the 3D view and the sheets all read
      scene: sceneEvidence(scene),
      sceneSelection: sceneSelectedIds,
      mfAccess,
      // 2026-11-09 (the scope's P0.2): the precondition the sketched plan rests on, if any.
      conditional: metrics?.conditional ?? null,
      spOrdinance: spOrdinance ? { ordinance: spOrdinance.ordinance, caseNo: spOrdinance.caseNo } : null,
      // the tasks, each with its own state and last duration (ms); a terminal
      // state for every one, so "generating" and an error never coexist
      tasks: {
        context: { state: plannerLoading ? 'working' : compileBlocked ? 'blocked' : spOrdinance ? 'unsupported' : plannerCtx ? 'done' : unsupportedUse ? 'unsupported' : 'none', reason: compileBlocked ?? (spOrdinance ? `sp_ordinance_not_loaded:${spOrdinance.ordinance ?? ''}` : null), ms: taskTimingsRef.current.compileMs },
        terrain: { state: topo ? 'done' : 'none', ms: null },
        lotFit: { state: isGeneratingLots ? 'working' : sfPlanOnSheet ? 'done' : sfV1Summary?.status === 'skipped' ? 'skipped' : 'none', reason: sfV1Summary?.status === 'skipped' ? sfV1Summary.reason : null, ms: taskTimingsRef.current.lotFitMs },
        massing: { state: isGenerating ? 'working' : serverPlanError ? 'failed' : displayElements.some(e => isMfPlanElement(e)) ? 'done' : 'none', reason: serverPlanError, ms: taskTimingsRef.current.massingMs },
      },
      taskTimingsVersion,
      // every element on the sheet by id, name and type: what the labels are made of
      elementIndex: displayElements.map(e => ({ id: e.id, name: e.name, type: e.type })),
      unsupportedUse,
      // 2026-11-09 (the scope's P0.1): the figures every surface must agree on —
      // the engine's unit count, the drawn buildings' mix summed, the stalls the
      // bays hold against the engine's summary, and the requirement.
      mfTabulation: metrics && displayElements.some(e => isMfPlanElement(e))
        ? {
            units: metrics.totalUnits ?? null,
            mixUnits: displayElements
              .filter(e => e.type === 'building' && isMfPlanElement(e) && (e.properties?.use ?? 'residential') === 'residential')
              .reduce((s, b) => s + ((b.properties?.unitMix as Array<{ count?: number }> | undefined) ?? []).reduce((t, r) => t + (r.count ?? 0), 0), 0),
            stallsProvided: metrics.stallsProvided ?? null,
            stallsRequired: metrics.stallsRequired ?? null,
            stallsDrawn: metrics.stallsDrawn ?? null,
            stallsReported: metrics.stallsReported ?? null,
            parkingStatus: metrics.parkingStatus ?? null,
            bayStalls: displayElements
              .filter(e => e.type === 'parking' && isMfPlanElement(e))
              .reduce((s, p) => s + (typeof p.properties?.parkingSpaces === 'number' ? (p.properties.parkingSpaces as number) : 0), 0),
          }
        : null,
      utilizationPct:
        !draftMode && maxBuildout && maxBuildout.max_gsf > 0 && metrics?.totalBuiltSF
          ? Math.round((metrics.totalBuiltSF / maxBuildout.max_gsf) * 1000) / 10
          : null,
    };
  }, [planLineage, planBasis, violations, metrics, maxBuildout, draftMode, rpcMetrics, buildability, neighbors, seedPlan, quickMassingAvailable, seedViewOn, spOrdinance, unsupportedUse, taskTimingsVersion, plannerLoading, compileBlocked, plannerCtx, isGenerating, isGeneratingLots, sfPlanOnSheet, serverPlanError, subdivisionSummary, subdivisionScheme, sfV1Summary, bfeContour, sfV1Shown, sfV1Competition, sfV1AutoBest, sfV1HoleOverlap, layoutChoice, layoutShown, layoutShownRequested, layoutAuto, thV3OnSheet, thV3Summary, thV3Error, displayElements, topo, topoCanvas, sheetAnnotations, streetProfiles, sheetTitle, mfAccess, scene, sceneSelectedIds]);

  const plannerParcel = isValidParcel(parcel)
    ? parcel
    : createFallbackParcel(parcel.ogc_fid || parcel.id || 'unknown', parcel.sqft || 4356);

  // historyVersion re-renders this component whenever the undo stacks change
  const canUndo = historyVersion >= 0 && pastRef.current.length > 0;
  const canRedo = historyVersion >= 0 && futureRef.current.length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-100">
      <CensusBanner />
      {/* Order-8: on a commercial-only lot the multifamily refusal (and its
          "draw the house" switch) is the wrong conversation — no residential
          use is permitted. The capacity card carries the deal number instead. */}
      {nonResidentialOnly && plannerCtx && (
        <CommercialCapacityCard
          zoning={(parcel.zoning as string | undefined) ?? plannerCtx.context.zoning_base ?? null}
          uses={permittedUses}
          lotSqft={
            typeof plannerCtx.context.entitlement_capacity?.lot_sqft === 'number'
              ? (plannerCtx.context.entitlement_capacity.lot_sqft as number)
              : null
          }
          maxFar={plannerCtx.solver_brief.hard_constraints.max_far ?? null}
          maxHeightFt={plannerCtx.solver_brief.hard_constraints.max_height_ft ?? null}
          maxImperviousPct={plannerCtx.solver_brief.hard_constraints.max_impervious_pct ?? null}
          frontSetbackFt={plannerCtx.solver_brief.hard_constraints.front_setback_ft ?? null}
          rearSetbackFt={plannerCtx.solver_brief.hard_constraints.rear_setback_ft ?? null}
          allowableGsf={
            typeof plannerCtx.context.entitlement_capacity?.max_gfa_sqft === 'number'
              ? (plannerCtx.context.entitlement_capacity.max_gfa_sqft as number)
              : null
          }
        />
      )}
      {spOrdinance && (
        <div data-testid="sp-ordinance" className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">
            Specific Plan{spOrdinance.district ? ` · ${spOrdinance.district}` : ''} — uses and standards are set by {spOrdinance.ordinance ?? 'its SP ordinance'}{spOrdinance.caseNo ? ` (${spOrdinance.caseNo})` : ''}, which is not loaded.
          </div>
          <div className="mt-1 text-xs text-amber-800">
            {spOrdinance.reason ?? 'No as-of-right use can be resolved from the district alone.'} Nothing is compiled or drawn from the base code: a plan here waits for the ordinance to be loaded into the engine.
          </div>
        </div>
      )}
      {unsupportedUse && !nonResidentialOnly && (() => {
        // the ordinance caps the parcel row carries (the compiler is not asked for a use it cannot type)
        const row = parcel as unknown as Record<string, unknown>;
        const num = (k: string): number | null => (typeof row[k] === 'number' && Number.isFinite(row[k] as number) ? (row[k] as number) : null);
        const lotSqft = num('sqft') ?? (num('deeded_acres') != null ? Math.round((num('deeded_acres') as number) * 43560) : null);
        const maxFar = num('max_far');
        const label = unsupportedUse.replace(/_/g, ' ');
        return (
          <div data-testid="unsupported-use">
            <CommercialCapacityCard
              zoning={(parcel.zoning as string | undefined) ?? null}
              uses={permittedUses.filter(u => NON_RESIDENTIAL_USES.has(u))}
              residentialPermitted={permittedUses.filter(u => /multi_family|multifamily|two_family|single_family/.test(u))}
              lotSqft={lotSqft}
              maxFar={maxFar}
              maxHeightFt={null}
              maxImperviousPct={num('max_impervious_coverage_pct')}
              frontSetbackFt={num('min_front_setback_ft')}
              rearSetbackFt={num('min_rear_setback_ft')}
              allowableGsf={lotSqft != null && maxFar != null ? Math.round(lotSqft * maxFar) : null}
            />
            <div data-testid="unsupported-use-note" className="mx-4 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">{label.charAt(0).toUpperCase() + label.slice(1)} is permitted here, but no massing engine draws {label} geometry yet.</span>{' '}
              The capacity card above is the ordinance arithmetic (lot area × FAR), not a plan. To draw a plan, pick a residential use the district permits
              {permittedUses.some(u => /multi_family|multifamily/.test(u)) ? ' (multi-family is permitted here, with conditions)' : ''} in the use selector.
            </div>
          </div>
        );
      })()}
      {!nonResidentialOnly && !unsupportedUse && isRefusal(buildability) && product === 'apartments' && buildability && layoutShown !== 'neighborhood' && (
        <RefusalCard
          buildability={buildability}
          onSwitchToTownhomes={() => handleProductChange('townhomes')}
          onDrawSfSeed={
            buildability.suggested_typology === 'single_family' &&
            (permittedUses.length === 0 || permittedUses.includes('single_family'))
              ? handleDrawSfSeed
              : undefined
          }
        />
      )}
      {/* Order-6 item 5c: a failed server plan is an ERROR CARD naming its
          cause + Retry — never an improvised worker plan. Distinct from the
          compile-blocked Retry screen (context unknown) and the generation-
          blocked banner (use not permitted): this is "the rules are known,
          the massing engine failed". */}
      {serverPlanError && !compileBlocked && !unsupportedUse && (
        <div
          data-testid="server-plan-error"
          className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <div className="font-semibold">Server plan failed</div>
          <div className="mt-1 text-xs text-red-800">{serverPlanError}</div>
          <button
            type="button"
            data-testid="server-plan-retry"
            onClick={() => {
              setServerPlanError(null);
              setIsGenerating(true);
              runServerMfPlan({ seed: mfSeedRef.current, pins: mfPinsRef.current })
                .then(ok => {
                  if (!ok) {
                    setServerPlanError(serverFailCauseRef.current ?? 'The massing service did not respond.');
                  }
                })
                .catch(() => setServerPlanError(serverFailCauseRef.current ?? 'The massing service did not respond.'))
                .finally(() => setIsGenerating(false));
            }}
            className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}
      {/* Live KPI bar — always visible, ticks during drags/slider moves */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <KpiStrip
          metrics={metrics}
          investment={investmentAnalysis}
          money={serverMoney}
          planFlags={planLineage?.flags ?? []}
          unverified={contextState === 'unavailable' || contextState === 'stale' ? contextStateLabel(contextState) : contextState === 'compiling' ? 'context still compiling' : null}
          empty={
            isGenerating || isGeneratingLots
              ? { state: 'generating' }
              : spOrdinance
                ? { state: 'blocked', reason: `Specific Plan ordinance ${spOrdinance.ordinance ?? ''}${spOrdinance.caseNo ? ` (${spOrdinance.caseNo})` : ''} is not loaded; no as-of-right use resolves from the district alone`.replace('  ', ' ') }
              : unsupportedUse
                ? { state: 'blocked', reason: `no massing engine draws ${unsupportedUse.replace(/_/g, ' ')} geometry; the capacity card carries the ordinance caps. Pick a residential use to draw a plan` }
              : serverPlanError
                ? { state: 'failed', reason: serverPlanError }
                : compileBlocked || generationBlocked
                  ? { state: 'blocked', reason: compileBlocked ?? 'the selected use is not permitted as-of-right' }
                  : { state: 'none' }
          }
          subdivision={
            thV3OnSheet && thV3Summary
              ? { lots: thV3Summary.homes, densityDuAc: thV3Summary.homesPerAcre, fails: thV3Summary.requiredFails, status: 'done', label: 'Townhomes', densityLabel: 'homes / ac' }
              : sfV1Summary && !displayElements.some(e => e.id.startsWith('sfseed-'))
              ? { lots: sfV1Summary.lots, densityDuAc: sfV1Summary.densityDuAc, fails: sfV1Summary.fails, status: sfV1Summary.status, tests: sfV1Summary.tests.map(t => t.id), offParcelLots: sfV1HoleOverlap?.lotsOnHoles ?? null, unplannedAcres: sfV1Summary.remainder?.acres ?? null }
              : legacyLots != null
              // the legacy lot generator's answer: a lot count, provisional (no code tests ran on it)
              ? { lots: legacyLots, densityDuAc: mappedAcres && mappedAcres > 0 ? Math.round((legacyLots / mappedAcres) * 100) / 100 : null, fails: [], status: 'done', legacy: true }
              : null
          }
          utilizationPct={
            !draftMode && maxBuildout && maxBuildout.max_gsf > 0 && metrics?.totalBuiltSF
              ? (metrics.totalBuiltSF / maxBuildout.max_gsf) * 100
              : null
          }
        />
        <div className="flex items-center gap-2 flex-shrink-0">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={undo}
            disabled={!canUndo}
            title={canUndo ? 'Undo (Ctrl+Z)' : 'Undo (Ctrl+Z) — applies to local-engine edits; server schemes have their history in the rail'}
            className="px-2.5 py-1.5 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="px-2.5 py-1.5 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed border-l border-gray-200"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm flex-shrink-0">
          <button
            onClick={() => setViewMode('2d')}
            className={`px-3 py-1.5 ${viewMode === '2d' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            2D Plan
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={`px-3 py-1.5 border-l border-gray-200 ${viewMode === '3d' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            3D Massing
          </button>
          {quickMassingAvailable && (
            <button
              data-testid="seed-toggle"
              onClick={() => setShowSeed(v => !v)}
              title="Quick massing: the engine's fast first-pass composition (zones, access spine, parking bays, one connected bar) that the full solve starts from. Not the solved plan."
              className={`px-3 py-1.5 border-l border-gray-200 ${showSeed ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Quick massing
            </button>
          )}
          {topo && (
            <button
              data-testid="topo-toggle"
              onClick={() => setShowTopo(v => !v)}
              title={`Existing contours — ${topo.source ?? 'USGS 3DEP 1 m DEM'}, 1-ft interval (index 5 ft), NAVD88`}
              className={`px-3 py-1.5 border-l border-gray-200 ${showTopo ? 'bg-amber-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Topo
            </button>
          )}
        </div>
        <button
          onClick={openExport}
          disabled={!metrics || draftMode || !!compileBlocked}
          title={
            !metrics
              ? 'Generate a plan first'
              : draftMode || compileBlocked
                ? 'Reports are only produced from context-verified plans'
                : 'Print-ready scheme report with plan, tabulation, and solver receipts'
          }
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export
        </button>
        {!classicDrawing && (
          <button
            data-testid="open-sheets"
            onClick={() => setSheetsOpen(true)}
            disabled={!scene || draftMode || !!compileBlocked}
            title={
              !scene
                ? 'Nothing is drawn on the sheet yet'
                : draftMode || compileBlocked
                  ? 'Sheets are only produced from context-verified plans'
                  : 'Exhibit sheets as vector drawings at page size: A-01 Site Plan'
            }
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sheets
          </button>
        )}
        </div>
      </div>

      {/* What is being built, in one plain sentence, before any receipt: the
          solver's basis line below it is the audit trail, not the answer. */}
      {!seedViewOn && <BuiltHeadline metrics={metrics} elements={elements} />}
      {/* 2026-09-04 (Eric, 2622 W Heiman: "difficult to see the site planner,
          there is a ton of data"): the basis line, the context lineage, the
          highest-and-best comparator and the buildout ladder fold into ONE
          row that opens on demand — the canvas is the page. A blocked or
          stale state opens the row itself. */}
      {(displayBasis || plannerCtx || plannerLoading || planStale || generationBlocked || (maxBuildout && !draftMode)) && (
        <PlanBasisDisclosure
          summary={basisSummary}
          tone={basisTone}
          forceOpen={contextState === 'blocked' || contextState === 'stale'}
        >
          {displayBasis && (
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">{seedViewOn ? 'Quick massing basis:' : 'Plan basis:'}</span> {displayBasis}
            </div>
          )}
          <ContextLineage
            state={contextState}
            activeContext={plannerCtx}
            lineage={planLineage}
            blockedReason={physicalBlockReason
              ? `The site is not developable as mapped: ${physicalBlockReason}. "${contextUse.replace(/_/g, ' ')}" itself is permitted here.`
              : `"${contextUse.replace(/_/g, ' ')}" is not permitted as-of-right on this parcel. Pick a permitted use in the Design Context panel.`}
          />
          {/* Draft plans never wear the authoritative Max-GSF dressing — a
              degraded solve reporting achievable-GSF capture is exactly the
              "broken plan in current dress" failure. */}
          {contextOgcFid != null && permittedUses.length > 1 && !draftMode && !compileBlocked && (
            <HbuStrip
              ogcFid={contextOgcFid}
              uses={permittedUses}
              activeUse={contextUse}
              onSelectUse={handleUseChange}
            />
          )}
          {maxBuildout && !draftMode && (
            <MaxBuildoutHeadline
              buildout={maxBuildout}
              achievedGsf={metrics?.totalBuiltSF ?? null}
              currentStories={planLineage?.floors ?? null}
              optimizationStatus={metrics?.optimizationStatus ?? null}
              optimizationProof={metrics?.optimizationProof ?? null}
              constructionType={massingProg?.construction_type ?? null}
            />
          )}
        </PlanBasisDisclosure>
      )}

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-4 p-4 overflow-auto xl:overflow-hidden">
        {!leftRailCollapsed && (
        <div className="w-full xl:w-80 flex-shrink-0 xl:min-h-0 xl:overflow-y-auto space-y-4">
          {isRmLayout && (
            <LayoutChoicePanel
              choice={layoutChoice}
              competition={sfV1Competition}
              shown={layoutShown}
              shownRequested={layoutShownRequested}
              auto={layoutAuto}
              busy={isGeneratingLots || isGenerating}
              onChoose={handleLayoutChoose}
              onViewCandidate={handleViewNeighborhood}
              onRetry={() => { if (contextOgcFid != null) runLayoutCompetition(contextOgcFid); }}
              thV3={thV3OnSheet ? thV3Summary : null}
              thV3Error={thV3Error}
            />
          )}
          {planPattern && (
            <PlanPatternPanel
              plan={planPattern}
              drawn={thV3OnSheet && thV3Summary
                ? {
                    label: `${thV3Summary.homes} townhomes${thV3Summary.pattern ? ` (${thV3Summary.pattern})` : ''}`,
                    source: 'the townhome engine (th_v3): the neighborhood layout, attached homes by right',
                    chip: 'drawn by right',
                  }
                : sfV1Summary && displayElements.some(e => e.id.startsWith('sfseed-'))
                ? { label: 'One house on the lot', source: 'the single-family seed (sf_seed_v1) on a parcel the by-right generator gives no new lots' }
                : sfV1Summary
                ? {
                    label: sfV1Summary.status === 'skipped'
                      ? 'By-right subdivision skipped'
                      : sfV1Summary.lots === 0
                        ? 'No new lots by right — the parcel is one lot'
                        : `${sfV1Summary.lots} lot${sfV1Summary.lots === 1 ? '' : 's'}${patternPhrase(sfV1Summary.pattern)}`,
                    source: 'the by-right subdivision generator (sf_v1), from the district\'s own standards',
                    chip: sfV1Summary.basis === 'override' ? 'drawn as an override' : 'drawn by right',
                  }
                : null}
            />
          )}
          {subdivisionSummary && (
            <SubdivisionPanel
              summary={subdivisionSummary}
              scheme={subdivisionScheme}
              onScheme={handleSubdivisionScheme}
              busy={isGeneratingLots}
            />
          )}
          {sfV1Summary && (
            <SfV1Panel
              summary={sfV1Summary}
              override={sfV1Override}
              // on multifamily land the lot fit routes to the townhome engine: no override re-runs here
              onOverride={isRmLayout ? undefined : handleSfV1Override}
              busy={isGeneratingLots || isGenerating}
              onDrawHouse={handleDrawSfSeed}
              houseDrawn={displayElements.some(e => e.id.startsWith('sfseed-'))}
              houseError={sfSeedError}
              competition={isRmLayout ? null : sfV1Competition}
              deepSearch={isRmLayout ? null : sfV1Deep}
              shownRequested={sfV1Shown}
              onViewCandidate={(r: string) => { void handleViewSfV1Candidate(r); }}
              onRetryCompetition={handleRunCompetition}
              terrain={topoCanvas ? {
                meanSlopePct: topoCanvas.meanSlopePct,
                maxSlopePct: topoCanvas.maxSlopePct,
                fallFt: topoCanvas.zMinFt != null && topoCanvas.zMaxFt != null ? topoCanvas.zMaxFt - topoCanvas.zMinFt : null,
              } : null}
              site={sfV1Site || mappedAcres != null ? { heldAcres: sfV1Site?.heldAcres ?? null, siteAcres: sfV1Site?.siteAcres ?? null, parcelAcres: mappedAcres } : null}
              autoBest={sfV1AutoBest}
              holeOverlap={sfV1HoleOverlap}
              frontageLandlocked={noStreetAccess}
            />
          )}
          <ContextPanel
            context={plannerCtx ? plannerContextToDesignContext(plannerCtx) : null}
            precedent={plannerCtx?.solver_brief.precedent_priors}
            pricing={plannerCtx?.context.market}
            contextSummary={plannerCtx ? plannerContextSummary(plannerCtx) : null}
            loading={plannerLoading}
            unsupportedUse={unsupportedUse}
            noContextReason={
              spOrdinance
                ? `No compiled context: this Specific Plan's uses are set by ${spOrdinance.ordinance ?? 'its ordinance'}${spOrdinance.caseNo ? ` (${spOrdinance.caseNo})` : ''}, which is not loaded.`
                : compileBlocked && sfPlanOnSheet
                  ? `The massing context compile failed; the by-right result on the sheet stands on the district's standards directly. Retry the context from the banner on the canvas.`
                  : null
            }
            uses={permittedUses}
            use={contextUse}
            onUseChange={handleUseChange}
            generationBlocked={generationBlocked}
            blockedMessage={physicalBlockReason ? `Generation is blocked because the site is not developable as mapped: ${physicalBlockReason}. The use is permitted; another use would not change it.` : null}
          />
          <ParametersPanel
            parcel={parcel}
            config={config}
            onConfigChange={updateConfig}
            rpcMetrics={rpcMetrics}
            status={status}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onGenerateAlternatives={handleGenerate}
            onGenerateLots={plannerCtx?.context.typology === 'multifamily' ? undefined : handleGenerateLots}
            isGeneratingLots={isGeneratingLots}
            lotFitSummary={lotFitSummary}
            staticPlan={planModeRef.current === 'sf' || planModeRef.current === 'mf-server'}
            resolvedTypology={plannerCtx?.context.typology ?? null}
            product={product}
            onProductChange={plannerCtx?.context.typology === 'multifamily' ? handleProductChange : undefined}
            alternatives={alternatives}
            alternativeScores={solveScores}
            rejectedSolves={solveRejected}
            selectedSolveIndex={selectedSolveIndex}
            onSelectSolve={selectSolve}
            savedPlans={savedPlans}
            savedPlansLoading={savedPlansLoading}
            savedPlansError={savedPlansError}
            onSavePlan={handleSavePlan}
            onLoadPlan={handleLoadPlan}
            onDeletePlan={deletePlanFromDb}
            onToggleFavorite={togglePlanFavorite}
            currentElements={elements}
            currentMetrics={metrics}
            currentViolations={violations}
            currentInvestment={investmentAnalysis}
          />
        </div>
        )}

        {/* Canvas column (3b): the plan is the workspace — the canvas takes
            every pixel the rails give back, and reporting docks beneath it. */}
        <div className="flex-1 min-w-0 flex flex-col xl:min-h-0">
        <div className="flex-1 min-w-0 min-h-[420px] xl:min-h-0 relative">
          <button
            type="button"
            onClick={() => setLeftRailCollapsed(c => !c)}
            title={leftRailCollapsed ? 'Show the inspector: layout, context and parameters' : 'Hide the inspector and give the drawing the room'}
            data-testid="inspector-toggle" aria-expanded={!leftRailCollapsed}
            className={`absolute ${viewMode === '3d' ? 'top-12 left-2' : 'top-5 left-44'} z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-white/95 border border-gray-200 text-xs font-medium text-gray-600 hover:text-gray-900 shadow-sm`}
          >
            {leftRailCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {leftRailCollapsed && <span>Inspector</span>}
          </button>
          {accessNote && !draftMode && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-orange-50 border border-orange-300 text-orange-800 text-xs font-medium rounded-md px-3 py-1.5 shadow-sm"
              data-testid="landlocked-banner" data-access-type={engineAccess?.type ?? 'frontage-layer'} title={accessNote.detail ?? undefined}
            >
              {accessNote.text}
            </div>
          )}
          {draftMode && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-amber-50 border border-amber-300 text-amber-800 text-xs font-medium rounded-md px-3 py-1.5 shadow-sm">
              <span>Using standard defaults — design context unavailable. Plan is a draft and won't be saved.</span>
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => {
                  markDraft(false);
                  hasAutoGeneratedRef.current = false;
                  setCompileNonce(n => n + 1);
                }}
              >
                Retry
              </button>
            </div>
          )}
          {plannerLoading && elements.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-[1px]">
              <div className="w-10 h-10 rounded-full border-[3px] border-blue-200 border-t-blue-600 animate-spin" />
              <div className="text-sm text-gray-700">
                Compiling context{parcel.address ? ` for ${parcel.address}` : ''}…
              </div>
              <div className="text-[11px] text-gray-400">ordinance · precedents · market comps</div>
            </div>
          )}
          {viewMode === '3d' ? (
            // its own key: React would otherwise keep the boundary instance
            // (and its caught error) across the 3D → 2D switch, so "Back to
            // 2D" landed on the same fallback under the 2D copy
            <SitePlannerErrorBoundary
              key="massing-3d"
              title="The 3D view failed"
              description="The 2D plan, its schedule, your selection and edits are intact."
              retryLabel="Retry 3D"
              onBackTo2D={() => setViewMode('2d')}
            >
              <React.Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-gray-500">Loading 3D…</div>}>
              <Massing3D
                elements={displayElements}
                parcelGeometry={plannerParcel?.geometry as import('geojson').Polygon | import('geojson').MultiPolygon | undefined}
                envelope={envelopeMeters ?? undefined}
                neighbors={neighbors}
                edgeClassifications={edgeClassifications}
                scene={scene}
                selectedId={sceneSelectedIds.length === 1 ? sceneSelectedIds[0] : null}
                onSelect={scene ? (id => handleSceneSelection(id ? [id] : [])) : undefined}
              />
              </React.Suspense>
            </SitePlannerErrorBoundary>
          ) : (
            <SitePlannerErrorBoundary key="plan-2d">
              <EnterpriseSitePlanner
                draftMode={draftMode}
                suppressCurbCut={noStreetAccess}
                neighbors={neighbors}
                topo={showTopo ? topoCanvas : null}
                annotations={sheetAnnotations}
                sheet={sheetTitle}
                scene={scene}
                initialSelectedIds={sceneSelectedIds}
                onSelectionChange={scene ? handleSceneSelection : undefined}
                parcel={plannerParcel}
                planElements={displayElements}
                metrics={metrics || undefined}
                selectedSolve={selectedSolve || undefined}
                parkingViz={{
                  angleDeg: metrics?.parkingAngleDeg ?? 0,
                  stallWidthFt: config.designParameters.parking.stallWidthFt,
                  stallDepthFt: config.designParameters.parking.stallDepthFt,
                  aisleWidthFt: config.designParameters.parking.aisleWidthFt
                }}
                buildableEnvelope={envelopeMeters || undefined}
                edgeClassifications={edgeClassifications}
                setbacks={rpcMetrics?.setbacks}
                onBuildingUpdate={handleBuildingUpdate}
                onAddBuilding={handleAddBuilding}
                onDeleteBuildings={handleDeleteBuildings}
                onCloneBuildings={handleCloneBuildings}
                staticPlan={planModeRef.current === 'sf' || planModeRef.current === 'mf-server'}
                envelopeStatus={status}
                envelopeError={envelopeError}
                usingFallbackEnvelope={usingFallbackEnvelope}
                onRetryEnvelope={() => {
                  // Force re-fetch by clearing the ref and triggering useEffect
                  // The hook will re-fetch when parcel.ogc_fid changes or ref is cleared
                  window.location.reload();
                }}
              />
            </SitePlannerErrorBoundary>
          )}
          {/* ENTERPRISE TRUST GATE: no compiled context → the canvas is
              blocked outright. Whatever numbers a context-free solve would
              show cannot be traced to an ordinance, so nothing is shown.
              (Covers the 3D view too — same container.) */}
          {compileBlocked && sfPlanOnSheet && (
            // A finished lot-fit result stays readable when the massing
            // context fails: the block is a banner, not a curtain (0 W
            // Trinity Ln, the cohort retest: the overlay dimmed the zero-lot
            // answer and its flood overlay).
            <div data-testid="compile-blocked-banner" className="absolute left-3 right-3 top-12 z-30 rounded-md border border-slate-300 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 flex items-center gap-3">
              <span className="flex-1">Massing context unavailable — {compileBlocked} The by-right result below is complete and stands on the district's standards.</span>
              <button
                type="button"
                className="px-2.5 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
                onClick={() => { markCompileBlocked(null); hasAutoGeneratedRef.current = false; setCompileNonce(n => n + 1); }}
              >
                Retry context
              </button>
            </div>
          )}
          {compileBlocked && !sfPlanOnSheet && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-900/85 text-center px-8 rounded-lg">
              <div className="text-white text-base font-semibold">
                Massing blocked — zoning context unavailable
              </div>
              <div className="text-slate-300 text-sm max-w-md">
                {compileBlocked} Plans here are only drawn from a verified
                ordinance context — every number must trace to its source, so
                nothing renders without one.
              </div>
              <button
                type="button"
                className="mt-1 px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                onClick={() => {
                  markCompileBlocked(null);
                  hasAutoGeneratedRef.current = false;
                  setCompileNonce(n => n + 1);
                }}
              >
                Retry context compile
              </button>
            </div>
          )}
        </div>

        {/* Docked reporting tabs (3b) — tabulation | schemes | flags | results */}
        <div data-testid="dock" data-open={dockOpen ? 'true' : 'false'} className="mt-3 flex-shrink-0 bg-white border border-gray-200 rounded-lg flex flex-col max-h-72">
          <div className="flex items-center border-b border-gray-100 flex-shrink-0">
            {([
              { key: 'tabulation', label: 'Tabulation', badge: null, alert: false },
              { key: 'schemes', label: 'Schemes', badge: mfCandidates.length || null, alert: false },
              {
                key: 'flags',
                label: 'Flags',
                badge:
                  (violations.length + (planLineage?.flags?.length ?? 0) + (solveRejected ? 1 : 0)) || null,
                alert: violations.some(v => v.severity === 'error'),
              },
              { key: 'results', label: 'Results', badge: null, alert: false },
              { key: 'profile', label: 'Profile', badge: streetProfiles.length || null, alert: false },
            ] as const).map(t => (
              <button
                key={t.key}
                data-testid={`dock-tab-${t.key}`}
                aria-expanded={dockOpen && dockTab === t.key}
                // a tab opens its panel; the open tab, pressed again, closes it and gives the drawing the room
                onClick={() => { if (dockOpen && dockTab === t.key) setDockOpen(false); else { setDockTab(t.key); setDockOpen(true); } }}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
                  dockOpen && dockTab === t.key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
                {t.badge != null && (
                  <span
                    className={`text-[10px] tabular-nums rounded-full px-1.5 py-px ${
                      t.alert ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className={dockOpen ? 'min-h-0 overflow-y-auto' : 'hidden'}>
            {dockTab === 'tabulation' && (
              <TabulationPanel
                elements={displayElements}
                // the quick massing tabulates its own mix; the solved plan's metrics are not its totals
                metrics={seedViewOn ? null : metrics}
                plannerCtx={plannerCtx}
                // the same acres the header and the sheets divide by
                acres={mappedAcres ?? parcel.deeded_acres}
              />
            )}
            {dockTab === 'schemes' && (
              <SchemesRail
                candidates={mfCandidates}
                activeId={activeCandidateId}
                onView={handleViewCandidate}
                busy={isGenerating || isGeneratingLots}
                activeContextId={plannerCtx?.context_id ?? null}
                onRegenerateWithCurrentContext={handleRegenerateCandidate}
                maxGsf={maxBuildout?.max_gsf ?? null}
                onUnderwrite={handleUnderwriteCandidate}
                onCompare={setComparing}
              />
            )}
            {dockTab === 'flags' && (
              <FlagsPanel
                violations={violations}
                lineageFlags={planLineage?.flags ?? []}
                rejected={solveRejected}
                proof={metrics?.optimizationProof ?? null}
                regimeComparison={metrics?.regimeComparison ?? null}
              />
            )}
            {dockTab === 'results' && (
              <ResultsPanel
                metrics={metrics}
                investmentAnalysis={investmentAnalysis}
                isGenerating={isGenerating}
                violations={violations}
              />
            )}
            {dockTab === 'profile' && <StreetProfilePanel profiles={streetProfiles} topo={topo} />}
          </div>
        </div>
        </div>
      </div>
      {comparing && parcelRing3857 && (
        <SchemeCompare
          schemes={comparing.map(c => ({ candidate: c, name: schemeNames(mfCandidates).get(c.id) ?? 'Scheme' }))}
          parcelRing={parcelRing3857}
          load={loadCompareDrawing}
          activeId={activeCandidateId}
          onView={handleViewCandidate}
          onUnderwrite={handleUnderwriteCandidate}
          onClose={() => setComparing(null)}
        />
      )}
      {sheetsOpen && scene && (
        <ExhibitSheets scene={scene} title={sheetsTitle} onClose={() => setSheetsOpen(false)} renderUnderlay={renderSheetUnderlay} renderView={renderSheetView} photoreal={paintSheetView} look={archStyle} />
      )}
      {exportOpen && (
        <ExportReport
          address={parcel.address ?? parcelIdStr}
          zoning={(parcel.zoning as string | undefined) ?? null}
          planPng={exportPng}
          planBasis={planBasis}
          metrics={metrics}
          elements={displayElements}
          buildout={maxBuildout}
          currentStories={planLineage?.floors ?? null}
          plannerCtx={plannerCtx}
          violations={violations}
          lineageFlags={planLineage?.flags ?? []}
          acres={parcel.deeded_acres ?? null}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
};

export default SiteWorkspace;
