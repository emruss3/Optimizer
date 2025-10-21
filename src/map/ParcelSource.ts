import { sb } from '@/lib/rpc';
import { createMockParcelData } from './MockParcelData';

export async function fetchParcelsForViewport(bbox: [number, number, number, number]) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  
  try {
    // Try the RPC first, but with error handling
    const { data: rows, error } = await sb.rpc('get_parcels_in_bbox', {
      min_lng: minLng,
      min_lat: minLat,
      max_lng: maxLng,
      max_lat: maxLat,
      min_sqft: 0,
      max_results: 1000,
      zoning_filter: []
    });
    
    if (error) {
      console.warn('RPC failed, using fallback method:', error);
      return await fetchParcelsFallback(bbox);
    }
    
    return {
      type: 'FeatureCollection',
      features: rows.map((r: any) => ({
        type: 'Feature',
        properties: { 
          ogc_fid: r.ogc_fid,
          parcelnumb: r.parcelnumb ?? null,
          address: r.address ?? null,
          zoning: r.zoning ?? null,
          sqft: r.sqft ?? null,
          parcelnumb_no_formatting: r.parcelnumb_no_formatting,
          zoning_description: r.zoning_description,
          zoning_type: r.zoning_type,
          owner: r.owner,
          deeded_acres: r.deeded_acres,
          gisacre: r.gisacre,
          landval: r.landval,
          parval: r.parval,
          yearbuilt: r.yearbuilt,
          numstories: r.numstories,
          numunits: r.numunits,
          lat: r.lat,
          lon: r.lon
        },
        geometry: r.geometry as any
      }))
    } as GeoJSON.FeatureCollection;
    
  } catch (error) {
    console.warn('RPC failed, using fallback method:', error);
    return await fetchParcelsFallback(bbox);
  }
}

// Fallback method that queries the parcels table directly
async function fetchParcelsFallback(bbox: [number, number, number, number]) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  
  try {
    // Query parcels table directly with a simple bounding box
    const { data, error } = await sb
      .from('parcels')
      .select(`
        ogc_fid,
        parcelnumb,
        address,
        zoning,
        sqft,
        deeded_acres,
        gisacre,
        landval,
        parval,
        yearbuilt,
        numstories,
        numunits,
        lat,
        lon,
        wkb_geometry_4326
      `)
      .gte('lat', minLat)
      .lte('lat', maxLat)
      .gte('lon', minLng)
      .lte('lon', maxLng)
      .limit(1000);
    
    if (error) {
      console.error('Fallback query failed:', error);
      return createEmptyFeatureCollection();
    }
    
    return {
      type: 'FeatureCollection',
      features: (data || []).map((row: any) => ({
        type: 'Feature',
        properties: {
          ogc_fid: row.ogc_fid?.toString() || '',
          parcelnumb: row.parcelnumb || null,
          address: row.address || null,
          zoning: row.zoning || null,
          sqft: row.sqft || null,
          deeded_acres: row.deeded_acres || null,
          gisacre: row.gisacre || null,
          landval: row.landval || null,
          parval: row.parval || null,
          yearbuilt: row.yearbuilt || null,
          numstories: row.numstories || null,
          numunits: row.numunits || null,
          lat: row.lat || null,
          lon: row.lon || null
        },
        geometry: row.wkb_geometry_4326 || { type: 'Polygon', coordinates: [] }
      }))
    } as GeoJSON.FeatureCollection;
    
  } catch (error) {
    console.error('All parcel loading methods failed:', error);
    return createEmptyFeatureCollection();
  }
}

// Create empty feature collection as last resort
function createEmptyFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: []
  } as GeoJSON.FeatureCollection;
}

// Enhanced fallback with mock data
export async function fetchParcelsWithMockFallback(bbox: [number, number, number, number]) {
  try {
    // Try the normal method first
    const result = await fetchParcelsForViewport(bbox);
    
    // If we got empty results, use mock data
    if (result.features.length === 0) {
      console.log('No parcels found, using mock data for development');
      return createMockParcelData(bbox);
    }
    
    return result;
  } catch (error) {
    console.warn('All parcel loading failed, using mock data:', error);
    return createMockParcelData(bbox);
  }
}