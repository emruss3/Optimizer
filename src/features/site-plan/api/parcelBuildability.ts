import { supabase } from '../../../lib/supabase';

/**
 * J1 refusal-as-deliverable (UX plan rev C): the engine's buildability
 * verdict, fetched the moment a parcel opens. A refused parcel is a
 * FIRST-CLASS result — the card renders the reason with its numbers
 * ("max width 41 ft < 67 ft bar") and what WOULD fit, not a dead end.
 * Cached per parcel; null is not cached (transient failures retry).
 */
export interface ParcelBuildability {
  parcel_ogc_fid: number;
  typology: string;
  /** 'buildable' | 'buildable_*' | 'unbuildable_area' | 'unbuildable_depth' | ... */
  verdict: string;
  reason?: string | null;
  envelope_sqft?: number | null;
  max_inscribed_width_ft?: number | null;
  bar_depth_required_ft?: number | null;
  note?: string | null;
}

export function isRefusal(b: ParcelBuildability | null | undefined): boolean {
  return !!b && b.verdict.startsWith('unbuildable');
}

const cache = new Map<number, Promise<ParcelBuildability | null>>();

export async function fetchParcelBuildability(ogcFid: number): Promise<ParcelBuildability | null> {
  if (!supabase || !ogcFid) return null;
  const hit = cache.get(ogcFid);
  if (hit) return hit;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc('fn_parcel_buildability', { p_ogc_fid: ogcFid });
      if (error || !data || (data as { error?: string }).error) return null;
      return data as ParcelBuildability;
    } catch {
      return null;
    }
  })();
  cache.set(ogcFid, p);
  const resolved = await p;
  if (resolved === null) cache.delete(ogcFid);
  return resolved;
}
