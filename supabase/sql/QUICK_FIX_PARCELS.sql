-- Quick fix for the get_parcels_in_bbox function
-- This removes the problematic p.parcel_id reference

-- Drop the existing function
drop function if exists public.get_parcels_in_bbox(double precision, double precision, double precision, double precision, integer, integer, text[]);

-- Create the fixed function
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
    coalesce(p.parcelnumb, p.map_par_id)::text as parcelnumb,
    regexp_replace(coalesce(p.parcelnumb, p.map_par_id)::text, '\D', '', 'g') as parcelnumb_no_formatting,
    coalesce(p.address, p.situsaddress, p.situs_full_address)::text as address,
    coalesce(p.zoning, p.zoning_code)::text as zoning,
    coalesce(p.zoning_description, p.zoningdesc)::text as zoning_description,
    coalesce(p.zoning_type, p.zontype)::text as zoning_type,
    coalesce(p.owner, p.ownername, p.owner_name)::text as owner,
    coalesce(p.deeded_acres, p.deededacreage)::numeric as deeded_acres,
    coalesce(p.gisacre, p.ll_gisacre)::numeric as gisacre,
    p.sqft::int as sqft,
    coalesce(p.landval, p.land_value)::numeric as landval,
    coalesce(p.parval, p.par_value)::numeric as parval,
    p.yearbuilt::int as yearbuilt,
    p.numstories::int as numstories,
    p.numunits::int as numunits,
    p.lat::double precision as lat,
    p.lon::double precision as lon,
    ST_AsGeoJSON(p.wkb_geometry_4326)::jsonb as geometry
  from public.parcels p, env
  where ST_Intersects(p.wkb_geometry_4326, env.bbox)
    and (min_sqft = 0 or p.sqft >= min_sqft)
    and (array_length(zoning_filter, 1) is null or p.zoning = any(zoning_filter))
  order by p.sqft desc nulls last
  limit max_results;
end;
$$;

-- Grant permissions
grant execute on function public.get_parcels_in_bbox(double precision, double precision, double precision, double precision, integer, integer, text[]) to anon, authenticated;
