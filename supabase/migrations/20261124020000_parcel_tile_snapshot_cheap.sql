-- Parcel tile export: a snapshot that does not read the whole table
-- (docs/PARCEL_TILES.md, finding 9).
--
-- Apply with the MCP apply_migration tool. It drops nothing.
--
-- The first fn_parcel_tile_snapshot took count(*), max(ll_updated_at) and the
-- distinct geoids over public.parcels: a scan of the whole 1.1 GB heap. On the
-- first CI build it ran past the Edge Function's time limit and was retried.
-- Now:
--   * the snapshot is the highest ogc_fid (primary key, instant) and the
--     table's running count of inserts, updates and deletes; if either moves
--     during an export, the export is refused;
--   * each export page reports its own newest ll_updated_at and its geoids,
--     so the data date and the counties come from the rows already being read.
--     That changes the page's columns, so it is a new function,
--     fn_parcel_tile_export_page. Nothing is dropped: the old
--     fn_parcel_tile_export stays, service_role only, and nothing calls it.

create or replace function public.fn_parcel_tile_snapshot()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'max_ogc_fid', (select max(ogc_fid) from public.parcels),
    'writes', (select n_tup_ins + n_tup_upd + n_tup_del from pg_stat_user_tables where relid = 'public.parcels'::regclass),
    'parcels_estimate', (select reltuples::bigint from pg_class where oid = 'public.parcels'::regclass),
    'taken_at', now()
  );
$$;

create or replace function public.fn_parcel_tile_export_page(p_after integer default 0, p_limit integer default 2000)
returns table (last_ogc_fid integer, features integer, rows_read integer, max_updated text, geoids text[], body text)
language plpgsql
stable
set search_path = public, extensions
as $$
begin
  -- EXECUTE ... USING plans each page with its own values
  -- (20261124010000_parcel_tile_export_plan.sql)
  return query execute $q$
    with page as (
      select p.ogc_fid, p.zoning, p.sqft, p.ll_updated_at, p.geoid, p.wkb_geometry_4326 as g
      from public.parcels p
      where p.ogc_fid > $1 and p.wkb_geometry_4326 is not null
      order by p.ogc_fid
      limit $2
    ),
    shaped as materialized (
      select ogc_fid, zoning, ll_updated_at, geoid,
        coalesce(sqft, round(st_area(g::geography) * 10.76391041671))::bigint as sqft,
        st_collectionextract(st_makevalid(g), 3) as poly
      from page
    )
    select max(ogc_fid)::integer,
           count(*) filter (where poly is not null and not st_isempty(poly))::integer,
           count(*)::integer,
           max(ll_updated_at)::text,
           coalesce(array_agg(distinct geoid::text) filter (where geoid is not null), '{}'),
           coalesce(string_agg(
             json_build_object(
               'type', 'Feature',
               'id', ogc_fid,
               'properties', json_build_object('ogc_fid', ogc_fid, 'zoning', zoning, 'sqft', sqft),
               'geometry', st_asgeojson(poly, 7)::json
             )::text, E'\n' order by ogc_fid)
             filter (where poly is not null and not st_isempty(poly)), '')
    from shaped
  $q$ using coalesce(p_after, 0), least(greatest(coalesce(p_limit, 2000), 1), 5000);
end;
$$;

revoke all on function public.fn_parcel_tile_snapshot() from public, anon, authenticated;
revoke all on function public.fn_parcel_tile_export_page(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_parcel_tile_snapshot() to service_role;
grant execute on function public.fn_parcel_tile_export_page(integer, integer) to service_role;
