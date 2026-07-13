-- Already applied to project okxrvetbzpoazrybhcqj via MCP on 2026-07-13.
-- Committed for source control and environment parity. Do not reapply blindly.
--
-- Planner context engine contract (owner: planner-contract agent):
--   planner schema (context_snapshot, program_prior, feedback_event — private,
--   RPC access only), fn_compile_planner_context, fn_record_planner_feedback,
--   session/candidate context + scoring columns, candidate context trigger.

create schema if not exists planner;

comment on schema planner is 'Private planner context, program-prior, and learning-event storage. Access through audited public RPCs only.';

revoke all on schema planner from public, anon, authenticated;
grant usage on schema planner to service_role;

create table if not exists planner.program_prior (
  id uuid primary key default gen_random_uuid(),
  typology text not null,
  prior_version text not null,
  prior jsonb not null,
  source_dataset_slugs text[] not null default '{}',
  confidence text not null check (confidence in ('high','medium','low','review_required')),
  approved_for_solver boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (typology, prior_version)
);

create unique index if not exists program_prior_one_active_per_typology_idx
  on planner.program_prior (typology)
  where active;

insert into planner.program_prior
  (typology, prior_version, prior, source_dataset_slugs, confidence, approved_for_solver, active)
values
  (
    'single_family',
    'procthor_seed_v0_1',
    jsonb_build_object(
      'training_examples', 450,
      'median_gfa_sqft', 821.92,
      'median_spaces', 3,
      'observed_space_types', jsonb_build_object(
        'Bedroom', 534,
        'Bathroom', 401,
        'LivingRoom', 399,
        'Kitchen', 325
      ),
      'applicability', 'Synthetic detached-house interior topology and room-function context. Do not use as a multifamily corridor/core precedent.',
      'limitations', jsonb_build_array(
        'synthetic_source',
        'residential_only',
        'not_a_site_layout_corpus'
      )
    ),
    array['procthor_10k'],
    'medium',
    true,
    true
  ),
  (
    'multifamily',
    'existing_engine_bridge_v0_1',
    jsonb_build_object(
      'average_unit_sqft', jsonb_build_object(
        'value', 950,
        'source', 'existing_server_generator_v1',
        'confidence', 'low'
      ),
      'net_to_gross_efficiency', jsonb_build_object(
        'value', 0.85,
        'source', 'existing_client_optimizer_v1',
        'confidence', 'low'
      ),
      'corridor_width_ft', jsonb_build_object(
        'value', 5,
        'source', 'existing_client_model_v1',
        'confidence', 'low'
      ),
      'core_loss_pct', jsonb_build_object(
        'value', 7,
        'source', 'existing_client_model_v1',
        'confidence', 'low'
      ),
      'applicability', 'Temporary compatibility prior so the new context contract is explicit. Replace with an approved multifamily interior corpus and calibrated program templates.',
      'limitations', jsonb_build_array(
        'heuristic_not_trained',
        'garden_multifamily_bias',
        'replace_before_learned_ranking'
      )
    ),
    array[]::text[],
    'low',
    true,
    true
  )
on conflict (typology, prior_version) do update set
  prior = excluded.prior,
  source_dataset_slugs = excluded.source_dataset_slugs,
  confidence = excluded.confidence,
  approved_for_solver = excluded.approved_for_solver,
  active = excluded.active;

create table if not exists planner.context_snapshot (
  id uuid primary key default gen_random_uuid(),
  parcel_ogc_fid integer not null,
  selected_use text not null,
  typology text not null,
  context_version text not null,
  context_hash text not null,
  generation_allowed boolean not null,
  compiled_context jsonb not null,
  solver_brief jsonb not null,
  provenance jsonb not null default '{}'::jsonb,
  objective_profile jsonb not null default '{}'::jsonb,
  created_by uuid,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  check (jsonb_typeof(compiled_context) = 'object'),
  check (jsonb_typeof(solver_brief) = 'object'),
  check (jsonb_typeof(provenance) = 'object'),
  check (jsonb_typeof(objective_profile) = 'object'),
  unique (parcel_ogc_fid, selected_use, context_version, context_hash)
);

create index if not exists context_snapshot_current_lookup_idx
  on planner.context_snapshot (parcel_ogc_fid, selected_use, refreshed_at desc)
  where is_current;
create index if not exists context_snapshot_hash_idx
  on planner.context_snapshot (context_hash);

create table if not exists planner.feedback_event (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references planner.context_snapshot(id) on delete cascade,
  candidate_id uuid references public.siteplanner_candidate(id) on delete set null,
  event_type text not null check (event_type in (
    'context_loaded','candidate_generated','candidate_viewed','candidate_selected',
    'candidate_saved','candidate_exported','candidate_rejected','building_moved',
    'building_resized','building_rotated','building_deleted','parameter_changed'
  )),
  payload jsonb not null default '{}'::jsonb,
  client_event_id uuid not null default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object'),
  unique (client_event_id)
);

create index if not exists feedback_event_context_created_idx
  on planner.feedback_event (context_id, created_at desc);
create index if not exists feedback_event_candidate_created_idx
  on planner.feedback_event (candidate_id, created_at desc)
  where candidate_id is not null;

alter table public.siteplanner_session
  add column if not exists context_id uuid,
  add column if not exists context_version text,
  add column if not exists objective_profile jsonb not null default '{}'::jsonb,
  add column if not exists generator_version text;

alter table public.siteplanner_candidate
  add column if not exists context_id uuid,
  add column if not exists generator_version text,
  add column if not exists score_version text,
  add column if not exists score_total numeric,
  add column if not exists score_components jsonb not null default '{}'::jsonb,
  add column if not exists objective_profile jsonb not null default '{}'::jsonb,
  add column if not exists precedent_ids jsonb not null default '[]'::jsonb,
  add column if not exists program_prior_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'siteplanner_session_context_id_fkey'
  ) then
    alter table public.siteplanner_session
      add constraint siteplanner_session_context_id_fkey
      foreign key (context_id) references planner.context_snapshot(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'siteplanner_candidate_context_id_fkey'
  ) then
    alter table public.siteplanner_candidate
      add constraint siteplanner_candidate_context_id_fkey
      foreign key (context_id) references planner.context_snapshot(id) on delete set null;
  end if;
end $$;

create index if not exists siteplanner_session_context_id_idx
  on public.siteplanner_session(context_id)
  where context_id is not null;
create index if not exists siteplanner_candidate_context_id_idx
  on public.siteplanner_candidate(context_id)
  where context_id is not null;
create index if not exists siteplanner_candidate_score_idx
  on public.siteplanner_candidate(score_total desc nulls last, created_at desc);

create or replace function planner.inherit_candidate_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.context_id is null then
    select s.context_id into new.context_id
    from public.siteplanner_session s
    where s.id = new.session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists siteplanner_candidate_inherit_context on public.siteplanner_candidate;
create trigger siteplanner_candidate_inherit_context
before insert or update of session_id on public.siteplanner_candidate
for each row execute function planner.inherit_candidate_context();

create or replace function public.fn_compile_planner_context(
  p_ogc_fid integer,
  p_use text,
  p_user_intent jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context_version constant text := 'planner_context_v1';
  v_selected_use text;
  v_typology text;
  v_use_key text;
  v_design jsonb;
  v_uses jsonb;
  v_built_form jsonb;
  v_pricing jsonb;
  v_physical jsonb;
  v_frontage jsonb;
  v_spec jsonb;
  v_program_prior jsonb;
  v_program_version text;
  v_program_confidence text;
  v_front numeric;
  v_side numeric;
  v_rear numeric;
  v_max_far numeric;
  v_max_height numeric;
  v_max_density numeric;
  v_min_open numeric;
  v_max_coverage numeric;
  v_permitted boolean := false;
  v_developable boolean := true;
  v_generation_allowed boolean;
  v_objectives jsonb;
  v_flags jsonb := '[]'::jsonb;
  v_context jsonb;
  v_solver_brief jsonb;
  v_provenance jsonb;
  v_hash text;
  v_id uuid;
  v_created_at timestamptz;
begin
  if p_ogc_fid is null or p_ogc_fid <= 0 then
    return jsonb_build_object('error', 'valid p_ogc_fid is required');
  end if;
  if p_use is null or btrim(p_use) = '' or length(p_use) > 64 then
    return jsonb_build_object('error', 'valid p_use is required');
  end if;
  if p_user_intent is null then p_user_intent := '{}'::jsonb; end if;
  if jsonb_typeof(p_user_intent) <> 'object' then
    return jsonb_build_object('error', 'p_user_intent must be a JSON object');
  end if;
  if octet_length(p_user_intent::text) > 16384 then
    return jsonb_build_object('error', 'p_user_intent exceeds 16KB');
  end if;

  v_selected_use := lower(btrim(p_use));
  v_typology := case
    when v_selected_use in ('multi_family','multifamily','mf') then 'multifamily'
    when v_selected_use in ('single_family','sf','two_family','duplex') then 'single_family'
    else v_selected_use
  end;
  v_use_key := case
    when v_typology = 'multifamily' then 'multi_family'
    when v_selected_use in ('two_family','duplex') then 'two_family'
    when v_typology = 'single_family' then 'single_family'
    else v_selected_use
  end;

  select to_jsonb(t) into v_spec
  from public.typology_spec t
  where t.typology = v_typology;
  if v_spec is null then
    return jsonb_build_object('error', 'no typology_spec row for ' || v_typology);
  end if;

  v_design := public.fn_resolve_design_context(p_ogc_fid, v_typology);
  if v_design ? 'error' then return v_design; end if;
  v_uses := public.fn_resolve_permitted_uses(p_ogc_fid);
  v_built_form := public.fn_local_built_form(p_ogc_fid, 5280, (current_date - interval '10 years')::date, 5);
  v_pricing := public.fn_local_pricing(p_ogc_fid, 5280, (current_date - interval '10 years')::date, 5);
  v_physical := public.fn_resolve_physical_context(p_ogc_fid);

  v_front := nullif(v_design #>> '{setbacks,front,value}', '')::numeric;
  v_side := nullif(v_design #>> '{setbacks,side,value}', '')::numeric;
  v_rear := nullif(v_design #>> '{setbacks,rear,value}', '')::numeric;
  v_max_far := nullif(v_design #>> '{far_max,value}', '')::numeric;
  v_max_height := nullif(v_design #>> '{height_max_ft,value}', '')::numeric;
  v_max_density := nullif(v_design #>> '{density_max_du_acre,value}', '')::numeric;
  v_min_open := nullif(v_design #>> '{min_open_space_pct,value}', '')::numeric;
  v_max_coverage := coalesce(
    nullif(v_design #>> '{max_coverage_pct,value}', '')::numeric,
    nullif(v_spec ->> 'default_max_coverage_pct', '')::numeric
  );

  begin
    select to_jsonb(x) into v_frontage
    from public.get_parcel_front_edge_with_roads(
      p_ogc_fid,
      coalesce(v_front, 20),
      coalesce(v_rear, 20),
      coalesce(v_side, 10)
    ) x
    limit 1;
  exception when others then
    v_frontage := jsonb_build_object('error', sqlerrm);
  end;

  select pp.prior, pp.prior_version, pp.confidence
    into v_program_prior, v_program_version, v_program_confidence
  from planner.program_prior pp
  where pp.typology = v_typology
    and pp.active
    and pp.approved_for_solver
  order by pp.created_at desc
  limit 1;

  v_permitted := coalesce((v_uses -> 'as_of_right' ->> v_use_key)::boolean, false);
  v_developable := coalesce((v_design ->> 'developable')::boolean, true);
  v_generation_allowed := v_permitted and v_developable;

  v_flags := coalesce(v_design -> 'flags', '[]'::jsonb)
    || case when not v_permitted then jsonb_build_array('selected_use_not_as_of_right') else '[]'::jsonb end
    || case when not v_developable then jsonb_build_array('physical_context_not_developable') else '[]'::jsonb end
    || jsonb_build_array('frontage_geometry_is_placeholder_until_road_edge_upgrade');

  v_objectives := jsonb_build_object(
    'profile', 'balanced_context_v1',
    'weights', jsonb_build_object(
      'financial_return', 0.20,
      'unit_or_program_yield', 0.15,
      'parking_compliance', 0.15,
      'zoning_utilization', 0.10,
      'precedent_fit', 0.15,
      'internal_program_fit', 0.10,
      'circulation_quality', 0.10,
      'open_space_quality', 0.05
    )
  ) || p_user_intent;

  v_provenance := jsonb_build_object(
    'compiled_at', now(),
    'context_version', v_context_version,
    'legal', jsonb_build_object('function', 'public.fn_resolve_design_context', 'confidence', v_design ->> 'confidence'),
    'permitted_uses', jsonb_build_object('function', 'public.fn_resolve_permitted_uses'),
    'built_form', jsonb_build_object('function', 'public.fn_local_built_form', 'radius_ft', 5280, 'lookback_years', 10, 'confidence', v_built_form ->> 'confidence'),
    'pricing', jsonb_build_object('function', 'public.fn_local_pricing', 'radius_ft', 5280, 'lookback_years', 10, 'confidence', v_pricing ->> 'confidence'),
    'physical', jsonb_build_object('function', 'public.fn_resolve_physical_context'),
    'frontage', jsonb_build_object(
      'function', 'public.get_parcel_front_edge_with_roads',
      'confidence', 'low',
      'limitation', 'Current RPC returns the parcel polygon as front_edge_geojson; do not treat it as a true road edge.'
    ),
    'program_prior', jsonb_build_object(
      'version', v_program_version,
      'confidence', v_program_confidence,
      'limitations', coalesce(v_program_prior -> 'limitations', '[]'::jsonb)
    )
  );

  v_context := jsonb_build_object(
    'schema_version', v_context_version,
    'parcel_ogc_fid', p_ogc_fid,
    'selected_use', v_selected_use,
    'typology', v_typology,
    'generation_allowed', v_generation_allowed,
    'flags', v_flags,
    'legal', jsonb_build_object(
      'permitted_as_of_right', v_permitted,
      'zoning_base', v_design ->> 'zoning_base',
      'zoning_subtype', v_design ->> 'zoning_subtype',
      'municipality', v_design ->> 'municipality',
      'confidence', v_design ->> 'confidence',
      'setbacks', v_design -> 'setbacks',
      'max_far', v_design -> 'far_max',
      'max_height_ft', v_design -> 'height_max_ft',
      'max_density_du_acre', v_design -> 'density_max_du_acre',
      'max_coverage_pct', jsonb_build_object(
        'value', v_max_coverage,
        'source', case when v_design #>> '{max_coverage_pct,value}' is not null then 'design_context' else 'typology_spec' end
      ),
      'min_open_space_pct', v_design -> 'min_open_space_pct',
      'source_conflicts', coalesce(v_design -> 'source_conflicts', '[]'::jsonb)
    ),
    'physical', v_physical,
    'frontage', v_frontage,
    'precedent', v_built_form,
    'market', v_pricing,
    'parking', v_design -> 'parking',
    'parking_strategy', v_design ->> 'parking_strategy',
    'typology_spec', v_spec,
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),
    'program_prior_version', v_program_version,
    'objective_profile', v_objectives,
    'provenance', v_provenance
  );

  v_solver_brief := jsonb_build_object(
    'schema_version', v_context_version,
    'parcel_ogc_fid', p_ogc_fid,
    'selected_use', v_selected_use,
    'typology', v_typology,
    'generation_allowed', v_generation_allowed,
    'flags', v_flags,
    'geometry', jsonb_build_object(
      'parcel', v_frontage -> 'parcel_geom_geojson',
      'buildable_envelope', v_frontage -> 'buildable_envelope_geojson',
      'front_edge', v_frontage -> 'front_edge_geojson',
      'front_edge_is_placeholder', true,
      'access_method', v_frontage #>> '{nearest_road_info,method}'
    ),
    'hard_constraints', jsonb_build_object(
      'front_setback_ft', v_front,
      'side_setback_ft', v_side,
      'rear_setback_ft', v_rear,
      'max_far', v_max_far,
      'max_height_ft', v_max_height,
      'max_density_du_acre', v_max_density,
      'max_coverage_pct', v_max_coverage,
      'min_open_space_pct', v_min_open,
      'developable', v_developable
    ),
    'parking', jsonb_build_object(
      'strategy', v_design ->> 'parking_strategy',
      'ratio', nullif(v_design #>> '{parking,ratio}', '')::numeric,
      'basis', v_design #>> '{parking,basis}',
      'stall_width_ft', nullif(v_design #>> '{parking,stall_w_ft}', '')::numeric,
      'stall_depth_ft', nullif(v_design #>> '{parking,stall_d_ft}', '')::numeric,
      'aisle_width_ft', nullif(v_design #>> '{parking,drive_aisle_ft}', '')::numeric,
      'permitted_angles_deg', jsonb_build_array(0, 60, 90)
    ),
    'precedent_priors', jsonb_build_object(
      'sample_size', v_built_form -> 'n_comps',
      'confidence', v_built_form -> 'confidence',
      'footprint_sqft', v_built_form #> '{distribution,footprint_sqft}',
      'stories', v_built_form #> '{distribution,stories}',
      'underwrite_target', v_built_form -> 'underwrite_target'
    ),
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),
    'program_prior_version', v_program_version,
    'physical', v_physical,
    'market_summary', jsonb_build_object(
      'confidence', v_pricing -> 'confidence',
      'n_comps', v_pricing -> 'n_comps',
      'price_per_building_sf', v_pricing -> 'price_per_building_sf',
      'price_per_lot_sf', v_pricing -> 'price_per_lot_sf',
      'sale_price', v_pricing -> 'sale_price'
    ),
    'objective_profile', v_objectives
  );

  v_hash := encode(
    extensions.digest(
      v_context_version || '|' || v_context::text || '|' || v_solver_brief::text,
      'sha256'
    ),
    'hex'
  );

  insert into planner.context_snapshot (
    parcel_ogc_fid, selected_use, typology, context_version, context_hash,
    generation_allowed, compiled_context, solver_brief, provenance,
    objective_profile, created_by, is_current
  ) values (
    p_ogc_fid, v_selected_use, v_typology, v_context_version, v_hash,
    v_generation_allowed, v_context, v_solver_brief, v_provenance,
    v_objectives, auth.uid(), true
  )
  on conflict (parcel_ogc_fid, selected_use, context_version, context_hash)
  do update set
    compiled_context = excluded.compiled_context,
    solver_brief = excluded.solver_brief,
    provenance = excluded.provenance,
    objective_profile = excluded.objective_profile,
    generation_allowed = excluded.generation_allowed,
    refreshed_at = now(),
    is_current = true
  returning id, created_at into v_id, v_created_at;

  update planner.context_snapshot
  set is_current = false
  where parcel_ogc_fid = p_ogc_fid
    and selected_use = v_selected_use
    and id <> v_id
    and is_current;

  return jsonb_build_object(
    'context_id', v_id,
    'context_version', v_context_version,
    'context_hash', v_hash,
    'created_at', v_created_at,
    'generation_allowed', v_generation_allowed,
    'context', v_context,
    'solver_brief', v_solver_brief
  );
end;
$$;

comment on function public.fn_compile_planner_context(integer, text, jsonb) is
  'Compiles and persists one versioned planner context from legal, physical, frontage, built-form, market, parking, program-prior, and user-objective inputs.';

revoke all on function public.fn_compile_planner_context(integer, text, jsonb) from public;
grant execute on function public.fn_compile_planner_context(integer, text, jsonb) to anon, authenticated, service_role;

create or replace function public.fn_record_planner_feedback(
  p_context_id uuid,
  p_event_type text,
  p_candidate_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_client_event_id uuid default gen_random_uuid()
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_context_id is null or not exists (
    select 1 from planner.context_snapshot c where c.id = p_context_id
  ) then
    raise exception 'unknown planner context';
  end if;
  if p_event_type not in (
    'context_loaded','candidate_generated','candidate_viewed','candidate_selected',
    'candidate_saved','candidate_exported','candidate_rejected','building_moved',
    'building_resized','building_rotated','building_deleted','parameter_changed'
  ) then
    raise exception 'unsupported planner feedback event: %', p_event_type;
  end if;
  if p_payload is null then p_payload := '{}'::jsonb; end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 32768 then
    raise exception 'feedback payload must be a JSON object no larger than 32KB';
  end if;

  insert into planner.feedback_event (
    context_id, candidate_id, event_type, payload, client_event_id, user_id
  ) values (
    p_context_id, p_candidate_id, p_event_type, p_payload, p_client_event_id, auth.uid()
  )
  on conflict (client_event_id) do nothing
  returning id into v_id;

  if v_id is null then
    select f.id into v_id
    from planner.feedback_event f
    where f.client_event_id = p_client_event_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.fn_record_planner_feedback(uuid, text, uuid, jsonb, uuid) from public;
grant execute on function public.fn_record_planner_feedback(uuid, text, uuid, jsonb, uuid) to authenticated, service_role;

grant select, insert, update, delete on all tables in schema planner to service_role;
grant usage, select on all sequences in schema planner to service_role;
