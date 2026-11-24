-- Parcel tile export: the read side of the tile build (docs/PARCEL_TILES.md).
--
-- NOT APPLIED. It waits on the owner's approval of the build plan. Apply it
-- with the MCP apply_migration tool or the SQL editor, never with db push.
--
-- The tile build reads the licensed parcel data once per release through these
-- two functions, page by page, and turns it into static vector tiles. Neither
-- function is callable by the browser: execute is granted to service_role only,
-- so the bulk export is no easier to reach than the table itself.
--
-- Geometry comes from the canonical wkb_geometry_4326. The projected and
-- simplified columns (geom_3857, wkb_geometry_3857, geom_simplified) were NULL
-- on the rows checked on 2026-11-24, and a bbox query on geom_3857 found no
-- rows in central Nashville; they are not used.

create or replace function public.fn_parcel_tile_snapshot()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  -- what one release is built from: compared before and after the export, so a
  -- build that straddles an import is refused rather than published half-old
  select jsonb_build_object(
    'parcels', count(*),
    'max_ogc_fid', max(ogc_fid),
    'data_updated_at', max(ll_updated_at),
    'geoids', coalesce(jsonb_agg(distinct geoid) filter (where geoid is not null), '[]'::jsonb),
    'taken_at', now()
  )
  from public.parcels;
$$;

create or replace function public.fn_parcel_tile_export(p_after integer default 0, p_limit integer default 2000)
returns table (last_ogc_fid integer, features integer, body text)
language sql
stable
set search_path = public, extensions
as $$
  -- One page of parcels as newline-delimited GeoJSON, in ogc_fid order. The
  -- feature id is ogc_fid and ogc_fid is also a property: the map reads it both
  -- ways. sqft is the value the live tiles show today (the parcels.sqft column
  -- when set, else the geodesic area in square feet), so filters and colours
  -- do not move when the source changes.
  with page as (
    select p.ogc_fid, p.zoning, p.sqft, p.wkb_geometry_4326 as g
    from public.parcels p
    where p.ogc_fid > p_after and p.wkb_geometry_4326 is not null
    order by p.ogc_fid
    limit least(greatest(p_limit, 1), 5000)
  ),
  shaped as (
    select ogc_fid, zoning,
      coalesce(sqft, round(st_area(g::geography) * 10.76391041671))::bigint as sqft,
      st_collectionextract(st_makevalid(g), 3) as poly
    from page
  )
  select max(ogc_fid)::integer,
         count(*) filter (where poly is not null and not st_isempty(poly))::integer,
         coalesce(string_agg(
           json_build_object(
             'type', 'Feature',
             'id', ogc_fid,
             'properties', json_build_object('ogc_fid', ogc_fid, 'zoning', zoning, 'sqft', sqft),
             'geometry', st_asgeojson(poly, 7)::json
           )::text, E'\n' order by ogc_fid)
           filter (where poly is not null and not st_isempty(poly)), '')
  from shaped;
$$;

revoke all on function public.fn_parcel_tile_snapshot() from public, anon, authenticated;
revoke all on function public.fn_parcel_tile_export(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_parcel_tile_snapshot() to service_role;
grant execute on function public.fn_parcel_tile_export(integer, integer) to service_role;
