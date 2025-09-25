import { supabase } from '../lib/supabase';

/**
 * Import road data from Mapbox Tilequery API for a specific parcel
 */
export async function importRoadsForParcel(ogcFid: number, mapboxToken?: string) {
  // Get Mapbox token from environment or parameter
  const token = mapboxToken || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN;
  try {
    console.log(`🗺️ Importing roads for parcel ${ogcFid} using Mapbox API`);
    
    // Get parcel geometry to determine search area
    const { data: parcelData, error: parcelError } = await supabase
      .from('parcels')
      .select('ogc_fid, wkb_geometry_4326, address, lat, lon')
      .eq('ogc_fid', ogcFid)
      .single();
    
    if (parcelError) {
      throw new Error(`Failed to get parcel: ${parcelError.message}`);
    }
    
    console.log('📦 Raw parcel data:', parcelData);
    
    // Parse parcel geometry - handle both string and object formats
    let geometry;
    try {
      if (typeof parcelData.wkb_geometry_4326 === 'string') {
        geometry = JSON.parse(parcelData.wkb_geometry_4326);
      } else if (typeof parcelData.wkb_geometry_4326 === 'object') {
        geometry = parcelData.wkb_geometry_4326;
      } else {
        throw new Error('Invalid geometry format');
      }
    } catch (parseError) {
      console.error('❌ Error parsing parcel geometry:', parseError);
      throw new Error(`Failed to parse parcel geometry: ${parseError.message}`);
    }
    const coordinates = geometry.coordinates[0];
    
    // Calculate parcel centroid
    const centerLon = coordinates.reduce((sum: number, coord: number[]) => sum + coord[0], 0) / coordinates.length;
    const centerLat = coordinates.reduce((sum: number, coord: number[]) => sum + coord[1], 0) / coordinates.length;
    
    console.log(`📍 Parcel center: ${centerLon}, ${centerLat}`);
    
    if (!token) {
      console.error('❌ No Mapbox token found');
      console.log('🔍 Checked for tokens:', {
        param: !!mapboxToken,
        env1: !!import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
        env2: !!import.meta.env.VITE_MAPBOX_TOKEN
      });
      throw new Error('Mapbox access token not found. Please add VITE_MAPBOX_ACCESS_TOKEN to your .env file.');
    }
    
    console.log('✅ Mapbox token found, length:', token.length);

    // Fetch nearby roads using Mapbox Tilequery API
    const radius = 300; // 300 meter search radius
    const url = `https://api.mapbox.com/tilequery/v1/mapbox.mapbox-streets-v8/tilequery/${centerLon},${centerLat}.json?radius=${radius}&layers=road&limit=50&access_token=${token}`;
    
    console.log(`🛣️ Fetching roads from Mapbox API...`);
    console.log(`📡 API URL: ${url.replace(token, 'TOKEN_HIDDEN')}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Mapbox API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.features.length} roads near parcel`);
    console.log('📍 Road features:', data.features.map(f => ({ 
      name: f.properties.name || f.properties.class, 
      class: f.properties.class 
    })));
    
    // Process and insert roads
    const roadInserts = [];
    for (const feature of data.features) {
      if (feature.geometry.type === 'LineString') {
        const roadData = {
          osm_id: feature.properties.id || Math.floor(Math.random() * 1000000),
          name: feature.properties.name || feature.properties.class || 'Unnamed Road',
          highway: feature.properties.class || 'unknown',
          surface: feature.properties.surface,
          lanes: feature.properties.lanes,
          oneway: feature.properties.oneway === 'true',
          maxspeed: feature.properties.maxspeed,
          // Convert GeoJSON LineString to WKT format for PostGIS
          geom: `LINESTRING(${feature.geometry.coordinates.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(',')})`
        };
        
        roadInserts.push(roadData);
      }
    }
    
      // Insert roads into database
      if (roadInserts.length > 0) {
        console.log(`💾 Inserting ${roadInserts.length} roads into database...`);
        console.log('🔍 Sample road data:', roadInserts[0]);
        
        // Use PostGIS to insert geometry properly
        const insertPromises = roadInserts.map(async (road) => {
          const { data, error } = await supabase.rpc('insert_road', {
            p_osm_id: road.osm_id,
            p_name: road.name,
            p_highway: road.highway,
            p_geom_wkt: road.geom
          });
          
          if (error) {
            console.error(`❌ Error inserting road ${road.name}:`, error);
            return null;
          }
          return data;
        });
        
        const insertResults = await Promise.all(insertPromises);
        const successCount = insertResults.filter(r => r !== null).length;
      
      if (successCount === 0) {
        console.error('❌ No roads were successfully inserted');
        return { success: false, error: 'Failed to insert any roads' };
      }
      
      console.log(`🎉 Successfully imported ${roadInserts.length} roads`);
      
      // Log road names for verification
      const roadNames = roadInserts.map(r => r.name).filter(name => name !== 'Unnamed Road');
      console.log(`📍 Road names: ${roadNames.join(', ')}`);
      
      return { 
        success: true, 
        roadsImported: roadInserts.length,
        roadNames: roadNames
      };
    } else {
      console.warn('⚠️ No valid roads found');
      return { success: false, error: 'No valid roads found' };
    }
    
  } catch (error) {
    console.error('❌ Error importing roads:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if roads exist for a parcel area
 */
export async function checkRoadsForParcel(ogcFid: number) {
  try {
    // Get parcel geometry
    const { data: parcelData, error: parcelError } = await supabase
      .from('parcels')
      .select('ogc_fid, wkb_geometry_4326')
      .eq('ogc_fid', ogcFid)
      .single();
    
    if (parcelError) {
      throw new Error(`Failed to get parcel: ${parcelError.message}`);
    }
    
    // Parse parcel geometry
    const geometry = JSON.parse(parcelData.wkb_geometry_4326);
    const coordinates = geometry.coordinates[0];
    
    // Calculate search area around parcel
    const bounds = coordinates.reduce(
      (acc, coord) => ({
        minLon: Math.min(acc.minLon, coord[0]),
        maxLon: Math.max(acc.maxLon, coord[0]),
        minLat: Math.min(acc.minLat, coord[1]),
        maxLat: Math.max(acc.maxLat, coord[1])
      }),
      { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }
    );
    
    // Add buffer
    const buffer = 0.002; // ~200 meters
    const searchArea = `POLYGON((${bounds.minLon - buffer} ${bounds.minLat - buffer}, ${bounds.maxLon + buffer} ${bounds.minLat - buffer}, ${bounds.maxLon + buffer} ${bounds.maxLat + buffer}, ${bounds.minLon - buffer} ${bounds.maxLat + buffer}, ${bounds.minLon - buffer} ${bounds.minLat - buffer}))`;
    
    // Check for existing roads in the area
    const { data: existingRoads, error: roadError } = await supabase
      .rpc('roads_in_area', { search_area: searchArea });
    
    if (roadError) {
      console.warn('⚠️ Could not check existing roads:', roadError.message);
      return { hasRoads: false, roadCount: 0 };
    }
    
    return { 
      hasRoads: existingRoads && existingRoads.length > 0,
      roadCount: existingRoads ? existingRoads.length : 0,
      roads: existingRoads
    };
    
  } catch (error) {
    console.error('❌ Error checking roads:', error);
    return { hasRoads: false, roadCount: 0 };
  }
}

/**
 * Parse vector tile data (simplified - you'd need @mapbox/vector-tile for full implementation)
 */
async function parseVectorTile(buffer: ArrayBuffer, tile: {z: number, x: number, y: number}) {
  // This is a placeholder - for full implementation you'd use:
  // import VectorTile from '@mapbox/vector-tile';
  // import Protobuf from 'pbf';
  
  console.log(`📦 Parsing vector tile ${tile.z}/${tile.x}/${tile.y} (${buffer.byteLength} bytes)`);
  
  // For now, return empty array
  // In production, you'd parse the protobuf and extract road features
  return [];
}

/**
 * Simple function to import roads using browser (no Node.js required)
 */
export async function browserImportRoads(ogcFid: number, mapboxToken?: string) {
  console.log(`🌐 Server-side road import for parcel ${ogcFid}`);
  
  try {
    // Get token from parameter or environment
    const token = mapboxToken || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN;
    
    if (!token) {
      console.warn('⚠️ No Mapbox token available for road import');
      return { success: false, error: 'No Mapbox token available' };
    }
    
    // First check if roads already exist for this area
    try {
      const { data: existingRoads, error: roadError } = await supabase
        .from('roads')
        .select('id, name')
        .limit(5);
      
      if (!roadError && existingRoads && existingRoads.length > 0) {
        console.log(`✅ Roads already exist in database:`, existingRoads.map(r => r.name));
        return { success: true, message: `${existingRoads.length} roads already available` };
      }
    } catch (checkError) {
      console.log('📍 No existing roads found, proceeding with import...');
    }
    
    // Use server-side Edge Function to avoid CORS issues
    const { data, error } = await supabase.functions.invoke('import-roads-from-mapbox', {
      body: {
        ogcFid: ogcFid,
        mapboxToken: token
      }
    });
    
    if (error) {
      console.error('❌ Edge function error:', error);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Server-side road import result:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Road import error:', error);
    return { success: false, error: error.message };
  }
}
