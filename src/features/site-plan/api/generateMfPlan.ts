/**
 * Multifamily site-plan generator client (Beat-TestFit M1+M2).
 *
 * fn_generate_mf_site_plan builds the whole site system server-side — entry
 * drive from the primary frontage, bar rows, parking streets, green courts,
 * amenity pad — grounded in typology_spec and the design context, with all
 * areas measured in EPSG:2274 true feet. The client renders it; it does not
 * re-measure or re-plan. Geometry converts 4326 → 3857 with the SAME function
 * the parcel outline uses, so alignment is guaranteed by construction.
 */
import type { Element, SiteMetrics } from '../../../engine/types';
import { generateUnitMixForCount } from '../../../engine/model';
import { supabase } from '../../../lib/supabase';
import { toCanvasPolygon } from './generateSfPlan';

/** Matches the server's average-unit assumption (units = GFA / 950). */
const AVG_UNIT_SF = 950;

interface MfGeom {
  geom: unknown;
}
interface MfBuilding extends MfGeom {
  i: number;
  footprint_sqft?: number;
  floors?: number;
  /** Townhome rows: unit count the server placed (th_context_v1) */
  units?: number;
  /** User-pinned bar (edit-as-regeneration): kept verbatim by the generator */
  pinned?: boolean;
  pin_index?: number;
}

/** A pinned bar constraint: 4326 polygon + floors, echoed by the generator. */
export interface MfPin {
  geom: unknown;
  floors?: number;
}
interface MfParking extends MfGeom {
  stalls?: number;
}
interface MfAmenity extends MfGeom {
  name?: string;
  area_sqft?: number;
}
interface MfGreen extends MfGeom {
  area_sqft?: number;
}

export interface MfPlanResponse {
  parcel_ogc_fid?: number;
  typology?: string;
  seed?: number;
  pins?: MfPin[];
  parent_candidate_id?: string | null;
  plan_basis?: string;
  session_id?: string;
  candidate_id?: string;
  persisted?: boolean;
  /** Context-contract fields (generator_version mf_context_v2*) */
  context_id?: string;
  context_version?: string;
  context_hash?: string;
  generator_version?: string;
  score_version?: string;
  program_prior_version?: string;
  score_total?: number;
  score_components?: Record<string, number>;
  /** How the Regrid precedent set was selected (planner_context_v2) */
  regrid_precedent_selection?: Record<string, unknown>;
  buildings?: MfBuilding[];
  parking?: MfParking[];
  drives?: MfGeom[];
  greens?: MfGreen[];
  amenity?: MfAmenity[];
  metrics?: Record<string, number | string | null>;
  flags?: unknown;
  /** Degenerate-generation message (e.g. envelope too shallow) */
  generation?: string;
  error?: string;
}

/** Server-plan elements are identified by prefix so a regenerate REPLACES. */
export function isMfPlanElement(el: Pick<Element, 'id'>): boolean {
  return el.id.startsWith('mfgen-');
}

const mNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Map the generator response onto canvas elements + planner metrics.
 * Areas come from the response (EPSG:2274 backend truth), never re-measured.
 */
export function mfPlanToElements(resp: MfPlanResponse): {
  elements: Element[];
  metrics: SiteMetrics | null;
  basis: string | null;
  flags: string[];
} {
  const now = new Date().toISOString();
  const elements: Element[] = [];
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };

  const isTownhome = resp.typology === 'townhome';
  for (const b of resp.buildings ?? []) {
    const poly = toCanvasPolygon(b.geom);
    if (!poly) continue;
    const floors = Math.max(1, Math.round(b.floors ?? 3));
    // Townhome rows carry their real unit count; apartment bars estimate
    // from GFA at the server's average-unit assumption.
    const unitsForBar = Math.max(
      1,
      Math.round(b.units ?? ((b.footprint_sqft ?? 0) * floors) / AVG_UNIT_SF)
    );
    elements.push({
      // Pinned bars keep a STABLE id across regenerations (index-based ids
      // renumber every solve, which would break live-drag element identity)
      id: b.pinned ? `mfgen-pin-${b.pin_index ?? 0}` : `mfgen-bldg-${b.i}`,
      type: 'building',
      name: isTownhome && b.units ? `Townhomes ${b.i} · ${b.units}u` : `Building ${b.i}`,
      geometry: poly,
      properties: {
        areaSqFt: b.footprint_sqft,
        floors,
        stories: floors,
        unitMix: generateUnitMixForCount(unitsForBar),
        use: 'residential',
        color: b.pinned ? '#2563EB' : '#3B82F6',
        pinned: b.pinned ?? false,
        pinIndex: b.pin_index,
      },
      metadata: meta,
    });
  }

  (resp.amenity ?? []).forEach((a, idx) => {
    const poly = toCanvasPolygon(a.geom);
    if (!poly) return;
    elements.push({
      id: `mfgen-amenity-${idx + 1}`,
      type: 'building',
      name: a.name ?? 'Clubhouse',
      geometry: poly,
      properties: { areaSqFt: a.area_sqft, floors: 1, stories: 1, use: 'amenity', color: '#F59E0B' },
      metadata: meta,
    });
  });

  (resp.parking ?? []).forEach((p, idx) => {
    const poly = toCanvasPolygon(p.geom);
    if (!poly) return;
    elements.push({
      id: `mfgen-park-${idx + 1}`,
      type: 'parking',
      name: p.stalls ? `Parking · ${p.stalls} stalls` : 'Parking',
      geometry: poly,
      // parkingSpaces is the canvas's stall-count vocabulary (bay labels)
      properties: { stalls: p.stalls, parkingSpaces: p.stalls, color: '#CBD5E1' },
      metadata: meta,
    });
  });

  (resp.drives ?? []).forEach((dr, idx) => {
    const poly = toCanvasPolygon(dr.geom);
    if (!poly) return;
    elements.push({
      id: `mfgen-drive-${idx + 1}`,
      type: 'circulation',
      name: idx === 0 ? 'Main Drive' : `Drive ${idx + 1}`,
      geometry: poly,
      properties: { color: '#94A3B8' },
      metadata: meta,
    });
  });

  (resp.greens ?? []).forEach((g, idx) => {
    const poly = toCanvasPolygon(g.geom);
    if (!poly) return;
    elements.push({
      id: `mfgen-green-${idx + 1}`,
      type: 'greenspace',
      name: 'Open space',
      geometry: poly,
      properties: { areaSqFt: g.area_sqft, color: '#86EFAC' },
      metadata: meta,
    });
  });

  const m = resp.metrics ?? {};
  const gfa = mNum(m.gfa_sqft);
  const metrics: SiteMetrics | null = gfa
    ? ({
        totalBuiltSF: gfa,
        siteCoveragePct: mNum(m.coverage_pct) ?? 0,
        achievedFAR: mNum(m.far) ?? 0,
        parkingRatio: mNum(m.parking_ratio_provided) ?? 0,
        openSpacePct: mNum(m.open_space_pct) ?? 0,
        totalUnits: mNum(m.units_est),
        stallsProvided: mNum(m.stalls),
        stallsRequired: mNum(m.stalls_required),
        // Server plans are constructed inside the setback envelope; parking
        // shortfall is surfaced via stalls (red) + plan-basis flag, not as a
        // zoning violation. Consumers (KpiStrip) need these present.
        violations: [],
        zoningCompliant: true,
      } as SiteMetrics)
    : null;

  return {
    elements,
    metrics,
    basis: resp.plan_basis ?? null,
    flags: Array.isArray(resp.flags)
      ? // Deduped: best-effort pinned solves append their marker once per
        // softened gate — counts ("+n") must reflect DISTINCT reasons.
        [...new Set((resp.flags as unknown[]).filter((f): f is string => typeof f === 'string'))]
      : [],
  };
}

export interface MfGenerateOptions {
  seed?: number;
  typology?: string;
  /** Edit-as-regeneration: bars the generator must keep verbatim */
  pins?: MfPin[];
  /** Candidate this variation descends from (lineage) */
  parentId?: string | null;
  /** false = view-only re-render (no new candidate row) */
  persist?: boolean;
}

/** Fail-soft RPC call: null (with a console warning) on any failure. */
export async function generateMfSitePlan(
  ogcFid: number,
  opts: MfGenerateOptions = {}
): Promise<MfPlanResponse | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_generate_mf_site_plan', {
      p_ogc_fid: ogcFid,
      p_typology: opts.typology ?? 'multifamily',
      p_seed: opts.seed ?? 1,
      p_pins: opts.pins && opts.pins.length > 0 ? opts.pins : null,
      p_parent: opts.parentId ?? null,
      p_persist: opts.persist ?? true,
    });
    if (error) {
      console.warn('[generateMfPlan] RPC failed:', error.message ?? error);
      return null;
    }
    const resp = data as MfPlanResponse | null;
    if (!resp) return null;
    if (resp.error || resp.generation) {
      console.info('[generateMfPlan] generator declined:', resp.error ?? resp.generation);
      return resp; // caller can distinguish "declined" from "unreachable"
    }
    return resp;
  } catch (err) {
    console.warn('[generateMfPlan] RPC threw:', err);
    return null;
  }
}

/**
 * Context-contract errors: the v2 generator REJECTED the request because the
 * context snapshot is wrong (missing, stale, for another parcel/use) or
 * generation is legally blocked. These must surface to the user — silently
 * regenerating on the legacy six-argument path would produce a plan that
 * ignores the compiled context while the UI still claims one exists.
 * The legacy generator remains ONLY the compatibility path for when the v2
 * RPC itself is unreachable (transport failure / not yet deployed).
 */
export const CONTEXT_CONTRACT_ERRORS = new Set([
  'planner_context_required',
  'planner_context_not_found',
  'planner_context_parcel_mismatch',
  'planner_context_use_mismatch',
  'planner_generation_not_allowed',
  'planner_solver_brief_invalid',
  'context_id and expected parcel are required',
]);

export function isContextContractError(err: string | null | undefined): boolean {
  return err != null && (CONTEXT_CONTRACT_ERRORS.has(err) || err.startsWith('planner_'));
}

/**
 * Context-driven generation (mf_context_v2): all planning values come from
 * the verified solver brief behind p_context_id. Contract errors surface in
 * the response's `error` (planner_generation_not_allowed,
 * planner_context_parcel_mismatch, …); transport failures return null.
 */
export async function generateMfSitePlanV2(
  ogcFid: number,
  contextId: string,
  opts: MfGenerateOptions = {}
): Promise<MfPlanResponse | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_generate_mf_site_plan_v2', {
      p_ogc_fid: ogcFid,
      p_typology: opts.typology ?? 'multifamily',
      p_seed: opts.seed ?? 1,
      p_pins: opts.pins && opts.pins.length > 0 ? opts.pins : null,
      p_parent: opts.parentId ?? null,
      p_persist: opts.persist ?? true,
      p_context_id: contextId,
    });
    if (error) {
      console.warn('[generateMfPlan] v2 RPC failed:', error.message ?? error);
      return null;
    }
    return (data as MfPlanResponse) ?? null;
  } catch (err) {
    console.warn('[generateMfPlan] v2 RPC threw:', err);
    return null;
  }
}

/**
 * Townhome product (th_context_v1): same context gate and response shape as
 * the MF generator, but a row/motor-court grammar with attached-dwelling
 * ordinance standards and townhome-typology Regrid unit form. Reuses the
 * MfPlanResponse pipeline (mapper, pins, rail, money) end to end.
 */
export async function generateThSitePlan(
  ogcFid: number,
  contextId: string,
  opts: Omit<MfGenerateOptions, 'typology'> = {}
): Promise<MfPlanResponse | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_generate_th_site_plan', {
      p_ogc_fid: ogcFid,
      p_seed: opts.seed ?? 1,
      p_pins: opts.pins && opts.pins.length > 0 ? opts.pins : null,
      p_parent: opts.parentId ?? null,
      p_persist: opts.persist ?? true,
      p_context_id: contextId,
    });
    if (error) {
      console.warn('[generateThPlan] RPC failed:', error.message ?? error);
      return null;
    }
    return (data as MfPlanResponse) ?? null;
  } catch (err) {
    console.warn('[generateThPlan] RPC threw:', err);
    return null;
  }
}

/** A3: the money block — local-sales revenue vs cost, with provenance. */
export interface MfMoney {
  available: boolean;
  gdv?: number;
  total_cost?: number;
  land?: number;
  hard_cost_psf?: number;
  cost_source?: string;
  price_psf_p50?: number;
  n_sales?: number;
  pricing_confidence?: string;
  margin_on_cost?: number;
  basis?: string;
  flags?: string[];
  reason?: string;
}

/** Value a scheme against LOCAL pricing. Fail-soft: null when unreachable. */
// Fail-QUIET, not just fail-soft: when the endpoint is broken (404/405/…),
// stop asking for the rest of the session instead of flooding the console —
// the rail enriches many candidates per refresh. Identical inputs share one
// in-flight/settled promise (same parcel+GFA ⇒ same margin).
let moneyConsecutiveFailures = 0;
let moneyUnavailable = false;
const moneyCache = new Map<string, Promise<MfMoney | null>>();

export function fetchMfMoney(
  ogcFid: number,
  gfaSqft: number,
  units?: number
): Promise<MfMoney | null> {
  if (!supabase || !gfaSqft || moneyUnavailable) return Promise.resolve(null);
  const key = `${ogcFid}|${Math.round(gfaSqft)}`;
  const hit = moneyCache.get(key);
  if (hit) return hit;

  const p = (async (): Promise<MfMoney | null> => {
    try {
      const { data, error } = await supabase!.rpc('fn_mf_money', {
        p_ogc_fid: ogcFid,
        p_gfa_sqft: gfaSqft,
        p_units: units ?? null,
      });
      if (error || !data) {
        moneyConsecutiveFailures += 1;
        if (moneyConsecutiveFailures >= 2 && !moneyUnavailable) {
          moneyUnavailable = true;
          console.info('[generateMfPlan] fn_mf_money unavailable — market margin hidden for this session:', error?.message ?? 'no data');
        }
        moneyCache.delete(key);
        return null;
      }
      moneyConsecutiveFailures = 0;
      return data as MfMoney;
    } catch {
      moneyCache.delete(key);
      return null;
    }
  })();
  moneyCache.set(key, p);
  return p;
}

/** Test hook. */
export function __resetMfMoneyAvailability(): void {
  moneyConsecutiveFailures = 0;
  moneyUnavailable = false;
  moneyCache.clear();
}

/** One persisted scheme (candidate) in a parcel's design history. */
export interface MfCandidate {
  id: string;
  createdAt: string;
  seed: number;
  pins: MfPin[];
  parentId: string | null;
  metrics: Record<string, number | string | null>;
  /** Context snapshot the candidate was generated from (v2 candidates only).
   *  A saved scheme stays explainable from the context that PRODUCED it — a
   *  view re-render must use this id, never today's context. */
  contextId: string | null;
  contextHash: string | null;
  /** Generator lineage for the rail's version tag (tolerant read) */
  generatorVersion?: string | null;
  /** Local-sales margin on cost (A3 ranking) — enriched client-side */
  marginOnCost?: number | null;
}

/** Enrich candidates with their local-sales margin so the rail can rank. */
export async function enrichCandidatesWithMoney(
  ogcFid: number,
  candidates: MfCandidate[]
): Promise<MfCandidate[]> {
  return Promise.all(
    candidates.map(async c => {
      const gfa = Number(c.metrics.gfa_sqft);
      const units = Number(c.metrics.units_est);
      if (!Number.isFinite(gfa) || gfa <= 0) return c;
      const m = await fetchMfMoney(ogcFid, gfa, Number.isFinite(units) ? units : undefined);
      return { ...c, marginOnCost: m?.available ? m.margin_on_cost ?? null : null };
    })
  );
}

/** A1 schemes rail: list a parcel's persisted candidates, newest first. */
export async function listMfCandidates(ogcFid: number, limit = 20): Promise<MfCandidate[]> {
  try {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('fn_list_mf_candidates', {
      p_ogc_fid: ogcFid,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map(r => {
      const metrics = (r.metrics as Record<string, number | string | null>) ?? {};
      // Context lineage reads tolerantly: v2 candidates persist context_hash
      // (and, on newer list RPCs, context_id) in/next to their metrics;
      // v1 candidates have neither and stay null.
      const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
      return {
        id: String(r.id),
        createdAt: String(r.created_at ?? ''),
        seed: Number(r.seed) || 1,
        pins: Array.isArray(r.pins) ? (r.pins as MfPin[]) : [],
        parentId: (r.parent_candidate_id as string | null) ?? null,
        metrics,
        contextId: str(r.context_id) ?? str(metrics.context_id),
        contextHash: str(r.context_hash) ?? str(metrics.context_hash),
        generatorVersion: str(r.generator_version) ?? str(metrics.generator_version),
      };
    });
  } catch {
    return [];
  }
}
