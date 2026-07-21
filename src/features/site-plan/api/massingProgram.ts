import { supabase } from '../../../lib/supabase';

/**
 * WO3: the massing program — the engine's composition directive ("build
 * THIS program"): building count from consolidation (never precedent
 * count), bar dims from the unit program, stories + construction type from
 * the max-buildout ladder and IBC table, parti from frontage, and the
 * napkin rationale sentence. Brief-first: once the compiler composes
 * `massing_program` into the solver brief, the brief wins; until then this
 * direct fetch powers the worker and the plan-basis line. Cached per
 * parcel+typology.
 */
export interface MassingProgram {
  parcel_ogc_fid: number;
  typology: string;
  target_gsf?: number | null;
  stories?: number | null;
  building_count?: number | null;
  per_building?: {
    bar_length_ft?: number | null;
    bar_depth_ft?: number | null;
    footprint_sqft?: number | null;
    gsf?: number | null;
  } | null;
  construction_type?: {
    type?: string | null;
    max_stories?: number | null;
    max_height_ft?: number | null;
    description?: string | null;
    source?: string | null;
  } | null;
  parti?: string | null;
  rationale?: string | null;
  frontage?: { primary_ft?: number | null; landlocked?: boolean; bearing_deg?: string | number | null } | null;
  building_count_basis?: string | null;
}

const cache = new Map<string, Promise<MassingProgram | null>>();

export async function fetchMassingProgram(
  ogcFid: number,
  typology = 'multifamily'
): Promise<MassingProgram | null> {
  if (!supabase || !ogcFid) return null;
  const key = `${ogcFid}:${typology}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc('fn_massing_program', {
        p_ogc_fid: ogcFid,
        p_typology: typology,
      });
      if (error || !data || (data as { error?: string }).error) return null;
      return data as MassingProgram;
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  const resolved = await p;
  if (resolved === null) cache.delete(key);
  return resolved;
}
