import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
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
import { contextToZoningPatch, contextToParkingPatch, routesToLotFit, type DesignContext } from './api/designContext';
import { generateSfSitePlan, sfPlanToElements, isSfPlanElement } from './api/generateSfPlan';
import { generateMfSitePlan, mfPlanToElements, isMfPlanElement, listMfCandidates, fetchMfMoney, type MfCandidate, type MfPin, type MfMoney } from './api/generateMfPlan';
import SchemesRail from './ui/SchemesRail';
import { useSitePlans } from '../../hooks/useSitePlans';
import type { SavedSitePlan } from '../../lib/sitePlanStorage';

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
  const { status, envelope, rpcMetrics, edgeClassifications, error: envelopeError } = useBuildableEnvelope(parcel);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [violations, setViolations] = useState<FeasibilityViolation[]>([]);

  // ── Design-context engine (brief Phase 1) ────────────────────────────────
  const contextOgcFid = useMemo(() => {
    const n = Number(parcel.ogc_fid);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [parcel.ogc_fid]);
  // Initial use is a placeholder — ContextPanel corrects it to the parcel's
  // highest-intensity as-of-right use (autoSelectUse) unless the user picked.
  const [contextUse, setContextUse] = useState('single_family');
  const userPickedUseRef = useRef(false);
  const handleUseChange = useCallback((use: string) => {
    userPickedUseRef.current = true;
    setContextUse(use);
  }, []);
  const appliedContextRef = useRef<string | null>(null);

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
  // A2 edit-as-regeneration state: current pins + the candidate the next
  // variation descends from; A1 rail data.
  const mfPinsRef = useRef<MfPin[]>([]);
  const mfRegenInFlightRef = useRef(false);
  // Live-drag pump (dynamic site plans): drag events coalesce latest-wins
  // into preview solves (persist=false); the release commits the candidate.
  const pendingMfRegenRef = useRef<{ pins: MfPin[]; final: boolean; dropPinIndex: number | null } | null>(null);
  const dragPinRef = useRef<{ elementId: string; pinIndex: number } | null>(null);
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
      savePlanToDb({
        parcel_id: parcelIdStr,
        name,
        config,
        elements,
        metrics,
        violations,
        investment: investmentAnalysis,
      });
    },
    [savePlanToDb, parcelIdStr, config, elements, metrics, violations, investmentAnalysis]
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
    listMfCandidates(contextOgcFid).then(setMfCandidates).catch(() => undefined);
  }, [contextOgcFid]);

  const runServerMfPlan = useCallback(async (opts: {
    seed: number;
    pins?: MfPin[];
    parentId?: string | null;
    persist?: boolean;
    /** Live-drag: omit this pin's bar from the render — the user's hand
     *  (the Shell's locally-dragged element) is the source of truth for it */
    dropPinIndex?: number | null;
  }): Promise<boolean> => {
    if (contextOgcFid == null) return false;
    const resp = await generateMfSitePlan(contextOgcFid, {
      seed: opts.seed,
      pins: opts.pins,
      parentId: opts.parentId,
      persist: opts.persist,
    });
    if (!resp || !resp.buildings || resp.buildings.length === 0) return false;
    const mapped = mfPlanToElements(resp);
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
    const base = elements.filter(el => !isMfPlanElement(el));
    setPlanOutput([...base, ...generated], serverMetrics ?? metrics);
    setViolations([]);
    const parkingNote = flags.includes('parking_below_ratio') ? ' · ⚠ parking below target ratio' : '';
    setPlanBasis(`${basis ?? 'Server-generated site plan'}${parkingNote}`);
    // A3: value the scheme against local sales — the margin ticks live
    loadMoney(serverMetrics?.totalBuiltSF, serverMetrics?.totalUnits);
    if (opts.persist !== false) refreshCandidates();
    return true;
  }, [contextOgcFid, elements, metrics, setPlanOutput, refreshCandidates, loadMoney]);

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

  const handleGenerate = useCallback(async (iterations?: unknown) => {
    if (!envelopeMeters) return;
    // Server plans vary by regeneration (a new candidate), not local SA.
    // Pins carry through: your placed buildings survive every variation.
    if (planModeRef.current === 'mf-server') {
      setIsGenerating(true);
      try {
        await runServerMfPlan({
          seed: mfSeedRef.current + 1,
          pins: mfPinsRef.current,
          parentId: activeCandidateId,
        });
      } finally {
        setIsGenerating(false);
      }
      return;
    }
    // Guard: button handlers pass the click event — only numbers count.
    const iters = typeof iterations === 'number' ? iterations : 50;
    planModeRef.current = 'mf';
    const ctx = ctxSettledRef.current;
    const zoningLabel = ctx && ctx !== 'pending' && ctx.zoningBase ? ctx.zoningBase : null;
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

      // Use the optimizer for "Generate Plan" — it runs simulated annealing
      const result = await workerManager.optimizeSite(
        envelopeMeters,
        config.zoning,
        config.designParameters,
        parkingSpec,
        iters // 0 = instant constructive solve; >0 = SA refinement
      );

      // Feed best result into the plan output (already in EPSG:3857 meters)
      setPlanOutput(
        result.bestElements || [],
        result.bestMetrics || null
      );
      setViolations(result.bestViolations || []);
      trackBuildings(result.bestBuildings);

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
        }, typologyToBuildingType(config.designParameters.buildingTypology));
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
  }, [config, envelopeMeters, setPlanOutput, applyAlternatives, pushHistory, trackBuildings, runServerMfPlan]);

  // Live re-solve: a fast, deterministic constructive solve (no annealing) run
  // when the user nudges parameter sliders, so the plan updates without clicking
  // "Generate". Quietly no-ops on failure — it's a preview, not a commit.
  const liveResolve = useCallback(async () => {
    if (!envelopeMeters) return;
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
      const result = await workerManager.optimizeSite(
        envelopeMeters,
        config.zoning,
        config.designParameters,
        parkingSpec,
        0
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
          dragPinRef.current = { elementId: update.id, pinIndex };
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
        if (options?.final) dragPinRef.current = null;
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
  const applyContextDefaults = useCallback(
    (ctx: DesignContext) => {
      const key = `${contextOgcFid}:${contextUse}`;
      if (appliedContextRef.current === key) return;
      appliedContextRef.current = key;
      const zoningPatch = contextToZoningPatch(ctx);
      // typology_spec's stall/aisle/ratio numbers ground how parking sits —
      // not just how big the envelope is.
      const parkingPatch = contextToParkingPatch(ctx);
      if (Object.keys(zoningPatch).length === 0 && Object.keys(parkingPatch).length === 0) return;
      updateConfig({
        zoning: { ...config.zoning, ...zoningPatch },
        designParameters: {
          ...config.designParameters,
          parking: { ...config.designParameters.parking, ...parkingPatch },
        },
      });
    },
    [contextOgcFid, contextUse, config.zoning, config.designParameters, updateConfig]
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
      const base = elements.filter(el => !isSfPlanElement(el));
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
    if (planModeRef.current === 'mf-server') {
      setViolations([{
        code: 'plan-mode',
        message: 'This plan was generated server-side as one system. Use Generate for a new variation — per-building editing arrives with candidate sessions.',
        severity: 'warning'
      }]);
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
        const init = await workerManager.initSite(envelopeMeters, config.zoning, undefined, parkingSpec);
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
  }, [envelopeMeters, elements, handleBuildingUpdate, solverReady, config, setPlanOutput]);

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
      setActiveCandidateId(null);
      setMfCandidates([]);
      ctxSettledRef.current = 'pending';
      userPickedUseRef.current = false;
      setServerMoney(null);
      setPlanBasis(null);
    }
  }, [parcel.ogc_fid, parcel.id]);

  /** MF branch of the auto-plan: server site-system first (M2), client
   *  constructive massing as the fail-soft fallback. */
  const autoPlanMf = useCallback((ctx: DesignContext | null) => {
    planModeRef.current = 'mf';
    void (async () => {
      const ok = await runServerMfPlan({ seed: 1 }).catch(() => false);
      if (!ok) {
        // handleGenerate sets the basis label from the settled context
        handleGenerate(0).catch(() => undefined);
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

  const handleContextSettled = useCallback((ctx: DesignContext | null) => {
    ctxSettledRef.current = ctx;
    autoPlan(ctx);
  }, [autoPlan]);

  // A1: load the parcel's scheme history on entry
  useEffect(() => {
    refreshCandidates();
  }, [refreshCandidates]);

  /** View a saved scheme: deterministic re-render from its seed + pins (no
   *  new candidate row); future variations descend from the viewed scheme. */
  const handleViewCandidate = useCallback((c: MfCandidate) => {
    if (mfRegenInFlightRef.current) return;
    mfRegenInFlightRef.current = true;
    setIsGenerating(true);
    runServerMfPlan({ seed: c.seed, pins: c.pins, parentId: c.parentId, persist: false })
      .then(ok => {
        if (ok) setActiveCandidateId(c.id);
      })
      .catch(() => undefined)
      .finally(() => {
        mfRegenInFlightRef.current = false;
        setIsGenerating(false);
      });
  }, [runServerMfPlan]);

  // Fallback: if the context engine hasn't settled ~2.5s after the envelope is
  // ready, don't block the user — plan with whatever we have (MF default).
  useEffect(() => {
    if (!hasValidGeometry || !envelopeMeters) return;
    if (hasAutoGeneratedRef.current) return;
    const timer = window.setTimeout(() => {
      autoPlan(ctxSettledRef.current === 'pending' ? null : ctxSettledRef.current);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [hasValidGeometry, envelopeMeters, autoPlan]);

  // Live re-solve when a design parameter changes (FAR, coverage, parking,
  // typology) — but only after the first plan exists. Debounced so dragging a
  // slider doesn't fire a solve per pixel. Reads the latest solverReady /
  // liveResolve from the fresh closure created on each parameter change.
  const liveResolveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!solverReady || !envelopeMeters) return;
    if (liveResolveTimer.current) window.clearTimeout(liveResolveTimer.current);
    liveResolveTimer.current = window.setTimeout(() => { liveResolve(); }, 350);
    return () => {
      if (liveResolveTimer.current) window.clearTimeout(liveResolveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.designParameters, config.zoning]);

  const plannerParcel = isValidParcel(parcel)
    ? parcel
    : createFallbackParcel(parcel.ogc_fid || parcel.id || 'unknown', parcel.sqft || 4356);

  // historyVersion re-renders this component whenever the undo stacks change
  const canUndo = historyVersion >= 0 && pastRef.current.length > 0;
  const canRedo = historyVersion >= 0 && futureRef.current.length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-100">
      {/* Live KPI bar — always visible, ticks during drags/slider moves */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <KpiStrip metrics={metrics} investment={investmentAnalysis} money={serverMoney} />
        <div className="flex items-center gap-2 flex-shrink-0">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
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
        </div>
        </div>
      </div>

      {planBasis && (
        <div className="px-4 py-1.5 bg-white border-b border-gray-100 text-xs text-gray-600 flex-shrink-0">
          <span className="font-medium text-gray-700">Plan basis:</span> {planBasis}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-4 p-4 overflow-auto xl:overflow-hidden">
        <div className="w-full xl:w-80 flex-shrink-0 xl:min-h-0 xl:overflow-y-auto space-y-4">
          <ContextPanel
            ogcFid={contextOgcFid}
            use={contextUse}
            onUseChange={handleUseChange}
            onContext={applyContextDefaults}
            onSettled={handleContextSettled}
            autoSelectUse={!userPickedUseRef.current}
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
            onGenerateLots={handleGenerateLots}
            isGeneratingLots={isGeneratingLots}
            lotFitSummary={lotFitSummary}
            alternatives={alternatives}
            alternativeScores={solveScores}
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

        <div className="flex-1 min-w-0 min-h-[420px] xl:min-h-0">
          {viewMode === '3d' ? (
            <SitePlannerErrorBoundary>
              <Massing3D elements={elements} />
            </SitePlannerErrorBoundary>
          ) : (
            <SitePlannerErrorBoundary>
              <EnterpriseSitePlanner
                parcel={plannerParcel}
                planElements={elements}
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
        </div>

        <div className="w-full xl:w-80 flex-shrink-0 xl:min-h-0 xl:overflow-y-auto">
          <SchemesRail
            candidates={mfCandidates}
            activeId={activeCandidateId}
            onView={handleViewCandidate}
            busy={isGenerating || isGeneratingLots}
          />
          <ResultsPanel
            metrics={metrics}
            investmentAnalysis={investmentAnalysis}
            isGenerating={isGenerating}
            violations={violations}
            edgeClassifications={edgeClassifications}
            setbacks={rpcMetrics?.setbacks}
          />
        </div>
      </div>
    </div>
  );
};

export default SiteWorkspace;
