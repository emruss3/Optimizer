-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

update training.dataset_registry
set
  name='buildingSMART PCERT Sample & Test Files',
  provider='buildingSMART International Ltd.',
  source_url='https://github.com/buildingSMART/Sample-Test-Files',
  license_name='CC BY 4.0',
  license_url='https://creativecommons.org/licenses/by/4.0/',
  commercial_use_allowed=true,
  derivative_use_allowed=true,
  attribution_required=true,
  redistribution_allowed=true,
  training_use_status='approved',
  geographic_scope='Generic OpenBIM/IFC discipline samples',
  version='cecf656112a54a0d8cdd8b06b9398bfea5163886',
  retrieved_at=now(),
  notes='Approved only for IFC parsing, BIM semantics, entity taxonomy, and interchange testing. Zero U.S. design-precedent weight.',
  license_fee_required=false,
  model_training_allowed=true,
  output_generation_allowed=false,
  license_scope=array['data','ifc','documentation'],
  license_evidence_url='https://github.com/buildingSMART/Sample-Test-Files/blob/main/LICENSE',
  license_snapshot_sha256=encode(extensions.digest('This work is licensed under the Creative Commons Attribution 4.0 International License.','sha256'),'hex'),
  license_reviewed_at=now(),
  attribution_text='buildingSMART International Ltd., Sample & Test Files, CC BY 4.0.',
  share_alike_required=false,
  third_party_components='[]'::jsonb,
  excluded_files=array['community/Schependomlaan and any item with narrower item-level terms'],
  approved_uses=array['ifc_parser_testing','bim_semantics','entity_taxonomy','interchange_validation'],
  metadata=metadata||jsonb_build_object('source_commit','cecf656112a54a0d8cdd8b06b9398bfea5163886','precedent_weight',0,'us_design_applicability',false,'license_review','official repository license confirmed'),
  updated_at=now()
where slug='buildingsmart_sample_test_files';

update training.dataset_registry
set
  provider='Alliance for Sustainable Energy, LLC / National Laboratory of the Rockies',
  source_url='https://github.com/NatLabRockies/openstudio-standards',
  license_name='OpenStudio permissive redistribution and use license',
  license_url='https://github.com/NatLabRockies/openstudio-standards/blob/develop/LICENSE.md',
  commercial_use_allowed=true,
  derivative_use_allowed=true,
  attribution_required=true,
  redistribution_allowed=true,
  training_use_status='approved',
  geographic_scope='United States commercial building archetypes and standards logic',
  version='cd105f8e8f5d0980b5d0bb2468ec89c9aa517f04',
  retrieved_at=now(),
  notes='Approved for U.S. commercial operational/program context and synthetic generation rules. Not treated as a corpus of architectural CAD plans.',
  license_fee_required=false,
  model_training_allowed=true,
  output_generation_allowed=true,
  license_scope=array['code','rules','program_metadata'],
  license_evidence_url='https://github.com/NatLabRockies/openstudio-standards/blob/develop/LICENSE.md',
  license_snapshot_sha256=encode(extensions.digest('OpenStudio permissive redistribution and use license; notice, naming, non-endorsement, and disclaimer conditions apply.','sha256'),'hex'),
  license_reviewed_at=now(),
  attribution_text='OpenStudio(R), Alliance for Sustainable Energy, LLC; used under the repository permissive license.',
  share_alike_required=false,
  third_party_components='[]'::jsonb,
  excluded_files=array[]::text[],
  approved_uses=array['commercial_program_context','operational_archetypes','synthetic_generation','validation'],
  metadata=metadata||jsonb_build_object('source_commit','cd105f8e8f5d0980b5d0bb2468ec89c9aa517f04','country_code','US','layout_precedent',false,'license_review','repository license confirmed'),
  updated_at=now()
where slug='openstudio_standards';

insert into training.dataset_registry (
  slug,name,dataset_type,provider,source_url,license_name,license_url,
  commercial_use_allowed,derivative_use_allowed,attribution_required,
  redistribution_allowed,training_use_status,geographic_scope,version,
  retrieved_at,notes,metadata,license_fee_required,model_training_allowed,
  output_generation_allowed,license_scope,license_evidence_url,
  license_snapshot_sha256,license_reviewed_at,attribution_text,
  share_alike_required,third_party_components,excluded_files,approved_uses
) values (
  'bim_whale_ifc_samples','BIM Whale IFC Samples','synthetic','André Wisén',
  'https://github.com/andrewisen/bim-whale-ifc-samples','MIT License',
  'https://github.com/andrewisen/bim-whale-ifc-samples/blob/main/LICENSE',
  true,true,true,true,'approved','Synthetic/dummy IFC samples; non-U.S. generic BIM semantics',
  '595fa90e3af7120d004fcb37a79d8657f1d1c9c2',now(),
  'Dummy IFC models approved for parser, spatial-hierarchy, and BIM element semantics. Explicitly excluded from U.S. layout-precedent learning.',
  jsonb_build_object('source_commit','595fa90e3af7120d004fcb37a79d8657f1d1c9c2','precedent_weight',0,'us_design_applicability',false,'synthetic',true),
  false,true,false,array['data','ifc','documentation'],
  'https://github.com/andrewisen/bim-whale-ifc-samples/blob/main/LICENSE',
  encode(extensions.digest('MIT License. Copyright (c) 2020 Andre Wisen. Permission is granted to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to retaining the notice.','sha256'),'hex'),
  now(),'BIM Whale IFC Samples, Copyright (c) 2020 André Wisén, MIT License.',
  false,'[]'::jsonb,
  array['AdvancedProject.ifc and BasicHouse.ifc deferred from starter ingestion because each exceeds 40 MB'],
  array['ifc_parser_testing','bim_spatial_hierarchy','element_taxonomy','property_set_parsing']
)
on conflict (slug) do update set
  name=excluded.name,dataset_type=excluded.dataset_type,provider=excluded.provider,
  source_url=excluded.source_url,license_name=excluded.license_name,license_url=excluded.license_url,
  commercial_use_allowed=excluded.commercial_use_allowed,derivative_use_allowed=excluded.derivative_use_allowed,
  attribution_required=excluded.attribution_required,redistribution_allowed=excluded.redistribution_allowed,
  training_use_status=excluded.training_use_status,geographic_scope=excluded.geographic_scope,
  version=excluded.version,retrieved_at=excluded.retrieved_at,notes=excluded.notes,
  metadata=training.dataset_registry.metadata||excluded.metadata,
  license_fee_required=excluded.license_fee_required,model_training_allowed=excluded.model_training_allowed,
  output_generation_allowed=excluded.output_generation_allowed,license_scope=excluded.license_scope,
  license_evidence_url=excluded.license_evidence_url,license_snapshot_sha256=excluded.license_snapshot_sha256,
  license_reviewed_at=excluded.license_reviewed_at,attribution_text=excluded.attribution_text,
  share_alike_required=excluded.share_alike_required,third_party_components=excluded.third_party_components,
  excluded_files=excluded.excluded_files,approved_uses=excluded.approved_uses,updated_at=now();

insert into training.dataset_registry (
  slug,name,dataset_type,provider,source_url,license_name,
  commercial_use_allowed,derivative_use_allowed,attribution_required,
  redistribution_allowed,training_use_status,geographic_scope,version,
  retrieved_at,notes,metadata,license_fee_required,model_training_allowed,
  output_generation_allowed,license_scope,license_evidence_url,
  license_snapshot_sha256,license_reviewed_at,attribution_text,
  share_alike_required,third_party_components,excluded_files,approved_uses
) values (
  'buildingsmart_schependomlaan','Schependomlaan BIM Dataset','other',
  'TU Eindhoven / project data owners',
  'https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/main/IFC%202.3.0.1%20(IFC%202x3)/Schependomlaan',
  'Item-level permission: scientific and academic purposes only',
  false,false,true,false,'blocked','Netherlands construction project',
  '7ddf57a201f88a0c213d5322b02ed15e94a60a40',now(),
  'Blocked even though the community repository is generally CC BY 4.0: the item README limits data-owner permission to scientific and academic purposes.',
  jsonb_build_object('item_level_restriction',true,'blocking_reason','scientific_and_academic_only','source_commit','7ddf57a201f88a0c213d5322b02ed15e94a60a40'),
  false,false,false,array['data','ifc','dwg'],
  'https://github.com/buildingsmart-community/Community-Sample-Test-Files/blob/main/IFC%202.3.0.1%20(IFC%202x3)/Schependomlaan/README.md',
  encode(extensions.digest('All data owners have given permission to use the data for scientific and academic purposes.','sha256'),'hex'),
  now(),null,false,'[]'::jsonb,array['all files'],array[]::text[]
)
on conflict (slug) do update set
  training_use_status='blocked',commercial_use_allowed=false,derivative_use_allowed=false,
  redistribution_allowed=false,model_training_allowed=false,output_generation_allowed=false,
  license_name=excluded.license_name,license_evidence_url=excluded.license_evidence_url,
  license_snapshot_sha256=excluded.license_snapshot_sha256,license_reviewed_at=now(),
  notes=excluded.notes,metadata=training.dataset_registry.metadata||excluded.metadata,
  excluded_files=array['all files'],approved_uses=array[]::text[],updated_at=now();
