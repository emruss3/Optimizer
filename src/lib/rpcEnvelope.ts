import { supabase } from "./supabase";
import { normalizeEnvelope, NormalizedEnvelope } from "./normalizeEnvelope";

export async function getEnvelopeAny(parcelId: string | number): Promise<NormalizedEnvelope | null> {
  // 1) Try p_parcel_id (string id)
  let r = await supabase.rpc("get_buildable_envelope", { p_parcel_id: String(parcelId) });
  if (!r.error && r.data) return normalizeEnvelope(r.data);

  // 2) Fallback to p_ogc_fid (numeric id)
  const fid = Number(parcelId);
  if (Number.isFinite(fid)) {
    r = await supabase.rpc("get_parcel_buildable_envelope", { p_ogc_fid: fid });
    if (!r.error && r.data) return normalizeEnvelope(r.data);
  }

  // 3) Still nothing: return null (UI will handle)
  console.warn("No envelope from either RPC for", parcelId, r.error);
  return null;
}
