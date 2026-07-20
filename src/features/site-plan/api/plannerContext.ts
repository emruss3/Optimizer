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

/**
 * How the typology-aware Regrid resolver (fn_local_built_form_v2) chose the
 * comparison set. Records the tier it settled on, so the UI can say honestly
 * whether the precedents are exact-use/same-zoning or a relaxed fallback.
 */
export interface RegridPrecedentSelection {
  mode:
    | 'exact_same_zoning'
    | 'exact_any_zoning'
    | 'compatible_same_zoning'
    | 'compatible_any_zoning'
    | 'zoning_only'
    | 'all_nearby';
  requested_typology: string;
  match_mode: 'exact' | 'compatible' | 'any';
  same_zoning_required: boolean;
  lot_band: string;
  sample_size: number;
  available_count?: number;
  sample_cap?: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
}

/**
 * Local built-form priors (planner_context_v2). Everything beyond
 * sample_size/confidence is optional so planner_context_v1 snapshots —
 * which only carry footprint/stories — keep parsing during rollout.
 */
export interface PrecedentPriors {
  sample_size: number | null;
  confidence: string | null;

  selection?: RegridPrecedentSelection | null;
  type_mix?: Record<string, number> | null;
  precedent_parcel_ids?: number[] | null;

  footprint_sqft?: Percentiles | null;
  total_footprint_sqft?: Percentiles | null;
  building_count?: Percentiles | null;
  coverage_pct?: Percentiles | null;
  stories?: Percentiles | null;
  length_ft?: Percentiles | null;
  depth_ft?: Percentiles | null;
  aspect_ratio?: Percentiles | null;
  compactness?: Percentiles | null;

  underwrite_target?: {
    footprint_sqft_p75?: number;
    footprint_sqft_p90?: number;
    stories_p75?: number;
    length_ft_p75?: number;
    depth_ft_p50?: number;
    coverage_pct_p75?: number;
    building_count_p50?: number;
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

/**
 * Recursive canonical JSON: object keys sorted at EVERY depth. The old
 * top-level-only key sort collided on nested objective profiles
 * ({weights:{a,b}} vs {weights:{b,a}} serialized differently), which made
 * "identical" intents miss the cache — or worse, distinct intents share it.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).filter(k => o[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

/** Stable cache key: parcel + use + canonical (deep key-sorted) intent. */
export function compileCacheKey(ogcFid: number, use: string, intent?: Record<string, unknown>): string {
  const normalized = intent && Object.keys(intent).length > 0
    ? canonicalJson(intent)
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
    // Cold-cache compiles can blow the API statement timeout (seen live:
    // "canceling statement due to statement timeout" while the same compile
    // runs in ~1.3s warm). One immediate retry rides the warmed buffers.
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await compileOnce(ogcFid, selectedUse, userIntent);
      if (r !== null || attempt === 1) return r;
    }
    return null;
  })();

  compileCache.set(key, p);
  // A failed compile must not poison the cache
  p.then(r => {
    if (r == null) compileCache.delete(key);
  });
  return p;
}

async function compileOnce(
  ogcFid: number,
  selectedUse: string,
  userIntent: Record<string, unknown>
): Promise<PlannerContextResponse | null> {
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
 *  this carries the Regrid built-form priors and the generation gate). */
export function briefToWorkerBrief(resp: PlannerContextResponse): import('../../../engine/optimizer').WorkerSolverBrief {
  const pri = resp.solver_brief.precedent_priors;
  const ut = pri.underwrite_target;
  return {
    generationAllowed: resp.generation_allowed,
    precedent: {
      storiesP50: pri.stories?.p50 ?? null,
      storiesP75: ut?.stories_p75 ?? pri.stories?.p75 ?? null,
      footprintP75SqFt: ut?.footprint_sqft_p75 ?? pri.footprint_sqft?.p75 ?? null,
      footprintP90SqFt: ut?.footprint_sqft_p90 ?? pri.footprint_sqft?.p90 ?? null,
      depthP50Ft: ut?.depth_ft_p50 ?? pri.depth_ft?.p50 ?? null,
      lengthP75Ft: ut?.length_ft_p75 ?? pri.length_ft?.p75 ?? null,
      coverageP75Pct: ut?.coverage_pct_p75 ?? pri.coverage_pct?.p75 ?? null,
      buildingCountP50: ut?.building_count_p50 ?? pri.building_count?.p50 ?? null,
      sampleSize: pri.sample_size ?? null,
      confidence: pri.confidence ?? null,
      selectionMode: pri.selection?.mode ?? null,
      precedentParcelIds: pri.precedent_parcel_ids ?? undefined,
    },
    programPrior: {
      averageUnitSqft: (resp.solver_brief.program_prior?.average_unit_sqft?.value as number | null) ?? null,
    },
    objectiveWeights: resp.solver_brief.objective_profile?.weights,
  };
}

// ── Context lineage vocabulary (current server implementation) ──────────────

export const CONTEXT_VERSION_V2 = 'planner_context_v2';

/** Generator versions that provably consumed a compiled context snapshot. */
const CONTEXT_AWARE_GENERATORS = new Set([
  'mf_context_v2',
  'mf_context_v2_regrid_typology_v1',
]);

export function isContextAwareGeneratorVersion(v: string | null | undefined): boolean {
  return v != null && CONTEXT_AWARE_GENERATORS.has(v);
}

/**
 * "Context applied" is earned, not assumed: the plan must carry the ACTIVE
 * snapshot's id, a v2 context version, and a context-aware generator version.
 * Anything less is a fallback state and must say so.
 */
export function planUsedActiveContext(
  plan: { context_id?: string | null; context_version?: string | null; generator_version?: string | null },
  activeContextId: string | null | undefined
): boolean {
  return (
    !!activeContextId &&
    plan.context_id === activeContextId &&
    plan.context_version === CONTEXT_VERSION_V2 &&
    isContextAwareGeneratorVersion(plan.generator_version)
  );
}

// ── Flag translations (technical flag → user-readable sentence) ─────────────

const FLAG_TEXT: Record<string, string> = {
  regrid_typology_selection_exact_same_zoning: 'Matched the selected use and zoning subtype.',
  regrid_typology_selection_exact_any_zoning: 'Matched the selected use across nearby zoning districts.',
  regrid_typology_selection_compatible_same_zoning: 'Used compatible building uses within the same zoning subtype.',
  regrid_typology_selection_compatible_any_zoning: 'Used compatible building uses across nearby zoning districts.',
  regrid_typology_selection_zoning_only: 'No reliable use match — compared against the zoning subtype only.',
  regrid_typology_selection_all_nearby: 'No reliable use or zoning match — compared against all nearby buildings.',
  regrid_zoning_filter_relaxed: "Expanded beyond the parcel's zoning subtype due to limited local examples.",
  regrid_compatible_use_classes_used: 'Included compatible building uses due to limited exact matches.',
  regrid_lot_band_relaxed_any: 'Included precedents on lots of any size due to limited local examples.',
  regrid_typology_filter_insufficient: 'Too few precedents of the selected use — the comparison set is a broad fallback.',
  regrid_sample_capped_100: 'Analyzed the 100 closest and most lot-comparable precedents.',
  bar_depth_from_regrid_geometry_p50: 'Building depth initialized from the local median.',
  bar_length_target_from_regrid_geometry_p75: 'Building length initialized from the local 75th percentile.',
  stories_from_precedent_p50_p75: 'Story count initialized from the local built-form range.',
  frontage_geometry_is_placeholder_until_road_edge_upgrade:
    'Access remains based on a frontage heuristic, not a verified road edge.',
  parking_below_ratio: 'Parking provided is below the target ratio.',
  // Pinned best-effort solves (the dynamic edit loop): the plan renders, and
  // every cap the placed building strains or breaks is stated here.
  pinned_best_effort_v1:
    'Solved around your placed building — binding caps are flagged instead of blocking the edit.',
  parking_caps_units_below_program_min:
    'Parking or density caps the unit count below what this floor area would normally program — fewer, larger units.',
  unit_gsf_out_of_band_pinned:
    'Average unit size falls outside the hard program band because a placed building fixes the floor area.',
  building_coverage_exceeded_pinned:
    'The placed building pushes total footprint over the building-coverage cap.',
  impervious_coverage_exceeded_pinned:
    'The placed building pushes total impervious area over the impervious-coverage cap.',
  far_exceeded_pinned:
    'The placed building pushes floor area over the FAR cap.',
  building_coverage_exceeded:
    'Total footprint exceeds the building-coverage cap.',
  impervious_coverage_exceeded:
    'Total impervious area exceeds the impervious-coverage cap.',
  far_exceeded: 'Floor area exceeds the FAR cap.',
  planner_parking_infeasible:
    'The lot cannot park this massing at the required ratio.',
  planner_parking_shortfall:
    'Parking supply falls short of the required stalls.',
};

/** Translate a technical flag into UI text; unknown flags are humanized. */
export function describeContextFlag(flag: string): string {
  return FLAG_TEXT[flag] ?? flag.replace(/_/g, ' ');
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
