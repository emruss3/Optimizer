-- =====================================================
-- FUNCTION TYPE FIX - Fix the round() function type error
-- =====================================================

-- Drop and recreate the get_parcel_buildable_envelope function with proper type casting
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope(int);

CREATE OR REPLACE FUNCTION public.get_parcel_buildable_envelope(p_ogc_fid int)
RETURNS TABLE(
  ogc_fid int,
  buildable_geom geometry,
  area_sqft numeric,
  edge_types jsonb,
  setbacks_applied jsonb,
  easements_removed int
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER 
SET search_path=public 
AS $$
DECLARE
  parcel_geom geometry;
  zoning_data record;
  front_setback numeric := 20;  -- default in feet
  side_setback numeric := 5;    -- default in feet
  rear_setback numeric := 20;   -- default in feet
  buildable_geom geometry;
  final_geom geometry;
  easement_count int := 0;
  edge_types jsonb;
  setbacks_applied jsonb;
BEGIN
  -- Get parcel geometry
  SELECT geom INTO parcel_geom
  FROM planner_parcels
  WHERE parcel_id = p_ogc_fid::text
  LIMIT 1;

  -- If no geometry found, return empty result
  IF parcel_geom IS NULL THEN
    RETURN QUERY SELECT 
      p_ogc_fid,
      NULL::geometry,
      0::numeric,
      '{}'::jsonb,
      '{}'::jsonb,
      0;
    RETURN;
  END IF;

  -- Get zoning data for setbacks
  SELECT 
    COALESCE((setbacks->>'front')::numeric, front_setback) as front,
    COALESCE((setbacks->>'side')::numeric, side_setback) as side,
    COALESCE((setbacks->>'rear')::numeric, rear_setback) as rear
  INTO zoning_data
  FROM planner_zoning
  WHERE parcel_id = (
    SELECT geoid FROM planner_parcels WHERE parcel_id = p_ogc_fid::text LIMIT 1
  )
  LIMIT 1;

  -- Use zoning setbacks if available, otherwise use defaults
  IF zoning_data IS NOT NULL THEN
    front_setback := zoning_data.front;
    side_setback := zoning_data.side;
    rear_setback := zoning_data.rear;
  END IF;

  -- Convert setbacks from feet to meters for ST_Buffer
  front_setback := front_setback / 3.28084;
  side_setback := side_setback / 3.28084;
  rear_setback := rear_setback / 3.28084;

  -- Apply setbacks using negative buffer
  -- Use the largest setback to ensure compliance
  buildable_geom := ST_Buffer(parcel_geom, -GREATEST(front_setback, side_setback, rear_setback));

  -- For now, use buildable_geom as final_geom (no easements)
  final_geom := buildable_geom;
  easement_count := 0;

  -- Determine edge types (simplified - assumes rectangular parcel)
  edge_types := jsonb_build_object(
    'front', true,
    'side', true, 
    'rear', true,
    'easement', easement_count > 0
  );

  -- Record applied setbacks
  setbacks_applied := jsonb_build_object(
    'front', front_setback * 3.28084,  -- convert back to feet
    'side', side_setback * 3.28084,
    'rear', rear_setback * 3.28084
  );

  -- Return results with proper type casting
  RETURN QUERY
  SELECT 
    p_ogc_fid,
    ST_MakeValid(final_geom) as buildable_geom,
    ROUND((ST_Area(final_geom) * 10.7639)::numeric, 0) as area_sqft,  -- Cast to numeric first, then round
    edge_types,
    setbacks_applied,
    easement_count;
END $$;

-- Test the fixed function
SELECT 'Testing the fixed get_parcel_buildable_envelope function...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(661807);

SELECT 'Function type fix completed successfully!' AS final_status;

