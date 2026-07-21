-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-21.
--
-- Compose the authoritative multifamily unit program and parcel-fabric frontage
-- into the immutable planner context. All runtime decisions remain generic:
-- no address or parcel-specific branches are introduced.

create table if not exists public.unit_spec (
  typology text not null,
  unit_type text not null,
  gsf numeric not null,
  width_ft numeric not null,
  depth_ft numeric not null,
  bedrooms numeric not null,
  bathrooms numeric not null,
  parking_ratio numeric not null,
  default_mix_pct numeric,
  source text not null default 'industry_standard_default',
  primary key (typology, unit_type)
);

alter table public.typology_spec
  add column if not exists corridor_clear_ft numeric,
  add column if not exists core_width_ft numeric,
  add column if not exists core_length_ft numeric,
  add column if not exists core_max_spacing_ft numeric;

insert into public.unit_spec (
  typology, unit_type, gsf, width_ft, depth_ft, bedrooms, bathrooms,
  parking_ratio, default_mix_pct, source
) values
  ('multifamily','studio', 550, 18, 30, 0, 1, 1.00, 10, 'industry_standard_default'),
  ('multifamily','1br',    700, 23, 30, 1, 1, 1.25, 40, 'industry_standard_default'),
  ('multifamily','2br',   1100, 35, 31, 2, 2, 1.50, 35, 'industry_standard_default'),
  ('multifamily','3br',   1600, 50, 32, 3, 2, 1.75, 15, 'industry_standard_default')
on conflict (typology, unit_type) do update set
  gsf = excluded.gsf,
  width_ft = excluded.width_ft,
  depth_ft = excluded.depth_ft,
  bedrooms = excluded.bedrooms,
  bathrooms = excluded.bathrooms,
  parking_ratio = excluded.parking_ratio,
  default_mix_pct = excluded.default_mix_pct,
  source = excluded.source;

update public.typology_spec
set corridor_clear_ft = coalesce(corridor_clear_ft, 5.75),
    core_width_ft = coalesce(core_width_ft, 12),
    core_length_ft = coalesce(core_length_ft, 25),
    core_max_spacing_ft = coalesce(core_max_spacing_ft, 250)
where typology = 'multifamily';

revoke insert, update, delete, truncate, references, trigger
  on public.unit_spec from anon, authenticated;
grant select on public.unit_spec to anon, authenticated, service_role;

create or replace function public.fn_unit_program(p_typology text)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'typology', p_typology,
    'units', (
      select jsonb_agg(jsonb_build_object(
        'type', unit_type,
        'gsf', gsf,
        'width_ft', width_ft,
        'depth_ft', depth_ft,
        'bedrooms', bedrooms,
        'bathrooms', bathrooms,
        'parking_ratio', parking_ratio,
        'default_mix_pct', default_mix_pct,
        'source', source
      ) order by gsf)
      from public.unit_spec
      where typology = p_typology
    ),
    'corridor_clear_ft', ts.corridor_clear_ft,
    'core', jsonb_build_object(
      'width_ft', ts.core_width_ft,
      'length_ft', ts.core_length_ft,
      'max_spacing_ft', ts.core_max_spacing_ft
    ),
    'implied_bar_depth_ft', (
      select round(2 * avg(depth_ft) + ts.corridor_clear_ft, 1)
      from public.unit_spec
      where typology = p_typology
    ),
    'weighted_unit_gsf', (
      select round(sum(gsf * coalesce(default_mix_pct, 0))
                   / nullif(sum(coalesce(default_mix_pct, 0)), 0), 1)
      from public.unit_spec
      where typology = p_typology
    ),
    'weighted_parking_ratio', (
      select round(sum(parking_ratio * coalesce(default_mix_pct, 0))
                   / nullif(sum(coalesce(default_mix_pct, 0)), 0), 3)
      from public.unit_spec
      where typology = p_typology
    ),
    'source', 'unit_spec + typology_spec',
    'confidence', 'medium',
    'role', 'authoritative_form_and_program_input'
  )
  from public.typology_spec ts
  where ts.typology = p_typology;
$function$;

create or replace function public.fn_parcel_frontage(p_ogc_fid integer)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, extensions
as $function$
declare
  g geometry;
  nb geometry;
  front geometry;
  prim geometry;
  total_ft numeric;
  n_segs integer;
  prim_ft numeric;
  prim_mid geometry;
  bearing numeric;
  second_ft numeric;
begin
  select (st_dump(geom_2274)).geom into g
  from public.parcels where ogc_fid = p_ogc_fid limit 1;
  if g is null then return jsonb_build_object('error', 'no geometry'); end if;

  select st_union(p.geom_2274) into nb
  from public.parcels p
  where p.ogc_fid <> p_ogc_fid and st_dwithin(p.geom_2274, g, 2);

  if nb is null then front := st_boundary(g);
  else front := st_difference(st_boundary(g), st_buffer(nb, 1.5)); end if;

  if front is null or st_isempty(front) then
    return jsonb_build_object(
      'parcel_ogc_fid', p_ogc_fid, 'landlocked', true,
      'total_frontage_ft', 0, 'n_segments', 0,
      'method', 'parcel_fabric_shared_edge_v1',
      'note', 'no unshared boundary — landlocked or fully interior; access likely via easement');
  end if;

  total_ft := st_length(front);
  select count(*) into n_segs
  from (select (st_dump(front)).geom) d where st_length(d.geom) > 10;
  select d.geom, st_length(d.geom) into prim, prim_ft
  from (select (st_dump(front)).geom) d order by st_length(d.geom) desc limit 1;
  select st_length(d.geom) into second_ft
  from (select (st_dump(front)).geom) d order by st_length(d.geom) desc offset 1 limit 1;
  prim_mid := st_lineinterpolatepoint(st_linemerge(prim), 0.5);
  bearing := degrees(st_azimuth(st_startpoint(st_linemerge(prim)), st_endpoint(st_linemerge(prim))));

  return jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'landlocked', false,
    'total_frontage_ft', round(total_ft, 1), 'n_segments', n_segs,
    'corner_lot', n_segs >= 2 and coalesce(second_ft, 0) > 25,
    'primary', jsonb_build_object(
      'length_ft', round(prim_ft, 1), 'bearing_deg', round(bearing, 1),
      'midpoint_2274', jsonb_build_array(round(st_x(prim_mid)::numeric, 2), round(st_y(prim_mid)::numeric, 2)),
      'geom_2274', st_asgeojson(prim)::jsonb),
    'method', 'parcel_fabric_shared_edge_v1',
    'basis', 'boundary segments not shared with neighboring parcels (2ft adjacency, 1.5ft carve)');
end
$function$;

comment on function public.fn_unit_program(text) is
  'Versioned unit-program input for planning contexts: unit dimensions, default mix, weighted parking, corridor/core and implied bar depth.';
comment on function public.fn_parcel_frontage(integer) is
  'Parcel-fabric frontage resolver. Returns a primary unshared boundary segment or an explicit landlocked/easement state.';

do $patch_compile$
declare v_definition text; v_old text; v_new text;
begin
  v_definition := pg_get_functiondef('public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure);
  v_definition := replace(v_definition,
    $old$  v_compiler_revision constant text := 'planner_context_v2_unit_band_20260720';$old$,
    $new$  v_compiler_revision constant text := 'planner_context_v2_program_frontage_20260721';$new$);

  v_old := $old$  v_frontage jsonb;
  v_spec jsonb;
  v_program_prior jsonb;$old$;
  v_new := $new$  v_frontage jsonb;
  v_fabric_frontage jsonb := '{}'::jsonb;
  v_unit_program jsonb := '{}'::jsonb;
  v_front_edge_4326 jsonb;
  v_front_edge_2274 jsonb;
  v_frontage_midpoint_2274 jsonb;
  v_frontage_bearing_deg numeric;
  v_frontage_is_placeholder boolean := true;
  v_frontage_landlocked boolean := false;
  v_access_method text := 'legacy_frontage_placeholder';
  v_spec jsonb;
  v_program_prior jsonb;$new$;
  if position(v_old in v_definition)=0 then raise exception 'compile declaration marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  v_physical := public.fn_resolve_physical_context(p_ogc_fid);

  v_front := nullif(v_design #>> '{setbacks,front,value}', '')::numeric;$old$;
  v_new := $new$  v_physical := public.fn_resolve_physical_context(p_ogc_fid);
  v_unit_program := coalesce(public.fn_unit_program(v_typology), '{}'::jsonb);
  v_fabric_frontage := coalesce(public.fn_parcel_frontage(p_ogc_fid), '{}'::jsonb);
  v_frontage_landlocked := coalesce((v_fabric_frontage->>'landlocked')::boolean, false);
  if not v_frontage_landlocked
     and jsonb_typeof(v_fabric_frontage#>'{primary,geom_2274}') = 'object'
     and jsonb_typeof(v_fabric_frontage#>'{primary,midpoint_2274}') = 'array' then
    v_front_edge_2274 := v_fabric_frontage#>'{primary,geom_2274}';
    v_frontage_midpoint_2274 := v_fabric_frontage#>'{primary,midpoint_2274}';
    v_frontage_bearing_deg := nullif(v_fabric_frontage#>>'{primary,bearing_deg}', '')::numeric;
    v_frontage_is_placeholder := false;
    v_access_method := 'parcel_fabric_primary_segment';
    begin
      v_front_edge_4326 := st_asgeojson(st_transform(st_setsrid(st_geomfromgeojson(v_front_edge_2274::text),2274),4326))::jsonb;
    exception when others then
      v_front_edge_4326 := null; v_frontage_is_placeholder := true;
      v_access_method := 'parcel_fabric_transform_failed';
    end;
  elsif v_frontage_landlocked then
    v_access_method := 'easement_assumed_landlocked';
  end if;

  v_front := nullif(v_design #>> '{setbacks,front,value}', '')::numeric;$new$;
  if position(v_old in v_definition)=0 then raise exception 'compile context-call marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    || jsonb_build_array('frontage_geometry_is_placeholder_until_road_edge_upgrade');$old$;
  v_new := $new$    || case
         when not v_frontage_is_placeholder then jsonb_build_array('frontage_from_parcel_fabric_primary_segment')
         when v_frontage_landlocked then jsonb_build_array('landlocked_access_via_easement_assumed')
         else jsonb_build_array('frontage_geometry_is_placeholder_until_road_edge_upgrade') end
    || case when jsonb_typeof(v_unit_program->'units') = 'array'
         then jsonb_build_array('unit_program_authoritative_v1')
         else jsonb_build_array('unit_program_fallback_program_prior') end;$new$;
  if position(v_old in v_definition)=0 then raise exception 'compile flags marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    'frontage', jsonb_build_object(
      'function', 'public.get_parcel_front_edge_with_roads',
      'confidence', 'low',
      'limitation', 'Current RPC returns the parcel polygon as front_edge_geojson; do not treat it as a true road edge.'
    ),
    'program_prior', jsonb_build_object($old$;
  v_new := $new$    'frontage', jsonb_build_object(
      'function', 'public.fn_parcel_frontage',
      'method', v_fabric_frontage->>'method',
      'confidence', case when v_frontage_is_placeholder then 'low' else 'medium' end,
      'landlocked', v_frontage_landlocked,
      'limitation', case
        when v_frontage_landlocked then 'No parcel-fabric frontage segment; access is assumed by easement until title/civil verification.'
        when v_frontage_is_placeholder then 'Parcel-fabric frontage unavailable; legacy heuristic retained.' else null end),
    'unit_program', jsonb_build_object(
      'function', 'public.fn_unit_program', 'source', v_unit_program->>'source',
      'confidence', v_unit_program->>'confidence', 'role', v_unit_program->>'role'),
    'program_prior', jsonb_build_object($new$;
  if position(v_old in v_definition)=0 then raise exception 'compile provenance marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    'frontage', v_frontage,
    'precedent', v_built_form,$old$;
  v_new := $new$    'frontage', jsonb_build_object(
      'resolved', v_fabric_frontage, 'legacy_envelope', v_frontage,
      'front_edge_is_placeholder', v_frontage_is_placeholder, 'access_method', v_access_method),
    'unit_program', v_unit_program,
    'precedent', v_built_form,$new$;
  if position(v_old in v_definition)=0 then raise exception 'compile display context marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    'geometry', jsonb_build_object(
      'parcel', v_frontage -> 'parcel_geom_geojson',
      'buildable_envelope', v_frontage -> 'buildable_envelope_geojson',
      'front_edge', v_frontage -> 'front_edge_geojson',
      'front_edge_is_placeholder', true,
      'access_method', v_frontage #>> '{nearest_road_info,method}'
    ),$old$;
  v_new := $new$    'geometry', jsonb_build_object(
      'parcel', v_frontage -> 'parcel_geom_geojson',
      'buildable_envelope', v_frontage -> 'buildable_envelope_geojson',
      'front_edge', coalesce(v_front_edge_4326, v_frontage -> 'front_edge_geojson'),
      'front_edge_2274', v_front_edge_2274,
      'frontage_midpoint_2274', v_frontage_midpoint_2274,
      'frontage_bearing_deg', v_frontage_bearing_deg,
      'front_edge_is_placeholder', v_frontage_is_placeholder,
      'landlocked', v_frontage_landlocked, 'access_method', v_access_method,
      'frontage_method', v_fabric_frontage->>'method'),$new$;
  if position(v_old in v_definition)=0 then raise exception 'compile geometry marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    'max_buildout', v_max_buildout,
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),$old$;
  v_new := $new$    'max_buildout', v_max_buildout,
    'unit_program', v_unit_program,
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),$new$;
  if position(v_old in v_definition)=0 then raise exception 'compile program insertion marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;
end
$patch_compile$;

do $patch_dispatcher$
declare v_definition text; v_old text; v_new text;
begin
  v_definition := pg_get_functiondef('public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure);
  v_old := $old$  receipts jsonb;
BEGIN
  -- Pinned edits keep the fast single-solve path:$old$;
  v_new := $new$  receipts jsonb;
  bres jsonb;
  brief jsonb;
  max_buildout jsonb;
BEGIN
  if p_context_id is null then return jsonb_build_object('error', 'planner_context_required'); end if;
  bres := public.fn_get_planner_solver_brief(p_context_id, p_ogc_fid);
  if bres ? 'error' then return jsonb_build_object('error', bres->>'error'); end if;
  brief := bres->'solver_brief';
  if lower(btrim(coalesce(p_typology, ''))) <> 'multifamily'
     or lower(btrim(coalesce(brief->>'typology', ''))) <> 'multifamily'
     or lower(btrim(coalesce(brief->>'selected_use', ''))) not in ('multifamily','multi_family','mf') then
    return jsonb_build_object('error','planner_context_use_mismatch','expected_typology','multifamily',
      'requested_typology',lower(btrim(coalesce(p_typology,''))),
      'context_typology',brief->>'typology','context_selected_use',brief->>'selected_use');
  end if;
  if not coalesce((bres->>'generation_allowed')::boolean,false) then
    return jsonb_build_object('error','planner_generation_not_allowed','flags',coalesce(brief->'flags','[]'::jsonb));
  end if;
  max_buildout := brief->'max_buildout';
  if max_buildout is null or max_buildout ? 'error' or nullif(max_buildout->>'max_gsf','') is null then
    return jsonb_build_object('error','planner_max_buildout_required');
  end if;

  -- Pinned edits keep the fast single-solve path:$new$;
  if position(v_old in v_definition)=0 then raise exception 'dispatcher preflight marker not found'; end if;
  execute replace(v_definition,v_old,v_new);
end
$patch_dispatcher$;

do $patch_core$
declare v_definition text; v_old text; v_new text;
begin
  v_definition := pg_get_functiondef('public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure);
  v_old := $old$  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; obj jsonb; w jsonb; mb jsonb; ent jsonb;$old$;
  v_new := $new$  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; unit_program jsonb; obj jsonb; w jsonb; mb jsonb; ent jsonb;$new$;
  if position(v_old in v_definition)=0 then raise exception 'core JSON declaration marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  bar_depth numeric; aisle numeric; stall_w numeric; stall_d numeric; ratio numeric;$old$;
  v_new := $new$  bar_depth numeric; typology_max_depth numeric; aisle numeric; stall_w numeric; stall_d numeric; ratio numeric; program_parking_ratio numeric;$new$;
  if position(v_old in v_definition)=0 then raise exception 'core depth declaration marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  park_floors integer := 0;
  frontage jsonb;$old$;
  v_new := $new$  park_floors integer := 0;
  frontage jsonb;
  frontage_bearing_deg numeric;$new$;
  if position(v_old in v_definition)=0 then raise exception 'core frontage declaration marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  prog := brief->'program_prior';
  obj := brief->'objective_profile';$old$;
  v_new := $new$  prog := brief->'program_prior';
  unit_program := coalesce(brief->'unit_program', '{}'::jsonb);
  obj := brief->'objective_profile';$new$;
  if position(v_old in v_definition)=0 then raise exception 'core brief extraction marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  -- Parking from the brief
  stall_w := COALESCE((pk->>'stall_width_ft')::numeric, 9);
  stall_d := COALESCE((pk->>'stall_depth_ft')::numeric, 18);
  aisle   := COALESCE((pk->>'aisle_width_ft')::numeric, 24);
  ratio   := COALESCE((pk->>'ratio')::numeric, 1.5);
  drive_gap := stall_d + aisle + stall_d;

  -- Program prior (explicit low-confidence fallback, flagged)
  avg_unit := COALESCE((prog#>>'{average_unit_sqft,value}')::numeric, 950);
  IF COALESCE(prog#>>'{average_unit_sqft,confidence}', 'low') = 'low' THEN
    flags := flags || to_jsonb('program_prior_low_confidence'::text);
  END IF;$old$;
  v_new := $new$  -- Parking from the brief. The per-type unit program may require a
  -- higher weighted ratio, but it can never weaken the legal/typology ratio.
  stall_w := COALESCE((pk->>'stall_width_ft')::numeric, 9);
  stall_d := COALESCE((pk->>'stall_depth_ft')::numeric, 18);
  aisle   := COALESCE((pk->>'aisle_width_ft')::numeric, 24);
  ratio   := COALESCE((pk->>'ratio')::numeric, 1.5);
  program_parking_ratio := nullif(unit_program->>'weighted_parking_ratio', '')::numeric;
  ratio := greatest(ratio, coalesce(program_parking_ratio, ratio));
  drive_gap := stall_d + aisle + stall_d;
  avg_unit := coalesce(nullif(unit_program->>'weighted_unit_gsf','')::numeric,
    (prog#>>'{average_unit_sqft,value}')::numeric,950);
  if jsonb_typeof(unit_program->'units')='array' then
    flags := flags || to_jsonb('unit_program_consumed_v1'::text);
  elsif coalesce(prog#>>'{average_unit_sqft,confidence}','low')='low' then
    flags := flags || to_jsonb('program_prior_low_confidence'::text);
  end if;$new$;
  if position(v_old in v_definition)=0 then raise exception 'core parking/program marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  -- Whole-building OBB depth is not a bar-depth prior. Use an interim U.S.
  -- double-loaded program depth until the per-type unit/core spec lands.
  SELECT LEAST(COALESCE(max_floorplate_depth_ft,65),65),
         COALESCE(floor_height_ft,floor_to_floor_ft,11)
    INTO bar_depth,f2f
  FROM public.typology_spec
  WHERE typology=p_typology;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','no typology_spec row for '||p_typology);
  END IF;
  bar_depth := LEAST(GREATEST(bar_depth,45),65);
  flags := flags || to_jsonb('bar_depth_from_typology_program_spec'::text);$old$;
  v_new := $new$  -- Whole-building Regrid OBB depth is corroboration only. Apartment-bar
  -- depth comes from unit dimensions + clear corridor, bounded by the typology maximum.
  select coalesce(max_floorplate_depth_ft,72),coalesce(floor_height_ft,floor_to_floor_ft,11)
    into typology_max_depth,f2f from public.typology_spec where typology=p_typology;
  if not found then return jsonb_build_object('error','no typology_spec row for '||p_typology); end if;
  bar_depth := nullif(unit_program->>'implied_bar_depth_ft','')::numeric;
  if bar_depth is not null then
    bar_depth := least(greatest(bar_depth,45),typology_max_depth);
    flags := flags || to_jsonb('bar_depth_from_unit_program_v1'::text);
  else
    bar_depth := least(greatest(coalesce(typology_max_depth,65),45),65);
    flags := flags || to_jsonb('bar_depth_from_typology_program_spec'::text);
  end if;$new$;
  if position(v_old in v_definition)=0 then raise exception 'core bar-depth marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  -- VERIFIED FRONTAGE (P1-6): the fabric-gap detector replaces the
  -- longest-edge guess whenever the parcel actually has a right-of-way
  -- edge (the ROW is the gap in the parcel fabric); fabric-locked parcels
  -- keep the heuristic and say so honestly.
  frontage := public.fn_parcel_row_frontage(p_ogc_fid);
  IF COALESCE((frontage->>'has_row_frontage')::boolean, false) THEN
    entry_pt := ST_SetSRID(ST_MakePoint(
      (frontage->>'primary_mid_x')::numeric,
      (frontage->>'primary_mid_y')::numeric), 2274);
    flags := flags || to_jsonb('entry_from_row_frontage_v1'::text);
  ELSE
    flags := flags || to_jsonb('entry_heuristic_no_row_frontage'::text);
  END IF;$old$;
  v_new := $new$  -- Use the immutable context's verified frontage. No runtime parcel lookup
  -- may silently disagree with the snapshot that explains this candidate.
  frontage := coalesce(brief->'geometry','{}'::jsonb);
  if not coalesce((frontage->>'front_edge_is_placeholder')::boolean,true)
     and jsonb_typeof(frontage->'frontage_midpoint_2274')='array' then
    entry_pt := st_setsrid(st_makepoint(
      (frontage#>>'{frontage_midpoint_2274,0}')::numeric,
      (frontage#>>'{frontage_midpoint_2274,1}')::numeric),2274);
    frontage_bearing_deg := nullif(frontage->>'frontage_bearing_deg','')::numeric;
    flags := flags || to_jsonb('entry_from_context_frontage_v1'::text);
  elsif coalesce((frontage->>'landlocked')::boolean,false) then
    flags := flags || to_jsonb('landlocked_access_via_easement_assumed'::text);
  else
    flags := flags || to_jsonb('entry_heuristic_no_verified_frontage'::text);
  end if;$new$;
  if position(v_old in v_definition)=0 then raise exception 'core frontage marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$    END INTO theta;
  theta := pi()/2 - theta;

  parcel_rot := ST_Rotate($old$;
  v_new := $new$    END INTO theta;
  theta := pi()/2 - theta;
  if frontage_bearing_deg is not null then
    theta := pi()/2 - radians(frontage_bearing_deg);
    flags := flags || to_jsonb('bar_orientation_from_context_frontage_v1'::text);
  end if;

  parcel_rot := ST_Rotate($new$;
  if position(v_old in v_definition)=0 then raise exception 'core orientation marker not found'; end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;
end
$patch_core$;

comment on function public.fn_compile_planner_context(integer,text,jsonb) is
  'Compiles an immutable planner_context_v2 snapshot with bounded reuse, max-GSF frontier, authoritative unit program, verified parcel-fabric frontage, Regrid form evidence and provenance.';
comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Multifamily regime dispatcher. Preflights context/use/max-buildout, then compares complete surface, courtyard and tuck-under solves.';
comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily solve core. Reads max-buildout, unit-program bar depth and verified frontage from the immutable solver brief; all legal, parking, circulation and program checks remain generic.';

notify pgrst, 'reload schema';
