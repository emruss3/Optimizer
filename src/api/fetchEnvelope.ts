import { supabase } from '../lib/supabase';

export async function getEnvelope(ogc_fid: number) {
  console.log('🔍 [getEnvelope] Fetching envelope for ogc_fid:', ogc_fid);
  
  if (!supabase) {
    console.error('❌ [getEnvelope] Supabase client not available');
    throw new Error('Supabase client not initialized');
  }

  const startTime = Date.now();
  const { data, error } = await supabase.rpc(
    "get_parcel_buildable_envelope",
    { p_ogc_fid: ogc_fid }
  );
  const duration = Date.now() - startTime;

  if (error) {
    console.error('❌ [getEnvelope] RPC error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      duration
    });
    throw error;
  }

  console.log(`✅ [getEnvelope] RPC completed in ${duration}ms:`, {
    hasData: !!data,
    dataLength: data?.length,
    hasFirstItem: !!data?.[0],
    firstItemKeys: data?.[0] ? Object.keys(data[0]) : [],
    hasBuildableGeom: !!data?.[0]?.buildable_geom,
    areaSqft: data?.[0]?.area_sqft
  });

  return data?.[0];
}
