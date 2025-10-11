-- =====================================================
-- GEOMETRY DIAGNOSTIC QUERY
-- =====================================================
-- Run this to diagnose why parcel 661807 isn't in planner_parcels view

-- Check the raw parcel data
SELECT 
  'Raw parcel data' AS test_type,
  ogc_fid,
  geoid,
  parcelnumb,
  state_parcelnumb,
  wkb_geometry_4326 IS NOT NULL AS has_4326_geom,
  wkb_geometry IS NOT NULL AS has_geom,
  ST_IsValid(wkb_geometry_4326) AS is_valid_4326,
  ST_IsValid(wkb_geometry) AS is_valid_geom,
  ST_IsEmpty(wkb_geometry_4326) AS is_empty_4326,
  ST_IsEmpty(wkb_geometry) AS is_empty_geom
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Test the geometry transformation step by step
SELECT 
  'Geometry transformation test' AS test_type,
  ogc_fid,
  -- Test each step of the transformation
  wkb_geometry_4326 IS NOT NULL AS step1_has_4326,
  ST_MakeValid(wkb_geometry_4326) IS NOT NULL AS step2_make_valid,
  ST_Transform(ST_MakeValid(wkb_geometry_4326), 3857) IS NOT NULL AS step3_transform,
  ST_IsValid(ST_Transform(ST_MakeValid(wkb_geometry_4326), 3857)) AS step4_is_valid_3857
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Test the COALESCE logic from planner_parcels view
SELECT 
  'COALESCE test' AS test_type,
  ogc_fid,
  -- Test the parcel_id generation
  COALESCE(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) AS generated_parcel_id,
  -- Test the geometry COALESCE
  CASE 
    WHEN wkb_geometry_4326 IS NOT NULL THEN 
      ST_Transform(ST_MakeValid(wkb_geometry_4326), 3857)
    WHEN wkb_geometry IS NOT NULL THEN 
      ST_Transform(ST_MakeValid(wkb_geometry), 3857)
    ELSE NULL
  END AS generated_geom,
  -- Test the WHERE clause conditions
  (wkb_geometry_4326 IS NOT NULL OR wkb_geometry IS NOT NULL) AS where_condition_1,
  NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry)) AS where_condition_2
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Check what parcel_id would be generated
SELECT 
  'Parcel ID generation' AS test_type,
  ogc_fid,
  geoid,
  parcelnumb,
  state_parcelnumb,
  COALESCE(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) AS final_parcel_id
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Test if the parcel would be included in planner_parcels
SELECT 
  'Inclusion test' AS test_type,
  ogc_fid,
  CASE 
    WHEN (wkb_geometry_4326 IS NOT NULL OR wkb_geometry IS NOT NULL)
         AND NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry))
    THEN 'SHOULD BE INCLUDED'
    ELSE 'WILL BE EXCLUDED'
  END AS inclusion_status,
  -- Show why it might be excluded
  CASE 
    WHEN wkb_geometry_4326 IS NULL AND wkb_geometry IS NULL THEN 'No geometry data'
    WHEN ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry)) THEN 'Geometry is empty'
    ELSE 'Should be included'
  END AS exclusion_reason
FROM public.parcels 
WHERE ogc_fid = 661807;

