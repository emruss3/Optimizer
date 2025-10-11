-- Verify that the get_parcel_geometry_for_siteplan function is deployed
-- and test it with the parcel the frontend is trying to load

-- Check if the function exists
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_parcel_geometry_for_siteplan';

-- Test the function with parcel 552298 (the one the frontend is loading)
SELECT 
  ogc_fid,
  address,
  sqft,
  parcel_width_ft,
  parcel_depth_ft,
  perimeter_ft,
  centroid_x,
  centroid_y
FROM get_parcel_geometry_for_siteplan(552298);

-- Check if the base parcels table has this parcel
SELECT 
  ogc_fid,
  address,
  sqft,
  deededacreage,
  ST_IsValid(wkb_geometry_4326) as geometry_valid,
  ST_GeometryType(wkb_geometry_4326) as geometry_type
FROM parcels 
WHERE ogc_fid = 552298;

