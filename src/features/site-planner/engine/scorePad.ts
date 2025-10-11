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
  p_parcel_id: string;
  p_pad_3857: any; // GeoJSON geometry in EPSG:3857
  p_parking_3857?: any; // GeoJSON geometry in EPSG:3857
}

/**
 * Score a site plan layout using the score_pad RPC
 */
export async function scorePad(params: ScorePadParams): Promise<ScorePadResult> {
  try {
    const { data, error } = await supabase.rpc('score_pad', {
      p_parcel_id: params.p_parcel_id,
      p_pad_3857: params.p_pad_3857,
      p_parking_3857: params.p_parking_3857 || null
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
  p_parcel_id: string,
  layouts: Array<{
    id: string;
    p_pad_3857: any;
    p_parking_3857?: any;
  }>
): Promise<Array<{ id: string; result: ScorePadResult }>> {
  const results = await Promise.allSettled(
    layouts.map(async (layout) => {
      const result = await scorePad({
        p_parcel_id,
        p_pad_3857: layout.p_pad_3857,
        p_parking_3857: layout.p_parking_3857
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
