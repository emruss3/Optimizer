-- Cleanup and Deploy All Migrations
-- This script aggressively drops all existing functions before creating new ones

-- ============================================================================
-- AGGRESSIVE CLEANUP - Drop ALL existing functions that might conflict
-- ============================================================================

-- Drop ALL variants of get_parcels_in_bbox
drop function if exists public.get_parcels_in_bbox(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision);
drop function if exists public.get_parcels_in_bbox(min_lng numeric, min_lat numeric, max_lng numeric, max_lat numeric);
drop function if exists public.get_parcels_in_bbox(min_lng real, min_lat real, max_lng real, max_lat real);
drop function if exists public.get_parcels_in_bbox(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision, min_sqft integer);
drop function if exists public.get_parcels_in_bbox(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision, min_sqft integer, max_results integer);
drop function if exists public.get_parcels_in_bbox(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision, min_sqft integer, max_results integer, zoning_filter text[]);
drop function if exists public.get_parcels_in_bbox_filtered(double precision, double precision, double precision, double precision);
drop function if exists public.get_parcels_in_bbox_filtered(numeric, numeric, numeric, numeric);

-- Drop ALL variants of score_pad
drop function if exists public.score_pad(text, geometry, numeric, numeric, numeric, numeric, numeric);
drop function if exists public.score_pad(text, geometry);
drop function if exists public.score_pad(integer, geometry);
drop function if exists public.score_pad(text, geometry, numeric, numeric, numeric);

-- Drop ALL variants of assemblage functions
drop function if exists public.get_assemblage_geometry(parcel_ids integer[]);
drop function if exists public.get_assemblage_geometry(parcel_ids text[]);
drop function if exists public.get_assemblage_geometry(parcel_ids bigint[]);

-- Drop ALL variants of buildable area functions
drop function if exists public.get_buildable_area_exact(parcel_ids text[], numeric, numeric, numeric);
drop function if exists public.get_buildable_area_exact(parcel_ids integer[], numeric, numeric, numeric);
drop function if exists public.get_buildable_area_exact(parcel_ids bigint[], numeric, numeric, numeric);

-- Drop compute_setback_polygon if it exists
drop function if exists public.compute_setback_polygon(geometry, numeric, numeric, numeric);

-- ============================================================================
-- CREATE NEW FUNCTIONS
-- ============================================================================

-- 1) UNIFIED BBOX FUNCTION
create or replace function public.get_parcels_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  min_sqft integer default 0,
  max_results integer default 1000,
  zoning_filter text[] default '{}'
)
returns table (
  ogc_fid text,
  parcelnumb text,
  parcelnumb_no_formatting text,
  address text,
  zoning text,
  zoning_description text,
  zoning_type text,
  owner text,
  deeded_acres numeric,
  gisacre numeric,
  sqft integer,
  landval numeric,
  parval numeric,
  yearbuilt integer,
  numstories integer,
  numunits integer,
  lat double precision,
  lon double precision,
  geometry jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with env as (
    select ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326) as bbox
  )
  select
    p.ogc_fid::text as ogc_fid,
    coalesce(p.parcelnumb, p.parcel_id, p.map_par_id)::text as parcelnumb,
    regexp_replace(coalesce(p.parcelnumb, p.parcel_id, p.map_par_id)::text, '\D', '', 'g') as parcelnumb_no_formatting,
    coalesce(p.address, p.situsaddress, p.situs_full_address)::text as address,
    coalesce(p.zoning, p.zoning_code)::text as zoning,
    coalesce(p.zoning_description, p.zoningdesc)::text as zoning_description,
    coalesce(p.zoning_type, p.zontype)::text as zoning_type,
    coalesce(p.owner, p.ownername, p.owner_name)::text as owner,
    coalesce(p.deeded_acres, p.deededacreage)::numeric as deeded_acres,
    coalesce(p.gisacre, p.ll_gisacre)::numeric as gisacre,
    p.sqft::int as sqft,
    coalesce(p.landval, p.land_value)::numeric as landval,
    coalesce(p.parval, p.total_value)::numeric as parval,
    coalesce(p.yearbuilt, p.year_built)::int as yearbuilt,
    coalesce(p.numstories, p.stories)::int as numstories,
    coalesce(p.numunits, p.units)::int as numunits,
    ST_Y(ST_Centroid(p.wkb_geometry_4326)) as lat,
    ST_X(ST_Centroid(p.wkb_geometry_4326)) as lon,
    ST_AsGeoJSON(p.wkb_geometry_4326)::jsonb as geometry
  from public.parcels p, env
  where
    p.wkb_geometry_4326 && env.bbox
    and ST_Intersects(p.wkb_geometry_4326, env.bbox)
    and (p.sqft is null or p.sqft >= min_sqft)
    and (zoning_filter = '{}' or p.zoning = any(zoning_filter))
  order by p.sqft desc nulls last
  limit greatest(10, least(max_results, 5000));
end
$$;

-- 2) COMPUTE SETBACK POLYGON
create or replace function public.compute_setback_polygon(
  parcel_geom geometry(Polygon, 4326),
  front_ft numeric, side_ft numeric, rear_ft numeric
) returns geometry
language sql immutable
as $$
  with meters as (
    select
      coalesce(front_ft, 0) / 3.28084 as f_m,
      coalesce(side_ft, 0) / 3.28084 as s_m,
      coalesce(rear_ft, 0) / 3.28084 as r_m
  ), edges as (
    select least(m.f_m, m.s_m, m.r_m) as inner_m
    from meters m
  )
  select case
    when parcel_geom is null then null
    else ST_Buffer(parcel_geom::geography, - (select inner_m from edges))::geometry
  end
$$;

-- 3) SCORE PAD WITH REAL COMPLIANCE
create or replace function public.score_pad(
  parcel_id text,
  building_geom geometry(Polygon, 4326),
  front_setback_ft numeric default 0,
  side_setback_ft numeric default 0,
  rear_setback_ft numeric default 0,
  max_far numeric default null,
  max_coverage_pct numeric default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  pg geometry;
  setback_poly geometry;
  parcel_area_sqft numeric;
  bldg_area_sqft numeric;
  site_coverage_pct numeric;
  far_val numeric;
  coverage_ok boolean;
  far_ok boolean;
  setback_ok boolean;
begin
  select wkb_geometry_4326 into pg
  from public.parcels
  where ogc_fid::text = parcel_id
  limit 1;

  if pg is null then
    raise exception 'Parcel % not found', parcel_id using errcode = 'P0002';
  end if;

  setback_poly := public.compute_setback_polygon(pg, front_setback_ft, side_setback_ft, rear_setback_ft);

  parcel_area_sqft := ST_Area(ST_Transform(pg, 3857)) * 10.764;
  bldg_area_sqft   := ST_Area(ST_Transform(building_geom, 3857)) * 10.764;

  site_coverage_pct := case when parcel_area_sqft > 0 then (bldg_area_sqft / parcel_area_sqft) * 100 else null end;
  far_val := case when parcel_area_sqft > 0 then (bldg_area_sqft / parcel_area_sqft) else null end;

  setback_ok := case
    when setback_poly is null or building_geom is null then false
    else ST_Covers(setback_poly, building_geom)
  end;

  coverage_ok := case
    when max_coverage_pct is null or site_coverage_pct is null then null
    else site_coverage_pct <= max_coverage_pct
  end;

  far_ok := case
    when max_far is null or far_val is null then null
    else far_val <= max_far
  end;

  return jsonb_build_object(
    'parcel_id', parcel_id,
    'metrics', jsonb_build_object(
      'parcel_area_sqft', parcel_area_sqft,
      'building_area_sqft', bldg_area_sqft,
      'site_coverage_pct', site_coverage_pct,
      'far', far_val
    ),
    'checks', jsonb_build_object(
      'setbacks', setback_ok,
      'coverage', coverage_ok,
      'far', far_ok
    )
  );
end
$$;

-- 4) ASSEMBLAGE GEOMETRY
create or replace function public.get_assemblage_geometry(parcel_ids text[])
returns table (geometry jsonb, acres numeric, sqft numeric, perimeter_ft numeric)
language sql
security invoker
set search_path = public
as $$
  with sel as (
    select wkb_geometry_4326
    from public.parcels
    where ogc_fid::text = any(parcel_ids)
  ), unioned as (
    select ST_UnaryUnion(ST_Collect(wkb_geometry_4326)) as g
    from sel
  )
  select
    ST_AsGeoJSON(g)::jsonb as geometry,
    ST_Area(ST_Transform(g,3857))/4046.85642 as acres,
    ST_Area(ST_Transform(g,3857))*10.764 as sqft,
    ST_Perimeter(ST_Transform(g,3857))*3.28084 as perimeter_ft
  from unioned;
$$;

-- 5) EXACT BUILDABLE AREA
create or replace function public.get_buildable_area_exact(
  parcel_ids text[],
  front_setback_ft numeric,
  side_setback_ft numeric,
  rear_setback_ft numeric
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  g geometry;
  inner geometry;
  sqft numeric;
begin
  select (ST_UnaryUnion(ST_Collect(wkb_geometry_4326))) into g
  from public.parcels
  where ogc_fid::text = any(parcel_ids);

  if g is null then
    return jsonb_build_object('sqft',0,'geometry',null,'note','no parcels');
  end if;

  inner := public.compute_setback_polygon(g, front_setback_ft, side_setback_ft, rear_setback_ft);
  sqft := ST_Area(ST_Transform(inner,3857))*10.764;

  return jsonb_build_object(
    'sqft', sqft,
    'geometry', ST_AsGeoJSON(inner)::jsonb
  );
end
$$;

-- ============================================================================
-- SECURITY AND PERMISSIONS
-- ============================================================================

-- Revoke anonymous access to roads table
revoke all on table public.roads from anon;
grant select on table public.roads to authenticated;

-- Grant permissions for all functions
grant execute on function public.get_parcels_in_bbox(double precision, double precision, double precision, double precision, integer, integer, text[]) to anon, authenticated;
grant execute on function public.compute_setback_polygon(geometry, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.score_pad(text, geometry, numeric, numeric, numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.get_assemblage_geometry(text[]) to anon, authenticated;
grant execute on function public.get_buildable_area_exact(text[], numeric, numeric, numeric) to anon, authenticated;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

create index if not exists idx_parcels_geom on public.parcels using gist (wkb_geometry_4326);
create index if not exists idx_parcels_sqft on public.parcels (sqft) where sqft is not null;
create index if not exists idx_parcels_zoning on public.parcels (zoning);
create index if not exists idx_roads_geom on public.roads using gist (geom);

