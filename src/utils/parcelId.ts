/**
 * Parcel ID standardization utilities
 * 
 * The app uses two different ID types:
 * - ogc_fid (number): Used for geometry RPCs like get_parcel_geometry_3857
 * - parcel_id (string): Used for planner RPCs like get_parcel_detail, get_buildable_envelope
 * 
 * This module provides utilities to convert between them and ensure consistent usage.
 */

export type OgcFid = number;
export type ParcelId = string;

/**
 * Convert ogc_fid (number) to parcel_id (string)
 * This is the standard conversion used throughout the app
 */
export function ogcFidToParcelId(ogcFid: OgcFid): ParcelId {
  return String(ogcFid);
}

/**
 * Convert parcel_id (string) to ogc_fid (number)
 * Use with caution - only when you need the numeric ID for geometry operations
 */
export function parcelIdToOgcFid(parcelId: ParcelId): OgcFid {
  const num = parseInt(parcelId, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid parcel_id: ${parcelId} - cannot convert to number`);
  }
  return num;
}

/**
 * Extract ogc_fid from map feature properties
 * This is the standard way to get the ID when clicking on map features
 */
export function extractOgcFidFromFeature(feature: any): OgcFid | null {
  const ogcFid = feature?.properties?.ogc_fid;
  if (typeof ogcFid === 'number') {
    return ogcFid;
  }
  if (typeof ogcFid === 'string') {
    const num = parseInt(ogcFid, 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Extract parcel_id from map feature properties
 * This converts the ogc_fid to the string format used by planner RPCs
 */
export function extractParcelIdFromFeature(feature: any): ParcelId | null {
  const ogcFid = extractOgcFidFromFeature(feature);
  return ogcFid ? ogcFidToParcelId(ogcFid) : null;
}

/**
 * Validate that an ID is a valid ogc_fid (positive integer)
 */
export function isValidOgcFid(id: any): id is OgcFid {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

/**
 * Validate that an ID is a valid parcel_id (non-empty string that can be parsed as integer)
 */
export function isValidParcelId(id: any): id is ParcelId {
  if (typeof id !== 'string' || id.trim() === '') {
    return false;
  }
  const num = parseInt(id, 10);
  return !isNaN(num) && num > 0;
}

/**
 * Create a standardized parcel selection object
 * This ensures consistent ID handling across the app
 */
export function createParcelSelection(feature: any): {
  ogcFid: OgcFid;
  parcelId: ParcelId;
  feature: any;
} | null {
  const ogcFid = extractOgcFidFromFeature(feature);
  if (!ogcFid) {
    return null;
  }
  
  return {
    ogcFid,
    parcelId: ogcFidToParcelId(ogcFid),
    feature
  };
}

/**
 * Get the appropriate ID for different RPC types
 */
export function getRpcId(ogcFid: OgcFid, rpcType: 'geometry' | 'planner'): OgcFid | ParcelId {
  switch (rpcType) {
    case 'geometry':
      return ogcFid; // Use numeric ID for geometry RPCs
    case 'planner':
      return ogcFidToParcelId(ogcFid); // Use string ID for planner RPCs
    default:
      throw new Error(`Unknown RPC type: ${rpcType}`);
  }
}

/**
 * Constants for RPC parameter names
 */
export const RPC_PARAMS = {
  GEOMETRY: 'p_ogc_fid',      // For get_parcel_geometry_3857
  PLANNER: 'p_parcel_id',     // For get_parcel_detail, get_buildable_envelope
  BBOX: 'p_parcel_ids'        // For batch operations
} as const;

/**
 * Create RPC parameters with the correct ID type
 */
export function createRpcParams(ogcFid: OgcFid, rpcType: 'geometry' | 'planner'): Record<string, any> {
  const id = getRpcId(ogcFid, rpcType);
  const paramName = rpcType === 'geometry' ? RPC_PARAMS.GEOMETRY : RPC_PARAMS.PLANNER;
  
  return {
    [paramName]: id
  };
}

/**
 * Create batch RPC parameters for multiple parcels
 */
export function createBatchRpcParams(ogcFids: OgcFid[]): Record<string, any> {
  return {
    [RPC_PARAMS.BBOX]: ogcFids.map(ogcFidToParcelId)
  };
}
