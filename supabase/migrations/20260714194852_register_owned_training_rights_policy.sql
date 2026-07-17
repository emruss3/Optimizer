-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- This migration carries rights and release policy only. Private files, URLs,
-- extracted text, and geometry remain outside the public repository.

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
