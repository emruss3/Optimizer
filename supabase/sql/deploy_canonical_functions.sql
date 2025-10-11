-- =====================================================
-- Deploy Canonical Functions in Order
-- Run this script to deploy all planner functions
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
-- Smoke Test - Run these to verify deployment
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
