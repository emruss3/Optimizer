-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

alter table training.dataset_registry
  add column if not exists license_fee_required boolean not null default false,
  add column if not exists model_training_allowed boolean,
  add column if not exists output_generation_allowed boolean,
  add column if not exists license_scope text[] not null default '{}'::text[],
  add column if not exists license_evidence_url text,
  add column if not exists license_snapshot_sha256 text,
  add column if not exists license_reviewed_at timestamptz,
  add column if not exists attribution_text text,
  add column if not exists share_alike_required boolean not null default false,
  add column if not exists third_party_components jsonb not null default '[]'::jsonb,
  add column if not exists excluded_files text[] not null default '{}'::text[],
  add column if not exists approved_uses text[] not null default '{}'::text[];

create table if not exists training.dataset_artifacts (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references training.dataset_registry(id) on delete cascade,
  name text not null,
  source_url text not null,
  split text,
  media_type text,
  file_format text not null,
  compression text,
  checksum_algorithm text,
  checksum_value text,
  byte_size bigint,
  expected_records bigint,
  license_scope text not null default 'data',
  status text not null default 'planned' check (status in ('planned','staging','staged','ingesting','partial','ingested','failed','blocked')),
  staged_object_path text,
  retrieved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dataset_id, name)
);

create table if not exists training.raw_documents (
  id bigint generated always as identity primary key,
  dataset_id uuid not null references training.dataset_registry(id) on delete restrict,
  artifact_id uuid not null references training.dataset_artifacts(id) on delete restrict,
  source_record_id text not null,
  record_index bigint not null,
  split text not null check (split in ('train','validation','test','unassigned','excluded')),
  payload jsonb not null,
  payload_sha256 text not null,
  quality_status text not null default 'unreviewed' check (quality_status in ('unreviewed','accepted','rejected','quarantined')),
  approved_for_training boolean not null default true,
  normalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique(artifact_id, record_index),
  unique(dataset_id, split, source_record_id)
);

create table if not exists training.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references training.dataset_artifacts(id) on delete cascade,
  job_type text not null default 'jsonl_gzip_to_raw' check (job_type in ('jsonl_gzip_to_raw','zip_csv_to_interior','ifc_to_bim','normalize_raw')),
  start_record bigint not null default 0 check (start_record >= 0),
  max_records integer not null default 250 check (max_records > 0 and max_records <= 5000),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  attempts integer not null default 0,
  records_seen bigint not null default 0,
  records_written bigint not null default 0,
  request_id bigint,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(artifact_id, job_type, start_record, max_records)
);

create table if not exists training.training_releases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  status text not null default 'draft' check (status in ('draft','frozen','archived')),
  description text,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  frozen_at timestamptz,
  unique(name, version)
);

create table if not exists training.training_release_datasets (
  release_id uuid not null references training.training_releases(id) on delete cascade,
  dataset_id uuid not null references training.dataset_registry(id) on delete restrict,
  included_splits text[] not null default array['train','validation','test']::text[],
  filters jsonb not null default '{}'::jsonb,
  attribution_text text,
  primary key(release_id, dataset_id)
);

create index if not exists dataset_artifacts_dataset_status_idx on training.dataset_artifacts(dataset_id, status);
create index if not exists raw_documents_dataset_split_idx on training.raw_documents(dataset_id, split, approved_for_training, quality_status);
create index if not exists raw_documents_payload_gin on training.raw_documents using gin(payload jsonb_path_ops);
create index if not exists ingestion_jobs_status_idx on training.ingestion_jobs(status, created_at);

create or replace function training.enforce_raw_document_license_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_ok boolean;
begin
  select dr.training_use_status = 'approved'
     and dr.commercial_use_allowed is true
     and dr.license_fee_required is false
     and dr.model_training_allowed is true
    into v_ok
  from training.dataset_registry dr
  where dr.id = new.dataset_id;

  if coalesce(v_ok, false) is not true then
    raise exception 'Dataset % is not approved for zero-fee commercial model training', new.dataset_id using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists raw_documents_license_gate on training.raw_documents;
create trigger raw_documents_license_gate
before insert or update of dataset_id, approved_for_training
on training.raw_documents
for each row
when (new.approved_for_training)
execute function training.enforce_raw_document_license_gate();

revoke all on schema training from anon, authenticated;
grant usage on schema training to service_role;
grant select, insert, update, delete on training.dataset_artifacts, training.raw_documents, training.ingestion_jobs, training.training_releases, training.training_release_datasets to service_role;
grant usage, select on all sequences in schema training to service_role;
