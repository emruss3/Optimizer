-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create table if not exists training.precedent_units (
  id uuid primary key default gen_random_uuid(),
  precedent_id uuid not null references training.site_precedents(id) on delete cascade,
  source_unit_id text not null,
  address text,
  model_unit_type text not null,
  label_unit_type text,
  phase integer,
  variant text not null default 'standard' check (variant in ('standard','alternate','unknown')),
  orientation_code text check (orientation_code is null or orientation_code in ('S','R')),
  habitable_sqft numeric,
  garage_sqft numeric,
  balcony_sqft numeric,
  rooftop_sqft numeric,
  enclosed_sqft numeric,
  stories integer,
  bedrooms numeric,
  bathrooms numeric,
  parking_spaces integer,
  source_sheet text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(precedent_id, source_unit_id)
);

create index if not exists precedent_units_precedent_type_idx
  on training.precedent_units(precedent_id, model_unit_type, phase);
create index if not exists precedent_units_address_idx
  on training.precedent_units(address);

revoke all on training.precedent_units from public, anon, authenticated;
grant select,insert,update,delete on training.precedent_units to service_role;
