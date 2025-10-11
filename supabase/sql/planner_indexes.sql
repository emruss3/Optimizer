-- Idempotent spatial indexes on base tables (views cannot be indexed)
create index if not exists gix_parcels_wkb4326 on public.parcels using gist (wkb_geometry_4326);
create index if not exists gix_zoning_geom      on public.zoning  using gist (geom);
