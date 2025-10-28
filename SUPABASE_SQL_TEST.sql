-- SUPABASE_SQL_TEST.sql
-- Quick smoke tests using sample IDs from the repo

-- Test 1: get_parcel_detail with text parcel_id
SELECT 'Test 1: get_parcel_detail' as test_name;
SELECT * FROM get_parcel_detail('08102016600') LIMIT 1;

-- Test 2: get_buildable_envelope with text parcel_id  
SELECT 'Test 2: get_buildable_envelope' as test_name;
SELECT * FROM get_buildable_envelope('08102016600') LIMIT 1;

-- Test 3: get_parcel_buildable_envelope with numeric ogc_fid
SELECT 'Test 3: get_parcel_buildable_envelope' as test_name;
SELECT * FROM get_parcel_buildable_envelope(691592) LIMIT 1;

-- Test 4: planner_join view with text parcel_id
SELECT 'Test 4: planner_join view' as test_name;
SELECT parcel_id, ogc_fid, area_sqft, far_max 
FROM planner_join 
WHERE parcel_id = '08102016600' 
LIMIT 1;

-- Test 5: planner_join view with numeric ogc_fid
SELECT 'Test 5: planner_join by ogc_fid' as test_name;
SELECT parcel_id, ogc_fid, area_sqft, far_max 
FROM planner_join 
WHERE ogc_fid = 691592 
LIMIT 1;

-- Test 6: score_pad function (if available)
SELECT 'Test 6: score_pad function' as test_name;
-- Note: This requires actual geometry data, so we'll just check if it exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'score_pad' 
  AND routine_schema = 'public';

-- Test 7: Cross-reference test - same parcel via different methods
SELECT 'Test 7: Cross-reference validation' as test_name;
WITH parcel_detail AS (
  SELECT * FROM get_parcel_detail('08102016600')
),
parcel_envelope AS (
  SELECT * FROM get_buildable_envelope('08102016600')  
),
parcel_join AS (
  SELECT * FROM planner_join WHERE parcel_id = '08102016600'
)
SELECT 
  'Detail vs Join' as comparison,
  CASE WHEN pd.parcel_id = pj.parcel_id THEN 'MATCH' ELSE 'MISMATCH' END as result
FROM parcel_detail pd
CROSS JOIN parcel_join pj
LIMIT 1;