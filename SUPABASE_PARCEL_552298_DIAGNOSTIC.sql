-- =====================================================
-- PARCEL 552298 DIAGNOSTIC - Check the actual parcel the app is trying to load
-- =====================================================

-- Check 1: Does parcel 552298 exist in the base parcels table?
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
WHERE ogc_fid = 552298;

-- Check 2: Check if 552298 exists in planner_parcels
SELECT 
  'Planner Parcels Check' AS check_type,
  parcel_id,
  geoid,
  ST_GeometryType(geom) AS geom_type,
  ST_Area(geom) * 10.7639 AS area_sqft
FROM planner_parcels 
WHERE parcel_id = '552298';

-- Check 3: Check if 552298 has zoning data
SELECT 
  'Zoning Check' AS check_type,
  parcel_id,
  base,
  far_max,
  height_max_ft,
  setbacks
FROM planner_zoning 
WHERE parcel_id = (
  SELECT geoid FROM planner_parcels WHERE parcel_id = '552298' LIMIT 1
);

-- Check 4: Test the RPC function with 552298
SELECT 'Testing get_parcel_buildable_envelope(552298)...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(552298);

-- Check 5: Check what parcel IDs are actually being used by the app
SELECT 
  'Available Parcels Sample' AS check_type,
  parcel_id,
  geoid,
  ST_Area(geom) * 10.7639 AS area_sqft
FROM planner_parcels 
ORDER BY ST_Area(geom) DESC
LIMIT 10;

SELECT 'Parcel 552298 diagnostic completed!' AS final_status;

