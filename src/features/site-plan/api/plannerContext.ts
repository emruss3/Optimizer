/**
 * Planner context contract client.
 *
 * One compiled, versioned, immutable context snapshot drives the context UI,
 * server generator, and client worker fallback. Browser code talks only to the
 * audited public RPC contract; planner.* tables remain private.
 */
import { supabase } from '../../../lib/supabase';
import type { DesignContext } from './designContext';

// ── Shared value shapes ──────────────────────────────────────────────────────

/** Provenance-annotated scalar: {value, source[, confidence]} */
export interface SourcedValue<T = number> {
  value: T | null;
  source: string;
  confidence?: string;
  semantics?: string;
  deprecated_alias_for?: string;
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
  /** Compatibility alias: building-footprint coverage only. */
  max_coverage_pct: number | null;
  max_building_coverage_pct?: number | null;
  max_impervious_pct?: number | null;
  max_impervious_sqft?: number | null;
  coverage_semantics?: {
    max_coverage_pct?: string;
    max_impervious_pct?: string;
  };
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

/** How the typology-aware Regrid resolver selected the comparison set. */
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

/** Local built-form priors. Regrid values are form evidence, never quantity caps. */
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
  /** Legacy alias. Current context labels this whole-building OBB depth. */
  depth_ft?: Percentiles | null;
  whole_building_obb_depth_ft?: Percentiles | null;
  depth_semantics?: string | null;
  bar_depth_source?: string | null;
  quantity_role?: string | null;
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

export interface MaxBuildoutBrief {
  contract_version?: string;
  max_gsf: number;
  at_stories?: number;
  at_unit_gsf?: number;
  units_at_max?: number;
  footprint_at_max?: number;
  unit_gsf_min?: number;
  unit_gsf_max?: number;
  binding_constraint?: string;
  stories_ladder?: Array<{
    stories?: number;
    max_gsf?: number;
    units?: number;
    unit_gsf?: number;
  }>;
  program_frontier?: {
    gsf_max_option?: {
      stories?: number;
      max_gsf?: number;
      units?: number;
      unit_gsf?: number;
    };
    units_max_option?: {
      stories?: number;
      gsf?: number;
      units?: number;
      unit_gsf?: number;
    };
    unit_gsf_band?: {
      min?: number;
      max?: number;
      hard_constraint?: boolean;
    };
  };
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
  max_buildout?: MaxBuildoutBrief;
  entitlement_capacity?: Record<string, unknown>;
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
    /** Compatibility alias: building-footprint coverage only. */
    max_coverage_pct?: SourcedValue<number>;
    max_building_coverage_pct?: SourcedValue<number>;
    max_impervious_pct?: SourcedValue<number>;
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
  max_buildout?: MaxBuildoutBrief;
  entitlement_capacity?: Record<string, unknown>;
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

// ── Fetchers (client cache + bounded server snapshot reuse) ─────────────────

const compileCache = new Map<string, Promise<PlannerContextResponse | null>>();

/** Recursive canonical JSON: object keys sorted at every depth. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).filter(k => o[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

/** Stable cache key: parcel + use + canonical intent. */
export function compileCacheKey(ogcFid: number, use: string, intent?: Record<string, unknown>): string {
  const normalized = intent && Object.keys(intent).length > 0
    ? canonicalJson(intent)
    : '{}';
  return `${ogcFid}|${use.toLowerCase().trim()}|${normalized}`;
}

/** Compile or share the in-flight compile for this parcel/use/intent. */
export function compilePlannerContext(
  ogcFid: number,
  selectedUse: string,
  userIntent: Record<string, unknown> = {}
): Promise<PlannerContextResponse | null> {
  const key = compileCacheKey(ogcFid, selectedUse, userIntent);
  const hit = compileCache.get(key);
  if (hit) return hit;

  const promise = (async (): Promise<PlannerContextResponse | null> => {
    // One retry rides warmed database buffers after a cold timeout.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await compileOnce(ogcFid, selectedUse, userIntent);
      if (result !== null || attempt === 1) return result;
    }
    return null;
  })();

  compileCache.set(key, promise);
  promise.then(result => {
    if (result == null) compileCache.delete(key);
  });
  return promise;
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
  } catch (error) {
    console.warn('[plannerContext] compile threw:', error);
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
  } catch (error) {
    console.warn('[plannerContext] brief fetch threw:', error);
    return null;
  }
}

/** Test hook: clear the compile cache. */
export function __clearPlannerContextCache(): void {
  compileCache.clear();
}

// ── Adapters: compiled context → existing display/solver shapes ─────────────

/** Project the compiled context onto the display shape used by ContextPanel. */
export function plannerContextToDesignContext(resp: PlannerContextResponse): DesignContext {
  const legal = resp.context.legal ?? ({} as PlannerContext['legal']);
  const asCv = (v?: SourcedValue | null) =>
    v && v.value != null
      ? { value: v.value, source: v.source ?? 'unknown', confidence: (v.confidence ?? 'medium') as never }
      : undefined;
  const parking = resp.solver_brief.parking;
  const buildingCoverage = legal.max_building_coverage_pct ?? legal.max_coverage_pct;
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
    maxCoveragePct: asCv(buildingCoverage),
    maxBuildingCoveragePct: asCv(buildingCoverage),
    maxImperviousPct: asCv(legal.max_impervious_pct),
    parkingStrategy: parking.strategy ?? resp.context.parking_strategy ?? undefined,
    parking: {
      ratio: parking.ratio ?? undefined,
      basis: parking.basis ?? undefined,
      stallWidthFt: parking.stall_width_ft ?? undefined,
      stallDepthFt: parking.stall_depth_ft ?? undefined,
      aisleWidthFt: parking.aisle_width_ft ?? undefined,
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
  const buildingCoverage = hc.max_building_coverage_pct ?? hc.max_coverage_pct;
  if (buildingCoverage != null && buildingCoverage > 0) patch.maxCoveragePct = buildingCoverage;
  return patch;
}

/** Brief parking → the solver's parking design-parameter patch. */
export function briefToParkingPatch(brief: SolverBrief): Record<string, number> {
  const parking = brief.parking;
  const patch: Record<string, number> = {};
  if (parking.ratio != null && parking.ratio > 0) patch.targetRatio = parking.ratio;
  if (parking.stall_width_ft != null && parking.stall_width_ft > 0) patch.stallWidthFt = parking.stall_width_ft;
  if (parking.stall_depth_ft != null && parking.stall_depth_ft > 0) patch.stallDepthFt = parking.stall_depth_ft;
  if (parking.aisle_width_ft != null && parking.aisle_width_ft > 0) patch.aisleWidthFt = parking.aisle_width_ft;
  return patch;
}

function maxBuildoutStories(brief: SolverBrief): number | null {
  const maxBuildout = brief.max_buildout;
  const direct = maxBuildout?.at_stories;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct;
  const nested = maxBuildout?.program_frontier?.gsf_max_option?.stories;
  if (typeof nested === 'number' && Number.isFinite(nested) && nested > 0) return nested;
  const best = [...(maxBuildout?.stories_ladder ?? [])]
    .filter(r => typeof r.stories === 'number' && typeof r.max_gsf === 'number')
    .sort((a, b) => (b.max_gsf ?? 0) - (a.max_gsf ?? 0))[0];
  return typeof best?.stories === 'number' && best.stories > 0 ? best.stories : null;
}

/**
 * Solver-safe subset for the client worker fallback. The existing worker still
 * names its story fields as precedent fields, so the max-GSF story target is
 * placed there as a compatibility bridge. Local precedent stories never cap
 * quantity, and whole-building OBB depth is never passed as apartment-bar depth.
 */
export function briefToWorkerBrief(resp: PlannerContextResponse): import('../../../engine/optimizer').WorkerSolverBrief {
  const priors = resp.solver_brief.precedent_priors;
  const target = priors.underwrite_target;
  const quantityStories = maxBuildoutStories(resp.solver_brief);
  const depthIsWholeBuildingObb =
    priors.depth_semantics === 'whole_building_oriented_bounding_box_not_bar_depth' ||
    priors.bar_depth_source === 'typology_or_program_spec_only';
  return {
    generationAllowed: resp.generation_allowed,
    precedent: {
      storiesP50: quantityStories ?? priors.stories?.p50 ?? null,
      storiesP75: quantityStories ?? target?.stories_p75 ?? priors.stories?.p75 ?? null,
      footprintP75SqFt: target?.footprint_sqft_p75 ?? priors.footprint_sqft?.p75 ?? null,
      footprintP90SqFt: target?.footprint_sqft_p90 ?? priors.footprint_sqft?.p90 ?? null,
      depthP50Ft: depthIsWholeBuildingObb
        ? null
        : target?.depth_ft_p50 ?? priors.depth_ft?.p50 ?? null,
      lengthP75Ft: target?.length_ft_p75 ?? priors.length_ft?.p75 ?? null,
      coverageP75Pct: target?.coverage_pct_p75 ?? priors.coverage_pct?.p75 ?? null,
      buildingCountP50: target?.building_count_p50 ?? priors.building_count?.p50 ?? null,
      sampleSize: priors.sample_size ?? null,
      confidence: priors.confidence ?? null,
      selectionMode: priors.selection?.mode ?? null,
      precedentParcelIds: priors.precedent_parcel_ids ?? undefined,
    },
    programPrior: {
      averageUnitSqft: (resp.solver_brief.program_prior?.average_unit_sqft?.value as number | null) ?? null,
    },
    objectiveWeights: resp.solver_brief.objective_profile?.weights,
  };
}

// ── Context lineage vocabulary ──────────────────────────────────────────────

export const CONTEXT_VERSION_V2 = 'planner_context_v2';

/** Generator versions that provably consumed a compiled context snapshot. */
const CONTEXT_AWARE_GENERATORS = new Set([
  'mf_context_v2',
  'mf_context_v2_regrid_typology_v1',
  'mf_max_gsf_v1',
]);

export function isContextAwareGeneratorVersion(v: string | null | undefined): boolean {
  return v != null && CONTEXT_AWARE_GENERATORS.has(v);
}

/** "Context applied" is earned by matching snapshot and generator lineage. */
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
  bar_depth_from_regrid_geometry_p50: 'Legacy local depth value recorded; it must not control apartment-bar depth.',
  bar_depth_from_typology_program_spec: 'Building depth comes from the typology/program specification.',
  bar_length_target_from_regrid_geometry_p75: 'Local p75 length informs building form.',
  precedent_bar_length_soft_target_not_quantity_cap: 'Local building length is a soft form target, not a yield cap.',
  stories_from_precedent_p50_p75: 'Local story count is recorded as form evidence only.',
  stories_from_max_gsf_frontier: 'Story count follows the max-GSF legal frontier.',
  coverage_response_lifted_stories_before_clamping_gsf: 'The solver added legal stories before reducing GSF for coverage.',
  unit_gsf_band_hard_pass: 'Programmed unit GSF is inside the hard development range.',
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
  const brief = resp.solver_brief;
  const precedents = brief.precedent_priors;
  const legalConfidence = resp.context.legal?.confidence ?? 'unknown';
  const parts = [
    `Context ${resp.context_version.replace('planner_context_', '')}`,
    `${precedents.sample_size ?? 0} precedents (${precedents.confidence ?? 'unknown'})`,
    `prior ${brief.program_prior_version ?? 'none'}`,
    `zoning ${legalConfidence}`,
    brief.geometry.front_edge_is_placeholder
      ? 'frontage heuristic pending road upgrade'
      : `access ${brief.geometry.access_method ?? 'road'}`,
  ];
  return parts.join(' · ');
}
