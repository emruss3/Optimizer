-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create table if not exists training.pdf_page_extract (
  artifact_id uuid not null references training.dataset_artifacts(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  page_width_pt numeric,
  page_height_pt numeric,
  text_content text not null default '',
  text_sha256 text,
  parser_version text not null,
  quality_status text not null default 'extracted' check (quality_status in ('extracted','empty','failed','reviewed')),
  extraction_metadata jsonb not null default '{}'::jsonb,
  extracted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (artifact_id,page_number)
);

create index if not exists pdf_page_extract_text_idx
  on training.pdf_page_extract using gin (to_tsvector('english', text_content));

revoke all on training.pdf_page_extract from public, anon, authenticated;
grant select,insert,update,delete on training.pdf_page_extract to service_role;
