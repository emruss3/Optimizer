/**
 * Planner context contract client (planner_context_v1, live 2026-07-13).
 *
 * ONE compiled, versioned, immutable context snapshot drives the context UI,
 * the server generator (v2), and the client worker fallback. This module is
 * the only place the browser talks to that contract:
 *
 *   fn_compile_planner_context(ogc_fid, use, user_intent) → snapshot + brief
 *   fn_get_planner_solver_brief(context_id, expected_parcel) → verified brief
 *
 * Types mirror the LIVE response shape (captured from parcel 669046), not the
 * spec paraphrase. Fail-soft everywhere: null on error, never mock context.
 * planner.* tables are private — never queried from browser code.
 */
import { supabase } from '../../../lib/supabase';

// ── Shared value shapes ──────────────────────────────────────────────────────

/** Provenance-annotated scalar: {value, source[, confidence]} */
export interface SourcedValue<T = number> {
  value: T | null;
  source: string;
  confidence?: string;
}

export interface ObjectiveProfile {
  profile: string;
  weights: {
    financial_return: number;
    unit_or_program_yield: number;
    parking_compliance: number;
    zoning_utilization: number;
    precedent_fit: number;
    internal_program_fit: number;
    circulation_quality: number;
    open_space_quality: number;
  } & Record<string, number>;
}

export interface HardConstraints {
  front_setback_ft: number | null;
  side_setback_ft: number | null;
  rear_setback_ft: number | null;
  max_far: number | null;
  max_height_ft: number | null;
  max_density_du_acre: number | null;
  max_coverage_pct: number | null;
  min_open_space_pct: number | null;
  developable: boolean;
}

export interface ParkingBrief {
  strategy?: string | null;
  ratio: number | null;
  basis?: string | null;
  stall_width_ft: number | null;
  stall_depth_ft: number | null;
  aisle_width_ft: number | null;
  permitted_angles_deg: number[];
}

export interface Percentiles {
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
}

export interface PrecedentPriors {
  sample_size: number | null;
  confidence: string | null;
  footprint_sqft?: Percentiles | null;
  stories?: Percentiles | null;
  underwrite_target?: {
    footprint_sqft_p75?: number;
    footprint_sqft_p90?: number;
    stories_p75?: number;
  } | null;
}

/** Deliberately low-confidence bridge prior — an explicit fallback, not truth. */
export interface ProgramPrior {
  average_unit_sqft?: SourcedValue;
  net_to_gross_efficiency?: SourcedValue;
  corridor_width_ft?: SourcedValue;
  core_loss_pct?: SourcedValue;
  applicability?: string;
  limitations?: string[];
  [k: string]: unknown;
}

export interface SolverBriefGeometry {
  parcel?: unknown;
  buildable_envelope?: unknown;
  /** PLACEHOLDER while front_edge_is_placeholder — currently the parcel polygon */
  front_edge?: unknown;
  front_edge_is_placeholder: boolean;
  access_method?: string | null;
}

export interface SolverBrief {
  schema_version: string;
  parcel_ogc_fid: number;
  selected_use: string;
  typology: string;
  generation_allowed: boolean;
  flags: string[];
  geometry: SolverBriefGeometry;
  hard_constraints: HardConstraints;
  parking: ParkingBrief;
  precedent_priors: PrecedentPriors;
  program_prior: ProgramPrior;
  program_prior_version: string | null;
  physical?: Record<string, unknown>;
  market_summary?: Record<string, unknown>;
  objective_profile: ObjectiveProfile;
}

export interface ContextProvenance {
  compiled_at?: string;
  context_version?: string;
  legal?: { function?: string; confidence?: string };
  built_form?: { function?: string; confidence?: string; radius_ft?: number; lookback_years?: number };
  pricing?: { function?: string; confidence?: string; radius_ft?: number; lookback_years?: number };
  frontage?: { function?: string; confidence?: string; limitation?: string };
  physical?: { function?: string };
  permitted_uses?: { function?: string };
  program_prior?: { version?: string | null; confidence?: string | null; limitations?: string[] };
  [k: string]: unknown;
}

/** The full compiled context (display-facing; superset of the brief). */
export interface PlannerContext {
  schema_version: string;
  parcel_ogc_fid: number;
  selected_use: string;
  typology: string;
  generation_allowed: boolean;
  flags: string[];
  legal: {
    permitted_as_of_right: boolean;
    zoning_base?: string | null;
    zoning_subtype?: string | null;
    municipality?: string | null;
    confidence?: string | null;
    setbacks?: { front?: SourcedValue; side?: SourcedValue; rear?: SourcedValue };
    max_far?: SourcedValue;
    max_height_ft?: SourcedValue;
    max_density_du_acre?: SourcedValue;
    max_coverage_pct?: SourcedValue<number>;
    min_open_space_pct?: SourcedValue;
    source_conflicts?: unknown[];
  };
  physical?: Record<string, unknown>;
  frontage?: Record<string, unknown>;
  precedent?: Record<string, unknown>;
  market?: Record<string, unknown>;
  parking?: Record<string, unknown>;
  parking_strategy?: string | null;
  typology_spec?: Record<string, unknown>;
  program_prior?: ProgramPrior;
  program_prior_version?: string | null;
  objective_profile: ObjectiveProfile;
  provenance: ContextProvenance;
}

export interface PlannerContextResponse {
  context_id: string;
  context_version: string;
  context_hash: string;
  created_at: string;
  generation_allowed: boolean;
  context: PlannerContext;
  solver_brief: SolverBrief;
}

// ── Type guards (tolerant: verify the load-bearing spine only) ──────────────

export function isSolverBrief(x: unknown): x is SolverBrief {
  if (x == null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.parcel_ogc_fid === 'number' &&
    typeof o.generation_allowed === 'boolean' &&
    o.hard_constraints != null &&
    typeof o.hard_constraints === 'object' &&
    o.parking != null &&
    typeof o.parking === 'object' &&
    o.geometry != null &&
    typeof o.geometry === 'object'
  );
}

export function isPlannerContextResponse(x: unknown): x is PlannerContextResponse {
  if (x == null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.context_id === 'string' &&
    typeof o.context_hash === 'string' &&
    typeof o.generation_allowed === 'boolean' &&
    o.context != null &&
    isSolverBrief(o.solver_brief)
  );
}

// ── Fetchers (fail-soft; the compile is cached per parcel+use+intent) ───────

const compileCache = new Map<string, Promise<PlannerContextResponse | null>>();

/** Stable cache key: parcel + use + normalized (key-sorted) intent. */
export function compileCacheKey(ogcFid: number, use: string, intent?: Record<string, unknown>): string {
  const normalized = intent && Object.keys(intent).length > 0
    ? JSON.stringify(intent, Object.keys(intent).sort())
    : '{}';
  return `${ogcFid}|${use.toLowerCase().trim()}|${normalized}`;
}

/**
 * Compile (or fetch the cached compile of) the parcel's planner context.
 * React re-renders share the same in-flight promise — the snapshot table is
 * hash-deduped server-side, but we avoid even asking twice.
 */
export function compilePlannerContext(
  ogcFid: number,
  selectedUse: string,
  userIntent: Record<string, unknown> = {}
): Promise<PlannerContextResponse | null> {
  const key = compileCacheKey(ogcFid, selectedUse, userIntent);
  const hit = compileCache.get(key);
  if (hit) return hit;

  const p = (async (): Promise<PlannerContextResponse | null> => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase.rpc('fn_compile_planner_context', {
        p_ogc_fid: ogcFid,
        p_use: selectedUse,
        p_user_intent: userIntent,
      });
      if (error) {
        console.warn('[plannerContext] compile failed:', error.message ?? error);
        return null;
      }
      if (data && typeof data === 'object' && 'error' in (data as object)) {
        console.warn('[plannerContext] compile declined:', (data as { error: string }).error);
        return null;
      }
      if (!isPlannerContextResponse(data)) {
        console.warn('[plannerContext] compile returned an unexpected shape');
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[plannerContext] compile threw:', err);
      return null;
    }
  })();

  compileCache.set(key, p);
  // A failed compile must not poison the cache
  p.then(r => {
    if (r == null) compileCache.delete(key);
  });
  return p;
}

/** Load the solver-safe brief for a known snapshot, parcel-verified. */
export async function getPlannerSolverBrief(
  contextId: string,
  expectedOgcFid: number
): Promise<{ brief: SolverBrief; generationAllowed: boolean } | { error: string } | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_get_planner_solver_brief', {
      p_context_id: contextId,
      p_expected_parcel_ogc_fid: expectedOgcFid,
    });
    if (error) {
      console.warn('[plannerContext] brief fetch failed:', error.message ?? error);
      return null;
    }
    const o = data as Record<string, unknown> | null;
    if (o && typeof o.error === 'string') return { error: o.error };
    if (o && isSolverBrief(o.solver_brief)) {
      return {
        brief: o.solver_brief as SolverBrief,
        generationAllowed: Boolean(o.generation_allowed),
      };
    }
    return null;
  } catch (err) {
    console.warn('[plannerContext] brief fetch threw:', err);
    return null;
  }
}

/** Test hook: clear the compile cache (parcel navigation does NOT need this). */
export function __clearPlannerContextCache(): void {
  compileCache.clear();
}

// ── Adapters: compiled context → existing display/solver shapes ─────────────

import type { DesignContext } from './designContext';

/**
 * Project the compiled context onto the ContextPanel's display shape so the
 * panel renders the SAME snapshot the solver uses (no competing fetches).
 */
export function plannerContextToDesignContext(resp: PlannerContextResponse): DesignContext {
  const legal = resp.context.legal ?? ({} as PlannerContext['legal']);
  const asCv = (v?: SourcedValue | null) =>
    v && v.value != null
      ? { value: v.value, source: v.source ?? 'unknown', confidence: (v.confidence ?? 'medium') as never }
      : undefined;
  const pk = resp.solver_brief.parking;
  return {
    zoningBase: legal.zoning_base ?? undefined,
    zoningSubtype: legal.zoning_subtype ?? undefined,
    regime: undefined,
    typology: resp.context.typology,
    confidence: (legal.confidence ?? undefined) as never,
    setbackFrontFt: asCv(legal.setbacks?.front),
    setbackSideFt: asCv(legal.setbacks?.side),
    setbackRearFt: asCv(legal.setbacks?.rear),
    maxFar: asCv(legal.max_far),
    maxHeightFt: asCv(legal.max_height_ft),
    maxDensityDuAc: asCv(legal.max_density_du_acre),
    maxCoveragePct: asCv(legal.max_coverage_pct),
    parkingStrategy: pk.strategy ?? resp.context.parking_strategy ?? undefined,
    parking: {
      ratio: pk.ratio ?? undefined,
      basis: pk.basis ?? undefined,
      stallWidthFt: pk.stall_width_ft ?? undefined,
      stallDepthFt: pk.stall_depth_ft ?? undefined,
      aisleWidthFt: pk.aisle_width_ft ?? undefined,
    },
    flags: resp.context.flags ?? [],
    permittedUses: [],
    raw: resp.context as unknown as Record<string, unknown>,
  };
}

/** Hard constraints → the planner's zoning config patch. */
export function briefToZoningPatch(brief: SolverBrief): Record<string, number> {
  const hc = brief.hard_constraints;
  const patch: Record<string, number> = {};
  if (hc.front_setback_ft != null) patch.frontSetbackFt = hc.front_setback_ft;
  if (hc.side_setback_ft != null) patch.sideSetbackFt = hc.side_setback_ft;
  if (hc.rear_setback_ft != null) patch.rearSetbackFt = hc.rear_setback_ft;
  if (hc.max_far != null && hc.max_far > 0) patch.maxFar = hc.max_far;
  if (hc.max_height_ft != null && hc.max_height_ft > 0) patch.maxHeightFt = hc.max_height_ft;
  if (hc.max_density_du_acre != null && hc.max_density_du_acre > 0) patch.maxDensityDuPerAcre = hc.max_density_du_acre;
  if (hc.max_coverage_pct != null && hc.max_coverage_pct > 0) patch.maxCoveragePct = hc.max_coverage_pct;
  return patch;
}

/** Brief parking → the solver's parking design-parameter patch. */
export function briefToParkingPatch(brief: SolverBrief): Record<string, number> {
  const pk = brief.parking;
  const patch: Record<string, number> = {};
  if (pk.ratio != null && pk.ratio > 0) patch.targetRatio = pk.ratio;
  if (pk.stall_width_ft != null && pk.stall_width_ft > 0) patch.stallWidthFt = pk.stall_width_ft;
  if (pk.stall_depth_ft != null && pk.stall_depth_ft > 0) patch.stallDepthFt = pk.stall_depth_ft;
  if (pk.aisle_width_ft != null && pk.aisle_width_ft > 0) patch.aisleWidthFt = pk.aisle_width_ft;
  return patch;
}

/** Solver-safe subset for the client worker fallback — the worker and the
 *  server generator may use different algorithms, but they read the SAME
 *  context values (hard constraints/parking travel via the config patches;
 *  this carries the precedent priors and the generation gate). */
export function briefToWorkerBrief(resp: PlannerContextResponse): import('../../../engine/optimizer').WorkerSolverBrief {
  const pri = resp.solver_brief.precedent_priors;
  return {
    generationAllowed: resp.generation_allowed,
    precedent: {
      storiesP50: pri.stories?.p50 ?? null,
      storiesP75: pri.stories?.p75 ?? null,
      footprintP90SqFt:
        pri.underwrite_target?.footprint_sqft_p90 ?? pri.footprint_sqft?.p90 ?? null,
      sampleSize: pri.sample_size ?? null,
    },
    programPrior: {
      averageUnitSqft: (resp.solver_brief.program_prior?.average_unit_sqft?.value as number | null) ?? null,
    },
    objectiveWeights: resp.solver_brief.objective_profile?.weights,
  };
}

/** One-line context summary for the plan-basis strip. */
export function plannerContextSummary(resp: PlannerContextResponse): string {
  const b = resp.solver_brief;
  const prec = b.precedent_priors;
  const legalConf = resp.context.legal?.confidence ?? 'unknown';
  const parts = [
    `Context ${resp.context_version.replace('planner_context_', '')}`,
    `${prec.sample_size ?? 0} precedents (${prec.confidence ?? 'unknown'})`,
    `prior ${b.program_prior_version ?? 'none'}`,
    `zoning ${legalConf}`,
    b.geometry.front_edge_is_placeholder ? 'frontage heuristic pending road upgrade' : `access ${b.geometry.access_method ?? 'road'}`,
  ];
  return parts.join(' · ');
}
