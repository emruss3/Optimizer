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
