-- =====================================================
-- FUNCTION TEST - Run this after deploying the function
-- =====================================================

-- Test 1: Check if the function exists
SELECT 
  'Function Check' AS test_type,
  proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_parcel_buildable_envelope';

-- Test 2: Test with parcel 661807
SELECT 'Testing get_parcel_buildable_envelope(661807)...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(661807);

-- Test 3: Test with a different parcel if 661807 doesn't work
SELECT 'Testing with first available parcel...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(
  (SELECT parcel_id::int FROM planner_parcels LIMIT 1)
);

SELECT 'Function test completed!' AS final_status;
