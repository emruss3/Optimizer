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
import Massing3D from './ui/Massing3D';
import KpiStrip from './ui/KpiStrip';
import ContextPanel from './ui/ContextPanel';
import { CensusBanner } from './ui/CensusBanner';
import { routesToLotFit, fetchPermittedUses, normalizePermittedUses, pickDefaultUse, defaultUseFromZoningBase, type DesignContext } from './api/designContext';
import { generateSfSitePlan, sfPlanToElements, isSfPlanElement } from './api/generateSfPlan';
import { generateMfSitePlan, generateMfSitePlanV2, generateThSitePlan, mfPlanToElements, isMfPlanElement, isContextContractError, listMfCandidates, fetchMfMoney, enrichCandidatesWithMoney, type MfCandidate, type MfPin, type MfMoney } from './api/generateMfPlan';
import { validatePlanElements } from '../../engine/validatePlan';
import TabulationPanel from './ui/TabulationPanel';
import FlagsPanel from './ui/FlagsPanel';
import HbuStrip from './ui/HbuStrip';
import ExportReport from './ui/ExportReport';
import MaxBuildoutHeadline from './ui/MaxBuildoutHeadline';
import { fetchMaxBuildout, type MaxBuildout } from './api/maxBuildout';
import { fetchPlannerNeighbors, type PlannerNeighbors } from './api/neighbors';
import {
  compilePlannerContext,
  plannerContextToDesignContext,
  plannerContextSummary,
  briefToZoningPatch,
  briefToParkingPatch,
  briefToWorkerBrief,
  describeContextFlag,
  type PlannerContextResponse,
} from './api/plannerContext';
import { fetchParcelFrontage, type ParcelFrontage } from './api/parcelFrontage';
import { fetchParcelBuildability, isRefusal, type ParcelBuildability } from './api/parcelBuildability';
import { fetchSeedPlan, type SeedPlan } from './api/seedPlan';
import { seedToElements } from '../../engine/seedToElements';
import { RefusalCard } from './ui/RefusalCard';
import { fetchMassingProgram, type MassingProgram } from './api/massingProgram';
import { recordPlannerFeedback } from './api/plannerFeedback';
import ContextLineage, { resolveContextApplication, type PlanLineage } from './ui/ContextLineage';
import SchemesRail from './ui/SchemesRail';
import { useSitePlans } from '../../hooks/useSitePlans';
import type { SavedSitePlan } from '../../lib/sitePlanStorage';

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
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [dockTab, setDockTab] = useState<'tabulation' | 'schemes' | 'flags' | 'results'>('tabulation');
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
    if (violations.some(v => v.severity === 'error')) setDockTab('flags');
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
  const [lotFitSummary, setLotFitSummary] = useState<string | null>(null);

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
  // J1: the engine's buildability verdict — a refused parcel is a first-class
  // result (RefusalCard), fetched the moment the parcel opens.
  const [buildability, setBuildability] = useState<ParcelBuildability | null>(null);
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
    // Townhomes have no legacy fallback: silently rendering apartments in
    // their place would misrepresent the selected product.
    if (!resp && effectiveProduct === 'townhomes') return false;
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
          // The massing SERVICE is unreachable but the compiled context is in
          // hand — return false so the caller's worker fallback solves on the
          // SAME brief (worker parity). That path is grounded, not degraded.
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
    }
    if (!resp || !resp.buildings || resp.buildings.length === 0) return false;
    const mapped = mfPlanToElements(resp);

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
      return false;
    }
    serverGeoRetryRef.current = false;
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
      buildings: mNum(resp.metrics?.bars),
      floors: mNum(resp.metrics?.floors),
      footprintSqft: mNum(resp.metrics?.footprint_sqft),
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
          // Service unreachable mid-session: the CURRENT plan stays exactly as
          // it is — say so rather than silently doing nothing.
          setViolations(v => [...v, {
            code: 'server-unreachable',
            message: 'The massing service did not respond — the current plan is unchanged. Try again.',
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

  /** Brief Phase 2: market-grounded SF lot fit, appended to the plan. */
  const handleGenerateLots = useCallback(async () => {
    planModeRef.current = 'sf';
    if (contextOgcFid == null) {
      setLotFitSummary('Lot fit needs a numeric parcel id.');
      return;
    }
    setIsGeneratingLots(true);
    try {
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
      // Additive per the brief — but idempotent: a re-generate REPLACES the
      // previous lot fit (matching id prefixes) instead of stacking a second
      // subdivision on top of the first.
      // A generated plan replaces the generated plan — of EITHER family.
      // (SF pads once stacked on top of MF bars: Elements 43.)
      const base = elements.filter(el => !isSfPlanElement(el) && !isMfPlanElement(el));
      setPlanOutput([...base, ...generated], metrics);
      const flagsNote = summary.flags.length > 0 ? ` · ⚠ ${summary.flags.join(', ')}` : '';
      setLotFitSummary(
        `${summary.lots} lots · lot target ${summary.targetLotSqft?.toLocaleString() ?? '—'} SF, ` +
        `footprint ${summary.targetFootprintSqft?.toLocaleString() ?? '—'} SF ` +
        `(${summary.targetSource ?? 'n/a'}) · confidence ${summary.confidence ?? 'n/a'}${flagsNote}`
      );
    } finally {
      setIsGeneratingLots(false);
    }
  }, [contextOgcFid, elements, metrics, setPlanOutput]);

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
    if (contextOgcFid == null) {
      setBuildability(null);
      return;
    }
    let cancelled = false;
    fetchParcelBuildability(contextOgcFid).then(b => {
      if (!cancelled) setBuildability(b);
    });
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

  /** MF branch of the auto-plan: server site-system first (M2), client
   *  constructive massing as the fail-soft fallback. */
  const autoPlanMf = useCallback((ctx: DesignContext | null) => {
    planModeRef.current = 'mf';
    void (async () => {
      // User pins carry through a re-plan (use switch, context refresh) —
      // same parcel, so they remain valid until geometry says otherwise.
      const ok = await runServerMfPlan({ seed: 1, pins: mfPinsRef.current }).catch(e => {
        // A throw here is a client bug, not a solver verdict — it must never
        // silently downgrade the plan to the worker (that hid every server
        // plan behind a fallback once already).
        console.error('[autoPlanMf] server massing path threw — falling back to the client solver:', e);
        return false;
      });
      if (!ok) {
        const rejectedWhy = serverRejectRef.current;
        // handleGenerate sets the basis label from the settled context
        handleGenerate(0).then(() => {
          // The worker result replaces the violations list wholesale — re-append
          // the server rejection so the fallback is never silent: the rail says
          // WHY this is a worker plan and not the server site system.
          if (rejectedWhy) {
            setViolations(v => [...v, {
              code: 'server-plan-rejected',
              message: `Server plan rejected by the geometry gate (${rejectedWhy}) — showing the client solver result instead.`,
              severity: 'warning',
            }]);
          }
        }).catch(() => undefined);
      }
    })();
    void ctx;
  }, [handleGenerate, runServerMfPlan]);

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
    hasAutoGeneratedRef.current = true;
    if (ctx && routesToLotFit(ctx)) {
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
    if (resp && !resp.generation_allowed) {
      generationBlockedRef.current = true;
      setGenerationBlocked(true);
      hasAutoGeneratedRef.current = true; // suppress auto-plan while blocked
      planModeRef.current = null;
      setPlanBasis(`Generation blocked — selected use not permitted as-of-right · ${plannerContextSummary(resp)}`);
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
      markCompileBlocked('The zoning context compile failed for this parcel.');
      hasAutoGeneratedRef.current = true; // no auto-plan may run while blocked
      planModeRef.current = null;
      setPlanBasis('Massing blocked — zoning context unavailable.');
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
  }, [autoPlan, markDraft, markCompileBlocked]);

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
      setPermittedUses(list);
      if (!userPickedUseRef.current) {
        const preferred =
          pickDefaultUse(list) ?? defaultUseFromZoningBase(parcel.zoning);
        if (preferred) {
          if (list.length === 0) {
            console.info(
              `[use-default] permitted-uses unavailable — density-first default '${preferred}' inferred from zoning base '${parcel.zoning}'.`
            );
          }
          if (preferred !== contextUse) setContextUse(preferred);
        }
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
  const seedViewOn = showSeed && !!seedRender && seedRender.elements.length > 0;
  const displayElements = seedViewOn && seedRender ? seedRender.elements : elements;
  const displayBasis = seedViewOn && seedRender
    ? seedRender.basis + (seedRender.inFamily ? ` · in-family: ${seedRender.inFamily}` : '')
    : planBasis;

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
      seedAvailable: !!seedPlan,
      seedShown: seedViewOn,
      seedComposition: seedPlan?.composition ?? null,
      neighborsLoaded: neighbors
        ? { parcels: neighbors.parcels.length, buildings: neighbors.buildings.length, roads: neighbors.roads.length }
        : null,
      utilizationPct:
        !draftMode && maxBuildout && maxBuildout.max_gsf > 0 && metrics?.totalBuiltSF
          ? Math.round((metrics.totalBuiltSF / maxBuildout.max_gsf) * 1000) / 10
          : null,
    };
  }, [planLineage, planBasis, violations, metrics, maxBuildout, draftMode, rpcMetrics, buildability, neighbors, seedPlan, seedViewOn]);

  const plannerParcel = isValidParcel(parcel)
    ? parcel
    : createFallbackParcel(parcel.ogc_fid || parcel.id || 'unknown', parcel.sqft || 4356);

  // historyVersion re-renders this component whenever the undo stacks change
  const canUndo = historyVersion >= 0 && pastRef.current.length > 0;
  const canRedo = historyVersion >= 0 && futureRef.current.length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-100">
      <CensusBanner />
      {isRefusal(buildability) && product === 'apartments' && buildability && (
        <RefusalCard
          buildability={buildability}
          onSwitchToTownhomes={() => handleProductChange('townhomes')}
        />
      )}
      {/* Live KPI bar — always visible, ticks during drags/slider moves */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <KpiStrip
          metrics={metrics}
          investment={investmentAnalysis}
          money={serverMoney}
          planFlags={planLineage?.flags ?? []}
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
          {seedPlan && (
            <button
              data-testid="seed-toggle"
              onClick={() => setShowSeed(v => !v)}
              title="Stage 1+2 seed: the engine's placed composition (zones, spine, bays, single-L)"
              className={`px-3 py-1.5 border-l border-gray-200 ${showSeed ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Seed
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
        </div>
      </div>

      {(displayBasis || plannerCtx || plannerLoading || planStale || generationBlocked) && (
        <div className="px-4 py-1.5 bg-white border-b border-gray-100 flex-shrink-0 space-y-1">
          {displayBasis && (
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">{seedViewOn ? 'Seed basis:' : 'Plan basis:'}</span> {displayBasis}
            </div>
          )}
          <ContextLineage
            state={resolveContextApplication({
              compiling: plannerLoading,
              blocked: generationBlocked,
              planStale,
              activeContext: plannerCtx,
              lineage: planLineage,
            })}
            activeContext={plannerCtx}
            lineage={planLineage}
            blockedReason={`"${contextUse.replace(/_/g, ' ')}" is not permitted as-of-right on this parcel. Pick a permitted use in the Design Context panel.`}
          />
        </div>
      )}

      {/* Draft plans never wear the authoritative Max-GSF dressing — a
          degraded solve reporting achievable-GSF capture is exactly the
          "broken plan in current dress" failure. */}
      {contextOgcFid != null && permittedUses.length > 1 && !draftMode && !compileBlocked && (
        <div className="px-4 pt-3 flex-shrink-0">
          <HbuStrip
            ogcFid={contextOgcFid}
            uses={permittedUses}
            activeUse={contextUse}
            onSelectUse={handleUseChange}
          />
        </div>
      )}
      {maxBuildout && !draftMode && (
        <div className="px-4 pt-3 flex-shrink-0">
          <MaxBuildoutHeadline
            buildout={maxBuildout}
            achievedGsf={metrics?.totalBuiltSF ?? null}
            currentStories={planLineage?.floors ?? null}
            optimizationStatus={metrics?.optimizationStatus ?? null}
            optimizationProof={metrics?.optimizationProof ?? null}
            constructionType={massingProg?.construction_type ?? null}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-4 p-4 overflow-auto xl:overflow-hidden">
        {!leftRailCollapsed && (
        <div className="w-full xl:w-80 flex-shrink-0 xl:min-h-0 xl:overflow-y-auto space-y-4">
          <ContextPanel
            context={plannerCtx ? plannerContextToDesignContext(plannerCtx) : null}
            precedent={plannerCtx?.solver_brief.precedent_priors}
            pricing={plannerCtx?.context.market}
            contextSummary={plannerCtx ? plannerContextSummary(plannerCtx) : null}
            loading={plannerLoading}
            uses={permittedUses}
            use={contextUse}
            onUseChange={handleUseChange}
            generationBlocked={generationBlocked}
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
            title={leftRailCollapsed ? 'Show parameters' : 'Hide parameters — maximize the canvas'}
            className="absolute top-2 left-2 z-20 p-1.5 rounded-md bg-white/90 border border-gray-200 text-gray-500 hover:text-gray-800 shadow-sm"
          >
            {leftRailCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          {frontage?.landlocked === true && !draftMode && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-orange-50 border border-orange-300 text-orange-800 text-xs font-medium rounded-md px-3 py-1.5 shadow-sm" data-testid="landlocked-banner">
              No street frontage — access via easement assumed.
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
            <SitePlannerErrorBoundary>
              <Massing3D
                elements={displayElements}
                parcelGeometry={plannerParcel?.geometry as import('geojson').Polygon | import('geojson').MultiPolygon | undefined}
                envelope={envelopeMeters ?? undefined}
                neighbors={neighbors}
                edgeClassifications={edgeClassifications}
              />
            </SitePlannerErrorBoundary>
          ) : (
            <SitePlannerErrorBoundary>
              <EnterpriseSitePlanner
                draftMode={draftMode}
                suppressCurbCut={frontage?.landlocked === true}
                neighbors={neighbors}
                parcel={plannerParcel}
                planElements={displayElements}
                metrics={metrics || undefined}
                selectedSolve={selectedSolve || undefined}
                parkingViz={{
                  angleDeg: metrics?.parkingAngleDeg ?? 0,
                  stallWidthFt: config.designParameters.parking.stallWidthFt,
                  stallDepthFt: config.designParameters.parking.stallDepthFt
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
          {compileBlocked && (
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
        <div className="mt-3 flex-shrink-0 bg-white border border-gray-200 rounded-lg flex flex-col max-h-72">
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
            ] as const).map(t => (
              <button
                key={t.key}
                data-testid={`dock-tab-${t.key}`}
                onClick={() => setDockTab(t.key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
                  dockTab === t.key
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
          <div className="min-h-0 overflow-y-auto">
            {dockTab === 'tabulation' && (
              <TabulationPanel
                elements={displayElements}
                metrics={metrics}
                plannerCtx={plannerCtx}
                acres={parcel.deeded_acres}
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
          </div>
        </div>
        </div>
      </div>
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
