// Script to import road data from Mapbox API to Supabase
// This uses Mapbox Vector Tiles API to get road geometries

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Configuration
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || 'your_mapbox_token_here';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'your_supabase_url';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'your_supabase_key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Get road data from Mapbox Vector Tiles for a specific bounding box
 * @param {number} minLon - Minimum longitude
 * @param {number} minLat - Minimum latitude  
 * @param {number} maxLon - Maximum longitude
 * @param {number} maxLat - Maximum latitude
 * @param {number} zoom - Tile zoom level (14-16 recommended for roads)
 */
async function fetchMapboxRoads(minLon, minLat, maxLon, maxLat, zoom = 15) {
  try {
    console.log(`🗺️ Fetching Mapbox roads for bounds: ${minLon},${minLat} to ${maxLon},${maxLat}`);
    
    // Calculate tile coordinates for the bounding box
    const tiles = getTilesForBounds(minLon, minLat, maxLon, maxLat, zoom);
    const roads = [];
    
    for (const tile of tiles) {
      const { z, x, y } = tile;
      
      // Fetch vector tile from Mapbox
      const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.vector.pbf?access_token=${MAPBOX_ACCESS_TOKEN}`;
      
      console.log(`📡 Fetching tile: ${z}/${x}/${y}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`❌ Failed to fetch tile ${z}/${x}/${y}: ${response.statusText}`);
        continue;
      }
      
      // Parse vector tile (you'll need a library like @mapbox/vector-tile)
      const buffer = await response.arrayBuffer();
      const tileRoads = await parseVectorTile(buffer, tile);
      roads.push(...tileRoads);
    }
    
    return roads;
  } catch (error) {
    console.error('❌ Error fetching Mapbox roads:', error);
    return [];
  }
}

/**
 * Alternative: Use Mapbox Tilequery API for simpler road data access
 * @param {number} lon - Longitude
 * @param {number} lat - Latitude
 * @param {number} radius - Search radius in meters
 */
async function fetchNearbyRoads(lon, lat, radius = 500) {
  try {
    const url = `https://api.mapbox.com/tilequery/v1/mapbox.mapbox-streets-v8/tilequery/${lon},${lat}.json?radius=${radius}&layers=road&access_token=${MAPBOX_ACCESS_TOKEN}`;
    
    console.log(`🛣️ Fetching nearby roads for ${lon}, ${lat}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.features.length} nearby roads`);
    
    return data.features.map(feature => ({
      id: feature.properties.id,
      name: feature.properties.name || feature.properties.class || 'Unnamed Road',
      class: feature.properties.class, // 'primary', 'secondary', 'street', etc.
      type: feature.properties.type,
      geometry: feature.geometry
    }));
  } catch (error) {
    console.error('❌ Error fetching nearby roads:', error);
    return [];
  }
}

/**
 * Import roads for a specific parcel's area
 * @param {number} ogcFid - Parcel OGC FID
 */
async function importRoadsForParcel(ogcFid) {
  try {
    console.log(`🏠 Importing roads for parcel: ${ogcFid}`);
    
    // Get parcel geometry from Supabase
    const { data: parcelData, error: parcelError } = await supabase
      .from('parcels')
      .select('ogc_fid, wkb_geometry_4326')
      .eq('ogc_fid', ogcFid)
      .single();
    
    if (parcelError) {
      throw new Error(`Failed to get parcel: ${parcelError.message}`);
    }
    
    // Extract bounding box from parcel geometry
    const geometry = JSON.parse(parcelData.wkb_geometry_4326);
    const bounds = calculateBounds(geometry.coordinates[0]);
    
    // Add buffer around parcel for road search
    const buffer = 0.002; // ~200 meters
    const searchBounds = {
      minLon: bounds.minLon - buffer,
      minLat: bounds.minLat - buffer,
      maxLon: bounds.maxLon + buffer,
      maxLat: bounds.maxLat + buffer
    };
    
    // Get roads using Tilequery API (simpler than vector tiles)
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const roads = await fetchNearbyRoads(centerLon, centerLat, 500);
    
    // Insert roads into database
    for (const road of roads) {
      if (road.geometry && road.geometry.type === 'LineString') {
        const { error: insertError } = await supabase
          .from('roads')
          .upsert({
            osm_id: road.id,
            name: road.name,
            highway: road.class,
            geom: `SRID=4326;LINESTRING(${road.geometry.coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(',')})`
          }, {
            onConflict: 'osm_id'
          });
        
        if (insertError) {
          console.error(`❌ Failed to insert road ${road.name}:`, insertError);
        } else {
          console.log(`✅ Inserted road: ${road.name} (${road.class})`);
        }
      }
    }
    
    console.log(`🎉 Successfully imported ${roads.length} roads for parcel ${ogcFid}`);
    return roads;
    
  } catch (error) {
    console.error('❌ Error importing roads for parcel:', error);
    return [];
  }
}

/**
 * Batch import roads for multiple parcels
 * @param {number[]} ogcFids - Array of parcel OGC FIDs
 */
async function batchImportRoads(ogcFids) {
  console.log(`🚀 Starting batch import for ${ogcFids.length} parcels`);
  
  for (const ogcFid of ogcFids) {
    await importRoadsForParcel(ogcFid);
    // Add delay to respect API rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('🎉 Batch import complete!');
}

/**
 * Helper function to calculate bounds from coordinates
 */
function calculateBounds(coordinates) {
  return coordinates.reduce(
    (bounds, coord) => ({
      minLon: Math.min(bounds.minLon, coord[0]),
      maxLon: Math.max(bounds.maxLon, coord[0]),
      minLat: Math.min(bounds.minLat, coord[1]),
      maxLat: Math.max(bounds.maxLat, coord[1])
    }),
    { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }
  );
}

/**
 * Helper function to get tile coordinates for a bounding box
 */
function getTilesForBounds(minLon, minLat, maxLon, maxLat, zoom) {
  const tiles = [];
  
  const minTileX = Math.floor(lonToTile(minLon, zoom));
  const maxTileX = Math.floor(lonToTile(maxLon, zoom));
  const minTileY = Math.floor(latToTile(maxLat, zoom)); // Note: lat is inverted
  const maxTileY = Math.floor(latToTile(minLat, zoom));
  
  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  
  return tiles;
}

function lonToTile(lon, zoom) {
  return (lon + 180) / 360 * Math.pow(2, zoom);
}

function latToTile(lat, zoom) {
  return (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
}

// Example usage:
// node import_mapbox_roads.js

// Import roads for a specific parcel
if (process.argv.length > 2) {
  const ogcFid = parseInt(process.argv[2]);
  importRoadsForParcel(ogcFid);
} else {
  console.log('Usage: node import_mapbox_roads.js <ogc_fid>');
  console.log('Example: node import_mapbox_roads.js 488278');
}

export { fetchMapboxRoads, fetchNearbyRoads, importRoadsForParcel, batchImportRoads };



