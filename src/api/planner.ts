import { supabase } from '../lib/supabase';

export async function fetchBuildableEnvelope(ogc_fid: number) {
  const { data, error } = await supabase
    .rpc("get_parcel_buildable_envelope", { p_ogc_fid: ogc_fid });

  if (error) throw error;
  // data[0].buildable_geom is EPSG:3857 geometry (WKB/GeoJSON depending on your client)
  return data?.[0] ?? null; // { ogc_fid, buildable_geom, area_sqft, edge_types, setbacks_applied, easements_removed }
}
