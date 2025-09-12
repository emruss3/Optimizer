import { supabase } from './supabase';

export async function fetchParcelAtPoint(lon: number, lat: number) {
  if (!supabase) throw new Error('Supabase not initialized');
  
  const { data, error } = await supabase.rpc('get_parcel_at_point', { lon, lat });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No parcel at point');
  return row; // full parcel record
}