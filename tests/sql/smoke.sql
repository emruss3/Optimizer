-- SQL Smoke Tests
-- Run these tests to verify core RPC functions work correctly
-- Usage: psql "$SUPABASE_DB_URL" -f tests/sql/smoke.sql

\echo '=== SQL Smoke Tests ==='

\echo '--- Smoke: get_parcels_in_bbox returns rows and stable columns ---'
select 
  count(*) > 0 as has_rows,
  count(*) as row_count
from public.get_parcels_in_bbox(-86.95, 36.10, -86.70, 36.25, 0, 50);

\echo '--- Smoke: get_parcels_in_bbox column structure ---'
select 
  ogc_fid,
  parcelnumb,
  address,
  zoning,
  sqft,
  lat,
  lon
from public.get_parcels_in_bbox(-86.95, 36.10, -86.70, 36.25, 0, 5)
limit 1;

\echo '--- Smoke: get_parcel_geometry_3857 works ---'
select 
  ogc_fid,
  sqft > 0 as has_area,
  geometry_3857 is not null as has_geometry
from public.get_parcel_geometry_3857(661807)
limit 1;

\echo '--- Smoke: get_parcel_buildable_envelope works ---'
select 
  ogc_fid,
  area_sqft > 0 as has_buildable_area,
  buildable_geom is not null as has_geometry,
  edge_types is not null as has_edge_types
from public.get_parcel_buildable_envelope(661807)
limit 1;

\echo '--- Smoke: compute_setback_polygon works ---'
select 
  public.compute_setback_polygon(
    ST_GeomFromText('POLYGON((-86.8 36.15, -86.8 36.16, -86.79 36.16, -86.79 36.15, -86.8 36.15))', 4326),
    10, 5, 10
  ) is not null as setback_polygon_created;

\echo '--- Smoke: score_pad computes real metrics (using test parcel 661807) ---'
select 
  jsonb_extract_path_text(result, 'parcel_id') as parcel_id,
  jsonb_extract_path_text(result, 'metrics', 'parcel_area_sqft')::numeric > 0 as has_parcel_area,
  jsonb_extract_path_text(result, 'metrics', 'building_area_sqft')::numeric > 0 as has_building_area,
  jsonb_extract_path_text(result, 'checks', 'setbacks') is not null as has_setback_check
from (
  select public.score_pad(
    '661807',
    ST_GeomFromText('POLYGON((-86.8 36.15, -86.8 36.16, -86.79 36.16, -86.79 36.15, -86.8 36.15))', 4326),
    20, 5, 20, 2.5, 70
  ) as result
) t;

\echo '--- Smoke: get_assemblage_geometry works ---'
select 
  geometry is not null as has_geometry,
  acres > 0 as has_acres,
  sqft > 0 as has_sqft
from public.get_assemblage_geometry(array['661807']);

\echo '--- Smoke: get_buildable_area_exact works ---'
select 
  jsonb_extract_path_text(result, 'sqft')::numeric > 0 as has_buildable_sqft,
  jsonb_extract_path_text(result, 'geometry') is not null as has_geometry
from (
  select public.get_buildable_area_exact(array['661807'], 20, 5, 20) as result
) t;

\echo '--- Smoke: roads table accessible to authenticated ---'
select count(*) >= 0 as roads_accessible
from public.roads
limit 1;

\echo '=== Smoke Tests Complete ==='
