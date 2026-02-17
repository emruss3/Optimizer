import { supabase } from '../lib/supabase';
import type { LineString } from 'geojson';

export interface NearbyRoad {
  id: number;
  name: string | null;
  highway: string | null;
  geom: LineString;
}

/**
 * Fetch roads near a parcel via the get_roads_near_parcel RPC.
 *
 * @param ogcFid     Parcel OGC_FID (integer)
 * @param bufferM    Search buffer in metres (default 60 ≈ 200 ft)
 * @returns Array of nearby roads with LineString geometries in EPSG:3857
 */
export async function fetchNearbyRoads(
  ogcFid: number,
  bufferM: number = 60
): Promise<NearbyRoad[]> {
  if (!supabase) {
    console.warn('[fetchNearbyRoads] Supabase client not available');
    return [];
  }

  try {
    const { data, error } = await supabase.rpc('get_roads_near_parcel', {
      p_parcel_id: ogcFid,
      p_buffer_m: bufferM,
    });

    if (error) {
      // Gracefully handle missing function or table
      if (
        error.message?.includes('does not exist') ||
        error.message?.includes('Could not find')
      ) {
        console.warn('[fetchNearbyRoads] RPC not deployed yet:', error.message);
        return [];
      }
      console.error('[fetchNearbyRoads] RPC error:', error);
      return [];
    }

    if (!data || !Array.isArray(data)) return [];

    // The RPC returns `geom` as a PostGIS geometry.
    // Supabase REST returns it as GeoJSON when the column is geometry type.
    // We need to handle both cases: raw GeoJSON object or stringified JSON.
    return data
      .map((row: any) => {
        let geom: LineString | null = null;

        if (typeof row.geom === 'string') {
          try {
            geom = JSON.parse(row.geom) as LineString;
          } catch {
            return null;
          }
        } else if (row.geom && typeof row.geom === 'object') {
          geom = row.geom as LineString;
        }

        if (!geom || geom.type !== 'LineString' || !geom.coordinates?.length) {
          return null;
        }

        return {
          id: row.id,
          name: row.name ?? null,
          highway: row.highway ?? null,
          geom,
        } as NearbyRoad;
      })
      .filter((r): r is NearbyRoad => r !== null);
  } catch (err) {
    console.error('[fetchNearbyRoads] Unexpected error:', err);
    return [];
  }
}
