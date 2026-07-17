/**
 * Max-buildout envelope (fn_max_buildout): the developer's headline — how
 * many GSF the lot can legally carry, at what stories/unit size, and which
 * constraint binds first. Consumed directly until the compile composes it
 * into the context payload (additive read; fail-soft).
 */
import { supabase } from '../../../lib/supabase';

export interface StoriesRung {
  stories: number;
  units: number;
  max_gsf: number;
  unit_gsf: number;
  footprint_sqft: number;
  binding: string;
}

export interface EntitlementCapacity {
  lot_sqft?: number;
  lot_acres?: number;
  max_units?: number | null;
  max_gfa_sqft?: number | null;
  max_units_source?: string;
  far_uncapped_for_mf?: boolean;
  max_impervious_sqft?: number | null;
  basis?: string;
}

export interface MaxBuildout {
  parcel_ogc_fid: number;
  typology: string;
  max_gsf: number;
  at_stories: number;
  at_unit_gsf: number;
  units_at_max: number;
  binding_constraint: string;
  footprint_at_max?: number;
  stories_ladder: StoriesRung[];
  entitlement_capacity?: EntitlementCapacity;
  assumptions?: Record<string, unknown>;
  note?: string;
}

export function isMaxBuildout(v: unknown): v is MaxBuildout {
  const o = v as MaxBuildout | null;
  return (
    !!o &&
    typeof o === 'object' &&
    typeof o.max_gsf === 'number' &&
    typeof o.at_stories === 'number' &&
    Array.isArray(o.stories_ladder)
  );
}

/** "impervious_coverage" → "impervious coverage" for display. */
export function bindingLabel(constraint: string | undefined | null): string {
  if (!constraint) return 'unknown';
  return constraint.replace(/_/g, ' ');
}

const cache = new Map<string, Promise<MaxBuildout | null>>();

export function fetchMaxBuildout(
  ogcFid: number,
  typology: string = 'multifamily'
): Promise<MaxBuildout | null> {
  const key = `${ogcFid}|${typology}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const p = (async (): Promise<MaxBuildout | null> => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase.rpc('fn_max_buildout', {
        p_ogc_fid: ogcFid,
        p_typology: typology,
      });
      if (error) {
        console.warn('[maxBuildout] RPC failed:', error.message ?? error);
        return null;
      }
      return isMaxBuildout(data) ? data : null;
    } catch (err) {
      console.warn('[maxBuildout] RPC threw:', err);
      return null;
    }
  })();

  cache.set(key, p);
  p.then(r => {
    if (r == null) cache.delete(key); // failures must not poison the cache
  });
  return p;
}

export function __clearMaxBuildoutCache(): void {
  cache.clear();
}
