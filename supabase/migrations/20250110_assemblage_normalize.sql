-- Normalize parcel_ids to text[] across assemblage functions
-- Add exact buildable area variant with proper setback calculations

-- Drop existing assemblage function
drop function if exists public.get_assemblage_geometry(parcel_ids integer[]);

-- Create normalized assemblage geometry function
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

-- Exact inner-setback buildable area (variant)
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

-- Grant permissions
grant execute on function public.get_assemblage_geometry(text[]) to anon, authenticated;
grant execute on function public.get_buildable_area_exact(text[], numeric, numeric, numeric) to anon, authenticated;
