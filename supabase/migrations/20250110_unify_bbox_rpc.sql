-- Unify get_parcels_in_bbox into a single canonical function
-- Returns stable, frontend-friendly columns with fast MBB filtering

-- Drop existing variants
drop function if exists public.get_parcels_in_bbox(min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision);
drop function if exists public.get_parcels_in_bbox_filtered(double precision, double precision, double precision, double precision);

-- Create unified canonical function
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
    -- fast mbb operator first
    p.wkb_geometry_4326 && env.bbox
    -- optional precise filter (comment out if MBB is sufficient)
    and ST_Intersects(p.wkb_geometry_4326, env.bbox)
    and (p.sqft is null or p.sqft >= min_sqft)
    and (zoning_filter = '{}' or p.zoning = any(zoning_filter))
  order by p.sqft desc nulls last
  limit greatest(10, least(max_results, 5000));
end
$$;

-- Performance helpers (idempotent)
create index if not exists idx_parcels_geom on public.parcels using gist (wkb_geometry_4326);
create index if not exists idx_parcels_sqft on public.parcels (sqft) where sqft is not null;
create index if not exists idx_parcels_zoning on public.parcels (zoning);

-- Grant permissions
grant execute on function public.get_parcels_in_bbox(double precision, double precision, double precision, double precision, integer, integer, text[]) to anon, authenticated;
