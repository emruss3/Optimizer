import { supabase } from '../../../lib/supabase';

/**
 * Plan-organization layer (fn_plan_pattern): HOW this parcel should be
 * organized — the pattern, its principles, the exemplar plans that show it,
 * and an honest verdict on whether our generator draws that pattern today.
 * Eric, 2026-09-03: "We need to know the best way to organize a plan, not fit
 * what's buildable as a box in the corner of the lot."
 */
export interface PlanExemplar {
  name: string;
  source: string;
  source_date?: string | null;
  parcel_ogc_fid?: number | null;
  pattern: string;
  program?: Record<string, unknown> | null;
  principles?: string[] | null;
}

/**
 * What the generator achieved on PARCELS LIKE THIS ONE (same zoning base,
 * ½× to 2× the acreage) in the population sweep — the number a single
 * parcel's result is read against. Server-computed from subdivision_sweep.
 */
export interface PlanCalibration {
  n: number;
  band?: { zoning?: string | null; acres_lo?: number; acres_hi?: number } | null;
  refused_pct?: number | null;
  median_du_ac?: number | null;
  p25_du_ac?: number | null;
  p75_du_ac?: number | null;
  median_lots?: number | null;
  median_pct_row?: number | null;
  median_pct_lots?: number | null;
  median_pct_residual?: number | null;
  median_pct_hazard?: number | null;
  networks?: Record<string, number> | null;
  generator_version?: string | null;
  sweep_run_at?: string | null;
  basis?: string | null;
}

export interface PlanPattern {
  version?: string;
  parcel_ogc_fid: number;
  typology?: string;
  pattern: string;
  alternates?: string[];
  principles?: string[];
  selection_basis?: Record<string, unknown>;
  exemplars?: PlanExemplar[];
  calibration?: PlanCalibration | null;
  generator_alignment?: { generator?: string; aligned?: boolean; note?: string };
  error?: string;
}

/** Deal-language names for the pattern keys. */
export const PATTERN_LABELS: Record<string, string> = {
  subdivision_row_spine: 'Subdivision on a public ROW spine with rear alleys',
  subdivision_street_grid: 'Subdivision on a street grid with rear alleys',
  townhome_rows_on_spine: 'Townhome rows on a ROW spine',
  house_on_lot: 'One house on the lot',
  duplex_on_lot: 'Duplex on the lot',
  bar_on_frontage_rear_field: 'Bar on the frontage, parking field behind',
  court_scheme_perpendicular_bars: 'Perpendicular bars framing courts to the street',
  podium_tower: 'Podium parking with liner units, tower above',
  landlocked_axis_bar: 'Axis bar on a landlocked lot, easement access',
  retail_full_plate: 'Retail: single-tenant full plate at the FAR ceiling',
  retail_stacked_two_tenant: 'Retail: stacked two-tenant (retail below, restaurant + terrace above)',
  unknown: 'No pattern — no as-of-right use resolved',
};

export function patternLabel(key: string | null | undefined): string {
  if (!key) return 'No pattern';
  return PATTERN_LABELS[key] ?? key.replace(/_/g, ' ');
}

const cache = new Map<string, Promise<PlanPattern | null>>();

/**
 * Fetch the plan pattern for a parcel with the appropriate typology.
 * Order-8 commercial correction (2026-09-11): commercial parcels should query
 * with p_typology='commercial', not default to 'multifamily'. Pass `zoning` or
 * `use` to auto-select; otherwise defaults to 'multifamily' for backward compat.
 */
export async function fetchPlanPattern(
  ogcFid: number,
  options?: { typology?: string; zoning?: string | null; use?: string | null }
): Promise<PlanPattern | null> {
  if (!supabase || !ogcFid) return null;
  
  // Infer typology from zoning/use if not explicitly provided
  let typology = options?.typology;
  if (!typology) {
    if (options?.use === 'commercial' || (options?.zoning && /^C[SLNP]?|^COMMERCIAL/i.test(options.zoning))) {
      typology = 'commercial';
    } else {
      typology = 'multifamily'; // backward-compatible default
    }
  }
  
  const key = `${ogcFid}:${typology}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc('fn_plan_pattern', { p_ogc_fid: ogcFid, p_typology: typology });
      if (error || !data || (data as { error?: string }).error) return null;
      const pp = data as PlanPattern;
      return typeof pp.pattern === 'string' ? pp : null;
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  const resolved = await p;
  if (resolved === null) cache.delete(key);
  return resolved;
}

export function __clearPlanPatternCache(): void {
  cache.clear();
}
