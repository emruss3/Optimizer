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

export interface PlanPattern {
  version?: string;
  parcel_ogc_fid: number;
  typology?: string;
  pattern: string;
  alternates?: string[];
  principles?: string[];
  selection_basis?: Record<string, unknown>;
  exemplars?: PlanExemplar[];
  generator_alignment?: { generator?: string; aligned?: boolean; note?: string };
  error?: string;
}

/** Deal-language names for the pattern keys. */
export const PATTERN_LABELS: Record<string, string> = {
  subdivision_row_spine: 'Subdivision on a public ROW spine with rear alleys',
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

export async function fetchPlanPattern(ogcFid: number, typology = 'multifamily'): Promise<PlanPattern | null> {
  if (!supabase || !ogcFid) return null;
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
