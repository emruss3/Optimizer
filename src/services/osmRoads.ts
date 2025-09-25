import { supabase } from '../lib/supabase';

/**
 * Import road data from OpenStreetMap Overpass API (no CORS issues)
 * This is a free alternative to Mapbox that works from the browser
 */
export async function importRoadsFromOSM(ogcFid: number) {
  try {
    console.log(`🌐 Importing roads from OpenStreetMap for parcel ${ogcFid}`);
    
    // Get parcel geometry
    const { data: parcelData, error: parcelError } = await supabase
      .from('parcels')
      .select('ogc_fid, wkb_geometry_4326, address')
      .eq('ogc_fid', ogcFid)
      .single();
    
    if (parcelError) {
      throw new Error(`Failed to get parcel: ${parcelError.message}`);
    }
    
    console.log('📦 Parcel data:', parcelData);
    
    // Parse parcel geometry
    let geometry;
    if (typeof parcelData.wkb_geometry_4326 === 'string') {
      geometry = JSON.parse(parcelData.wkb_geometry_4326);
    } else {
      geometry = parcelData.wkb_geometry_4326;
    }
    
    const coordinates = geometry.coordinates[0];
    const centerLon = coordinates.reduce((sum: number, coord: number[]) => sum + coord[0], 0) / coordinates.length;
    const centerLat = coordinates.reduce((sum: number, coord: number[]) => sum + coord[1], 0) / coordinates.length;
    
    // Calculate bounding box for road search (500m radius)
    const buffer = 0.005; // ~500 meters in degrees
    const bbox = {
      south: centerLat - buffer,
      west: centerLon - buffer,
      north: centerLat + buffer,
      east: centerLon + buffer
    };
    
    console.log(`📍 Searching for roads around: ${centerLon}, ${centerLat}`);
    console.log(`📦 Bounding box: ${bbox.south},${bbox.west},${bbox.north},${bbox.east}`);
    
    // Build Overpass API query for roads in the area
    const overpassQuery = `[out:json][timeout:25];(way["highway"~"^(primary|secondary|tertiary|residential|trunk|unclassified)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east}););out geom;`;
    
    // Query OpenStreetMap Overpass API (no CORS restrictions)
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    console.log('🛣️ Fetching roads from OpenStreetMap...');
    console.log('📡 Overpass query:', overpassQuery);
    
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`
    });
    
    console.log(`📡 OSM API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OSM API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`OSM API error: ${response.status} ${response.statusText}`);
    }
    
    const osmData = await response.json();
    console.log(`✅ Found ${osmData.elements.length} roads from OSM`);
    
    // Process OSM data into roads
    const roadInserts = [];
    for (const element of osmData.elements) {
      if (element.type === 'way' && element.geometry) {
        const roadName = element.tags.name || element.tags['addr:street'] || element.tags.highway || 'Unnamed Road';
        const roadClass = element.tags.highway || 'unknown';
        
        // Convert OSM geometry to LineString
        const coords = element.geometry.map((node: { lon: number; lat: number }) => `${node.lon} ${node.lat}`).join(',');
        
        const roadData = {
          osm_id: element.id,
          name: roadName,
          highway: roadClass,
          geom: `LINESTRING(${coords})`
        };
        
        roadInserts.push(roadData);
      }
    }
    
    console.log(`🔍 Processed roads:`, roadInserts.map(r => ({ name: r.name, class: r.highway })));
    
    // Insert roads into database
    let successCount = 0;
    for (const road of roadInserts) {
      try {
        const { data, error } = await supabase.rpc('insert_road', {
          p_osm_id: road.osm_id,
          p_name: road.name,
          p_highway: road.highway,
          p_geom_wkt: road.geom
        });
        
        if (!error) {
          successCount++;
          console.log(`✅ Inserted: ${road.name} (${road.highway})`);
        } else {
          console.warn(`⚠️ Failed to insert ${road.name}:`, error);
        }
      } catch (insertError) {
        console.warn(`⚠️ Insert error for ${road.name}:`, insertError);
      }
    }
    
    const roadNames = roadInserts.map(r => r.name).filter(name => name !== 'Unnamed Road');
    
    console.log(`🎉 Successfully imported ${successCount}/${roadInserts.length} roads`);
    console.log(`📍 Road names: ${roadNames.join(', ')}`);
    
    return {
      success: true,
      roadsImported: successCount,
      totalFound: osmData.elements.length,
      roadNames: roadNames,
      parcelAddress: parcelData.address
    };
    
  } catch (error) {
    console.error('❌ Error importing roads from OSM:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if roads exist for a parcel area using OSM data
 */
export async function checkAndImportOSMRoads(ogcFid: number) {
  try {
    // Check if we already have roads
    const { data: existingRoads, error: roadError } = await supabase
      .from('roads')
      .select('id, name')
      .limit(5);
    
    if (!roadError && existingRoads && existingRoads.length > 0) {
      console.log(`✅ Roads already exist:`, existingRoads.map(r => r.name));
      return { success: true, message: `${existingRoads.length} roads already available` };
    }
    
    // No roads exist, import from OSM
    console.log('📍 No roads found, importing from OpenStreetMap...');
    return await importRoadsFromOSM(ogcFid);
    
  } catch (error) {
    console.error('❌ Error checking/importing OSM roads:', error);
    return { success: false, error: error.message };
  }
}
