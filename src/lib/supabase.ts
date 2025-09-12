import { createClient } from '@supabase/supabase-js';

console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY present:', Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY));

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Missing Supabase environment variables');
  console.warn('   Please add to your .env file:');
  console.warn('   VITE_SUPABASE_URL=https://okxrvetbzpoazrybhcqj.supabase.co');
  console.warn('   VITE_SUPABASE_ANON_KEY=your_anon_key');
}

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Types for our database tables
export interface Parcel {
  id: string;
  address: string;
  deededacreage: number;
  sqft: number;
  zoning: string;
  geometry?: any;
}

export interface Zoning {
  zoning: string;
  max_far: number;
  max_density_du_per_acre: number;
  max_impervious_coverage_pct: number;
  min_front_setback_ft: number;
  min_side_setback_ft: number;
  min_rear_setback_ft: number;
}

export interface ParcelGeoJSON {
  type: 'Feature';
  properties: Parcel;
  geometry: any;
}