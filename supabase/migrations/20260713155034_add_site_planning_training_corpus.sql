-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create schema if not exists training;

revoke all on schema training from public, anon, authenticated;
grant usage on schema training to service_role;

create table if not exists training.dataset_registry (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  dataset_type text not null check (dataset_type in ('floorplan','site_plan','building_footprint','road_network','zoning','terrain','imagery','synthetic','municipal_approval','other')),
  provider text,
  source_url text,
  license_name text,
  license_url text,
  commercial_use_allowed boolean,
  derivative_use_allowed boolean,
  attribution_required boolean not null default true,
  redistribution_allowed boolean,
  training_use_status text not null default 'pending_review' check (training_use_status in ('approved','pending_review','reference_only','blocked')),
  geographic_scope text,
  version text,
  retrieved_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists training.site_precedents (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references training.dataset_registry(id) on delete restrict,
  source_record_id text,
  name text,
  typology text not null,
  subtype text,
  status text check (status in ('built','approved','proposed','synthetic','unknown')) default 'unknown',
  address text,
  city text,
  state text,
  country text default 'US',
  parcel_geom geometry(MultiPolygon,4326),
  site_geom geometry(MultiPolygon,4326),
  source_crs text,
  site_area_sqft numeric,
  gross_building_area_sqft numeric,
  building_footprint_sqft numeric,
  stories numeric,
  units integer,
  keys integer,
  parking_spaces integer,
  loading_spaces integer,
  far numeric,
  lot_coverage_pct numeric,
  impervious_coverage_pct numeric,
  open_space_pct numeric,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_document_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dataset_id, source_record_id)
);

create table if not exists training.site_features (
  id bigint generated always as identity primary key,
  precedent_id uuid not null references training.site_precedents(id) on delete cascade,
  feature_type text not null check (feature_type in ('building','parking_stall','parking_field','drive_aisle','road','curb','sidewalk','path','landscape','open_space','water','detention','easement','setback','buffer','loading','trash','bike_parking','amenity','retaining_wall','utility','other')),
  subtype text,
  level_no integer,
  geom geometry(Geometry,4326) not null,
  area_sqft numeric,
  length_ft numeric,
  count_value numeric,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists training.precedent_constraints (
  id bigint generated always as identity primary key,
  precedent_id uuid not null references training.site_precedents(id) on delete cascade,
  constraint_type text not null,
  value_numeric numeric,
  value_text text,
  unit text,
  source text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  attributes jsonb not null default '{}'::jsonb
);

create table if not exists training.parcel_plan_pairs (
  id uuid primary key default gen_random_uuid(),
  precedent_id uuid references training.site_precedents(id) on delete set null,
  parcel_id text,
  parcel_geom geometry(MultiPolygon,4326) not null,
  buildable_geom geometry(MultiPolygon,4326),
  target_plan_geom geometry(GeometryCollection,4326),
  jurisdiction text,
  zoning_code text,
  typology text not null,
  input_features jsonb not null default '{}'::jsonb,
  target_metrics jsonb not null default '{}'::jsonb,
  split text not null default 'unassigned' check (split in ('train','validation','test','unassigned','excluded')),
  quality_score numeric check (quality_score is null or (quality_score >= 0 and quality_score <= 1)),
  approved_for_training boolean not null default false,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists training.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references training.dataset_registry(id) on delete restrict,
  status text not null check (status in ('queued','running','completed','failed','partial')),
  started_at timestamptz,
  completed_at timestamptz,
  records_seen bigint not null default 0,
  records_inserted bigint not null default 0,
  records_updated bigint not null default 0,
  records_rejected bigint not null default 0,
  error_log jsonb not null default '[]'::jsonb,
  parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists site_precedents_dataset_idx on training.site_precedents(dataset_id);
create index if not exists site_precedents_typology_idx on training.site_precedents(typology, subtype);
create index if not exists site_precedents_site_geom_gix on training.site_precedents using gist(site_geom);
create index if not exists site_precedents_parcel_geom_gix on training.site_precedents using gist(parcel_geom);
create index if not exists site_features_precedent_idx on training.site_features(precedent_id, feature_type);
create index if not exists site_features_geom_gix on training.site_features using gist(geom);
create index if not exists parcel_plan_pairs_typology_split_idx on training.parcel_plan_pairs(typology, split, approved_for_training);
create index if not exists parcel_plan_pairs_parcel_geom_gix on training.parcel_plan_pairs using gist(parcel_geom);
create index if not exists parcel_plan_pairs_buildable_geom_gix on training.parcel_plan_pairs using gist(buildable_geom);

insert into training.dataset_registry
(slug,name,dataset_type,provider,source_url,license_name,commercial_use_allowed,derivative_use_allowed,redistribution_allowed,training_use_status,geographic_scope,notes,metadata)
values
('cubicasa5k','CubiCasa5K','floorplan','CubiCasa','https://zenodo.org/record/2613548','Research dataset license',null,null,null,'pending_review','Global residential interiors','Already ingested into public.floorplans and related geometry tables. Keep commercial training status pending until counsel confirms license scope.',jsonb_build_object('loaded_floorplans',4989,'existing_source','CubiCasa5k-SVG')),
('openstreetmap','OpenStreetMap','road_network','OpenStreetMap contributors','https://www.openstreetmap.org/copyright','ODbL 1.0',true,true,true,'approved','Global','Use for roads, access, sidewalks, parking and contextual site features with required attribution.',jsonb_build_object('primary_use',array['roads','access','parking','context']))
on conflict (slug) do update set
  name=excluded.name,
  dataset_type=excluded.dataset_type,
  provider=excluded.provider,
  source_url=excluded.source_url,
  license_name=excluded.license_name,
  commercial_use_allowed=excluded.commercial_use_allowed,
  derivative_use_allowed=excluded.derivative_use_allowed,
  redistribution_allowed=excluded.redistribution_allowed,
  training_use_status=excluded.training_use_status,
  geographic_scope=excluded.geographic_scope,
  notes=excluded.notes,
  metadata=training.dataset_registry.metadata || excluded.metadata,
  updated_at=now();

grant select, insert, update, delete on all tables in schema training to service_role;
grant usage, select on all sequences in schema training to service_role;
