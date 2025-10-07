// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { supabase } from '../../../lib/supabase';

export interface ScorePadResult {
  score: number;
  parcel_area_sqft: number;
  building_area_sqft: number;
  parking_area_sqft: number;
  landscape_area_sqft: number;
  total_building_area_sqft: number;
  coverage_ratio: number;
  far_ratio: number;
  parking_ratio: number;
  setback_compliance: boolean;
  zoning_compliance: boolean;
  timestamp: string;
}

export interface ScorePadParams {
  parcel_id: string;
  building_geometry: any; // GeoJSON geometry
  parking_geometry?: any; // GeoJSON geometry
  landscape_geometry?: any; // GeoJSON geometry
  zoning_data?: Record<string, any>;
}

/**
 * Score a site plan layout using the score_pad RPC
 */
export async function scorePad(params: ScorePadParams): Promise<ScorePadResult> {
  try {
    const { data, error } = await supabase.rpc('score_pad', {
      parcel_id: params.parcel_id,
      building_geometry: params.building_geometry,
      parking_geometry: params.parking_geometry || null,
      landscape_geometry: params.landscape_geometry || null,
      zoning_data: params.zoning_data || {}
    });

    if (error) {
      throw new Error(`Score pad RPC failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from score_pad RPC');
    }

    return data as ScorePadResult;
  } catch (error) {
    console.error('Error scoring site plan:', error);
    throw error;
  }
}

/**
 * Batch score multiple site plan layouts
 */
export async function batchScorePad(
  parcel_id: string,
  layouts: Array<{
    id: string;
    building_geometry: any;
    parking_geometry?: any;
    landscape_geometry?: any;
    zoning_data?: Record<string, any>;
  }>
): Promise<Array<{ id: string; result: ScorePadResult }>> {
  const results = await Promise.allSettled(
    layouts.map(async (layout) => {
      const result = await scorePad({
        parcel_id,
        building_geometry: layout.building_geometry,
        parking_geometry: layout.parking_geometry,
        landscape_geometry: layout.landscape_geometry,
        zoning_data: layout.zoning_data
      });
      return { id: layout.id, result };
    })
  );

  return results
    .filter((result): result is PromiseFulfilledResult<{ id: string; result: ScorePadResult }> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value);
}

/**
 * Get buildable envelope for a parcel
 */
export async function getBuildableEnvelope(
  parcel_id: string,
  front_ft: number,
  side_ft: number,
  rear_ft: number
): Promise<any> {
  try {
    const { data, error } = await supabase.rpc('get_buildable_envelope', {
      parcel_id,
      front_ft,
      side_ft,
      rear_ft
    });

    if (error) {
      throw new Error(`Get buildable envelope RPC failed: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting buildable envelope:', error);
    throw error;
  }
}

/**
 * Get parcel geometry in Web Mercator projection
 */
export async function getParcelGeometry3857(parcel_id: string): Promise<any> {
  try {
    const { data, error } = await supabase.rpc('get_parcel_geometry_3857', {
      parcel_id
    });

    if (error) {
      throw new Error(`Get parcel geometry RPC failed: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting parcel geometry:', error);
    throw error;
  }
}
