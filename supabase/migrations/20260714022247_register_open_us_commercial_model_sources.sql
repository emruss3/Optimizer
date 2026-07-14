-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

with openstudio_upsert as (
  insert into training.dataset_registry (
    slug, name, dataset_type, provider, source_url, license_name, license_url,
    commercial_use_allowed, derivative_use_allowed, attribution_required,
    redistribution_allowed, training_use_status, geographic_scope, version,
    notes, metadata, license_fee_required, model_training_allowed,
    output_generation_allowed, license_scope, license_evidence_url,
    license_reviewed_at, attribution_text, share_alike_required,
    third_party_components, excluded_files, approved_uses, updated_at
  ) values (
    'openstudio_us_commercial_archetypes',
    'OpenStudio U.S. Commercial Archetype Geometry',
    'floorplan',
    'Alliance for Sustainable Energy / National Laboratory of the Rockies',
    'https://github.com/NatLabRockies/openstudio-standards/tree/develop/data/geometry',
    'OpenStudio permissive license',
    'https://github.com/NatLabRockies/openstudio-standards/blob/develop/LICENSE.md',
    true, true, true, true, 'approved',
    'United States commercial, institutional, hospitality, healthcare, industrial, education, and multifamily archetypes',
    'develop@cd105f8e8f5d0980b5d0bb2468ec89c9aa517f04',
    'Use model geometry, named spaces, thermal zones, surfaces, subsurfaces, and program semantics. Preserve license notices and do not imply endorsement.',
    jsonb_build_object(
      'source_branch','develop',
      'source_commit','cd105f8e8f5d0980b5d0bb2468ec89c9aa517f04',
      'country_policy','US-first',
      'initial_parser','openstudio_osm_cleaner_v1',
      'license_file_git_sha','74290520ab1c519136d53350b9edb6acd165a713'
    ),
    false, true, true,
    array['code','data','model-files']::text[],
    'https://github.com/NatLabRockies/openstudio-standards/blob/develop/LICENSE.md',
    now(),
    'OpenStudio(R), Copyright (c) 2008-2023, Alliance for Sustainable Energy, LLC. Retain the license conditions and do not imply endorsement.',
    false, '[]'::jsonb, '{}'::text[],
    array['commercial_model_training','program_prior_calibration','geometry_parser_testing','synthetic_generation','evaluation']::text[],
    now()
  )
  on conflict (slug) do update set
    name=excluded.name,
    dataset_type=excluded.dataset_type,
    provider=excluded.provider,
    source_url=excluded.source_url,
    license_name=excluded.license_name,
    license_url=excluded.license_url,
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
    license_evidence_url=excluded.license_evidence_url,
    license_reviewed_at=excluded.license_reviewed_at,
    attribution_text=excluded.attribution_text,
    share_alike_required=excluded.share_alike_required,
    third_party_components=excluded.third_party_components,
    excluded_files=excluded.excluded_files,
    approved_uses=excluded.approved_uses,
    updated_at=now()
  returning id
), buildingsmart_upsert as (
  insert into training.dataset_registry (
    slug, name, dataset_type, provider, source_url, license_name, license_url,
    commercial_use_allowed, derivative_use_allowed, attribution_required,
    redistribution_allowed, training_use_status, geographic_scope, version,
    notes, metadata, license_fee_required, model_training_allowed,
    output_generation_allowed, license_scope, license_evidence_url,
    license_reviewed_at, attribution_text, share_alike_required,
    third_party_components, excluded_files, approved_uses, updated_at
  ) values (
    'buildingsmart_pcert_ifc_samples',
    'buildingSMART PCERT IFC Sample Scene',
    'other',
    'buildingSMART International',
    'https://github.com/buildingSMART/Sample-Test-Files/tree/main/IFC%204.3.2.0%20(IFC4X3_ADD2)/PCERT-Sample-Scene',
    'CC BY 4.0',
    'https://github.com/buildingSMART/Sample-Test-Files/blob/main/LICENSE',
    true, true, true, true, 'approved',
    'Synthetic multi-discipline IFC parser and semantic validation scene; not a U.S. commercial precedent corpus',
    'main',
    'Approved for IFC parsing, entity normalization, and round-trip tests. Do not use as a weighted U.S. building-program precedent.',
    jsonb_build_object(
      'semantic_only',true,
      'us_layout_prior',false,
      'precedent_weight',0,
      'ifc_schema','IFC4X3_ADD2',
      'license_file_git_sha','0ac4732f2f3bedaa4c4b2da4b2017c6eff3ba563'
    ),
    false, true, true,
    array['data','model-files']::text[],
    'https://github.com/buildingSMART/Sample-Test-Files/blob/main/LICENSE',
    now(),
    'buildingSMART International sample files, licensed under Creative Commons Attribution 4.0 International.',
    false, '[]'::jsonb, '{}'::text[],
    array['geometry_parser_testing','bim_semantic_normalization','ifc_round_trip_testing','evaluation']::text[],
    now()
  )
  on conflict (slug) do update set
    name=excluded.name,
    dataset_type=excluded.dataset_type,
    provider=excluded.provider,
    source_url=excluded.source_url,
    license_name=excluded.license_name,
    license_url=excluded.license_url,
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
    license_evidence_url=excluded.license_evidence_url,
    license_reviewed_at=excluded.license_reviewed_at,
    attribution_text=excluded.attribution_text,
    share_alike_required=excluded.share_alike_required,
    third_party_components=excluded.third_party_components,
    excluded_files=excluded.excluded_files,
    approved_uses=excluded.approved_uses,
    updated_at=now()
  returning id
), openstudio_files(filename, split, building_type, subtype) as (
  values
    ('ASHRAESmallOffice.osm','train','office','small_office'),
    ('ASHRAEMediumOffice.osm','train','office','medium_office'),
    ('ASHRAELargeOffice.osm','train','office','large_office'),
    ('ASHRAERetailStandalone.osm','train','retail','standalone_retail'),
    ('ASHRAERetailStripmall.osm','train','retail','strip_mall'),
    ('ASHRAESuperMarket.osm','train','retail','supermarket'),
    ('ASHRAESmallHotel.osm','train','hotel','small_hotel'),
    ('ASHRAELargeHotel.osm','train','hotel','large_hotel'),
    ('ASHRAEWarehouse.osm','train','industrial','warehouse'),
    ('ASHRAEFullServiceRestaurant.osm','train','restaurant','full_service'),
    ('ASHRAEQuickServiceRestaurant.osm','train','restaurant','quick_service'),
    ('ASHRAEOutpatient.osm','train','healthcare','outpatient'),
    ('ASHRAEPrimarySchool.osm','train','education','primary_school'),
    ('ASHRAEMidriseApartment.osm','train','multifamily','midrise_apartment'),
    ('ASHRAEHospital.osm','validation','healthcare','hospital'),
    ('ASHRAESecondarySchool.osm','validation','education','secondary_school'),
    ('ASHRAELaboratory.osm','validation','laboratory','research_laboratory'),
    ('ASHRAEHighriseApartment.osm','test','multifamily','highrise_apartment'),
    ('ASHRAECourthouse.osm','test','civic','courthouse'),
    ('ASHRAECollege.osm','test','education','college')
), inserted_openstudio_artifacts as (
  insert into training.dataset_artifacts (
    dataset_id, name, source_url, split, media_type, file_format,
    compression, expected_records, license_scope, status, metadata, updated_at
  )
  select d.id, f.filename,
    'https://raw.githubusercontent.com/NatLabRockies/openstudio-standards/develop/data/geometry/' || f.filename,
    f.split, 'text/plain', 'osm', null, 1, 'model-file', 'planned',
    jsonb_build_object(
      'source_record_id', regexp_replace(f.filename, '\.osm$', ''),
      'building_type', f.building_type,
      'subtype', f.subtype,
      'country_code','US',
      'us_archetype',true,
      'semantic_only',false,
      'parser_version','openstudio_osm_cleaner_v1'
    ), now()
  from training.dataset_registry d
  cross join openstudio_files f
  where d.slug='openstudio_us_commercial_archetypes'
  on conflict (dataset_id, name) do update set
    source_url=excluded.source_url,
    split=excluded.split,
    media_type=excluded.media_type,
    file_format=excluded.file_format,
    compression=excluded.compression,
    expected_records=excluded.expected_records,
    license_scope=excluded.license_scope,
    metadata=training.dataset_artifacts.metadata || excluded.metadata,
    status=case when training.dataset_artifacts.status='ingested' then 'ingested' else 'planned' end,
    updated_at=now()
  returning id
), pcert_files(filename, discipline) as (
  values
    ('Building-Architecture.ifc','architecture'),
    ('Building-Hvac.ifc','hvac'),
    ('Building-Structural.ifc','structural'),
    ('Building-Landscaping.ifc','landscape'),
    ('Infrastructure-Footing.ifc','foundation'),
    ('Infrastructure-Geotech.ifc','geotechnical')
), inserted_pcert_artifacts as (
  insert into training.dataset_artifacts (
    dataset_id, name, source_url, split, media_type, file_format,
    compression, expected_records, license_scope, status, metadata, updated_at
  )
  select d.id, f.filename,
    'https://raw.githubusercontent.com/buildingSMART/Sample-Test-Files/main/IFC%204.3.2.0%20%28IFC4X3_ADD2%29/PCERT-Sample-Scene/' || f.filename,
    'test', 'application/x-step', 'ifc', null, 1, 'model-file', 'planned',
    jsonb_build_object(
      'source_record_id', regexp_replace(f.filename, '\.ifc$', ''),
      'discipline', f.discipline,
      'building_type','parser_test_scene',
      'subtype','pcert_' || f.discipline,
      'country_code',null,
      'us_archetype',false,
      'semantic_only',true,
      'precedent_weight',0,
      'parser_version','ifc_semantic_cleaner_v1'
    ), now()
  from training.dataset_registry d
  cross join pcert_files f
  where d.slug='buildingsmart_pcert_ifc_samples'
  on conflict (dataset_id, name) do update set
    source_url=excluded.source_url,
    split=excluded.split,
    media_type=excluded.media_type,
    file_format=excluded.file_format,
    compression=excluded.compression,
    expected_records=excluded.expected_records,
    license_scope=excluded.license_scope,
    metadata=training.dataset_artifacts.metadata || excluded.metadata,
    status=case when training.dataset_artifacts.status='ingested' then 'ingested' else 'planned' end,
    updated_at=now()
  returning id
)
insert into training.ingestion_jobs (
  artifact_id, job_type, start_record, max_records, status, scheduled_at, result
)
select a.id, 'ifc_to_bim', 0, 1, 'queued', now(), '{}'::jsonb
from training.dataset_artifacts a
join training.dataset_registry d on d.id=a.dataset_id
where d.slug in ('openstudio_us_commercial_archetypes','buildingsmart_pcert_ifc_samples')
on conflict (artifact_id, job_type, start_record, max_records) do update set
  status=case when training.ingestion_jobs.status='completed' then 'completed' else 'queued' end,
  scheduled_at=now(),
  last_error=null,
  updated_at=now();
