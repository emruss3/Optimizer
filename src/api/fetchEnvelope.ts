import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function getEnvelope(ogc_fid: number) {
  const { data, error } = await supabase.rpc(
    "get_parcel_buildable_envelope",
    { p_ogc_fid: ogc_fid }
  );
  if (error) throw error;
  return data?.[0];
}
