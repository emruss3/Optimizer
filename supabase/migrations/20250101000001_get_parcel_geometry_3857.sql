-- © 2025 ER Technologies. All rights reserved.
-- Proprietary and confidential. Not for distribution.

-- Get parcel geometry in Web Mercator (EPSG:3857) projection
-- This function returns the parcel geometry transformed to Web Mercator for accurate calculations
CREATE OR REPLACE FUNCTION get_parcel_geometry_3857(parcel_id text)
RETURNS TABLE (
  ogc_fid integer,
  address text,
  sqft numeric,
  geometry_3857 geometry(POLYGON, 3857),
  bounds_3857 jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.ogc_fid,
    p.address,
    p.sqft,
    ST_Transform(p.geometry, 3857) as geometry_3857,
    jsonb_build_object(
      'minX', ST_XMin(ST_Transform(p.geometry, 3857)),
      'minY', ST_YMin(ST_Transform(p.geometry, 3857)),
      'maxX', ST_XMax(ST_Transform(p.geometry, 3857)),
      'maxY', ST_YMax(ST_Transform(p.geometry, 3857))
    ) as bounds_3857
  FROM parcels p
  WHERE p.ogc_fid::text = parcel_id;
END;
$$;
