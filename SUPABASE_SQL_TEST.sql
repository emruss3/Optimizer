-- =====================================================
-- SQL VALIDATION TEST SCRIPT
-- =====================================================
-- Run this in Supabase Studio SQL Editor to test the functions

-- Test 1: Check if the base tables exist and have data
SELECT 'Testing base tables...' AS test_step;

-- Check parcels table
SELECT 
  'parcels' AS table_name,
  COUNT(*) AS row_count,
  COUNT(wkb_geometry_4326) AS has_4326_geom,
  COUNT(wkb_geometry) AS has_geom
FROM public.parcels
WHERE ogc_fid = 661807;

-- Check zoning table  
SELECT 
  'zoning' AS table_name,
  COUNT(*) AS row_count
FROM public.zoning
WHERE geoid = '661807';

-- Test 2: Check if views can be created
SELECT 'Testing view creation...' AS test_step;

-- Test planner_parcels view
SELECT 
  'planner_parcels' AS view_name,
  COUNT(*) AS row_count,
  COUNT(geom) AS has_geom
FROM planner_parcels
WHERE parcel_id = '661807';

-- Test planner_zoning view
SELECT 
  'planner_zoning' AS view_name,
  COUNT(*) AS row_count,
  far_max,
  setbacks
FROM planner_zoning
WHERE parcel_id = '661807';

-- Test planner_join view
SELECT 
  'planner_join' AS view_name,
  COUNT(*) AS row_count,
  far_max,
  setbacks
FROM planner_join
WHERE parcel_id = '661807';

-- Test 3: Test the RPC functions
SELECT 'Testing RPC functions...' AS test_step;

-- Test get_buildable_envelope function
SELECT 
  'get_buildable_envelope' AS function_name,
  ST_Area(public.get_buildable_envelope('661807')) AS envelope_area_m2,
  ST_Area(public.get_buildable_envelope('661807')) * 10.7639 AS envelope_area_sqft
WHERE EXISTS (SELECT 1 FROM planner_parcels WHERE parcel_id = '661807');

-- Test get_parcel_buildable_envelope function
SELECT 
  'get_parcel_buildable_envelope' AS function_name,
  ogc_fid,
  area_sqft,
  edge_types,
  setbacks_applied
FROM public.get_parcel_buildable_envelope(661807);

-- Test get_parcel_detail function
SELECT 
  'get_parcel_detail' AS function_name,
  parcel_id,
  far_max,
  height_max_ft,
  setbacks,
  ST_Area(envelope) * 10.7639 AS envelope_area_sqft,
  metrics
FROM public.get_parcel_detail('661807');

-- Test 4: Performance check
SELECT 'Testing performance...' AS test_step;

-- Check if spatial indexes exist
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('parcels', 'zoning')
  AND indexdef LIKE '%gist%';

-- Test 5: Error handling
SELECT 'Testing error handling...' AS test_step;

-- Test with non-existent parcel
SELECT 
  'error_test' AS test_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.get_parcel_buildable_envelope(999999)) 
    THEN 'ERROR: Should have failed'
    ELSE 'OK: Correctly failed for non-existent parcel'
  END AS result;

SELECT 'All tests completed!' AS final_status;

