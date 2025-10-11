-- =====================================================
-- SIMPLIFIED SUPABASE DEPLOYMENT (SAFER VERSION)
-- =====================================================
-- This version is more conservative and less likely to cause timeouts

-- Step 1: Drop existing objects safely
DROP VIEW IF EXISTS planner_join CASCADE;
DROP VIEW IF EXISTS planner_zoning CASCADE;
DROP VIEW IF EXISTS planner_parcels CASCADE;
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope(int) CASCADE;
DROP FUNCTION IF EXISTS public.get_buildable_envelope(text) CASCADE;
DROP FUNCTION IF EXISTS public.score_pad(text, geometry, geometry) CASCADE;
DROP FUNCTION IF EXISTS public.get_parcel_detail(text) CASCADE;

-- Step 2: Create planner_parcels view (simplified)
CREATE VIEW planner_parcels AS
SELECT
  COALESCE(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) AS parcel_id,
  -- Use simpler geometry handling to avoid timeouts
  CASE 
    WHEN wkb_geometry_4326 IS NOT NULL THEN 
      ST_Transform(ST_MakeValid(wkb_geometry_4326), 3857)
    WHEN wkb_geometry IS NOT NULL THEN 
      ST_Transform(ST_MakeValid(wkb_geometry), 3857)
    ELSE NULL
  END AS geom
FROM public.parcels
WHERE (wkb_geometry_4326 IS NOT NULL OR wkb_geometry IS NOT NULL)
  AND NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry));

-- Step 3: Create planner_zoning view (simplified)
CREATE VIEW planner_zoning AS
SELECT
  geoid::text AS parcel_id,
  zoning AS base,
  -- Simplified FAR handling
  CASE 
    WHEN max_far IS NOT NULL AND max_far != '' AND max_far::numeric NOT IN (-5555, -9999) 
    THEN max_far::numeric 
    ELSE NULL 
  END AS far_max,
  -- Simplified height handling
  CASE 
    WHEN max_building_height_ft IS NOT NULL AND max_building_height_ft != '' AND max_building_height_ft::numeric NOT IN (-5555, -9999)
    THEN max_building_height_ft::numeric 
    ELSE NULL 
  END AS height_max_ft,
  -- Simplified setbacks
  jsonb_build_object(
    'front', CASE WHEN min_front_setback_ft IS NOT NULL AND min_front_setback_ft != '' THEN min_front_setback_ft::numeric ELSE NULL END,
    'side',  CASE WHEN min_side_setback_ft IS NOT NULL AND min_side_setback_ft != '' THEN min_side_setback_ft::numeric ELSE NULL END,
    'rear',  CASE WHEN min_rear_setback_ft IS NOT NULL AND min_rear_setback_ft != '' THEN min_rear_setback_ft::numeric ELSE NULL END
  ) AS setbacks,
  NULL::numeric AS parking_ratio
FROM public.zoning;

-- Step 4: Create planner_join view
CREATE VIEW planner_join AS
SELECT
  p.parcel_id,
  p.geom,
  z.base,
  z.far_max,
  z.height_max_ft,
  z.setbacks,
  z.parking_ratio
FROM planner_parcels p
LEFT JOIN planner_zoning z ON z.parcel_id = p.parcel_id;

-- Step 5: Create simplified get_parcel_buildable_envelope function
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
  front_setback numeric := 20;  -- default in feet
  side_setback numeric := 5;    -- default in feet
  rear_setback numeric := 20;   -- default in feet
  buildable_geom geometry;
  edge_types jsonb;
  setbacks_applied jsonb;
BEGIN
  -- Get parcel geometry (simplified)
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

  -- Get zoning setbacks (simplified)
  SELECT 
    COALESCE((setbacks->>'front')::numeric, front_setback),
    COALESCE((setbacks->>'side')::numeric, side_setback),
    COALESCE((setbacks->>'rear')::numeric, rear_setback)
  INTO front_setback, side_setback, rear_setback
  FROM planner_zoning
  WHERE parcel_id = p_ogc_fid::text
  LIMIT 1;

  -- Convert setbacks from feet to meters
  front_setback := front_setback / 3.28084;
  side_setback := side_setback / 3.28084;
  rear_setback := rear_setback / 3.28084;

  -- Apply setbacks using negative buffer (use largest setback)
  buildable_geom := ST_Buffer(parcel_geom, -GREATEST(front_setback, side_setback, rear_setback));

  -- Create edge types (simplified)
  edge_types := jsonb_build_object(
    'front', true,
    'side', true, 
    'rear', true,
    'easement', false
  );

  -- Record applied setbacks
  setbacks_applied := jsonb_build_object(
    'front', front_setback * 3.28084,  -- convert back to feet
    'side', side_setback * 3.28084,
    'rear', rear_setback * 3.28084
  );

  -- Return results
  RETURN QUERY
  SELECT 
    p_ogc_fid,
    ST_MakeValid(buildable_geom) AS buildable_geom,
    ROUND(ST_Area(buildable_geom) * 10.7639, 0) AS area_sqft,  -- convert m² to ft²
    edge_types,
    setbacks_applied,
    0 AS easements_removed;
END $$;

-- Step 6: Create spatial indexes for performance
CREATE INDEX IF NOT EXISTS gix_parcels_wkb4326 ON public.parcels USING gist (wkb_geometry_4326);
CREATE INDEX IF NOT EXISTS gix_parcels_wkb ON public.parcels USING gist (wkb_geometry);
CREATE INDEX IF NOT EXISTS gix_zoning_geom ON public.zoning USING gist (geom);

-- Step 7: Test the function
SELECT 'Testing get_parcel_buildable_envelope...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(661807) LIMIT 1;

SELECT 'Deployment completed successfully!' AS status;

