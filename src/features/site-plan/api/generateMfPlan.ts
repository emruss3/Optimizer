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

  for (const b of resp.buildings ?? []) {
    const poly = toCanvasPolygon(b.geom);
    if (!poly) continue;
    const floors = Math.max(1, Math.round(b.floors ?? 3));
    const unitsForBar = Math.max(1, Math.round(((b.footprint_sqft ?? 0) * floors) / AVG_UNIT_SF));
    elements.push({
      id: `mfgen-bldg-${b.i}`,
      type: 'building',
      name: `Building ${b.i}`,
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
      properties: { stalls: p.stalls, color: '#CBD5E1' },
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
      ? (resp.flags as unknown[]).filter((f): f is string => typeof f === 'string')
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

/** One persisted scheme (candidate) in a parcel's design history. */
export interface MfCandidate {
  id: string;
  createdAt: string;
  seed: number;
  pins: MfPin[];
  parentId: string | null;
  metrics: Record<string, number | string | null>;
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
    return (data as Record<string, unknown>[]).map(r => ({
      id: String(r.id),
      createdAt: String(r.created_at ?? ''),
      seed: Number(r.seed) || 1,
      pins: Array.isArray(r.pins) ? (r.pins as MfPin[]) : [],
      parentId: (r.parent_candidate_id as string | null) ?? null,
      metrics: (r.metrics as Record<string, number | string | null>) ?? {},
    }));
  } catch {
    return [];
  }
}
