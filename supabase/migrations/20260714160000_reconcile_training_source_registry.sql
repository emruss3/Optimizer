-- Reconciles source manifests, release policy, and owner-controlled registry rows.
-- Private binaries and extracted content remain outside this public repository.

update training.training_releases
set status='archived',
    description='Archived because the production corpus is U.S.-first; Swiss Dwellings is not used as a U.S. design prior.',
    manifest=manifest || jsonb_build_object(
      'archived_reason','foreign residential geometry excluded from U.S. production priors',
      'production_precedent_weight',0
    )
where name='parcelmap_open_interiors' and version='0.2.0';

delete from training.training_release_datasets trd
using training.training_releases tr, training.dataset_registry d
where trd.release_id=tr.id
  and trd.dataset_id=d.id
  and tr.name='parcelmap_open_interiors'
  and tr.version='0.2.0'
  and d.slug='swiss_dwellings';

update training.dataset_registry
set training_use_status='reference_only',
    model_training_allowed=false,
    output_generation_allowed=false,
    notes='Deprecated duplicate registry row. Canonical buildingSMART PCERT source is buildingsmart_pcert_ifc_samples; retained only for audit history.',
    metadata=metadata || jsonb_build_object(
      'deprecated_duplicate',true,
      'canonical_slug','buildingsmart_pcert_ifc_samples'
    ),
    updated_at=now()
where slug='buildingsmart_sample_test_files';

update training.dataset_artifacts a
set status='blocked',
    metadata=a.metadata || jsonb_build_object(
      'blocked_reason','deprecated_duplicate_registry',
      'canonical_dataset_slug','buildingsmart_pcert_ifc_samples'
    ),
    updated_at=now()
from training.dataset_registry d
where a.dataset_id=d.id and d.slug='buildingsmart_sample_test_files';

update training.dataset_registry
set output_generation_allowed=false,
    metadata=metadata || jsonb_build_object('precedent_weight',0,'parser_fixture_only',true),
    updated_at=now()
where slug in ('buildingsmart_pcert_ifc_samples','bim_whale_ifc_samples');

update training.dataset_artifacts a
set status='blocked',
    metadata=a.metadata || jsonb_build_object(
      'blocked_reason','source_path_not_present_in_official_repository'
    ),
    updated_at=now()
from training.dataset_registry d
where a.dataset_id=d.id
  and d.slug='buildingsmart_pcert_ifc_samples'
  and a.name in ('Infrastructure-Footing.ifc','Infrastructure-Geotech.ifc');

update training.dataset_artifacts a
set status='blocked',
    metadata=a.metadata || jsonb_build_object(
      'blocked_reason','replaced_by_canonical_artifact',
      'canonical_name',case a.name
        when 'ASHRAERetailStandalone.osm' then 'ASHRAE9012013RetailStandalone.osm'
        when 'ASHRAEWarehouse.osm' then 'DOERefWarehouse.osm'
      end
    ),
    updated_at=now()
from training.dataset_registry d
where a.dataset_id=d.id
  and d.slug='openstudio_us_commercial_archetypes'
  and a.name in ('ASHRAERetailStandalone.osm','ASHRAEWarehouse.osm');

with d as (
  select id from training.dataset_registry where slug='openstudio_us_commercial_archetypes'
), files(name,source_url,split,building_type,subtype,source_record_id) as (
  values
  ('ASHRAE9012013RetailStandalone.osm',
   'https://raw.githubusercontent.com/NatLabRockies/openstudio-standards/develop/data/geometry/ASHRAE9012013RetailStandalone.osm',
   'train','retail','standalone_retail_ashrae_2013','ASHRAE9012013RetailStandalone'),
  ('DOERefWarehouse.osm',
   'https://raw.githubusercontent.com/NatLabRockies/openstudio-standards/develop/data/geometry/DOERefWarehouse.osm',
   'train','industrial','warehouse_doe_reference','DOERefWarehouse')
)
insert into training.dataset_artifacts(
  dataset_id,name,source_url,split,media_type,file_format,compression,
  expected_records,license_scope,status,metadata,updated_at
)
select d.id,f.name,f.source_url,f.split,'text/plain','osm',null,1,'model-file','planned',
       jsonb_build_object(
         'source_record_id',f.source_record_id,
         'building_type',f.building_type,
         'subtype',f.subtype,
         'country_code','US',
         'us_archetype',true,
         'semantic_only',false,
         'parser_version','openstudio_osm_cleaner_v1'
       ),now()
from d cross join files f
on conflict(dataset_id,name) do update set
  source_url=excluded.source_url,
  split=excluded.split,
  media_type=excluded.media_type,
  file_format=excluded.file_format,
  expected_records=excluded.expected_records,
  license_scope=excluded.license_scope,
  metadata=training.dataset_artifacts.metadata || excluded.metadata,
  status=case when training.dataset_artifacts.status='ingested' then 'ingested' else 'planned' end,
  updated_at=now();

insert into training.ingestion_jobs(
  artifact_id,job_type,start_record,max_records,status,scheduled_at,result
)
select a.id,'ifc_to_bim',0,1,'queued',now(),'{}'::jsonb
from training.dataset_artifacts a
join training.dataset_registry d on d.id=a.dataset_id
where d.slug='openstudio_us_commercial_archetypes'
  and a.name in ('ASHRAE9012013RetailStandalone.osm','DOERefWarehouse.osm')
on conflict(artifact_id,job_type,start_record,max_records) do update set
  status=case when training.ingestion_jobs.status='completed' then 'completed' else 'queued' end,
  scheduled_at=now(),
  last_error=null,
  updated_at=now();

insert into training.dataset_registry(
  slug,name,dataset_type,provider,source_url,license_name,license_url,
  commercial_use_allowed,derivative_use_allowed,attribution_required,
  redistribution_allowed,training_use_status,geographic_scope,version,
  notes,metadata,license_fee_required,model_training_allowed,
  output_generation_allowed,license_scope,license_evidence_url,
  license_reviewed_at,attribution_text,share_alike_required,
  third_party_components,excluded_files,approved_uses,updated_at
)
values
(
  'owned_1300_4th_ave_multifamily_cd',
  'Owner-Controlled U.S. Podium Multifamily Precedent',
  'floorplan','Private owner-controlled project',null,
  'Owner-controlled private project data',null,
  true,true,true,false,'approved','United States','private-v1',
  'Approved for internal commercial analysis, model training, derived statistics, context selection, and generated design guidance. Public redistribution is prohibited.',
  jsonb_build_object(
    'source_confidentiality','private_project_documents',
    'project_typology','multifamily',
    'rights_attestation_status','confirmed_by_owner',
    'rights_scope',jsonb_build_array('internal_analysis','commercial_model_training','derived_statistics','production_context_engine','generated_design_guidance'),
    'program_training_weight',1,
    'geometry_training_weight',0,
    'geometry_quality_gate','rendered_sheet_review_pending',
    'private_data_restore_required',true
  ),
  false,true,true,array['private-data','program-features','relationship-features'],null,now(),
  'Private owner-controlled project precedent. Internal use only.',false,'[]'::jsonb,'{}'::text[],
  array['private_analysis','commercial_training','program_extraction','precedent_review','derived_outputs','production_context_engine'],now()
),
(
  'owned_townhome_cd_20260311',
  'Owner-Controlled U.S. Townhome Precedent',
  'floorplan','Private owner-controlled project',null,
  'Owner-controlled private project data',null,
  true,true,true,false,'approved','United States','private-v1',
  'Approved for internal commercial analysis, model training, derived statistics, context selection, and generated design guidance. Public redistribution is prohibited.',
  jsonb_build_object(
    'source_confidentiality','private_project_documents',
    'project_typology','townhome',
    'rights_attestation_status','confirmed_by_owner',
    'rights_scope',jsonb_build_array('internal_analysis','commercial_model_training','derived_statistics','production_context_engine','generated_design_guidance'),
    'program_training_weight',1,
    'geometry_training_weight',0,
    'geometry_quality_gate','rendered_sheet_review_pending',
    'private_data_restore_required',true
  ),
  false,true,true,array['private-data','program-features','relationship-features'],null,now(),
  'Private owner-controlled project precedent. Internal use only.',false,'[]'::jsonb,'{}'::text[],
  array['private_analysis','commercial_training','program_extraction','precedent_review','derived_outputs','production_context_engine'],now()
)
on conflict(slug) do update set
  name=excluded.name,
  dataset_type=excluded.dataset_type,
  provider=excluded.provider,
  license_name=excluded.license_name,
  commercial_use_allowed=excluded.commercial_use_allowed,
  derivative_use_allowed=excluded.derivative_use_allowed,
  attribution_required=excluded.attribution_required,
  redistribution_allowed=excluded.redistribution_allowed,
  training_use_status=excluded.training_use_status,
  geographic_scope=excluded.geographic_scope,
  version=excluded.version,
  notes=excluded.notes,
  metadata=training.dataset_registry.metadata || excluded.metadata,
  license_fee_required=excluded.license_fee_required,
  model_training_allowed=excluded.model_training_allowed,
  output_generation_allowed=excluded.output_generation_allowed,
  license_scope=excluded.license_scope,
  license_reviewed_at=excluded.license_reviewed_at,
  attribution_text=excluded.attribution_text,
  share_alike_required=excluded.share_alike_required,
  approved_uses=excluded.approved_uses,
  updated_at=now();

insert into training.training_releases(name,version,status,description,manifest)
values(
  'parcelmap_owned_us_precedents','0.1.0','draft',
  'Private owner-controlled U.S. precedents approved for program and relationship training. Private binaries and extracted page content require secure restore.',
  jsonb_build_object(
    'rightsStatus','confirmed_by_owner',
    'programTrainingAllowed',true,
    'geometryTrainingAllowed',false,
    'publicRedistributionAllowed',false,
    'productionGenerationApproved',false,
    'privateDataRestoreRequired',true,
    'qualityGate','rendered sheet and dimensional rule validation'
  )
)
on conflict(name,version) do update set
  status='draft',
  description=excluded.description,
  manifest=training.training_releases.manifest || excluded.manifest;

insert into training.training_release_datasets(
  release_id,dataset_id,included_splits,filters,attribution_text
)
select r.id,d.id,array['train']::text[],
       jsonb_build_object(
         'training_scope','program_and_relationship_features',
         'geometry_training_allowed',false,
         'private_data_restore_required',true
       ),d.attribution_text
from training.training_releases r
join training.dataset_registry d
  on d.slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311')
where r.name='parcelmap_owned_us_precedents' and r.version='0.1.0'
on conflict(release_id,dataset_id) do update set
  included_splits=excluded.included_splits,
  filters=excluded.filters,
  attribution_text=excluded.attribution_text;
