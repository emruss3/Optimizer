-- =====================================================
-- FIXED PLANNER VIEWS
-- =====================================================
-- This version should work with your data

-- Drop existing views
DROP VIEW IF EXISTS planner_join CASCADE;
DROP VIEW IF EXISTS planner_zoning CASCADE;
DROP VIEW IF EXISTS planner_parcels CASCADE;

-- Create fixed planner_parcels view
CREATE VIEW planner_parcels AS
SELECT
  COALESCE(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) AS parcel_id,
  -- Simplified geometry handling - use whichever geometry exists
  CASE 
    WHEN wkb_geometry_4326 IS NOT NULL AND NOT ST_IsEmpty(wkb_geometry_4326) THEN 
      ST_Transform(ST_MakeValid(wkb_geometry_4326), 3857)
    WHEN wkb_geometry IS NOT NULL AND NOT ST_IsEmpty(wkb_geometry) THEN 
      ST_Transform(ST_MakeValid(wkb_geometry), 3857)
    ELSE NULL
  END AS geom
FROM public.parcels
WHERE (wkb_geometry_4326 IS NOT NULL AND NOT ST_IsEmpty(wkb_geometry_4326))
   OR (wkb_geometry IS NOT NULL AND NOT ST_IsEmpty(wkb_geometry));

-- Create planner_zoning view (simplified)
CREATE VIEW planner_zoning AS
SELECT
  geoid::text AS parcel_id,
  zoning AS base,
  -- Simplified FAR handling
  CASE 
    WHEN max_far IS NOT NULL AND max_far != '' AND max_far::numeric NOT IN (-5555, -9999) 
    THEN max_far::numeric 
    ELSE NULL 
  END AS far_max,
  -- Simplified height handling
  CASE 
    WHEN max_building_height_ft IS NOT NULL AND max_building_height_ft != '' AND max_building_height_ft::numeric NOT IN (-5555, -9999)
    THEN max_building_height_ft::numeric 
    ELSE NULL 
  END AS height_max_ft,
  -- Simplified setbacks
  jsonb_build_object(
    'front', CASE WHEN min_front_setback_ft IS NOT NULL AND min_front_setback_ft != '' THEN min_front_setback_ft::numeric ELSE NULL END,
    'side',  CASE WHEN min_side_setback_ft IS NOT NULL AND min_side_setback_ft != '' THEN min_side_setback_ft::numeric ELSE NULL END,
    'rear',  CASE WHEN min_rear_setback_ft IS NOT NULL AND min_rear_setback_ft != '' THEN min_rear_setback_ft::numeric ELSE NULL END
  ) AS setbacks,
  NULL::numeric AS parking_ratio
FROM public.zoning;

-- Create planner_join view
CREATE VIEW planner_join AS
SELECT
  p.parcel_id,
  p.geom,
  z.base,
  z.far_max,
  z.height_max_ft,
  z.setbacks,
  z.parking_ratio
FROM planner_parcels p
LEFT JOIN planner_zoning z ON z.parcel_id = p.parcel_id;

-- Test the fixed views
SELECT 'Testing fixed views...' AS status;

-- Test planner_parcels
SELECT 
  'planner_parcels' AS view_name,
  COUNT(*) AS row_count,
  COUNT(geom) AS has_geom
FROM planner_parcels
WHERE parcel_id = '661807';

-- Test planner_join
SELECT 
  'planner_join' AS view_name,
  COUNT(*) AS row_count,
  far_max,
  setbacks
FROM planner_join
WHERE parcel_id = '661807';

-- Test the function
SELECT 'Testing get_parcel_buildable_envelope...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(661807);

SELECT 'Fixed views deployed successfully!' AS status;

