import { supabase } from '../../../lib/supabase';

/**
 * The massing program is the engine's preferred composition prior: building
 * count from consolidation (never precedent count), bar dimensions from the
 * unit program, stories + construction type from the max-buildout ladder, and
 * a frontage-responsive parti. The server attempts it first, then relaxes
 * through split-one, plus-one, and free-pack when geometry or access requires
 * it. Brief-first: the compiled snapshot wins; this direct fetch remains a
 * compatibility path for the worker and plan-basis line. Cached per
 * parcel+typology.
 */
export interface MassingProgram {
  parcel_ogc_fid: number;
  typology: string;
  target_gsf?: number | null;
  role?: 'preferred_massing_prior' | string | null;
  relaxation_ladder?: Array<{
    step?: 'exact' | 'split_one' | 'plus_one' | 'free_pack' | string;
    description?: string | null;
  }> | null;
  relax_when?: {
    drive_network_disconnected?: boolean;
    placement_shortfall_gsf_pct_gt?: number | null;
  } | null;
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
  note?: string | null;
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
