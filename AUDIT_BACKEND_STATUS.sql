-- =====================================================
-- COMPREHENSIVE BACKEND AUDIT
-- =====================================================

-- Audit 1: Check if all required functions exist
SELECT 
  'Function Audit' AS audit_type,
  proname AS function_name,
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

-- Audit 2: Check if all required views exist
SELECT 
  'View Audit' AS audit_type,
  viewname,
  schemaname
FROM pg_views 
WHERE schemaname = 'public' 
  AND viewname IN ('planner_parcels', 'planner_zoning', 'planner_join')
ORDER BY viewname;

-- Audit 3: Test parcel 552298 specifically
SELECT 
  'Parcel 552298 Audit' AS audit_type,
  'Base Parcels' AS check_type,
  ogc_fid,
  geoid,
  parcelnumb,
  state_parcelnumb
FROM public.parcels 
WHERE ogc_fid = 552298;

-- Audit 4: Check planner_parcels for 552298
SELECT 
  'Parcel 552298 Audit' AS audit_type,
  'Planner Parcels' AS check_type,
  parcel_id,
  geoid,
  ST_GeometryType(geom) AS geom_type,
  ST_Area(geom) * 10.7639 AS area_sqft
FROM planner_parcels 
WHERE parcel_id = '552298';

-- Audit 5: Check zoning data for 552298
SELECT 
  'Parcel 552298 Audit' AS audit_type,
  'Zoning Data' AS check_type,
  parcel_id,
  base,
  far_max,
  height_max_ft,
  setbacks
FROM planner_zoning 
WHERE parcel_id = (
  SELECT geoid FROM planner_parcels WHERE parcel_id = '552298' LIMIT 1
);

-- Audit 6: Test the RPC function directly
SELECT 
  'Parcel 552298 Audit' AS audit_type,
  'RPC Function Test' AS check_type,
  ogc_fid,
  area_sqft,
  edge_types,
  setbacks_applied
FROM public.get_parcel_buildable_envelope(552298);

-- Audit 7: Check for any errors in the function execution
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_parcel_buildable_envelope(552298);
    RAISE NOTICE 'SUCCESS: get_parcel_buildable_envelope(552298) executed without errors';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR: get_parcel_buildable_envelope(552298) failed: %', SQLERRM;
  END;
END $$;

SELECT 'Backend audit completed!' AS final_status;

