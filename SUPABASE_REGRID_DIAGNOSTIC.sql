-- =====================================================
-- REGRID SCHEMA DIAGNOSTIC QUERY
-- =====================================================
-- Run this to check your zoning data against the Regrid schema

-- Check if your zoning table has the expected Regrid columns
SELECT 
  'Column check' AS test_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'zoning' 
  AND table_schema = 'public'
  AND column_name IN (
    'geoid', 'zoning', 'zoning_description', 'zoning_type', 'zoning_subtype',
    'max_far', 'max_building_height_ft', 'min_front_setback_ft', 
    'min_side_setback_ft', 'min_rear_setback_ft', 'permitted_land_uses',
    'min_lot_area_sq_ft', 'min_lot_width_ft', 'max_coverage_pct',
    'municipality_name'
  )
ORDER BY column_name;

-- Check what zoning data exists for parcel 661807
SELECT 
  'Zoning data for 661807' AS test_type,
  geoid,
  zoning,
  zoning_description,
  zoning_type,
  zoning_subtype,
  max_far,
  max_building_height_ft,
  min_front_setback_ft,
  min_side_setback_ft,
  min_rear_setback_ft,
  permitted_land_uses,
  municipality_name
FROM public.zoning 
WHERE geoid = '661807';

-- Check if there are any zoning records at all
SELECT 
  'Zoning table overview' AS test_type,
  COUNT(*) AS total_records,
  COUNT(DISTINCT geoid) AS unique_geoids,
  COUNT(CASE WHEN max_far IS NOT NULL THEN 1 END) AS records_with_far,
  COUNT(CASE WHEN min_front_setback_ft IS NOT NULL THEN 1 END) AS records_with_front_setback,
  COUNT(CASE WHEN min_side_setback_ft IS NOT NULL THEN 1 END) AS records_with_side_setback,
  COUNT(CASE WHEN min_rear_setback_ft IS NOT NULL THEN 1 END) AS records_with_rear_setback
FROM public.zoning;

-- Check what geoid values exist (to see if 661807 is the right format)
SELECT 
  'Geoid format check' AS test_type,
  geoid,
  LENGTH(geoid) AS geoid_length,
  COUNT(*) AS count
FROM public.zoning 
GROUP BY geoid, LENGTH(geoid)
ORDER BY count DESC
LIMIT 10;

-- Check if there are any zoning records that might match parcel 661807
SELECT 
  'Potential matches for 661807' AS test_type,
  geoid,
  zoning,
  zoning_description
FROM public.zoning 
WHERE geoid LIKE '%661807%' 
   OR geoid = '661807'
   OR geoid::text = '661807'
LIMIT 5;

-- Check the parcels table to see what geoid format it uses
SELECT 
  'Parcel geoid format' AS test_type,
  ogc_fid,
  geoid,
  parcelnumb,
  state_parcelnumb,
  LENGTH(geoid::text) AS geoid_length
FROM public.parcels 
WHERE ogc_fid = 661807;

