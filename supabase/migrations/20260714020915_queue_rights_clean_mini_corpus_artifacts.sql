-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

with d as (
  select id from training.dataset_registry where slug='bim_whale_ifc_samples'
), artifacts(name,source_url,byte_size,building_type,subtype,training_role) as (
  values
  ('bim_whale_simple_wall',
   'https://raw.githubusercontent.com/andrewisen/bim-whale-ifc-samples/595fa90e3af7120d004fcb37a79d8657f1d1c9c2/SimpleWall/IFC/SimpleWall.ifc',
   39818::bigint,'component_test','ifc2x3','ifc_parser_and_element_semantics'),
  ('bim_whale_many_simple_walls',
   'https://raw.githubusercontent.com/andrewisen/bim-whale-ifc-samples/595fa90e3af7120d004fcb37a79d8657f1d1c9c2/ManySimpleWalls/IFC/ManySimpleWalls.ifc',
   null::bigint,'component_test','ifc2x3','ifc_parser_and_element_semantics'),
  ('bim_whale_tall_building',
   'https://raw.githubusercontent.com/andrewisen/bim-whale-ifc-samples/595fa90e3af7120d004fcb37a79d8657f1d1c9c2/TallBuilding/IFC/TallBuilding.ifc',
   616448::bigint,'tall_building','ifc2x3','bim_spatial_hierarchy'),
  ('bim_whale_large_building',
   'https://raw.githubusercontent.com/andrewisen/bim-whale-ifc-samples/595fa90e3af7120d004fcb37a79d8657f1d1c9c2/LargeBuilding/IFC/LargeBuilding.ifc',
   1289748::bigint,'multi_building','ifc2x3','bim_spatial_hierarchy')
)
insert into training.dataset_artifacts (
  dataset_id,name,source_url,split,media_type,file_format,compression,
  byte_size,expected_records,license_scope,status,metadata,updated_at
)
select
  d.id,a.name,a.source_url,'unassigned','application/x-step','ifc',null,
  a.byte_size,null,'data','planned',
  jsonb_build_object(
    'building_type',a.building_type,'subtype',a.subtype,
    'training_role',a.training_role,
    'geographic_applicability','generic_synthetic_non_us',
    'precedent_weight',0,
    'source_commit','595fa90e3af7120d004fcb37a79d8657f1d1c9c2',
    'geometry_extraction','not_in_starter_batch'
  ),now()
from d cross join artifacts a
on conflict (dataset_id,name) do update set
  source_url=excluded.source_url,split=excluded.split,media_type=excluded.media_type,
  file_format=excluded.file_format,byte_size=coalesce(excluded.byte_size,training.dataset_artifacts.byte_size),
  license_scope=excluded.license_scope,metadata=training.dataset_artifacts.metadata||excluded.metadata,
  updated_at=now();

with d as (
  select id from training.dataset_registry where slug='buildingsmart_sample_test_files'
), artifacts(name,file_name,building_type,training_role) as (
  values
  ('pcert_building_architecture','Building-Architecture.ifc','architecture_sample','ifc_architecture_semantics'),
  ('pcert_building_hvac','Building-Hvac.ifc','hvac_discipline','ifc_mep_semantics'),
  ('pcert_building_structural','Building-Structural.ifc','structural_discipline','ifc_structural_semantics'),
  ('pcert_building_landscaping','Building-Landscaping.ifc','landscape_discipline','ifc_landscape_semantics')
)
insert into training.dataset_artifacts (
  dataset_id,name,source_url,split,media_type,file_format,compression,
  expected_records,license_scope,status,metadata,updated_at
)
select
  d.id,a.name,
  'https://raw.githubusercontent.com/buildingSMART/Sample-Test-Files/cecf656112a54a0d8cdd8b06b9398bfea5163886/IFC%204.3.2.0%20(IFC4X3_ADD2)/PCERT-Sample-Scene/'||a.file_name,
  'unassigned','application/x-step','ifc',null,null,'data','planned',
  jsonb_build_object(
    'building_type',a.building_type,'subtype','ifc4x3_add2',
    'training_role',a.training_role,
    'geographic_applicability','generic_openbim',
    'precedent_weight',0,
    'source_commit','cecf656112a54a0d8cdd8b06b9398bfea5163886',
    'geometry_extraction','not_in_starter_batch'
  ),now()
from d cross join artifacts a
on conflict (dataset_id,name) do update set
  source_url=excluded.source_url,split=excluded.split,media_type=excluded.media_type,
  file_format=excluded.file_format,license_scope=excluded.license_scope,
  metadata=training.dataset_artifacts.metadata||excluded.metadata,updated_at=now();

with d as (
  select id from training.dataset_registry where slug='openstudio_standards'
)
insert into training.dataset_artifacts (
  dataset_id,name,source_url,split,media_type,file_format,compression,
  expected_records,license_scope,status,metadata,updated_at
)
select
  d.id,'openstudio_ashrae_90_1_2019_prototype_inputs',
  'https://raw.githubusercontent.com/NatLabRockies/openstudio-standards/cd105f8e8f5d0980b5d0bb2468ec89c9aa517f04/lib/openstudio-standards/standards/ashrae_90_1/ashrae_90_1_2019/data/ashrae_90_1_2019.prototype_inputs.json',
  'unassigned','application/json','json',null,null,'program_metadata','planned',
  jsonb_build_object(
    'normalizer','openstudio_prototype_inputs_v1',
    'training_role','us_commercial_operational_context',
    'geographic_applicability','US','layout_precedent',false,
    'source_commit','cd105f8e8f5d0980b5d0bb2468ec89c9aa517f04'
  ),now()
from d
on conflict (dataset_id,name) do update set
  source_url=excluded.source_url,split=excluded.split,media_type=excluded.media_type,
  file_format=excluded.file_format,license_scope=excluded.license_scope,
  metadata=training.dataset_artifacts.metadata||excluded.metadata,updated_at=now();

insert into training.ingestion_jobs (
  artifact_id,job_type,start_record,max_records,status,result,invocation_nonce,updated_at
)
select
  a.id,case when a.file_format='ifc' then 'ifc_to_bim' else 'normalize_raw' end,
  0,5000,'queued','{}'::jsonb,gen_random_uuid(),now()
from training.dataset_artifacts a
join training.dataset_registry d on d.id=a.dataset_id
where d.slug in ('bim_whale_ifc_samples','buildingsmart_sample_test_files','openstudio_standards')
  and a.name in (
    'bim_whale_simple_wall','bim_whale_many_simple_walls',
    'bim_whale_tall_building','bim_whale_large_building',
    'pcert_building_architecture','pcert_building_hvac',
    'pcert_building_structural','pcert_building_landscaping',
    'openstudio_ashrae_90_1_2019_prototype_inputs'
  )
  and not exists (
    select 1 from training.ingestion_jobs j
    where j.artifact_id=a.id
      and j.job_type=case when a.file_format='ifc' then 'ifc_to_bim' else 'normalize_raw' end
  );
