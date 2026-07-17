-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create or replace view training.v_training_examples
with (security_invoker = true)
as
select
  bi.id,
  d.slug as dataset_slug,
  r.split,
  bi.source_record_id,
  bi.building_type,
  bi.subtype,
  bi.gross_floor_area_sqft,
  bi.program_metrics,
  bi.metadata,
  (select count(*) from training.interior_spaces s where s.interior_id = bi.id) as space_count,
  (select count(*) from training.interior_connections c where c.interior_id = bi.id) as connection_count,
  (select count(*) from training.interior_elements e where e.interior_id = bi.id) as element_count
from training.building_interiors bi
join training.dataset_registry d on d.id = bi.dataset_id
join training.raw_documents r
  on r.dataset_id = bi.dataset_id and r.source_record_id = bi.source_record_id
where bi.approved_for_training
  and r.approved_for_training
  and r.quality_status = 'accepted'
  and d.training_use_status = 'approved'
  and d.commercial_use_allowed is true
  and d.license_fee_required is false
  and d.model_training_allowed is true;

create or replace function training.get_training_example(p_interior_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'dataset', e.dataset_slug,
    'split', e.split,
    'sourceRecordId', e.source_record_id,
    'buildingType', e.building_type,
    'subtype', e.subtype,
    'grossFloorAreaSqft', e.gross_floor_area_sqft,
    'programMetrics', e.program_metrics,
    'metadata', e.metadata,
    'spaces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'sourceSpaceId', s.source_space_id,
        'spaceType', s.space_type,
        'spaceSubtype', s.space_subtype,
        'functionGroup', s.function_group,
        'areaSqft', s.area_sqft,
        'widthFt', s.width_ft,
        'depthFt', s.depth_ft,
        'clearHeightFt', s.clear_height_ft,
        'publicPrivate', s.public_private,
        'geometry', public.st_asgeojson(s.geom, 6)::jsonb,
        'attributes', s.attributes
      ) order by s.id)
      from training.interior_spaces s
      where s.interior_id = e.id
    ), '[]'::jsonb),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'fromSpaceId', c.from_space_id,
        'toSpaceId', c.to_space_id,
        'connectionType', c.connection_type,
        'widthFt', c.width_ft,
        'accessible', c.accessible,
        'attributes', c.attributes
      ) order by c.id)
      from training.interior_connections c
      where c.interior_id = e.id
    ), '[]'::jsonb),
    'elements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', el.id,
        'elementType', el.element_type,
        'subtype', el.subtype,
        'geometry', case when el.geom is null then null else public.st_asgeojson(el.geom, 6)::jsonb end,
        'quantity', el.quantity,
        'attributes', el.attributes
      ) order by el.id)
      from training.interior_elements el
      where el.interior_id = e.id
    ), '[]'::jsonb)
  )
  from training.v_training_examples e
  where e.id = p_interior_id;
$$;

revoke all on training.v_training_examples from anon, authenticated;
revoke all on function training.get_training_example(uuid) from public, anon, authenticated;
grant select on training.v_training_examples to service_role;
grant execute on function training.get_training_example(uuid) to service_role;

delete from training.training_release_datasets trd
using training.training_releases tr, training.dataset_registry d
where trd.release_id = tr.id
  and trd.dataset_id = d.id
  and tr.name = 'parcelmap_open_interiors'
  and tr.version = '0.1.0'
  and d.slug = 'swiss_dwellings';

update training.training_releases
set status = 'frozen', frozen_at = now(),
    description = 'Verified zero-license-fee ProcTHOR interior seed corpus.',
    manifest = jsonb_build_object(
      'licensePolicy', 'approved + commercial use + zero fee + model training allowed',
      'examples', 450,
      'train', 250,
      'validation', 100,
      'test', 100,
      'spaces', 1659,
      'connections', 1534,
      'elements', 46336,
      'normalizer', 'training.normalize_procthor_v1'
    )
where name = 'parcelmap_open_interiors' and version = '0.1.0';

insert into training.training_releases(name, version, status, description, manifest)
values (
  'parcelmap_open_interiors', '0.2.0', 'draft',
  'Planned expanded release adding Swiss Dwellings after full artifact staging and normalization.',
  jsonb_build_object('plannedDataset', 'swiss_dwellings', 'excludedFiles', array['location_ratings.csv'])
)
on conflict (name, version) do update set
  description = excluded.description,
  manifest = excluded.manifest;

insert into training.training_release_datasets(release_id,dataset_id,included_splits,attribution_text,filters)
select r.id,d.id,array['train','validation','test']::text[],d.attribution_text,
       jsonb_build_object('excluded_files', d.excluded_files, 'status', 'planned')
from training.training_releases r
join training.dataset_registry d on d.slug = 'swiss_dwellings'
where r.name = 'parcelmap_open_interiors' and r.version = '0.2.0'
on conflict (release_id, dataset_id) do update set
  filters = excluded.filters,
  attribution_text = excluded.attribution_text;
