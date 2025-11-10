// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { createClient } from '@supabase/supabase-js';
import { GeoJSONGeometry } from '../types/parcel';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn('⚠️ Missing Supabase environment variables');
  console.warn('   Please add to your .env file:');
  console.warn('   VITE_SUPABASE_URL=https://okxrvetbzpoazrybhcqj.supabase.co');
  console.warn('   VITE_SUPABASE_ANON_KEY=your_anon_key');
}

// Singleton pattern: reuse the same client instance to avoid multiple GoTrueClient instances
// @ts-expect-error attach to window to ensure singleton in HMR/dev
if (!(window as any).__supabase) {
  if (url && anon) {
    (window as any).__supabase = createClient(url, anon, {
      auth: { persistSession: true, storageKey: 'kissy-auth' }, // make storageKey explicit
    });
  } else {
    (window as any).__supabase = null;
  }
}

export const supabase = (window as any).__supabase;

import { RegridZoningData } from '../types/zoning';

// Types for our database tables
export interface Parcel {
  id: string;
  address: string;
  deededacreage: number;
  sqft: number;
  zoning: string;
  geometry?: GeoJSONGeometry;
  // Enhanced zoning data
  zoning_data?: RegridZoningData;
}

export interface Zoning {
  zoning: string;
  max_far: number;
  max_density_du_per_acre: number;
  max_impervious_coverage_pct: number;
  min_front_setback_ft: number;
  min_side_setback_ft: number;
  min_rear_setback_ft: number;
  // Enhanced fields from Regrid schema
  zoning_type?: string;
  zoning_subtype?: string;
  zoning_description?: string;
  permitted_land_uses?: Record<string, string[]>;
  min_lot_area_sq_ft?: number;
  min_lot_width_ft?: number;
  max_building_height_ft?: number;
  max_coverage_pct?: number;
  min_landscaped_space_pct?: number;
  min_open_space_pct?: number;
  municipality_name?: string;
}

export interface ParcelGeoJSON {
  type: 'Feature';
  properties: Parcel;
  geometry: GeoJSONGeometry;
}