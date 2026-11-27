-- Map context for the sheets: site, nearby roads with names, neighbouring parcels and buildings, EPSG:3857.
-- :ids is the list of plan ids to draw (train and development only). Save the result and pass the file to sheets.py.
with s as (select t.precedent_id pid, t.case_number, t.name, t.split, ST_SetSRID(ST_GeomFromGeoJSON(t.site_geometry::text),2274) g
           from training.v_sp_trace_training_v1 t where t.split in ('train','dev') and t.precedent_id in (:ids))
select jsonb_build_object('pid', s.pid, 'case', s.case_number, 'name', s.name, 'split', s.split,
 'site', ST_AsGeoJSON(ST_Transform(s.g,3857),2)::jsonb,
 'roads', (select jsonb_agg(jsonb_build_object('name', r.name, 'kind', r.kind, 'line', ST_AsGeoJSON(ST_Transform(ST_Intersection(r.geom_2274, ST_Expand(s.g,260)),3857),2)::jsonb)) from public.transport_line_2274 r where ST_DWithin(r.geom_2274, s.g, 200)),
 'parcels', (select jsonb_agg(ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(p.geom_2274,1),3857),2)::jsonb) from public.parcels p where ST_DWithin(p.geom_2274, s.g, 140) and ST_Area(ST_Intersection(p.geom_2274, s.g)) < 0.5*ST_Area(p.geom_2274) and ST_Area(p.geom_2274) < 30*ST_Area(s.g)),
 'bldgs', (select jsonb_agg(ST_AsGeoJSON(ST_Transform(b.geom,3857),2)::jsonb) from public.buildings b where b.geom && ST_Transform(ST_Expand(s.g,160),4326) and ST_DWithin(ST_Transform(b.geom,2274), s.g, 150) and not ST_Intersects(ST_Transform(b.geom,2274), ST_Buffer(s.g,-5)))
)::text j from s;
