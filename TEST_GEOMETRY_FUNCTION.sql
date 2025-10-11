-- Test the get_parcel_geometry_for_siteplan function
-- This will help verify the function is working correctly

-- Test with parcel 552298 (the one the frontend is trying to load)
SELECT * FROM get_parcel_geometry_for_siteplan(552298);

-- Test with parcel 661807 (the one we've been testing with)
SELECT * FROM get_parcel_geometry_for_siteplan(661807);

-- Check if the function exists
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_parcel_geometry_for_siteplan';

-- Check if the base parcels table has data for these OGC_FIDs
SELECT 
  ogc_fid,
  address,
  sqft,
  deededacreage,
  ST_IsValid(wkb_geometry_4326) as geometry_valid
FROM parcels 
WHERE ogc_fid IN (552298, 661807)
ORDER BY ogc_fid;

