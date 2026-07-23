import { supabase } from '../../../lib/supabase';

/**
 * Stage-1+2 seed plan (SEND_TO_CLAUDE_CODE_4 item 1): the engine's COMPLETE
 * placed plan — skeleton (entry/spine/zones), single-L legs with retention
 * stats and DOF, and the double-loaded parking seed — all EPSG:2274 true
 * feet. The client draws it stage-ordered; it never re-measures it.
 * Cached per parcel+typology; null not cached.
 */
type Geom2274 = { type: string; coordinates: unknown; crs?: unknown };

export interface SeedLeg {
  geom_2274: Geom2274;
  length_ft: number;
  depth_ft: number;
  envelope_retention_pct: number;
}

export interface SeedPlan {
  parcel_ogc_fid: number;
  basis?: string | null;
  composition?: string | null;
  stories?: number | null;
  construction_type?: { type?: string | null; description?: string | null } | null;
  skeleton?: {
    entry_2274?: Geom2274 | null;
    spine_2274?: Geom2274 | null;
    front_zone_2274?: Geom2274 | null;
    rear_zone_2274?: Geom2274 | null;
    rear_zone_sqft?: number | null;
  } | null;
  seed?: {
    leg1?: SeedLeg | null;
    wing?: SeedLeg | null;
    dof?: Record<string, unknown> | null;
  } | null;
  parking_seed?: {
    bays?: Array<{ geom_2274: Geom2274; area_sqft?: number | null; row?: number | null }> | null;
    stalls_target?: number | null;
    stalls_achieved_est?: number | null;
    coverage_of_target_pct?: number | null;
    basis?: string | null;
  } | null;
}

const cache = new Map<string, Promise<SeedPlan | null>>();

export async function fetchSeedPlan(ogcFid: number, typology = 'multifamily'): Promise<SeedPlan | null> {
  if (!supabase || !ogcFid) return null;
  const key = `${ogcFid}:${typology}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc('fn_seed_parking', {
        p_ogc_fid: ogcFid,
        p_typology: typology,
      });
      if (error || !data || (data as { error?: string }).error) return null;
      const seed = data as SeedPlan;
      // A seed without at least one placed leg draws nothing — treat as absent.
      if (!seed.seed?.leg1?.geom_2274) return null;
      return seed;
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  const resolved = await p;
  if (resolved === null) cache.delete(key);
  return resolved;
}
