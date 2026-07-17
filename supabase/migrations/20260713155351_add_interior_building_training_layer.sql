-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create table if not exists training.building_interiors (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references training.dataset_registry(id) on delete restrict,
  source_record_id text,
  precedent_id uuid references training.site_precedents(id) on delete set null,
  floorplan_id uuid references public.floorplans(id) on delete set null,
  building_type text not null,
  subtype text,
  floor_no integer,
  gross_floor_area_sqft numeric,
  net_usable_area_sqft numeric,
  efficiency_pct numeric,
  occupancy_load integer,
  structural_grid jsonb not null default '{}'::jsonb,
  core_metrics jsonb not null default '{}'::jsonb,
  program_metrics jsonb not null default '{}'::jsonb,
  source_file_url text,
  metadata jsonb not null default '{}'::jsonb,
  approved_for_training boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dataset_id, source_record_id, floor_no)
);

create table if not exists training.interior_spaces (
  id bigint generated always as identity primary key,
  interior_id uuid not null references training.building_interiors(id) on delete cascade,
  source_space_id text,
  space_type text not null,
  space_subtype text,
  function_group text,
  geom geometry(Polygon,0),
  area_sqft numeric,
  width_ft numeric,
  depth_ft numeric,
  clear_height_ft numeric,
  capacity integer,
  public_private text check (public_private is null or public_private in ('public','semi_public','private','service','restricted')),
  conditioned boolean,
  attributes jsonb not null default '{}'::jsonb
);

create table if not exists training.interior_connections (
  id bigint generated always as identity primary key,
  interior_id uuid not null references training.building_interiors(id) on delete cascade,
  from_space_id bigint references training.interior_spaces(id) on delete cascade,
  to_space_id bigint references training.interior_spaces(id) on delete cascade,
  connection_type text not null check (connection_type in ('door','opening','corridor','stair','elevator','escalator','service_path','visual','adjacent','other')),
  width_ft numeric,
  accessible boolean,
  one_way boolean not null default false,
  attributes jsonb not null default '{}'::jsonb,
  check (from_space_id is distinct from to_space_id)
);

create table if not exists training.interior_elements (
  id bigint generated always as identity primary key,
  interior_id uuid not null references training.building_interiors(id) on delete cascade,
  element_type text not null check (element_type in ('wall','door','window','column','stair','elevator','escalator','restroom_fixture','kitchen_equipment','loading_dock','mep_room','shaft','egress_exit','furniture_zone','other')),
  subtype text,
  geom geometry(Geometry,0),
  quantity numeric,
  attributes jsonb not null default '{}'::jsonb
);

create table if not exists training.program_templates (
  id uuid primary key default gen_random_uuid(),
  building_type text not null,
  subtype text not null default '',
  name text not null,
  source_dataset_id uuid references training.dataset_registry(id) on delete set null,
  min_gfa_sqft numeric,
  max_gfa_sqft numeric,
  target_efficiency_pct numeric,
  required_spaces jsonb not null default '[]'::jsonb,
  adjacency_rules jsonb not null default '[]'::jsonb,
  circulation_rules jsonb not null default '{}'::jsonb,
  core_rules jsonb not null default '{}'::jsonb,
  service_rules jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  approved_for_generation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(building_type, subtype, name)
);

create index if not exists building_interiors_type_idx on training.building_interiors(building_type, subtype, approved_for_training);
create index if not exists building_interiors_dataset_idx on training.building_interiors(dataset_id);
create index if not exists interior_spaces_interior_type_idx on training.interior_spaces(interior_id, space_type);
create index if not exists interior_spaces_geom_gix on training.interior_spaces using gist(geom);
create index if not exists interior_connections_interior_idx on training.interior_connections(interior_id, connection_type);
create index if not exists interior_elements_interior_type_idx on training.interior_elements(interior_id, element_type);
create index if not exists interior_elements_geom_gix on training.interior_elements using gist(geom);

insert into training.dataset_registry
(slug,name,dataset_type,provider,source_url,license_name,commercial_use_allowed,derivative_use_allowed,redistribution_allowed,training_use_status,geographic_scope,notes,metadata)
values
('rplan','RPLAN','floorplan','Academic research dataset',null,null,null,null,null,'pending_review','Residential','Large residential floorplan corpus. License and distribution source must be verified before commercial model training.',jsonb_build_object('focus',array['room_labels','adjacency','residential_layouts'])),
('structured3d','Structured3D','floorplan','Structured3D authors','https://structured3d-dataset.org/',null,null,null,null,'pending_review','Synthetic residential interiors','Rich 3D structure, room semantics and rendered views. Keep quarantined until current terms are reviewed.',jsonb_build_object('focus',array['3d_geometry','room_semantics','doors','windows','structure'])),
('houseexpo','HouseExpo','floorplan','HouseExpo authors','https://arxiv.org/abs/1903.09845',null,null,null,null,'pending_review','Residential','35,126 2D indoor layouts useful for geometry and navigation. Verify repository license before commercial use.',jsonb_build_object('reported_floorplans',35126,'reported_rooms',252550)),
('resplan','ResPlan','floorplan','ResPlan authors','https://arxiv.org/abs/2508.14006',null,null,null,null,'pending_review','Residential','Vector and graph representations with walls, doors, windows, balconies and functional spaces. Verify released files and license.',jsonb_build_object('reported_floorplans',17000,'focus',array['vector_geometry','connectivity_graph','functional_spaces'])),
('municipal_approved_plans','Municipal Approved Building Plans','municipal_approval','Local permitting and planning agencies',null,'Varies by jurisdiction',null,null,null,'pending_review','United States','Best prospective source for commercial internal programs, cores, egress and service layouts. Each jurisdiction and document requires provenance and rights review.',jsonb_build_object('focus',array['commercial','multifamily','hotel','retail','industrial','mixed_use']))
on conflict (slug) do update set
 name=excluded.name,
 dataset_type=excluded.dataset_type,
 provider=excluded.provider,
 source_url=coalesce(excluded.source_url,training.dataset_registry.source_url),
 license_name=coalesce(excluded.license_name,training.dataset_registry.license_name),
 training_use_status=excluded.training_use_status,
 geographic_scope=excluded.geographic_scope,
 notes=excluded.notes,
 metadata=training.dataset_registry.metadata || excluded.metadata,
 updated_at=now();

grant select, insert, update, delete on training.building_interiors, training.interior_spaces, training.interior_connections, training.interior_elements, training.program_templates to service_role;
grant usage, select on all sequences in schema training to service_role;
