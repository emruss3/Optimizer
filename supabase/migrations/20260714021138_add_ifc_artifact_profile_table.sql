-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create table if not exists training.ifc_artifact_profile (
  artifact_id uuid primary key references training.dataset_artifacts(id) on delete cascade,
  job_id uuid references training.ingestion_jobs(id) on delete set null,
  response_id bigint,
  source_sha256 text not null,
  ifc_schema text,
  file_name text,
  file_timestamp text,
  quality_status text not null check (quality_status in ('accepted','quarantined','rejected')),
  quality_notes text,
  entity_counts jsonb not null default '{}'::jsonb,
  total_entities bigint not null default 0,
  spatial_entity_count integer not null default 0,
  building_count integer not null default 0,
  storey_count integer not null default 0,
  space_count integer not null default 0,
  byte_size bigint not null default 0,
  geometry_extracted boolean not null default false,
  parser_version text not null default 'sql_ifc_profile_v1',
  ingested_at timestamptz not null default now(),
  check (jsonb_typeof(entity_counts) = 'object')
);

create index if not exists ifc_artifact_profile_quality_idx
  on training.ifc_artifact_profile(quality_status, ingested_at desc);

revoke all on training.ifc_artifact_profile from public, anon, authenticated;
grant select, insert, update, delete on training.ifc_artifact_profile to service_role;
