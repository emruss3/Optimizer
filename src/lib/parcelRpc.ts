import { sb } from './rpc';
import { createRpcParams, createBatchRpcParams, type OgcFid, type ParcelId } from '../utils/parcelId';

/**
 * Standardized RPC client for parcel operations
 * 
 * This module provides type-safe RPC calls with proper ID handling:
 * - Geometry RPCs use ogc_fid (number)
 * - Planner RPCs use parcel_id (string)
 */

/**
 * Get parcel geometry in Web Mercator (3857) for canvas rendering
 * Uses ogc_fid (number) as required by the RPC
 */
export async function getParcelGeometry3857(ogcFid: OgcFid): Promise<any> {
  const params = createRpcParams(ogcFid, 'geometry');
  const { data, error } = await sb.rpc('get_parcel_geometry_3857', params);
  
  if (error) {
    console.error('Error fetching parcel geometry:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get complete parcel detail including envelope, metrics, and zoning
 * Uses parcel_id (string) as required by the RPC
 */
export async function getParcelDetail(parcelId: ParcelId): Promise<any> {
  const params = createRpcParams(parseInt(parcelId, 10), 'planner');
  const { data, error } = await sb.rpc('get_parcel_detail', params);
  
  if (error) {
    console.error('Error fetching parcel detail:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get buildable envelope for a parcel
 * Uses parcel_id (string) as required by the RPC
 */
export async function getBuildableEnvelope(parcelId: ParcelId): Promise<any> {
  const params = createRpcParams(parseInt(parcelId, 10), 'planner');
  const { data, error } = await sb.rpc('get_buildable_envelope', params);
  
  if (error) {
    console.error('Error fetching buildable envelope:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get buildable envelopes for multiple parcels
 * Uses parcel_ids (string[]) as required by the RPC
 */
export async function getBuildableEnvelopes(parcelIds: ParcelId[]): Promise<any> {
  const ogcFids = parcelIds.map(id => parseInt(id, 10));
  const params = createBatchRpcParams(ogcFids);
  const { data, error } = await sb.rpc('get_buildable_envelopes', params);
  
  if (error) {
    console.error('Error fetching buildable envelopes:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get parcel zoning and base information from planner views
 * This is the correct way to get planner-specific fields
 */
export async function getParcelZoningInfo(parcelId: ParcelId): Promise<any> {
  const { data, error } = await sb
    .from('planner_join')
    .select('*')
    .eq('parcel_id', parcelId)
    .single();
  
  if (error) {
    console.error('Error fetching parcel zoning info:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get parcel information from planner_parcels view
 * Alternative to planner_join if you need different fields
 */
export async function getParcelPlannerInfo(parcelId: ParcelId): Promise<any> {
  const { data, error } = await sb
    .from('planner_parcels')
    .select('*')
    .eq('parcel_id', parcelId)
    .single();
  
  if (error) {
    console.error('Error fetching parcel planner info:', error);
    throw error;
  }
  
  return data;
}

/**
 * Score a building design against parcel constraints
 * Uses parcel_id (string) as required by the RPC
 */
export async function scoreBuildingDesign(
  parcelId: ParcelId,
  buildingGeometry: any,
  options?: {
    frontSetback?: number;
    sideSetback?: number;
    rearSetback?: number;
    maxFAR?: number;
    maxCoverage?: number;
  }
): Promise<any> {
  const params = {
    p_parcel_id: parcelId,
    p_building_geometry: buildingGeometry,
    p_front_setback: options?.frontSetback || 0,
    p_side_setback: options?.sideSetback || 0,
    p_rear_setback: options?.rearSetback || 0,
    p_max_far: options?.maxFAR || null,
    p_max_coverage: options?.maxCoverage || null
  };
  
  const { data, error } = await sb.rpc('score_building_design', params);
  
  if (error) {
    console.error('Error scoring building design:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get exact buildable area for a parcel
 * Uses parcel_id (string) as required by the RPC
 */
export async function getExactBuildableArea(
  parcelId: ParcelId,
  setbacks: {
    front: number;
    side: number;
    rear: number;
  }
): Promise<any> {
  const params = {
    p_parcel_id: parcelId,
    p_front_setback: setbacks.front,
    p_side_setback: setbacks.side,
    p_rear_setback: setbacks.rear
  };
  
  const { data, error } = await sb.rpc('get_exact_buildable_area', params);
  
  if (error) {
    console.error('Error fetching exact buildable area:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get parcels in bounding box (for map loading)
 * This uses the existing get_parcels_in_bbox RPC
 */
export async function getParcelsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  options?: {
    minSqft?: number;
    maxResults?: number;
    zoningFilter?: string[];
  }
): Promise<any[]> {
  const params = {
    min_lng: minLng,
    min_lat: minLat,
    max_lng: maxLng,
    max_lat: maxLat,
    min_sqft: options?.minSqft || 0,
    max_results: options?.maxResults || 1000,
    zoning_filter: options?.zoningFilter || []
  };
  
  const { data, error } = await sb.rpc('get_parcels_in_bbox', params);
  
  if (error) {
    console.error('Error fetching parcels in bbox:', error);
    throw error;
  }
  
  return data;
}

/**
 * Utility function to get all parcel data in one call
 * This combines geometry, detail, and zoning info
 */
export async function getCompleteParcelData(ogcFid: OgcFid): Promise<{
  geometry: any;
  detail: any;
  zoning: any;
}> {
  const parcelId = String(ogcFid);
  
  try {
    const [geometry, detail, zoning] = await Promise.all([
      getParcelGeometry3857(ogcFid),
      getParcelDetail(parcelId),
      getParcelZoningInfo(parcelId)
    ]);
    
    return {
      geometry,
      detail,
      zoning
    };
  } catch (error) {
    console.error('Error fetching complete parcel data:', error);
    throw error;
  }
}
