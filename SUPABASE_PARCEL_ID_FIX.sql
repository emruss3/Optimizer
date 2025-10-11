-- =====================================================
-- PARCEL ID FIX - USE OGC_FID AS PRIMARY IDENTIFIER
-- =====================================================
-- This fixes the issue where all parcels have the same geoid (47037)

-- Drop existing views in dependency order
DROP VIEW IF EXISTS planner_join CASCADE;
DROP VIEW IF EXISTS planner_zoning CASCADE;
DROP VIEW IF EXISTS planner_parcels CASCADE;

-- Create fixed planner_parcels view using ogc_fid as primary identifier
CREATE VIEW planner_parcels AS
SELECT
  -- Use ogc_fid as the primary parcel_id since geoid is not unique
  ogc_fid::text AS parcel_id,
  -- Keep the original geoid for reference
  geoid::text AS geoid,
  parcelnumb,
  state_parcelnumb,
  -- Use the same geometry logic
  COALESCE(
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry_4326),3857),3)) )::geometry(MultiPolygon,3857),
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry       ),3857),3)) )::geometry(MultiPolygon,3857)
  ) AS geom
FROM public.parcels
WHERE COALESCE(wkb_geometry_4326, wkb_geometry) IS NOT NULL
  AND NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry));

-- Create fixed planner_zoning view that joins on geoid
CREATE VIEW planner_zoning AS
SELECT
  -- Use geoid as parcel_id to match with parcels.geoid
  geoid::text AS parcel_id,
  zoning AS base,
  CASE WHEN nullif(max_far,'')::numeric IN (-5555,-9999) THEN NULL 
       ELSE nullif(max_far,'')::numeric END AS far_max,
  CASE WHEN nullif(max_building_height_ft,'')::numeric IN (-5555,-9999) THEN NULL
       ELSE nullif(max_building_height_ft,'')::numeric END AS height_max_ft,
  jsonb_build_object(
    'front', CASE WHEN nullif(min_front_setback_ft,'')::numeric IN (-5555,-9999) THEN NULL ELSE nullif(min_front_setback_ft,'')::numeric END,
    'side',  CASE WHEN nullif(min_side_setback_ft,'')::numeric  IN (-5555,-9999) THEN NULL ELSE nullif(min_side_setback_ft,'')::numeric  END,
    'rear',  CASE WHEN nullif(min_rear_setback_ft,'')::numeric  IN (-5555,-9999) THEN NULL ELSE nullif(min_rear_setback_ft,'')::numeric  END
  ) AS setbacks,
  NULL::numeric AS parking_ratio,
  zoning_description, 
  zoning_type, 
  zoning_subtype, 
  zoning_code_link, 
  permitted_land_uses
FROM public.zoning;

-- Create fixed planner_join view that joins parcels and zoning on geoid
CREATE VIEW planner_join AS
SELECT
  p.parcel_id,           -- This is now ogc_fid::text
  p.geoid,               -- Keep geoid for reference
  p.parcelnumb,
  p.state_parcelnumb,
  p.geom,
  z.base,
  z.far_max,
  z.height_max_ft,
  z.setbacks,
  z.parking_ratio,
  z.zoning_description,
  z.zoning_type,
  z.zoning_subtype,
  z.zoning_code_link,
  z.permitted_land_uses
FROM planner_parcels p
LEFT JOIN planner_zoning z ON z.parcel_id = p.geoid;  -- Join on geoid

-- Test the fix
SELECT 'Testing the parcel ID fix...' AS status;

-- Check if parcel 661807 is now visible
SELECT 
  'Fixed planner_parcels' AS check_type,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN parcel_id = '661807' THEN 1 END) AS has_661807,
  COUNT(CASE WHEN parcel_id = '47037' THEN 1 END) AS has_47037
FROM planner_parcels;

-- Check if planner_join now has data for parcel 661807
SELECT 
  'Fixed planner_join' AS check_type,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN parcel_id = '661807' THEN 1 END) AS has_661807,
  COUNT(CASE WHEN parcel_id = '47037' THEN 1 END) AS has_47037
FROM planner_join;

-- Test the RPC function with parcel 661807
SELECT 'Testing get_parcel_buildable_envelope(661807)...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(661807);

SELECT 'Parcel ID fix completed successfully!' AS final_status;

