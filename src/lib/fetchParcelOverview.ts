import { supabase } from "./supabase";

// use the planner "text parcel_id" when possible; otherwise adapt ogc_fid
export async function fetchParcelOverviewAnyId(id: string | number) {
  const pid = String(id);
  // fastest: one-call detail
  let r = await supabase.rpc('get_parcel_detail', { p_parcel_id: pid });
  if (!r.error && r.data) return r.data;

  // fallback: views
  const j = await supabase.from('planner_join').select('*').eq('parcel_id', pid).single();
  if (!j.error && j.data) return j.data;

  // last resort: if caller gave numeric ogc_fid, try the envelope alt path for geometry
  const fid = Number(id);
  if (Number.isFinite(fid)) {
    const env = await supabase.rpc('get_parcel_buildable_envelope', { p_ogc_fid: fid });
    if (!env.error && env.data) {
      // combine with planner_parcels by fid->parcel_id lookup if needed...
      // For now, return the envelope data as a basic parcel overview
      return {
        ogc_fid: fid,
        parcel_id: pid,
        geometry: env.data.buildable_geom,
        area_sqft: env.data.area_sqft,
        source: 'envelope_fallback'
      };
    }
  }
  return null;
}
