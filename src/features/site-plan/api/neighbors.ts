/**
 * Neighborhood context (fn_planner_neighbors): neighbor parcel outlines,
 * existing Regrid building footprints with stories, and street segments —
 * so a plan renders in its block (2D grey context, 3D white massing).
 * Display-only data; reprojected ONCE into the 3857 canvas frame here.
 */
import type { Polygon, LineString } from 'geojson';
import { supabase } from '../../../lib/supabase';
import { feature4326To3857 } from '../../../utils/reproject';
import { normalizeToPolygon } from '../../../engine/geometry';

export interface NeighborBuilding {
  /** Footprint in the canvas frame (EPSG:3857 metres) */
  polygon: Polygon;
  stories: number;
}

export interface NeighborRoad {
  line: LineString;
  name?: string | null;
  highway?: string | null;
}

export interface PlannerNeighbors {
  parcels: Polygon[];
  buildings: NeighborBuilding[];
  roads: NeighborRoad[];
}

function to3857Polygon(geom: unknown): Polygon | null {
  try {
    const g = geom as Polygon;
    if (!g?.coordinates?.[0] || g.coordinates[0].length < 4) return null;
    return normalizeToPolygon(feature4326To3857(g) as Polygon);
  } catch {
    return null;
  }
}

function to3857Line(geom: unknown): LineString | null {
  try {
    const g = geom as LineString;
    if (g?.type !== 'LineString' || !g.coordinates || g.coordinates.length < 2) return null;
    return feature4326To3857(g) as LineString;
  } catch {
    return null;
  }
}

const cache = new Map<number, Promise<PlannerNeighbors | null>>();

export function fetchPlannerNeighbors(ogcFid: number): Promise<PlannerNeighbors | null> {
  const hit = cache.get(ogcFid);
  if (hit) return hit;

  const p = (async (): Promise<PlannerNeighbors | null> => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase.rpc('fn_planner_neighbors', {
        p_ogc_fid: ogcFid,
        p_radius_ft: 500,
      });
      if (error || !data || typeof data !== 'object' || 'error' in (data as object)) {
        if (error) console.warn('[neighbors] RPC failed:', error.message ?? error);
        return null;
      }
      const o = data as {
        parcels?: Array<{ geom: unknown }>;
        buildings?: Array<{ geom: unknown; stories?: number }>;
        roads?: Array<{ geom: unknown; name?: string | null; highway?: string | null }>;
      };
      return {
        parcels: (o.parcels ?? [])
          .map(x => to3857Polygon(x.geom))
          .filter((g): g is Polygon => g != null),
        buildings: (o.buildings ?? [])
          .map(x => {
            const polygon = to3857Polygon(x.geom);
            return polygon
              ? { polygon, stories: Math.max(1, Math.round(x.stories ?? 1)) }
              : null;
          })
          .filter((b): b is NeighborBuilding => b != null),
        roads: (o.roads ?? [])
          .map(x => {
            const line = to3857Line(x.geom);
            return line ? { line, name: x.name, highway: x.highway } : null;
          })
          .filter((r): r is NeighborRoad => r != null),
      };
    } catch (err) {
      console.warn('[neighbors] RPC threw:', err);
      return null;
    }
  })();

  cache.set(ogcFid, p);
  p.then(r => {
    if (r == null) cache.delete(ogcFid);
  });
  return p;
}

export function __clearNeighborsCache(): void {
  cache.clear();
}
