-- Fix the get_parcel_geometry_for_siteplan function
-- The original had an ambiguous column reference error

CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop the existing function
DROP FUNCTION IF EXISTS public.get_parcel_geometry_for_siteplan(integer);

-- Create the fixed version
CREATE OR REPLACE FUNCTION public.get_parcel_geometry_for_siteplan(p_ogc_fid integer)
RETURNS TABLE (
  ogc_fid int,
  address text,
  sqft double precision,
  deeded_acres double precision,
  geometry_4326 jsonb,
  geometry_3857 jsonb,
  parcel_width_ft double precision,
  parcel_depth_ft double precision,
  perimeter_ft double precision,
  centroid_x double precision,
  centroid_y double precision,
  bbox_min_x_ft double precision,
  bbox_min_y_ft double precision,
  bbox_max_x_ft double precision,
  bbox_max_y_ft double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  geom_4326 geometry;
  geom_3857 geometry;
  bbox geometry;
  centroid geometry;
BEGIN
  -- Fetch the original geometry
  SELECT p.wkb_geometry_4326 INTO geom_4326
  FROM public.parcels p
  WHERE p.ogc_fid = p_ogc_fid;

  -- If no geometry found, return early
  IF geom_4326 IS NULL THEN
    RETURN;
  END IF;

  -- Transform to Web Mercator (EPSG:3857) for calculations
  geom_3857 := ST_Transform(geom_4326, 3857);

  -- Calculate bounding box and centroid in Web Mercator
  bbox := ST_Envelope(geom_3857);
  centroid := ST_Centroid(geom_3857);

  -- Return all calculated properties
  RETURN QUERY
  SELECT
    p.ogc_fid,
    p.address,
    COALESCE(p.sqft, ROUND(ST_Area(geom_4326::geography) * 10.76391041671))::double precision AS sqft,
    COALESCE(p.deededacreage, ST_Area(geom_4326::geography) / 4046.8564224)::double precision AS deeded_acres,
    ST_AsGeoJSON(geom_4326)::jsonb AS geometry_4326,
    ST_AsGeoJSON(geom_3857)::jsonb AS geometry_3857,
    (ST_XMax(bbox) - ST_XMin(bbox)) * 3.28084 AS parcel_width_ft,
    (ST_YMax(bbox) - ST_YMin(bbox)) * 3.28084 AS parcel_depth_ft,
    ST_Perimeter(geom_3857) * 3.28084 AS perimeter_ft,
    ST_X(centroid) AS centroid_x,
    ST_Y(centroid) AS centroid_y,
    ST_XMin(bbox) * 3.28084 AS bbox_min_x_ft,
    ST_YMin(bbox) * 3.28084 AS bbox_min_y_ft,
    ST_XMax(bbox) * 3.28084 AS bbox_max_x_ft,
    ST_YMax(bbox) * 3.28084 AS bbox_max_y_ft
  FROM public.parcels p
  WHERE p.ogc_fid = p_ogc_fid;
END;
$$;

-- Grant execution rights
GRANT EXECUTE ON FUNCTION public.get_parcel_geometry_for_siteplan(integer) TO anon, authenticated;




