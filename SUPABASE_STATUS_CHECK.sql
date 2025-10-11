-- =====================================================
-- SUPABASE STATUS CHECK - RUN THIS FIRST
-- =====================================================
-- This will tell us exactly what's deployed and what's missing

-- Check 1: Do the views exist?
SELECT 
  'Views Check' AS check_type,
  schemaname,
  viewname,
  definition
FROM pg_views 
WHERE schemaname = 'public' 
  AND viewname IN ('planner_parcels', 'planner_zoning', 'planner_join')
ORDER BY viewname;

-- Check 2: Do the functions exist?
SELECT 
  'Functions Check' AS check_type,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_parcel_buildable_envelope',
    'get_buildable_envelope', 
    'score_pad',
    'get_parcel_detail'
  )
ORDER BY p.proname;

-- Check 3: Test if planner_parcels has data for our test parcel
SELECT 
  'Data Check' AS check_type,
  'planner_parcels' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN parcel_id = '661807' THEN 1 END) AS has_661807,
  COUNT(CASE WHEN parcel_id = '47037' THEN 1 END) AS has_47037
FROM planner_parcels;

-- Check 4: Test if planner_zoning has data
SELECT 
  'Data Check' AS check_type,
  'planner_zoning' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN parcel_id = '661807' THEN 1 END) AS has_661807,
  COUNT(CASE WHEN parcel_id = '47037' THEN 1 END) AS has_47037
FROM planner_zoning;

-- Check 5: Test if planner_join has data
SELECT 
  'Data Check' AS check_type,
  'planner_join' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN parcel_id = '661807' THEN 1 END) AS has_661807,
  COUNT(CASE WHEN parcel_id = '47037' THEN 1 END) AS has_47037
FROM planner_join;

-- Check 6: Test the RPC function (if it exists)
SELECT 
  'RPC Test' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND p.proname = 'get_parcel_buildable_envelope'
    ) THEN 'Function exists - testing...'
    ELSE 'Function does not exist'
  END AS status;

-- If the function exists, test it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'get_parcel_buildable_envelope'
  ) THEN
    -- Test with parcel 661807
    IF EXISTS (SELECT 1 FROM planner_parcels WHERE parcel_id = '661807') THEN
      PERFORM * FROM public.get_parcel_buildable_envelope(661807);
      RAISE NOTICE 'SUCCESS: get_parcel_buildable_envelope(661807) works!';
    ELSE
      RAISE NOTICE 'WARNING: Parcel 661807 not found in planner_parcels';
    END IF;
    
    -- Test with parcel 47037
    IF EXISTS (SELECT 1 FROM planner_parcels WHERE parcel_id = '47037') THEN
      PERFORM * FROM public.get_parcel_buildable_envelope(47037);
      RAISE NOTICE 'SUCCESS: get_parcel_buildable_envelope(47037) works!';
    ELSE
      RAISE NOTICE 'WARNING: Parcel 47037 not found in planner_parcels';
    END IF;
  END IF;
END $$;

-- Check 7: Show any available parcel IDs for testing
SELECT 
  'Available Parcels' AS check_type,
  parcel_id,
  ST_GeometryType(geom) AS geom_type,
  ST_Area(geom) * 10.7639 AS area_sqft
FROM planner_parcels 
ORDER BY ST_Area(geom) DESC
LIMIT 5;

SELECT 'Status check completed!' AS final_status;

