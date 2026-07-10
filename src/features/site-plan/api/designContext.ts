/**
 * Context Engine client (brief Phase 1).
 *
 * Wraps the Supabase RPCs that ground the planner in real zoning + market
 * data, with two hard rules learned from this codebase's history:
 *  1. FAIL SOFT — if an RPC is missing/slow/erroring, the planner keeps
 *     working on its defaults; the context UI simply says so. No mock data,
 *     ever.
 *  2. PROVENANCE IS FIRST-CLASS — every value carries source + confidence so
 *     the UI can badge "estimated" anything that didn't come from zoning.
 */
import { supabase } from '../../../lib/supabase';

export type Confidence = 'high' | 'medium' | 'low' | 'review_required';

export interface ContextValue {
  value: number | string | null;
  source: string;
  confidence: Confidence;
}

/** Parking geometry/ratio defaults from typology_spec (how parking sits). */
export interface ContextParking {
  ratio?: number;
  basis?: string;
  stallWidthFt?: number;
  stallDepthFt?: number;
  aisleWidthFt?: number;
}

export interface DesignContext {
  zoningBase?: string;
  zoningSubtype?: string;
  /**
   * PARKING-STRUCTURE regime, not building type: 'vertical' = FAR high enough
   * for structured parking, 'horizontal' = surface parking, and
   * 'horizontal_pending' = vertical-capable typology but zoning FAR unknown
   * (defaulted to surface FOR NOW). Never use this to route SF vs MF — that's
   * what `typology` is for (see routesToLotFit).
   */
  regime?: string;
  /** Backend-resolved typology for the selected use, e.g. 'single_family' */
  typology?: string;
  confidence?: Confidence;
  setbackFrontFt?: ContextValue;
  setbackSideFt?: ContextValue;
  setbackRearFt?: ContextValue;
  maxFar?: ContextValue;
  maxHeightFt?: ContextValue;
  maxDensityDuAc?: ContextValue;
  maxCoveragePct?: ContextValue;
  /** e.g. 'surface' | 'structured' — derived from the regime */
  parkingStrategy?: string;
  /** Stall/aisle geometry + ratio from typology_spec */
  parking?: ContextParking;
  /** Backend warning flags (flood zone, review triggers, …) → warning chips */
  flags: string[];
  /** As-of-right uses embedded in the context payload (newer backend shape) */
  permittedUses: string[];
  raw: Record<string, unknown>;
}

const CONFIDENCES: Confidence[] = ['high', 'medium', 'low', 'review_required'];

/** Wrap a raw field as a ContextValue whether it arrives bare or annotated. */
function cv(x: unknown): ContextValue | undefined {
  if (x == null) return undefined;
  if (typeof x === 'number' || typeof x === 'string') {
    return { value: x, source: 'unknown', confidence: 'medium' };
  }
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (!('value' in o)) return undefined;
    const conf = CONFIDENCES.includes(o.confidence as Confidence)
      ? (o.confidence as Confidence)
      : 'medium';
    return {
      value: (o.value as number | string | null) ?? null,
      source: typeof o.source === 'string' ? o.source : 'unknown',
      confidence: conf,
    };
  }
  return undefined;
}

/** First present key wins — tolerates naming drift in the backend payload. */
function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] != null) return o[k];
  }
  return undefined;
}

/**
 * Normalize whatever fn_resolve_design_context returns into a stable shape.
 * Tolerant by design: the backend payload is still evolving, so we probe a
 * few plausible key spellings and drop anything we don't recognize.
 */
export function normalizeDesignContext(json: unknown): DesignContext | null {
  if (json == null || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const setbacks = (pick(o, 'setbacks') ?? {}) as Record<string, unknown>;

  const ctx: DesignContext = {
    zoningBase: (pick(o, 'zoning_base', 'zoningBase', 'zoning') as string) ?? undefined,
    zoningSubtype: (pick(o, 'zoning_subtype', 'zoningSubtype', 'subtype') as string) ?? undefined,
    regime: (pick(o, 'regime', 'design_regime') as string) ?? undefined,
    typology: (pick(o, 'typology') as string) ?? undefined,
    confidence: CONFIDENCES.includes(pick(o, 'confidence', 'context_confidence') as Confidence)
      ? (pick(o, 'confidence', 'context_confidence') as Confidence)
      : undefined,
    setbackFrontFt: cv(pick(setbacks, 'front', 'front_ft') ?? pick(o, 'front_setback_ft', 'min_front_setback_ft')),
    setbackSideFt: cv(pick(setbacks, 'side', 'side_ft') ?? pick(o, 'side_setback_ft', 'min_side_setback_ft')),
    setbackRearFt: cv(pick(setbacks, 'rear', 'rear_ft') ?? pick(o, 'rear_setback_ft', 'min_rear_setback_ft')),
    maxFar: cv(pick(o, 'far_max', 'far', 'max_far', 'maxFar')),
    maxHeightFt: cv(pick(o, 'height_max_ft', 'height_ft', 'max_height_ft', 'maxHeightFt')),
    maxDensityDuAc: cv(pick(o, 'density_max_du_ac', 'density_du_ac', 'max_density_du_per_acre', 'density')),
    maxCoveragePct: cv(pick(o, 'coverage_pct', 'max_coverage_pct', 'max_impervious_coverage_pct')),
    parkingStrategy: (pick(o, 'parking_strategy', 'parkingStrategy') as string) ?? undefined,
    parking: normalizeParking(pick(o, 'parking')),
    flags: normalizeFlags(pick(o, 'flags', 'warnings')),
    permittedUses: normalizePermittedUses(pick(o, 'permitted_uses', 'permittedUses')),
    raw: o,
  };

  const hasAnything =
    ctx.zoningBase || ctx.setbackFrontFt || ctx.maxFar || ctx.maxHeightFt || ctx.maxDensityDuAc;
  return hasAnything ? ctx : null;
}

const num = (v: ContextValue | undefined): number | undefined => {
  const n = typeof v?.value === 'string' ? Number(v.value) : v?.value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Map a DesignContext onto the planner's zoning config — this is what makes
 * the FIRST auto-solve zoning-grounded instead of hardcoded defaults.
 * Only returns keys the context actually knows; everything else keeps the
 * existing config value.
 */
export function contextToZoningPatch(ctx: DesignContext): Record<string, number> {
  const patch: Record<string, number> = {};
  const front = num(ctx.setbackFrontFt);
  const side = num(ctx.setbackSideFt);
  const rear = num(ctx.setbackRearFt);
  const far = num(ctx.maxFar);
  const height = num(ctx.maxHeightFt);
  const density = num(ctx.maxDensityDuAc);
  const coverage = num(ctx.maxCoveragePct);
  if (front != null) patch.frontSetbackFt = front;
  if (side != null) patch.sideSetbackFt = side;
  if (rear != null) patch.rearSetbackFt = rear;
  if (far != null && far > 0) patch.maxFar = far;
  if (height != null && height > 0) patch.maxHeightFt = height;
  if (density != null && density > 0) patch.maxDensityDuPerAcre = density;
  if (coverage != null && coverage > 0) patch.maxCoveragePct = coverage;
  return patch;
}

const numOrUndef = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

/** Tolerant reader for the typology_spec parking block. */
export function normalizeParking(json: unknown): ContextParking | undefined {
  if (json == null || typeof json !== 'object') return undefined;
  const o = json as Record<string, unknown>;
  const parking: ContextParking = {
    ratio: numOrUndef(pick(o, 'ratio', 'surface_parking_ratio', 'target_ratio')),
    basis: (pick(o, 'basis', 'parking_basis') as string) ?? undefined,
    stallWidthFt: numOrUndef(pick(o, 'stall_w_ft', 'stall_width_ft')),
    stallDepthFt: numOrUndef(pick(o, 'stall_d_ft', 'stall_depth_ft')),
    aisleWidthFt: numOrUndef(pick(o, 'drive_aisle_ft', 'aisle_width_ft')),
  };
  return Object.values(parking).some(v => v != null) ? parking : undefined;
}

/**
 * Ground the solver's parking spec in typology_spec (via the context payload):
 * stall geometry + target ratio come from the backend's per-typology numbers
 * instead of hardcoded defaults. Only returns keys the context actually knows.
 */
export function contextToParkingPatch(ctx: DesignContext): Record<string, number> {
  const patch: Record<string, number> = {};
  const p = ctx.parking;
  if (!p) return patch;
  if (p.ratio != null) patch.targetRatio = p.ratio;
  if (p.stallWidthFt != null) patch.stallWidthFt = p.stallWidthFt;
  if (p.stallDepthFt != null) patch.stallDepthFt = p.stallDepthFt;
  if (p.aisleWidthFt != null) patch.aisleWidthFt = p.aisleWidthFt;
  return patch;
}

/**
 * Uses that plan as a lot subdivision (houses on lots) rather than building
 * massing. This — the USE/TYPOLOGY — is the SF-vs-MF routing switch.
 *
 * The context `regime` must NOT route this decision: it describes the parking
 * structure (surface vs structured), and 'horizontal_pending' merely means
 * "vertical-capable typology, zoning FAR unknown". Routing on it is how an
 * RM40 multifamily parcel once got tiled with 14 house pads.
 */
const LOT_FIT_USES = new Set(['single_family', 'two_family', 'sf', 'duplex']);

/** Multifamily zoning code prefixes (Nashville: RM20/RM40/…, MF, RX mixed) */
const MF_ZONING = /^(RM|MF|RX)/i;

export function routesToLotFit(ctx: DesignContext | null, selectedUse?: string): boolean {
  // Belt-and-braces: ctx.typology merely ECHOES the typology the context was
  // fetched for. If the default-use auto-correction couldn't run (permitted-
  // uses RPC hiccup), that echo says 'single_family' on multifamily land —
  // the zoning code itself is the tiebreaker that keeps RM/MF parcels on the
  // massing path.
  if (ctx?.zoningBase && MF_ZONING.test(ctx.zoningBase)) return false;
  const t = (ctx?.typology ?? selectedUse ?? '').toLowerCase();
  return LOT_FIT_USES.has(t);
}

/**
 * permitted-uses vocabulary → typology_spec vocabulary. The two backend
 * functions disagree ('multi_family' vs 'multifamily'), and typology_spec has
 * no two_family row yet, so duplex-family uses fall back to the SF spec.
 */
export function toContextTypology(use: string): string {
  const u = use.toLowerCase().trim();
  if (u === 'multi_family' || u === 'multifamily' || u === 'mf') return 'multifamily';
  if (u === 'two_family' || u === 'duplex') return 'single_family';
  if (u === 'single_family' || u === 'sf') return 'single_family';
  return u;
}

/**
 * Zoning-grounded default use: the highest-intensity residential use that is
 * permitted AS OF RIGHT. This is what stops an RM40 parcel from defaulting to
 * a single-family plan just because 'single_family' was the hardcoded initial.
 */
const USE_PRIORITY = ['multi_family', 'multifamily', 'two_family', 'single_family'];

export function pickDefaultUse(uses: string[]): string | null {
  if (uses.length === 0) return null;
  for (const u of USE_PRIORITY) {
    if (uses.includes(u)) return u;
  }
  return uses[0];
}

// ── Fetchers (all fail-soft: null on any error) ─────────────────────────────

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      console.warn(`[designContext] ${fn} failed:`, error.message ?? error);
      return null;
    }
    return (data as T) ?? null;
  } catch (err) {
    console.warn(`[designContext] ${fn} threw:`, err);
    return null;
  }
}

export function fetchDesignContext(ogcFid: number, use: string) {
  // The RPC's p_typology must be a typology_spec row — map from whatever
  // vocabulary the use came in as (permitted-uses list, UI selector, …).
  return rpc('fn_resolve_design_context', { p_ogc_fid: ogcFid, p_typology: toContextTypology(use) });
}

export function fetchPermittedUses(ogcFid: number) {
  return rpc('fn_resolve_permitted_uses', { p_ogc_fid: ogcFid });
}

export function fetchLocalBuiltForm(ogcFid: number) {
  return rpc('fn_local_built_form', { p_ogc_fid: ogcFid });
}

export function fetchLocalPricing(ogcFid: number) {
  return rpc('fn_local_pricing', { p_ogc_fid: ogcFid });
}

/** Tolerant reader for warning flags → list of strings for chips. */
export function normalizeFlags(json: unknown): string[] {
  if (json == null) return [];
  const list = Array.isArray(json) ? json : typeof json === 'object' ? Object.values(json) : [json];
  return list
    .map(f => (typeof f === 'string' ? f : (f as Record<string, unknown>)?.flag ?? (f as Record<string, unknown>)?.message))
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
}

/** Tolerant reader for the permitted-uses payload → list of use strings. */
export function normalizePermittedUses(json: unknown): string[] {
  if (json == null) return [];
  const o = (typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const list = (Array.isArray(json) ? json : (pick(o, 'feasible_uses_as_of_right', 'feasible_uses', 'uses') as unknown[])) ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map(u => (typeof u === 'string' ? u : (u as Record<string, unknown>)?.use))
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
}
