-- =====================================================
-- FRONTEND CONNECTION TEST
-- =====================================================
-- This simulates what the frontend is trying to do

-- Test 1: Check if we can find parcel 661807 in the base tables
SELECT 
  'Base Tables Check' AS test_type,
  'parcels' AS table_name,
  ogc_fid,
  geoid,
  parcelnumb,
  state_parcelnumb,
  CASE 
    WHEN wkb_geometry_4326 IS NOT NULL THEN 'Has 4326 geometry'
    WHEN wkb_geometry IS NOT NULL THEN 'Has default geometry'
    ELSE 'No geometry'
  END AS geometry_status
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Test 2: Check if we can find zoning data for parcel 661807
SELECT 
  'Base Tables Check' AS test_type,
  'zoning' AS table_name,
  geoid,
  zoning,
  max_far,
  max_building_height_ft,
  min_front_setback_ft,
  min_side_setback_ft,
  min_rear_setback_ft
FROM public.zoning 
WHERE geoid = '661807';

-- Test 3: Test the exact geometry transformation that planner_parcels uses
SELECT 
  'Geometry Transformation Test' AS test_type,
  ogc_fid,
  geoid,
  -- Test the exact logic from planner_parcels
  COALESCE(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) AS calculated_parcel_id,
  -- Test geometry transformation
  CASE 
    WHEN wkb_geometry_4326 IS NOT NULL THEN
      ST_GeometryType(ST_Transform(ST_MakeValid(wkb_geometry_4326), 3857))::text
    WHEN wkb_geometry IS NOT NULL THEN
      ST_GeometryType(ST_Transform(ST_MakeValid(wkb_geometry), 3857))::text
    ELSE 'No geometry'
  END AS transformed_geometry_type,
  -- Test if geometry is valid
  CASE 
    WHEN wkb_geometry_4326 IS NOT NULL THEN
      ST_IsValid(wkb_geometry_4326)::text
    WHEN wkb_geometry IS NOT NULL THEN
      ST_IsValid(wkb_geometry)::text
    ELSE 'No geometry'
  END AS is_valid_geometry
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Test 4: Test the exact WHERE clause from planner_parcels
SELECT 
  'WHERE Clause Test' AS test_type,
  ogc_fid,
  -- Test the WHERE conditions
  COALESCE(wkb_geometry_4326, wkb_geometry) IS NOT NULL AS has_geometry,
  NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry)) AS is_not_empty,
  -- Combined condition
  (COALESCE(wkb_geometry_4326, wkb_geometry) IS NOT NULL 
   AND NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry))) AS passes_where_clause
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Test 5: If planner_parcels exists, check what it returns for 661807
SELECT 
  'Planner Parcels Test' AS test_type,
  parcel_id,
  ST_GeometryType(geom) AS geom_type,
  ST_Area(geom) * 10.7639 AS area_sqft
FROM planner_parcels 
WHERE parcel_id = '661807';

-- Test 6: If planner_zoning exists, check what it returns for 661807
SELECT 
  'Planner Zoning Test' AS test_type,
  parcel_id,
  base,
  far_max,
  height_max_ft,
  setbacks
FROM planner_zoning 
WHERE parcel_id = '661807';

-- Test 7: If planner_join exists, check what it returns for 661807
SELECT 
  'Planner Join Test' AS test_type,
  parcel_id,
  base,
  far_max,
  height_max_ft,
  setbacks
FROM planner_join 
WHERE parcel_id = '661807';

SELECT 'Frontend connection test completed!' AS final_status;

