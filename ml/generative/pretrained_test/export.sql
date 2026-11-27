-- One row per plan, as JSON text in column j. Run per split and batch (results are large); never run for holdout.
-- :split is 'dev' or 'train'. Latest review per plan decides eligibility and the clean flags.
with r as (select distinct on (precedent_id) * from training.sp_plan_review_v2 order by precedent_id, reviewed_at desc)
select jsonb_build_object('pid', t.precedent_id, 'typ', t.typology, 'split', t.split,
 'site', ST_AsText(ST_GeomFromGeoJSON(t.site_geometry::text),1),
 'ctx', jsonb_build_object('boundary_edges', (select jsonb_agg(jsonb_build_object('type', e->>'type','geom_2274', ST_AsGeoJSON(ST_GeomFromGeoJSON((e->'geom_2274')::text),1)::jsonb)) from jsonb_array_elements(t.site_context->'boundary_edges') e)),
 'b', (select jsonb_agg(jsonb_build_object('w', ST_AsText(ST_GeomFromGeoJSON((f->'geometry')::text),1), 't', f->'labels'->>'building_type', 'u', f->'count_value', 's', f->>'source_subtype')) from jsonb_array_elements(t.features) f where f->>'type'='building'),
 'p', (select jsonb_agg(ST_AsText(ST_GeomFromGeoJSON((f->'geometry')::text),1)) from jsonb_array_elements(t.features) f where f->>'type'='parking_field'),
 'pc', (select sum((f->>'count_value')::numeric) from jsonb_array_elements(t.features) f where f->>'type'='parking_field'),
 'd', (select ST_AsText(ST_Collect(d.geom),1) from training.sp_drive d where d.precedent_id=t.precedent_id),
 'tm', jsonb_build_object('units', t.target_metrics->'units', 'stalls', t.target_metrics->'stalls'),
 'pos', r.position_status='verified', 'ur', r.units_reconciled, 'sr', r.stalls_reconciled, 'perr', r.position_error_ft)::text j
from training.v_sp_trace_training_v1 t join r on r.precedent_id=t.precedent_id
where t.split = :split and r.layout_training_eligible order by t.precedent_id;
