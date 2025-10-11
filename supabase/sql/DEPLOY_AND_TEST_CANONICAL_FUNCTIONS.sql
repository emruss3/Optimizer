-- =====================================================
-- DEPLOY AND TEST CANONICAL FUNCTIONS
-- Run this entire script in Supabase Dashboard SQL Editor
-- =====================================================

-- 1) Base tables / views
\i sql/planner_parcels.sql;
\i sql/planner_zoning.sql;
\i sql/planner_join.sql;

-- 2) Geometry helpers + scoring
\i sql/get_buildable_envelope.sql;
\i sql/score_pad.sql;
\i sql/get_parcel_detail.sql;

-- 3) Canonical envelope for UI
\i sql/get_parcel_geometry_3857.sql;
\i sql/get_parcel_buildable_envelope.sql;

-- 4) Indexes last
\i sql/planner_indexes.sql;

-- =====================================================
-- SMOKE TESTS - Run these to verify deployment
-- =====================================================

-- Test base tables
SELECT 'planner_parcels' as table_name, COUNT(*) as row_count FROM planner_parcels LIMIT 1;
SELECT 'planner_zoning' as table_name, COUNT(*) as row_count FROM planner_zoning LIMIT 1;
SELECT 'planner_join' as table_name, COUNT(*) as row_count FROM planner_join LIMIT 1;

-- Test geometry functions
SELECT 'get_parcel_geometry_3857' as function_name, COUNT(*) as result_count 
FROM get_parcel_geometry_3857(661807) LIMIT 1;

SELECT 'get_parcel_buildable_envelope' as function_name, COUNT(*) as result_count 
FROM get_parcel_buildable_envelope(661807) LIMIT 1;

-- =====================================================
-- DETAILED FUNCTION TESTS
-- =====================================================

-- Test get_parcel_geometry_3857 with sample data
SELECT 
  ogc_fid,
  address,
  sqft,
  ST_GeometryType(geometry_3857) as geom_type,
  jsonb_pretty(bounds_3857) as bounds,
  centroid_x,
  centroid_y,
  perimeter_ft
FROM get_parcel_geometry_3857(661807)
LIMIT 1;

-- Test get_parcel_buildable_envelope with sample data
SELECT 
  ogc_fid,
  ST_GeometryType(buildable_geom) as buildable_geom_type,
  area_sqft,
  jsonb_pretty(edge_types) as edge_types,
  jsonb_pretty(setbacks_applied) as setbacks_applied,
  jsonb_pretty(easements_removed) as easements_removed
FROM get_parcel_buildable_envelope(661807)
LIMIT 1;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify function signatures
SELECT 
  routine_name,
  routine_type,
  data_type as return_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'get_parcel_geometry_3857',
    'get_parcel_buildable_envelope',
    'score_pad'
  )
ORDER BY routine_name;

-- Check for any remaining old function variants
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND (
    routine_name LIKE '%parcel_geometry%' OR
    routine_name LIKE '%buildable_envelope%' OR
    routine_name LIKE '%siteplan%'
  )
ORDER BY routine_name;
