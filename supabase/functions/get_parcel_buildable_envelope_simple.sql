-- Simplified function to create buildable envelope without road data dependency
CREATE OR REPLACE FUNCTION get_parcel_buildable_envelope_simple(
  p_ogc_fid INTEGER,
  p_front_setback NUMERIC DEFAULT 25,
  p_rear_setback NUMERIC DEFAULT 20,
  p_side_setback NUMERIC DEFAULT 15
)
RETURNS TABLE (
  ogc_fid INTEGER,
  parcel_geom_geojson JSONB,
  buildable_envelope_geojson JSONB,
  parcel_area_sqft NUMERIC,
  buildable_area_sqft NUMERIC,
  setback_info JSONB
) AS $$
DECLARE
  parcel_geom GEOMETRY;
  parcel_3857 GEOMETRY;
  buildable_geom GEOMETRY;
  parcel_area NUMERIC;
  buildable_area NUMERIC;
BEGIN
  -- Get the parcel geometry
  SELECT ST_Transform(geom, 3857)
  INTO parcel_3857
  FROM public.parcels 
  WHERE public.parcels.ogc_fid = p_ogc_fid;
  
  IF parcel_3857 IS NULL THEN
    RAISE EXCEPTION 'Parcel not found: %', p_ogc_fid;
  END IF;
  
  -- Calculate parcel area in square feet
  parcel_area := ST_Area(parcel_3857) * 10.764; -- Convert m² to sq ft
  
  -- Create buildable envelope by applying uniform setback
  -- This is a simplified approach - in production would use edge-specific setbacks
  buildable_geom := ST_Buffer(parcel_3857, -GREATEST(p_front_setback, p_rear_setback, p_side_setback) / 3.28084);
  
  -- If the buffer results in an empty geometry, use a smaller setback
  IF ST_IsEmpty(buildable_geom) OR ST_Area(buildable_geom) < 100 THEN
    buildable_geom := ST_Buffer(parcel_3857, -10 / 3.28084); -- 10 foot uniform setback
  END IF;
  
  -- If still empty, create a simple rectangular buildable area
  IF ST_IsEmpty(buildable_geom) THEN
    buildable_geom := ST_MakeEnvelope(
      ST_XMin(parcel_3857) + (p_side_setback / 3.28084),
      ST_YMin(parcel_3857) + (p_rear_setback / 3.28084),
      ST_XMax(parcel_3857) - (p_side_setback / 3.28084),
      ST_YMax(parcel_3857) - (p_front_setback / 3.28084),
      3857
    );
  END IF;
  
  -- Calculate buildable area
  buildable_area := ST_Area(buildable_geom) * 10.764;
  
  -- Return results as GeoJSON
  RETURN QUERY SELECT
    p_ogc_fid,
    ST_AsGeoJSON(ST_Transform(parcel_3857, 4326))::JSONB,
    ST_AsGeoJSON(ST_Transform(buildable_geom, 4326))::JSONB,
    parcel_area,
    buildable_area,
    jsonb_build_object(
      'front_setback_ft', p_front_setback,
      'rear_setback_ft', p_rear_setback,
      'side_setback_ft', p_side_setback,
      'method', 'uniform_buffer',
      'buildable_ratio', (buildable_area / parcel_area)
    );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_parcel_buildable_envelope_simple(INTEGER, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;



