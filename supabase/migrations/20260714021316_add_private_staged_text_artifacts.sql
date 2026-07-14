-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create table if not exists training.staged_text_artifacts (
  artifact_id uuid primary key references training.dataset_artifacts(id) on delete cascade,
  source_url text not null,
  media_type text,
  content text not null,
  source_sha256 text not null,
  byte_size bigint not null,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staged_text_artifacts_sha_idx
  on training.staged_text_artifacts(source_sha256);

revoke all on training.staged_text_artifacts from public, anon, authenticated;
grant select, insert, update, delete on training.staged_text_artifacts to service_role;
