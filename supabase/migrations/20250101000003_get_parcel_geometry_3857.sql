-- © 2025 ER Technologies. All rights reserved.
-- Proprietary and confidential. Not for distribution.

-- Create get_parcel_geometry_3857 function for getting parcel geometry in Web Mercator projection
CREATE OR REPLACE FUNCTION get_parcel_geometry_3857(
  parcel_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  parcel_geom geometry;
  parcel_geom_3857 geometry;
  parcel_area_sqft numeric;
  bounds jsonb;
  metrics jsonb;
BEGIN
  -- Get parcel geometry
  SELECT geometry INTO parcel_geom
  FROM parcels 
  WHERE ogc_fid = parcel_id;
  
  IF parcel_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'Parcel not found');
  END IF;
  
  -- Transform to Web Mercator (EPSG:3857)
  parcel_geom_3857 := ST_Transform(parcel_geom, 3857);
  
  -- Calculate area in square feet
  parcel_area_sqft := ST_Area(parcel_geom_3857) * 10.764;
  
  -- Get bounds in Web Mercator
  bounds := jsonb_build_object(
    'minx', ST_XMin(parcel_geom_3857),
    'miny', ST_YMin(parcel_geom_3857),
    'maxx', ST_XMax(parcel_geom_3857),
    'maxy', ST_YMax(parcel_geom_3857)
  );
  
  -- Build metrics object
  metrics := jsonb_build_object(
    'parcel_id', parcel_id,
    'area_sqft', parcel_area_sqft,
    'bounds', bounds,
    'geometry', ST_AsGeoJSON(parcel_geom_3857),
    'centroid', ST_AsGeoJSON(ST_Centroid(parcel_geom_3857)),
    'perimeter_ft', ST_Perimeter(parcel_geom_3857) * 3.28084,
    'timestamp', NOW()
  );
  
  RETURN metrics;
END;
$$;
