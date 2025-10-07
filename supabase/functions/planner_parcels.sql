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
