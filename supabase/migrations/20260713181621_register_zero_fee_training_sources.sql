-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

insert into training.dataset_registry (
  slug, name, dataset_type, provider, source_url, license_name, license_url,
  commercial_use_allowed, derivative_use_allowed, attribution_required,
  redistribution_allowed, training_use_status, geographic_scope, notes, metadata,
  license_fee_required, model_training_allowed, output_generation_allowed,
  license_scope, license_evidence_url, license_reviewed_at, attribution_text,
  share_alike_required, excluded_files, approved_uses
)
values
(
  'swiss_dwellings', 'Swiss Dwellings v3.0.0', 'floorplan', 'Archilyse AG',
  'https://zenodo.org/records/7788422', 'CC BY 4.0',
  'https://creativecommons.org/licenses/by/4.0/', true, true, true, true,
  'approved', 'Switzerland',
  'Commercially reusable with attribution. Exclude location_ratings.csv initially because it contains ratings supplied by an identified third party.',
  jsonb_build_object('apartments',45176,'approx_rooms',370000,'buildings',3100,'version','3.0.0'),
  false, true, true, array['data','geometry','annotations'],
  'https://zenodo.org/records/7788422', now(),
  'Swiss Dwellings v3.0.0 © Archilyse AG contributors, licensed CC BY 4.0; transformed for Parcelmap.',
  false, array['location_ratings.csv'], array['commercial_training','evaluation','derived_features','generated_outputs']
),
(
  'procthor_10k', 'ProcTHOR-10K', 'synthetic', 'Allen Institute for AI',
  'https://github.com/allenai/procthor-10k', 'Apache-2.0',
  'https://www.apache.org/licenses/LICENSE-2.0', true, true, true, true,
  'approved', 'Synthetic residential interiors',
  'Use house JSON geometry, room topology and semantic relationships. Retain Apache notices and source attribution.',
  jsonb_build_object('train_records',10000,'validation_records',1000,'test_records',1000),
  false, true, true, array['data','code','annotations'],
  'https://github.com/allenai/procthor-10k/blob/main/LICENSE', now(),
  'ProcTHOR-10K © Allen Institute for AI, licensed Apache-2.0; transformed for Parcelmap.',
  false, '{}'::text[], array['commercial_training','evaluation','derived_features','generated_outputs']
),
(
  'buildingsmart_sample_test_files', 'buildingSMART Sample & Test Files', 'other', 'buildingSMART International',
  'https://github.com/buildingSMART/Sample-Test-Files', 'Repository license under review', null,
  true, true, true, true, 'pending_review', 'OpenBIM/IFC samples',
  'Registered for parser conformance. Promote only after the exact repository license text is snapshotted and reviewed.',
  '{}'::jsonb, false, false, false, array['data','ifc'],
  'https://github.com/buildingSMART/Sample-Test-Files/blob/main/LICENSE', now(), null, false, '{}'::text[], array['parser_testing']
),
(
  'openstudio_standards', 'OpenStudio Standards', 'synthetic', 'National Laboratory of the Rockies contributors',
  'https://github.com/NatLabRockies/openstudio-standards', 'Permissive software license under review', null,
  true, true, true, true, 'pending_review', 'Commercial building archetype generation',
  'Software and generation rules, not a raw plan corpus. Promote after license snapshot and third-party data inventory review.',
  '{}'::jsonb, false, false, false, array['code','rules'],
  'https://github.com/NatLabRockies/openstudio-standards/blob/develop/LICENSE.md', now(), null, false, '{}'::text[], array['synthetic_generation','validation']
)
on conflict (slug) do update set
  name = excluded.name,
  dataset_type = excluded.dataset_type,
  provider = excluded.provider,
  source_url = excluded.source_url,
  license_name = excluded.license_name,
  license_url = excluded.license_url,
  commercial_use_allowed = excluded.commercial_use_allowed,
  derivative_use_allowed = excluded.derivative_use_allowed,
  attribution_required = excluded.attribution_required,
  redistribution_allowed = excluded.redistribution_allowed,
  training_use_status = excluded.training_use_status,
  geographic_scope = excluded.geographic_scope,
  notes = excluded.notes,
  metadata = training.dataset_registry.metadata || excluded.metadata,
  license_fee_required = excluded.license_fee_required,
  model_training_allowed = excluded.model_training_allowed,
  output_generation_allowed = excluded.output_generation_allowed,
  license_scope = excluded.license_scope,
  license_evidence_url = excluded.license_evidence_url,
  license_reviewed_at = excluded.license_reviewed_at,
  attribution_text = excluded.attribution_text,
  share_alike_required = excluded.share_alike_required,
  excluded_files = excluded.excluded_files,
  approved_uses = excluded.approved_uses,
  updated_at = now();

update training.dataset_registry
set license_fee_required = false,
    model_training_allowed = false,
    output_generation_allowed = false,
    approved_uses = '{}'::text[],
    updated_at = now()
where slug in ('cubicasa5k','rplan','resplan','structured3d','houseexpo','municipal_approved_plans');
