-- © 2025 ER Technologies. All rights reserved.
-- Proprietary and confidential. Not for distribution.

-- Create get_buildable_envelope function for calculating buildable area with setbacks
CREATE OR REPLACE FUNCTION get_buildable_envelope(
  parcel_id text,
  front_ft numeric,
  side_ft numeric,
  rear_ft numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  parcel_geom geometry;
  buildable_geom geometry;
  parcel_area_sqft numeric;
  buildable_area_sqft numeric;
  envelope_ratio numeric;
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
  
  -- Convert setbacks from feet to meters
  DECLARE
    front_meters numeric := front_ft / 3.28084;
    side_meters numeric := side_ft / 3.28084;
    rear_meters numeric := rear_ft / 3.28084;
  BEGIN
    -- Create buildable envelope by buffering inward
    -- This is a simplified approach - in practice, you'd need to consider
    -- parcel orientation and actual setback requirements
    buildable_geom := ST_Buffer(
      ST_Buffer(
        ST_Buffer(parcel_geom, -front_meters),
        -side_meters
      ),
      -rear_meters
    );
  END;
  
  -- Calculate areas
  parcel_area_sqft := ST_Area(ST_Transform(parcel_geom, 3857)) * 10.764;
  buildable_area_sqft := ST_Area(ST_Transform(buildable_geom, 3857)) * 10.764;
  envelope_ratio := buildable_area_sqft / parcel_area_sqft;
  
  -- Get bounds
  bounds := jsonb_build_object(
    'minx', ST_XMin(buildable_geom),
    'miny', ST_YMin(buildable_geom),
    'maxx', ST_XMax(buildable_geom),
    'maxy', ST_YMax(buildable_geom)
  );
  
  -- Build metrics object
  metrics := jsonb_build_object(
    'parcel_id', parcel_id,
    'parcel_area_sqft', parcel_area_sqft,
    'buildable_area_sqft', buildable_area_sqft,
    'envelope_ratio', envelope_ratio,
    'front_setback_ft', front_ft,
    'side_setback_ft', side_ft,
    'rear_setback_ft', rear_ft,
    'bounds', bounds,
    'geometry', ST_AsGeoJSON(buildable_geom),
    'timestamp', NOW()
  );
  
  RETURN metrics;
END;
$$;