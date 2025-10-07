-- =====================================================
-- COMPLETE PLANNER SCHEMA - RUN THIS IN SUPABASE STUDIO
-- =====================================================
-- This file contains all planner views, functions, and indexes
-- Run this entire script in Supabase Studio SQL Editor

-- =====================================================
-- 1. PLANNER_PARCELS VIEW
-- =====================================================
-- View: planner_parcels (stable MultiPolygon,3857)
drop view if exists planner_parcels;
create view planner_parcels as
select
  coalesce(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) as parcel_id,
  coalesce(
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry_4326),3857),3)) )::geometry(MultiPolygon,3857),
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry       ),3857),3)) )::geometry(MultiPolygon,3857)
  ) as geom
from public.parcels
where coalesce(wkb_geometry_4326, wkb_geometry) is not null
  and not ST_IsEmpty(coalesce(wkb_geometry_4326, wkb_geometry));

-- =====================================================
-- 2. PLANNER_ZONING VIEW
-- =====================================================
-- View: planner_zoning (dynamic FAR if available; no defaults)
-- If a dynamic FAR column exists (effective_far, dynamic_far, ...), use it; else use max_far.
do $dynfar$
declare
  dyn_far_col text;
  far_expr    text;
  sql_zoning  text;
begin
  select column_name into dyn_far_col
  from information_schema.columns
  where table_schema='public' and table_name='zoning'
    and column_name = any (array[
      'effective_far','dynamic_far','calc_far','computed_far','current_far',
      'far_dynamic','far_effective','far_calc','far_current'
    ])
  order by 1 limit 1;

  far_expr := case
    when dyn_far_col is not null then format('nullif(%I, '''')::numeric', dyn_far_col)
    else                           'case when nullif(max_far, '''')::numeric in (-5555,-9999) then null else nullif(max_far, '''')::numeric end'
  end;

  sql_zoning := format($f$
    drop view if exists planner_zoning;
    create view planner_zoning as
    select
      geoid::text as parcel_id,
      zoning      as base,
      %s          as far_max,
      case when nullif(max_building_height_ft,'')::numeric in (-5555,-9999) then null
           else nullif(max_building_height_ft,'')::numeric end as height_max_ft,
      jsonb_build_object(
        'front', case when nullif(min_front_setback_ft,'')::numeric in (-5555,-9999) then null else nullif(min_front_setback_ft,'')::numeric end,
        'side',  case when nullif(min_side_setback_ft,'')::numeric  in (-5555,-9999) then null else nullif(min_side_setback_ft,'')::numeric  end,
        'rear',  case when nullif(min_rear_setback_ft,'')::numeric  in (-5555,-9999) then null else nullif(min_rear_setback_ft,'')::numeric  end
      ) as setbacks,
      null::numeric as parking_ratio,
      zoning_description, zoning_type, zoning_subtype, zoning_code_link, permitted_land_uses
    from public.zoning;
  $f$, far_expr);

  execute sql_zoning;
end
$dynfar$ language plpgsql;

-- =====================================================
-- 3. PLANNER_JOIN VIEW
-- =====================================================
-- View: planner_join (no defaults; purely dynamic fields)
drop view if exists planner_join;
create view planner_join as
select
  p.parcel_id,
  p.geom,
  z.base,
  z.far_max,
  z.height_max_ft,
  z.setbacks,
  z.parking_ratio
from planner_parcels p
left join planner_zoning z
  on z.parcel_id = p.parcel_id;

-- =====================================================
-- 4. GET_BUILDABLE_ENVELOPE FUNCTION
-- =====================================================
-- RPC: get_buildable_envelope(p_parcel_id text) -> geometry (EPSG:3857)
drop function if exists public.get_buildable_envelope(text);
create or replace function public.get_buildable_envelope(p_parcel_id text)
returns geometry
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  p3857  geometry;
  f numeric := 20;  -- defaults if zoning missing
  s numeric := 5;
  r numeric := 20;
  inset_m numeric;
  env geometry;
begin
  select geom into p3857
  from planner_parcels
  where parcel_id = p_parcel_id
  limit 1;

  if p3857 is null then
    raise exception 'Parcel % not found in planner_parcels', p_parcel_id;
  end if;

  select
    coalesce((setbacks->>'front')::numeric, f),
    coalesce((setbacks->>'side')::numeric,  s),
    coalesce((setbacks->>'rear')::numeric,  r)
  into f, s, r
  from planner_zoning
  where parcel_id = p_parcel_id
  limit 1;

  inset_m := greatest(f,s,r) / 3.28084;  -- ft→m
  env := ST_Buffer(p3857, -inset_m);

  return ST_MakeValid(env);
end $$;

-- =====================================================
-- 5. SCORE_PAD FUNCTION
-- =====================================================
-- RPC: score_pad(p_parcel_id text, p_pad_3857 geometry, p_parking_3857 geometry) -> jsonb
drop function if exists public.score_pad(text, geometry, geometry);
create function public.score_pad(
  p_parcel_id text,
  p_pad_3857 geometry,
  p_parking_3857 geometry
) returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  env geometry := public.get_buildable_envelope(p_parcel_id);
  pad_sf numeric := ST_Area(p_pad_3857) * 10.7639;
  env_sf numeric := nullif(ST_Area(env) * 10.7639, 0);

  far_max numeric := (select far_max from planner_zoning where parcel_id = p_parcel_id limit 1);
  pratio  numeric := (select parking_ratio from planner_zoning where parcel_id = p_parcel_id limit 1);

  far_ok boolean := case when far_max is null or env_sf is null then true else pad_sf <= far_max * env_sf end;
  coverage numeric := case when env_sf is null then 0 else pad_sf / env_sf end;

  stalls int := coalesce((select count(*) from ST_Dump(p_parking_3857)), 0);
  stalls_needed numeric := case when pratio is null then 0 else (pad_sf/1000.0) * pratio end;
  parking_ok boolean := stalls >= stalls_needed;

  envelope_ok boolean := ST_CoveredBy(p_pad_3857, env);
  score numeric;
begin
  score := (case when far_ok then 0.4 else 0 end)
         + (case when parking_ok then 0.3 else 0 end)
         + (case when envelope_ok then 0.2 else 0 end)
         + greatest(0, 0.1 - abs(coverage - 0.35));

  return jsonb_build_object(
    'pad_sf', round(pad_sf,0),
    'env_sf', round(coalesce(env_sf,0),0),
    'coverage', round(coverage,3),
    'stalls', stalls,
    'stalls_needed', ceil(stalls_needed),
    'far_ok', far_ok,
    'parking_ok', parking_ok,
    'envelope_ok', envelope_ok,
    'score', round(score,3)
  );
end $$;

-- =====================================================
-- 6. GET_PARCEL_DETAIL FUNCTION
-- =====================================================
-- RPC: get_parcel_detail(p_parcel_id text) -> everything UI needs in one call
drop function if exists public.get_parcel_detail(text);
create function public.get_parcel_detail(p_parcel_id text)
returns table(
  parcel_id text,
  geom geometry,
  base text,
  far_max numeric,
  height_max_ft numeric,
  setbacks jsonb,
  envelope geometry,
  metrics jsonb
) language plpgsql stable security definer set search_path=public as $$
begin
  return query
  select
    j.parcel_id,
    j.geom,
    j.base,
    j.far_max,
    j.height_max_ft,
    j.setbacks,
    public.get_buildable_envelope(j.parcel_id) as envelope,
    public.score_pad(j.parcel_id, public.get_buildable_envelope(j.parcel_id), null) as metrics
  from planner_join j
  where j.parcel_id = p_parcel_id
  limit 1;
end $$;

-- =====================================================
-- 7. SPATIAL INDEXES
-- =====================================================
-- Idempotent spatial indexes on base tables (views cannot be indexed)
create index if not exists gix_parcels_wkb4326 on public.parcels using gist (wkb_geometry_4326);
create index if not exists gix_zoning_geom      on public.zoning  using gist (geom);

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
select 'Planner schema created successfully!' as status;
