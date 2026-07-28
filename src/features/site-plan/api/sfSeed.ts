import { supabase } from '../../../lib/supabase';
import type { SeedFamilyResponse } from './generateMfPlan';
import type { ParcelBuildability } from './parcelBuildability';

/**
 * Order-6 item 1: the typology switch behind the RefusalCard suggestion.
 * fn_parcel_buildability MF refusals carry `suggested_typology:
 * 'single_family'` only when the SF check is pre-verified server-side; on
 * tap, fn_generate_sf_seed returns the same seed-family payload (one house
 * polygon + a driveway, EPSG:2274) that seedFamilyPlanToElements renders.
 * A refused SF seed ({error:'sf_unbuildable'}) is a VERDICT — the caller
 * shows its buildability reason, never a dead spinner.
 */
export interface SfSeedResponse extends SeedFamilyResponse {
  buildability?: (ParcelBuildability & Record<string, unknown>) | null;
}

const cache = new Map<number, Promise<SfSeedResponse | null>>();

/** null = transport failure (retryable); a payload with `error` = a verdict. */
export async function fetchSfSeed(ogcFid: number): Promise<SfSeedResponse | null> {
  if (!supabase || !ogcFid) return null;
  const hit = cache.get(ogcFid);
  if (hit) return hit;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc('fn_generate_sf_seed', { p_ogc_fid: ogcFid });
      if (error || !data) return null;
      return data as SfSeedResponse;
    } catch {
      return null;
    }
  })();
  cache.set(ogcFid, p);
  const resolved = await p;
  if (resolved === null) cache.delete(ogcFid);
  return resolved;
}
