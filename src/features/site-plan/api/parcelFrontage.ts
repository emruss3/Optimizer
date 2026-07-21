import { supabase } from '../../../lib/supabase';

/**
 * WO-1b: derived street frontage from the parcel fabric
 * (`fn_parcel_frontage`, validated at median 3.2 ft agreement vs assessor
 * footage). Brief-first discipline: once the compiler maps this into
 * `geometry.front_edge`, the compiled brief wins; until then the client
 * fetches it directly so entries, bearings, and the landlocked banner are
 * real TODAY. Cached per parcel — the fabric doesn't move between clicks.
 */
export interface ParcelFrontage {
  parcel_ogc_fid: number;
  landlocked: boolean;
  corner_lot?: boolean;
  n_segments: number;
  total_frontage_ft: number;
  primary?: {
    length_ft: number;
    bearing_deg: number;
    midpoint_2274: [number, number];
    geom_2274?: unknown;
  } | null;
  method?: string;
  note?: string;
}

const cache = new Map<number, Promise<ParcelFrontage | null>>();

export async function fetchParcelFrontage(ogcFid: number): Promise<ParcelFrontage | null> {
  if (!supabase || !ogcFid) return null;
  const hit = cache.get(ogcFid);
  if (hit) return hit;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc('fn_parcel_frontage', { p_ogc_fid: ogcFid });
      if (error || !data) return null;
      return data as ParcelFrontage;
    } catch {
      return null;
    }
  })();
  cache.set(ogcFid, p);
  const resolved = await p;
  if (resolved === null) cache.delete(ogcFid); // transient failures may retry
  return resolved;
}
