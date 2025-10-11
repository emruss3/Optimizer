// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { supabase } from '../../../lib/supabase';

export interface ScorePadResult {
  pad_sf: number;
  env_sf: number;
  coverage: number;
  stalls: number;
  stalls_needed: number;
  far_ok: boolean;
  parking_ok: boolean;
  envelope_ok: boolean;
  score: number;
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

// Note: get_buildable_envelope and get_parcel_geometry_3857 functions
// are now handled by the parcelGeometry service with correct signatures
