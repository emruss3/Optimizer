import { supabase } from "./supabase";
import { normalizeEnvelope } from "./normalizeEnvelope";

export async function fetchEnvelopeSafe(parcelId: string | number) {
  const fid = Number(parcelId);

  // try parcel-specific RPC first
  let res = await supabase.rpc("get_parcel_buildable_envelope", { p_ogc_fid: fid });
  if (res.error) {
    console.warn("Primary RPC failed:", res.error.message);
  } else if (res.data) {
    return normalizeEnvelope(res.data);
  }

  // fallback to simpler RPC name if the first one threw
  res = await supabase.rpc("get_buildable_envelope", { p_parcel_id: String(parcelId) });
  if (res.error) {
    console.error("Fallback RPC also failed:", res.error.message);
    return null;        // gracefully handle instead of 500 bubbling up
  }

  return normalizeEnvelope(res.data);
}
