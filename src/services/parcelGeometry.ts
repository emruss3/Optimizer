// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { supabase } from '../lib/supabase';
import { GeoJSONGeometry } from '../types/parcel';
import { projectTo3857, areaSqFt, lengthFt, toFeetFromMeters } from '../lib/geometry/coords';

export interface ParcelGeometryData {
  ogc_fid: number;
  address: string;
  sqft: number;
  deeded_acres: number;
  geometry_4326: GeoJSONGeometry;
  geometry_local: GeoJSONGeometry;
  geometry_simplified: GeoJSONGeometry;
  parcel_width_ft: number;
  parcel_depth_ft: number;
  perimeter_ft: number;
  centroid_x: number;
  centroid_y: number;
  bbox_min_x_ft: number;
  bbox_min_y_ft: number;
  bbox_max_x_ft: number;
  bbox_max_y_ft: number;
}

export interface SitePlannerGeometry {
  width: number;
  depth: number;
  area: number;
  perimeter: number;
  coordinates: number[][]; // Normalized coordinates in feet, starting at (0,0)
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  centroid: {
    x: number;
    y: number;
  };
}

/** DB row for the simpler 3857 function */
interface ParcelGeometry3857Row {
  ogc_fid: number;
  geometry_3857: GeoJSONGeometry;
  sqft: number;
  address: string | null;
}

/**
 * Fetch parcel geometry via the same baseline as the MVT tiles (EPSG:3857)
 */
export async function fetchParcelGeometry3857(
  ogcFid: string | number
): Promise<SitePlannerGeometry | null> {
  try {
    const numericId = typeof ogcFid === 'string' ? parseInt(ogcFid) : ogcFid;
    console.log('🔍 fetchParcelGeometry3857 called with ogc_fid:', numericId);
    
    const { data, error } = await supabase.rpc('get_parcel_geometry_3857', {
      p_ogc_fid: numericId,
    });

    console.log('📡 RPC get_parcel_geometry_3857 response:', { data, error });

    if (error) {
      console.error('❌ Error from get_parcel_geometry_3857:', error);
      return null;
    }
    if (!data || data.length === 0) {
      console.warn('⚠️ get_parcel_geometry_3857 returned no data for ogc_fid:', numericId);
      return null;
    }

    console.log('✅ get_parcel_geometry_3857 returned data:', data[0]);
    const row = data[0] as ParcelGeometry3857Row;
    return parse3857Geometry(row);
  } catch (e) {
    console.error('❌ Exception in fetchParcelGeometry3857:', e);
    return null;
  }
}

function parse3857Geometry(row: ParcelGeometry3857Row): SitePlannerGeometry | null {
  const geom = row.geometry_3857;
  if (!geom) return null;

  console.log('🔍 Parsing 3857 geometry for ogc_fid:', row.ogc_fid);
  console.log('📦 Geometry type:', geom.type);

  let coords: number[][];
  if (geom.type === 'Polygon') {
    coords = (geom.coordinates as number[][][])[0];
  } else if (geom.type === 'MultiPolygon') {
    coords = (geom.coordinates as number[][][][])[0][0];
  } else {
    console.warn('❌ Unsupported geometry type:', geom.type);
    return null;
  }
  if (!coords || coords.length < 3) {
    console.warn('❌ Insufficient coordinates:', coords?.length);
    return null;
  }

  console.log('📍 Coordinate count:', coords.length);
  console.log('📍 First coordinate (Web Mercator meters):', coords[0]);

  // Calculate bounds in Web Mercator meters first
  const boundsMeters = coords.reduce(
    (acc, c) => ({
      minX: Math.min(acc.minX, c[0]),
      minY: Math.min(acc.minY, c[1]),
      maxX: Math.max(acc.maxX, c[0]),
      maxY: Math.max(acc.maxY, c[1]),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  console.log('📏 Bounds in Web Mercator (meters):', boundsMeters);

  // Calculate dimensions in meters, then convert to feet using centralized function
  const widthMeters = boundsMeters.maxX - boundsMeters.minX;
  const depthMeters = boundsMeters.maxY - boundsMeters.minY;
  const width = toFeetFromMeters(widthMeters);
  const depth = toFeetFromMeters(depthMeters);

  console.log('📐 Dimensions in meters:', { widthMeters, depthMeters });
  console.log('📐 Dimensions in feet:', { width, depth });

  const area = row.sqft ?? Math.round(width * depth);
  
  // Normalize coordinates: subtract mins, then convert to feet using centralized function
  const normalized = coords.map(([x, y]) => [
    toFeetFromMeters(x - boundsMeters.minX),
    toFeetFromMeters(y - boundsMeters.minY)
  ]);

  console.log('📍 First normalized coordinate (feet):', normalized[0]);
  console.log('📍 Last normalized coordinate (feet):', normalized[normalized.length - 1]);

  const result = {
    width,
    depth,
    area,
    perimeter: (width + depth) * 2,
    coordinates: normalized,
    bounds: { minX: 0, minY: 0, maxX: width, maxY: depth },
    centroid: { x: width / 2, y: depth / 2 },
  };

  console.log('✅ Successfully parsed geometry:', {
    width: result.width.toFixed(1),
    depth: result.depth.toFixed(1),
    area: result.area,
    coordinateCount: result.coordinates.length
  });

  return result;
}

/**
 * Fetch parcel geometry optimized for site planning
 */
export async function fetchParcelGeometryForSitePlanner(
  parcelId: string
): Promise<SitePlannerGeometry | null> {
  try {
    console.log('🔍 Fetching parcel geometry for site planner:', parcelId);
    
    const { data, error } = await supabase.rpc('get_parcel_geometry_for_siteplan', {
      p_ogc_fid: parseInt(parcelId)
    });

    if (error) {
      console.error('❌ Error fetching parcel geometry:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.warn('⚠️ No geometry data found for parcel:', parcelId);
      return null;
    }

    const parcelData = data[0] as ParcelGeometryData;
    console.log('📦 Raw parcel geometry data:', parcelData);

    return parseGeometryForSitePlanner(parcelData);
  } catch (error) {
    console.error('❌ Exception fetching parcel geometry:', error);
    return null;
  }
}

/**
 * Parse the database geometry into format suitable for site planner
 */
export function parseGeometryForSitePlanner(
  data: ParcelGeometryData
): SitePlannerGeometry {
  console.log('🔧 Parsing geometry for site planner...');
  
  // Use the local projected geometry (Web Mercator in meters)
  const geometry = data.geometry_local || data.geometry_simplified || data.geometry_4326;
  
  if (!geometry) {
    console.warn('⚠️ No geometry available, creating fallback');
    return createFallbackGeometry(data.sqft);
  }

  try {
    // Extract coordinates from GeoJSON
    let coordinates: number[][];
    
    if (geometry.type === 'Polygon') {
      coordinates = geometry.coordinates[0] as number[][];
    } else if (geometry.type === 'MultiPolygon') {
      coordinates = (geometry.coordinates as number[][][])[0][0];
    } else {
      console.warn('⚠️ Unsupported geometry type:', geometry.type);
      return createFallbackGeometry(data.sqft);
    }

    console.log('📐 Original coordinates (first 3):', coordinates.slice(0, 3));

    // Convert from meters to feet and calculate bounds using centralized function
    const coordinatesInFeet = coordinates.map(coord => [
      toFeetFromMeters(coord[0]),
      toFeetFromMeters(coord[1])
    ]);

    // Calculate bounds
    const bounds = coordinatesInFeet.reduce(
      (acc, coord) => ({
        minX: Math.min(acc.minX, coord[0]),
        minY: Math.min(acc.minY, coord[1]),
        maxX: Math.max(acc.maxX, coord[0]),
        maxY: Math.max(acc.maxY, coord[1])
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    // Normalize coordinates to start at (0,0)
    const normalizedCoordinates = coordinatesInFeet.map(coord => [
      coord[0] - bounds.minX,
      coord[1] - bounds.minY
    ]);

    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxY - bounds.minY;
    const area = data.sqft;
    const perimeter = data.perimeter_ft;

    // Calculate normalized centroid
    const centroid = {
      x: (data.centroid_x * METERS_TO_FEET) - bounds.minX,
      y: (data.centroid_y * METERS_TO_FEET) - bounds.minY
    };

    console.log('✅ Parsed geometry successfully:', {
      width: width.toFixed(1),
      depth: depth.toFixed(1),
      area,
      points: normalizedCoordinates.length,
      bounds
    });

    return {
      width,
      depth,
      area,
      perimeter,
      coordinates: normalizedCoordinates,
      bounds: {
        minX: 0,
        minY: 0,
        maxX: width,
        maxY: depth
      },
      centroid
    };

  } catch (error) {
    console.error('❌ Error parsing geometry:', error);
    return createFallbackGeometry(data.sqft);
  }
}

/**
 * Fetch parcel buildable envelope with proper setback analysis
 */
export async function fetchParcelBuildableEnvelope(
  ogcFid: string | number,
  setbacks?: { front?: number; rear?: number; side?: number }
): Promise<{
  parcelGeometry: SitePlannerGeometry;
  buildableEnvelope: SitePlannerGeometry;
  edgeClassifications: Record<string, any>;
  metrics: Record<string, any>;
} | null> {
  try {
    const numericId = typeof ogcFid === 'string' ? parseInt(ogcFid) : ogcFid;
    console.log('🔍 fetchParcelBuildableEnvelope called with ogc_fid:', numericId);
    
    const { data, error } = await supabase.rpc('get_parcel_front_edge_with_roads', {
      p_ogc_fid: numericId,
      p_front_setback: setbacks?.front || 25,
      p_rear_setback: setbacks?.rear || 20,
      p_side_setback: setbacks?.side || 15
    });

    console.log('📡 RPC get_parcel_buildable_envelope response:', { data, error });

    if (error) {
      console.error('❌ Error from get_parcel_buildable_envelope:', error);
      // Fallback to the existing 3857 function
      const fallbackGeometry = await fetchParcelGeometry3857(ogcFid);
      if (fallbackGeometry) {
        return {
          parcelGeometry: fallbackGeometry,
          buildableEnvelope: fallbackGeometry, // Use same geometry as fallback
          edgeClassifications: { method: 'fallback' },
          metrics: { note: 'Using fallback geometry' }
        };
      }
      return null;
    }
    
    if (!data || data.length === 0) {
      console.warn('⚠️ get_parcel_buildable_envelope returned no data for ogc_fid:', numericId);
      return null;
    }

    const result = data[0];
    console.log('✅ get_parcel_buildable_envelope returned data:', result);
    
    // Parse the parcel geometry from GeoJSON
    const parcelGeometry = parseGeoJSONToSitePlanner(result.parcel_geom_geojson, result);
    const buildableGeometry = parseGeoJSONToSitePlanner(result.buildable_envelope_geojson, result);
    
    if (!parcelGeometry || !buildableGeometry) {
      console.error('❌ Failed to parse geometries');
      return null;
    }
    
    return {
      parcelGeometry,
      buildableEnvelope: buildableGeometry,
      edgeClassifications: result.edge_analysis,
      metrics: {
        ...result.parcel_metrics,
        roadInfo: result.nearest_road_info
      }
    };
  } catch (e) {
    console.error('❌ Exception in fetchParcelBuildableEnvelope:', e);
    return null;
  }
}

/**
 * Parse GeoJSON to SitePlannerGeometry format
 */
function parseGeoJSONToSitePlanner(geojson: Record<string, any>, parcelData?: Record<string, any>): SitePlannerGeometry | null {
  if (!geojson || !geojson.coordinates) return null;
  
  let coords: number[][];
  if (geojson.type === 'Polygon') {
    coords = geojson.coordinates[0];
  } else if (geojson.type === 'MultiPolygon') {
    coords = geojson.coordinates[0][0];
  } else {
    console.warn('❌ Unsupported GeoJSON type:', geojson.type);
    return null;
  }
  
  // Calculate bounds in WGS84 degrees
  const bounds = coords.reduce(
    (acc, c) => ({
      minX: Math.min(acc.minX, c[0]),
      minY: Math.min(acc.minY, c[1]),
      maxX: Math.max(acc.maxX, c[0]),
      maxY: Math.max(acc.maxY, c[1]),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  
  // Use actual parcel dimensions from database if available, otherwise calculate from coordinates
  let width, depth;
  if (parcelData && parcelData.parcel_width_ft && parcelData.parcel_depth_ft) {
    width = parcelData.parcel_width_ft;
    depth = parcelData.parcel_depth_ft;
    console.log('✅ Using actual parcel dimensions from database:', { width, depth });
  } else {
    // Convert degrees to feet (more accurate conversion)
    // At latitude ~40°N (typical for US), 1 degree ≈ 69 miles ≈ 364,320 feet
    // But we need to account for longitude compression at different latitudes
    const DEGREES_TO_FEET_LAT = 364320; // 1 degree latitude in feet
    const DEGREES_TO_FEET_LON = 279000; // 1 degree longitude at ~40°N in feet (approximate)
    
    width = (bounds.maxX - bounds.minX) * DEGREES_TO_FEET_LON;
    depth = (bounds.maxY - bounds.minY) * DEGREES_TO_FEET_LAT;
    console.log('⚠️ Using calculated dimensions from coordinates:', { width, depth });
  }
  
  // Normalize coordinates to start at (0,0) in feet
  const normalized = coords.map(([x, y]) => [
    (x - bounds.minX) * (parcelData && parcelData.parcel_width_ft ? (width / (bounds.maxX - bounds.minX)) : 279000),
    (y - bounds.minY) * (parcelData && parcelData.parcel_depth_ft ? (depth / (bounds.maxY - bounds.minY)) : 364320)
  ]);
  
  // Use actual parcel area from database if available
  const area = parcelData && parcelData.sqft ? parcelData.sqft : width * depth;
  
  return {
    width,
    depth,
    area,
    perimeter: (width + depth) * 2,
    coordinates: normalized,
    bounds: { minX: 0, minY: 0, maxX: width, maxY: depth },
    centroid: { x: width / 2, y: depth / 2 },
  };
}

/**
 * Parse PostGIS geometry to SitePlannerGeometry format
 */
function parseGeometryFromPostGIS(geom: Record<string, any>): SitePlannerGeometry | null {
  if (!geom || !geom.coordinates) return null;
  
  let coords: number[][];
  if (geom.type === 'Polygon') {
    coords = geom.coordinates[0];
  } else if (geom.type === 'MultiPolygon') {
    coords = geom.coordinates[0][0];
  } else {
    console.warn('❌ Unsupported geometry type:', geom.type);
    return null;
  }
  
  // Calculate bounds in Web Mercator meters
  const boundsMeters = coords.reduce(
    (acc, c) => ({
      minX: Math.min(acc.minX, c[0]),
      minY: Math.min(acc.minY, c[1]),
      maxX: Math.max(acc.maxX, c[0]),
      maxY: Math.max(acc.maxY, c[1]),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  
  // Convert to feet and normalize using centralized function
  const widthMeters = boundsMeters.maxX - boundsMeters.minX;
  const depthMeters = boundsMeters.maxY - boundsMeters.minY;
  const width = toFeetFromMeters(widthMeters);
  const depth = toFeetFromMeters(depthMeters);
  
  // Normalize coordinates to start at (0,0)
  const normalized = coords.map(([x, y]) => [
    toFeetFromMeters(x - boundsMeters.minX),
    toFeetFromMeters(y - boundsMeters.minY)
  ]);
  
  return {
    width,
    depth,
    area: width * depth, // Simplified area calculation
    perimeter: (width + depth) * 2,
    coordinates: normalized,
    bounds: { minX: 0, minY: 0, maxX: width, maxY: depth },
    centroid: { x: width / 2, y: depth / 2 },
  };
}

/**
 * Create fallback geometry when actual geometry is not available
 */
function createFallbackGeometry(sqft: number): SitePlannerGeometry {
  const area = sqft || 4356;
  const aspectRatio = 1.5; // Typical lot ratio
  const width = Math.sqrt(area * aspectRatio);
  const depth = area / width;
  
  console.log('📦 Created fallback geometry:', { width, depth, area });
  
  return {
    width,
    depth,
    area,
    perimeter: (width + depth) * 2,
    coordinates: [
      [0, 0],
      [width, 0],
      [width, depth],
      [0, depth],
      [0, 0]
    ],
    bounds: {
      minX: 0,
      minY: 0,
      maxX: width,
      maxY: depth
    },
    centroid: {
      x: width / 2,
      y: depth / 2
    }
  };
}
