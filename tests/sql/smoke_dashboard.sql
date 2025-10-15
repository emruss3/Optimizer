-- SQL Smoke Tests for Supabase Dashboard
-- This version removes \echo commands that aren't supported in web SQL editors

-- Test 1: get_parcels_in_bbox returns rows and stable columns
select 
  'get_parcels_in_bbox test' as test_name,
  count(*) > 0 as has_rows,
  count(*) as row_count
from public.get_parcels_in_bbox(-86.95, 36.10, -86.70, 36.25, 0, 50);

-- Test 2: get_parcels_in_bbox column structure
select 
  'get_parcels_in_bbox columns' as test_name,
  ogc_fid,
  parcelnumb,
  address,
  zoning,
  sqft,
  lat,
  lon
from public.get_parcels_in_bbox(-86.95, 36.10, -86.70, 36.25, 0, 5)
limit 1;

-- Test 3: get_parcel_geometry_3857 works
select 
  'get_parcel_geometry_3857 test' as test_name,
  ogc_fid,
  sqft > 0 as has_area,
  geometry_3857 is not null as has_geometry
from public.get_parcel_geometry_3857(661807)
limit 1;

-- Test 4: get_parcel_buildable_envelope works
select 
  'get_parcel_buildable_envelope test' as test_name,
  ogc_fid,
  area_sqft > 0 as has_buildable_area,
  buildable_geom is not null as has_geometry,
  edge_types is not null as has_edge_types
from public.get_parcel_buildable_envelope(661807)
limit 1;

-- Test 5: compute_setback_polygon works
select 
  'compute_setback_polygon test' as test_name,
  public.compute_setback_polygon(
    ST_GeomFromText('POLYGON((-86.8 36.15, -86.8 36.16, -86.79 36.16, -86.79 36.15, -86.8 36.15))', 4326),
    10, 5, 10
  ) is not null as setback_polygon_created;

-- Test 6: score_pad computes real metrics
select 
  'score_pad test' as test_name,
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

-- Test 7: get_assemblage_geometry works
select 
  'get_assemblage_geometry test' as test_name,
  geometry is not null as has_geometry,
  acres > 0 as has_acres,
  sqft > 0 as has_sqft
from public.get_assemblage_geometry(array['661807']);

-- Test 8: get_buildable_area_exact works
select 
  'get_buildable_area_exact test' as test_name,
  jsonb_extract_path_text(result, 'sqft')::numeric > 0 as has_buildable_sqft,
  jsonb_extract_path_text(result, 'geometry') is not null as has_geometry
from (
  select public.get_buildable_area_exact(array['661807'], 20, 5, 20) as result
) t;

-- Test 9: roads table accessible to authenticated
select 
  'roads table test' as test_name,
  count(*) >= 0 as roads_accessible
from public.roads
limit 1;

