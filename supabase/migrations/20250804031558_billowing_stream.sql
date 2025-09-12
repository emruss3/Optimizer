/*
  # Add Filtered Parcel RPC for Zoning Filters

  1. New RPC Functions
    - `get_parcels_in_bbox_filtered` - BBOX query with zoning filter support
*/

-- Enhanced BBOX query with zoning filters
CREATE OR REPLACE FUNCTION get_parcels_in_bbox_filtered(
  min_lng FLOAT,
  min_lat FLOAT,
  max_lng FLOAT,
  max_lat FLOAT,
  min_sqft INTEGER DEFAULT 0,
  max_results INTEGER DEFAULT 1000,
  zoning_filter TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE (
  ogc_fid INTEGER,
  parcelnumb TEXT,
  address TEXT,
  deededacreage FLOAT,
  gisacre FLOAT,
  sqft FLOAT,
  zoning TEXT,
  landval FLOAT,
  parval FLOAT,
  lat TEXT,
  lon TEXT,
  geometry JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.ogc_fid,
    p.parcelnumb::TEXT,
    p.address::TEXT,
    p.deeded_acres,
    p.ll_gisacre,
    p.sqft::FLOAT,
    p.zoning::TEXT,
    p.landval,
    p.parval,
    p.lat::TEXT,
    p.lon::TEXT,
    ST_AsGeoJSON(p.wkb_geometry_4326)::JSON as geometry
  FROM parcels p
  WHERE p.wkb_geometry_4326 && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    AND (p.sqft IS NULL OR p.sqft >= min_sqft)
    AND (
      CASE 
        WHEN array_length(zoning_filter, 1) > 0 THEN p.zoning = ANY(zoning_filter)
        ELSE TRUE
      END
    )
    AND p.wkb_geometry_4326 IS NOT NULL
  ORDER BY p.sqft DESC NULLS LAST
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;