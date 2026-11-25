-- Parcel tile export: plan each page with its own values (docs/PARCEL_TILES.md).
--
-- Applied 2026-11-24 with the MCP apply_migration tool, after
-- 20261124000000_parcel_tile_export.sql.
--
-- As a SQL function the page query was planned generically: with p_after and
-- p_limit unknown, the planner chose a bitmap scan of about a third of
-- public.parcels and a sort, on every page. A 2,000-parcel page took 30 s,
-- which made a full Davidson export about an hour of heavy reads. The same
-- query with the values written in walks the primary key and takes 0.3 s per
-- 500 parcels. EXECUTE ... USING plans each page with its actual values.
-- Same signature, same output, same grants.

create or replace function public.fn_parcel_tile_export(p_after integer default 0, p_limit integer default 2000)
returns table (last_ogc_fid integer, features integer, body text)
language plpgsql
stable
set search_path = public, extensions
as $$
begin
  return query execute $q$
    with page as (
      select p.ogc_fid, p.zoning, p.sqft, p.wkb_geometry_4326 as g
      from public.parcels p
      where p.ogc_fid > $1 and p.wkb_geometry_4326 is not null
      order by p.ogc_fid
      limit $2
    ),
    shaped as materialized (
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
    from shaped
  $q$ using coalesce(p_after, 0), least(greatest(coalesce(p_limit, 2000), 1), 5000);
end;
$$;

revoke all on function public.fn_parcel_tile_export(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_parcel_tile_export(integer, integer) to service_role;
