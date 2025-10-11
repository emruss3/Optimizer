-- =====================================================
-- PARCEL ID DIAGNOSTIC - FIND OUT WHY 661807 IS MISSING
-- =====================================================

-- Check 1: Does parcel 661807 exist in the base parcels table?
SELECT 
  'Base Parcels Check' AS check_type,
  ogc_fid,
  geoid,
  parcelnumb,
  state_parcelnumb,
  -- Test the COALESCE logic from planner_parcels
  COALESCE(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) AS calculated_parcel_id
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Check 2: What parcel IDs are actually being generated?
SELECT 
  'Parcel ID Distribution' AS check_type,
  calculated_parcel_id,
  COUNT(*) AS count
FROM (
  SELECT 
    COALESCE(
      geoid::text,
      nullif(parcelnumb,''),
      nullif(state_parcelnumb,''),
      ogc_fid::text
    ) AS calculated_parcel_id
  FROM public.parcels 
  LIMIT 1000  -- Sample first 1000 to avoid timeout
) AS sample
GROUP BY calculated_parcel_id
ORDER BY count DESC
LIMIT 10;

-- Check 3: Check if 661807 exists in base parcels table at all
SELECT 
  'Base Parcels Existence' AS check_type,
  COUNT(*) AS total_parcels,
  COUNT(CASE WHEN ogc_fid = 661807 THEN 1 END) AS has_661807,
  COUNT(CASE WHEN ogc_fid = 47037 THEN 1 END) AS has_47037
FROM public.parcels;

-- Check 4: Check if 661807 exists in base zoning table
SELECT 
  'Base Zoning Existence' AS check_type,
  COUNT(*) AS total_zoning,
  COUNT(CASE WHEN geoid = '661807' THEN 1 END) AS has_661807,
  COUNT(CASE WHEN geoid = '47037' THEN 1 END) AS has_47037
FROM public.zoning;

-- Check 5: Sample some actual parcel IDs from base tables
SELECT 
  'Sample Parcel IDs' AS check_type,
  ogc_fid,
  geoid,
  parcelnumb,
  state_parcelnumb
FROM public.parcels 
ORDER BY ogc_fid
LIMIT 10;

-- Check 6: Sample some actual zoning geoids
SELECT 
  'Sample Zoning Geoids' AS check_type,
  geoid,
  zoning
FROM public.zoning 
ORDER BY geoid
LIMIT 10;

-- Check 7: Test the exact WHERE clause from planner_parcels
SELECT 
  'WHERE Clause Test' AS check_type,
  ogc_fid,
  -- Test each condition
  COALESCE(wkb_geometry_4326, wkb_geometry) IS NOT NULL AS has_geometry,
  NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry)) AS is_not_empty,
  -- Combined condition
  (COALESCE(wkb_geometry_4326, wkb_geometry) IS NOT NULL 
   AND NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry))) AS passes_where_clause
FROM public.parcels 
WHERE ogc_fid = 661807;

SELECT 'Parcel ID diagnostic completed!' AS final_status;

