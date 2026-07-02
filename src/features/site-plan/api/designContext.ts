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

export interface DesignContext {
  zoningBase?: string;
  zoningSubtype?: string;
  /** 'civil_horizontal' (lots/streets) vs 'architectural_vertical' (massing) */
  regime?: string;
  confidence?: Confidence;
  setbackFrontFt?: ContextValue;
  setbackSideFt?: ContextValue;
  setbackRearFt?: ContextValue;
  maxFar?: ContextValue;
  maxHeightFt?: ContextValue;
  maxDensityDuAc?: ContextValue;
  maxCoveragePct?: ContextValue;
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
    confidence: CONFIDENCES.includes(pick(o, 'confidence', 'context_confidence') as Confidence)
      ? (pick(o, 'confidence', 'context_confidence') as Confidence)
      : undefined,
    setbackFrontFt: cv(pick(setbacks, 'front', 'front_ft') ?? pick(o, 'front_setback_ft', 'min_front_setback_ft')),
    setbackSideFt: cv(pick(setbacks, 'side', 'side_ft') ?? pick(o, 'side_setback_ft', 'min_side_setback_ft')),
    setbackRearFt: cv(pick(setbacks, 'rear', 'rear_ft') ?? pick(o, 'rear_setback_ft', 'min_rear_setback_ft')),
    maxFar: cv(pick(o, 'far', 'max_far', 'maxFar')),
    maxHeightFt: cv(pick(o, 'height_ft', 'max_height_ft', 'maxHeightFt')),
    maxDensityDuAc: cv(pick(o, 'density_du_ac', 'max_density_du_per_acre', 'density')),
    maxCoveragePct: cv(pick(o, 'coverage_pct', 'max_coverage_pct', 'max_impervious_coverage_pct')),
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

export function fetchDesignContext(ogcFid: number, typology: string) {
  return rpc('fn_resolve_design_context', { p_ogc_fid: ogcFid, p_typology: typology });
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
