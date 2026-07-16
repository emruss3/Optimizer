-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

do $patch$
declare
  v_definition text;
begin
  v_definition:=pg_get_functiondef('public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure);

  if position('planner_context_v1' in v_definition)=0 then
    raise exception 'fn_compile_planner_context expected planner_context_v1 marker not found';
  end if;
  v_definition:=replace(v_definition,
    'v_context_version constant text := ''planner_context_v1'';',
    'v_context_version constant text := ''planner_context_v2'';');

  if position('public.fn_local_built_form(p_ogc_fid, 5280, (current_date - interval ''10 years'')::date, 5)' in v_definition)=0 then
    raise exception 'fn_compile_planner_context legacy built-form call not found';
  end if;
  v_definition:=replace(v_definition,
    'public.fn_local_built_form(p_ogc_fid, 5280, (current_date - interval ''10 years'')::date, 5)',
    'public.fn_local_built_form_v2(p_ogc_fid, v_typology, 5280, 5)');

  v_definition:=replace(v_definition,
    '''function'', ''public.fn_local_built_form''',
    '''function'', ''public.fn_local_built_form_v2''');

  if position('|| jsonb_build_array(''frontage_geometry_is_placeholder_until_road_edge_upgrade'');' in v_definition)=0 then
    raise exception 'fn_compile_planner_context flags marker not found';
  end if;
  v_definition:=replace(v_definition,
    '|| jsonb_build_array(''frontage_geometry_is_placeholder_until_road_edge_upgrade'');',
    E'|| coalesce(v_built_form -> ''flags'', ''[]''::jsonb)\n    || jsonb_build_array(''frontage_geometry_is_placeholder_until_road_edge_upgrade'');');

  if position('''underwrite_target'', v_built_form -> ''underwrite_target''' in v_definition)=0 then
    raise exception 'fn_compile_planner_context precedent-prior marker not found';
  end if;
  v_definition:=replace(v_definition,
    '''underwrite_target'', v_built_form -> ''underwrite_target''',
    E'''underwrite_target'', v_built_form -> ''underwrite_target'',\n      ''selection'', v_built_form -> ''selection'',\n      ''type_mix'', v_built_form -> ''type_mix'',\n      ''building_count'', v_built_form #> ''{distribution,building_count}'',\n      ''total_footprint_sqft'', v_built_form #> ''{distribution,total_footprint_sqft}'',\n      ''coverage_pct'', v_built_form #> ''{distribution,coverage_pct}'',\n      ''length_ft'', v_built_form #> ''{distribution,length_ft}'',\n      ''depth_ft'', v_built_form #> ''{distribution,depth_ft}'',\n      ''aspect_ratio'', v_built_form #> ''{distribution,aspect_ratio}'',\n      ''compactness'', v_built_form #> ''{distribution,compactness}'',\n      ''precedent_parcel_ids'', v_built_form -> ''precedent_parcel_ids''');

  if position('v_context_version || ''|'' || v_context::text || ''|'' || v_solver_brief::text' in v_definition)=0 then
    raise exception 'fn_compile_planner_context hash marker not found';
  end if;
  v_definition:=replace(v_definition,
    'v_context_version || ''|'' || v_context::text || ''|'' || v_solver_brief::text',
    'v_context_version || ''|'' || (v_context #- ''{provenance,compiled_at}'')::text || ''|'' || v_solver_brief::text');

  execute v_definition;
end
$patch$;

comment on function public.fn_compile_planner_context(integer,text,jsonb) is
  'Compiles planner_context_v2. Regrid built-form priors are typology-aware and include actual footprint geometry metrics, adaptive filter provenance, and explicit decision inputs.';
