// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { supabase } from '../lib/supabase';

export interface RoadImportResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Check if roads exist for a parcel and import from OpenStreetMap if needed
 * @param ogc_fid - The parcel OGC_FID
 * @returns Result object with success status and message
 */
export async function checkAndImportOSMRoads(ogc_fid: number): Promise<RoadImportResult> {
  try {
    console.log('🛣️ [OSMRoads] Checking roads for parcel:', ogc_fid);

    // Check if roads table exists
    const { data: roadCheck, error: roadError } = await supabase
      .from('roads')
      .select('id')
      .eq('parcel_ogc_fid', ogc_fid)
      .limit(1);

    if (roadError) {
      // If table doesn't exist, try to create it or return error
      if (roadError.message.includes('does not exist')) {
        console.warn('⚠️ [OSMRoads] Roads table does not exist');
        return {
          success: false,
          error: 'Roads table does not exist. Please deploy database migrations first.'
        };
      }
      throw roadError;
    }

    // If roads already exist, return success
    if (roadCheck && roadCheck.length > 0) {
      console.log('✅ [OSMRoads] Roads already exist for this parcel');
      return {
        success: true,
        message: 'Roads already available for this parcel'
      };
    }

    // Import roads using RPC function (if available)
    console.log('📍 [OSMRoads] Importing roads from OpenStreetMap...');
    
    const { data: importResult, error: importError } = await supabase.rpc(
      'import_roads_for_parcel',
      { p_ogc_fid: ogc_fid }
    );

    if (importError) {
      // If RPC doesn't exist, return helpful error
      if (importError.message.includes('does not exist')) {
        return {
          success: false,
          error: 'Road import function not available. Please deploy database migrations.'
        };
      }
      throw importError;
    }

    if (importResult) {
      console.log('✅ [OSMRoads] Roads imported successfully');
      return {
        success: true,
        message: `Successfully imported ${importResult.count || 0} road segments`
      };
    }

    return {
      success: false,
      error: 'Road import completed but no data returned'
    };
  } catch (error) {
    console.error('❌ [OSMRoads] Error importing roads:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error importing roads'
    };
  }
}

/**
 * Browser-based road import using Mapbox (if token provided)
 * Falls back to OSM import if Mapbox token not available
 * @param ogc_fid - The parcel OGC_FID
 * @param mapboxToken - Optional Mapbox access token
 * @returns Result object with success status and message
 */
export async function browserImportRoads(
  ogc_fid: number,
  mapboxToken?: string
): Promise<RoadImportResult> {
  try {
    console.log('🛣️ [BrowserRoads] Importing roads for parcel:', ogc_fid);

    // If Mapbox token provided, use Mapbox API
    if (mapboxToken) {
      // TODO: Implement Mapbox road import if needed
      // For now, fall back to OSM
      console.log('📍 [BrowserRoads] Mapbox token provided, but using OSM fallback');
    }

    // Use OSM import as fallback/default
    return await checkAndImportOSMRoads(ogc_fid);
  } catch (error) {
    console.error('❌ [BrowserRoads] Error importing roads:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error importing roads'
    };
  }
}
