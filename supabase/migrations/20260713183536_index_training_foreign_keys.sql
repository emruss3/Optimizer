-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create index if not exists building_interiors_floorplan_id_idx
  on training.building_interiors(floorplan_id) where floorplan_id is not null;
create index if not exists building_interiors_precedent_id_idx
  on training.building_interiors(precedent_id) where precedent_id is not null;
create index if not exists ingestion_runs_dataset_id_idx
  on training.ingestion_runs(dataset_id);
create index if not exists interior_connections_from_space_id_idx
  on training.interior_connections(from_space_id) where from_space_id is not null;
create index if not exists interior_connections_to_space_id_idx
  on training.interior_connections(to_space_id) where to_space_id is not null;
create index if not exists parcel_plan_pairs_precedent_id_idx
  on training.parcel_plan_pairs(precedent_id) where precedent_id is not null;
create index if not exists precedent_constraints_precedent_id_idx
  on training.precedent_constraints(precedent_id);
create index if not exists program_templates_source_dataset_id_idx
  on training.program_templates(source_dataset_id) where source_dataset_id is not null;
create index if not exists training_release_datasets_dataset_id_idx
  on training.training_release_datasets(dataset_id);
analyze training.dataset_registry;
analyze training.dataset_artifacts;
analyze training.raw_documents;
analyze training.building_interiors;
analyze training.interior_spaces;
analyze training.interior_connections;
analyze training.interior_elements;
