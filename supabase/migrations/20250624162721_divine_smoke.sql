/*
  # Update parcel bbox RPC with size filtering

  1. Modified Functions
    - `get_parcels_in_bbox` now accepts optional minimum square footage parameter
    - Defaults to showing all parcels, but can filter by size
    - Orders by square footage descending to prioritize larger parcels

  2. Performance Improvements
    - Adds sqft index for faster filtering
    - Limits results to prevent browser overload
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS get_parcels_in_bbox(double precision, double precision, double precision, double precision);

-- Create updated function with size filtering
CREATE OR REPLACE FUNCTION get_parcels_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  min_sqft integer DEFAULT 0,
  max_results integer DEFAULT 2000
) 
RETURNS TABLE (
  ogc_fid integer,
  parcelnumb character varying,
  parcelnumb_no_formatting character varying,
  zoning character varying,
  zoning_description character varying,
  zoning_type character varying,
  address character varying,
  city character varying,
  owner character varying,
  deeded_acres double precision,
  gisacre double precision,
  sqft double precision,
  lat character varying,
  lon character varying,
  parval double precision,
  landval double precision,
  improvval double precision,
  saledate date,
  saleprice double precision,
  yearbuilt integer,
  numstories double precision,
  numunits integer,
  geometry json
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.ogc_fid,
    p.parcelnumb,
    p.parcelnumb_no_formatting,
    p.zoning,
    p.zoning_description,
    p.zoning_type,
    p.address,
    p.city,
    p.owner,
    p.deeded_acres,
    p.gisacre,
    p.sqft,
    p.lat,
    p.lon,
    p.parval,
    p.landval,
    p.improvval,
    p.saledate,
    p.saleprice,
    p.yearbuilt,
    p.numstories,
    p.numunits,
    ST_AsGeoJSON(p.wkb_geometry_4326)::json as geometry
  FROM parcels p
  WHERE 
    p.wkb_geometry_4326 IS NOT NULL
    AND ST_Intersects(
      p.wkb_geometry_4326,
      ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    )
    AND COALESCE(p.sqft, p.gisacre * 43560, 0) >= min_sqft
  ORDER BY COALESCE(p.sqft, p.gisacre * 43560, 0) DESC
  LIMIT max_results;
END;
$$;

-- Create index on sqft for faster filtering
CREATE INDEX IF NOT EXISTS idx_parcels_sqft ON parcels (sqft) WHERE sqft IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parcels_gisacre ON parcels (gisacre) WHERE gisacre IS NOT NULL;

-- Create a function specifically for large parcels (industrial/commercial areas)
CREATE OR REPLACE FUNCTION get_large_parcels_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
) 
RETURNS TABLE (
  ogc_fid integer,
  parcelnumb character varying,
  address character varying,
  zoning character varying,
  sqft double precision,
  deeded_acres double precision,
  owner character varying,
  geometry json
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.ogc_fid,
    p.parcelnumb,
    p.address,
    p.zoning,
    p.sqft,
    p.deeded_acres,
    p.owner,
    ST_AsGeoJSON(p.wkb_geometry_4326)::json as geometry
  FROM parcels p
  WHERE 
    p.wkb_geometry_4326 IS NOT NULL
    AND ST_Intersects(
      p.wkb_geometry_4326,
      ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    )
    AND (
      COALESCE(p.sqft, p.gisacre * 43560, 0) >= 10000  -- 10k+ sqft
      OR p.zoning LIKE '%C%'  -- Commercial
      OR p.zoning LIKE '%I%'  -- Industrial  
      OR p.zoning LIKE '%M%'  -- Mixed use
    )
  ORDER BY COALESCE(p.sqft, p.gisacre * 43560, 0) DESC
  LIMIT 1000;
END;
$$;