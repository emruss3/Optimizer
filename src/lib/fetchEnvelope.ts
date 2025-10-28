import { supabase } from "./supabase";
import { normalizeEnvelope } from "./normalizeEnvelope";

export async function fetchEnvelopeAny(id: string | number) {
  // prefer the text-id RPC; fallback to the ogc_fid version
  let r = await supabase.rpc('get_buildable_envelope', { p_parcel_id: String(id) });
  if (!r.error && r.data) return normalizeEnvelope(r.data);        // geometry(3857)

  const fid = Number(id);
  if (Number.isFinite(fid)) {
    r = await supabase.rpc('get_parcel_buildable_envelope', { p_ogc_fid: fid });
    if (!r.error && r.data) return normalizeEnvelope(r.data);      // table-return with buildable_geom/area_sqft...
  }
  return null;
}

// Legacy function name for backward compatibility
export const fetchEnvelopeSafe = fetchEnvelopeAny;
