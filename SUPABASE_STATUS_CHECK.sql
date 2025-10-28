-- SUPABASE_STATUS_CHECK.sql
-- Database verification checklist for planner system

-- 1. Check if views exist and have rows
SELECT 'planner_parcels' as view_name, count(*) as row_count 
FROM planner_parcels 
UNION ALL
SELECT 'planner_zoning' as view_name, count(*) as row_count 
FROM planner_zoning 
UNION ALL
SELECT 'planner_join' as view_name, count(*) as row_count 
FROM planner_join;

-- 2. Check if functions exist
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'get_buildable_envelope',
    'get_parcel_buildable_envelope', 
    'get_parcel_detail',
    'score_pad'
  )
ORDER BY routine_name;

-- 3. Test function signatures
SELECT 
  routine_name,
  parameter_name,
  data_type,
  parameter_mode
FROM information_schema.parameters 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'get_buildable_envelope',
    'get_parcel_buildable_envelope', 
    'get_parcel_detail',
    'score_pad'
  )
ORDER BY routine_name, ordinal_position;

-- 4. Sample data check
SELECT 
  'Sample parcel_id from planner_join' as check_type,
  parcel_id,
  ogc_fid,
  area_sqft
FROM planner_join 
LIMIT 5;

-- 5. Function availability test
DO $$
DECLARE
  test_result text;
BEGIN
  -- Test get_parcel_detail
  BEGIN
    PERFORM get_parcel_detail('08102016600');
    RAISE NOTICE 'get_parcel_detail: OK';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'get_parcel_detail: FAILED - %', SQLERRM;
  END;
  
  -- Test get_buildable_envelope  
  BEGIN
    PERFORM get_buildable_envelope('08102016600');
    RAISE NOTICE 'get_buildable_envelope: OK';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'get_buildable_envelope: FAILED - %', SQLERRM;
  END;
  
  -- Test get_parcel_buildable_envelope
  BEGIN
    PERFORM get_parcel_buildable_envelope(691592);
    RAISE NOTICE 'get_parcel_buildable_envelope: OK';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'get_parcel_buildable_envelope: FAILED - %', SQLERRM;
  END;
END $$;