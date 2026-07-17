-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );

  if position('v_max_buildout jsonb;' in v_definition) = 0 then
    v_old := $old$
  v_max_coverage numeric;
  v_permitted boolean := false;
$old$;
    v_new := $new$
  v_max_coverage numeric;
  v_max_impervious numeric;
  v_max_buildout jsonb := '{}'::jsonb;
  v_precedent_n integer := 0;
  v_precedent_confidence text;
  v_permitted boolean := false;
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner compile declaration marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  if position('v_max_buildout := public.fn_max_buildout' in v_definition) = 0 then
    v_old := $old$
  v_max_coverage := coalesce(
    nullif(v_design #>> '{max_coverage_pct,value}', '')::numeric,
    nullif(v_spec ->> 'default_max_coverage_pct', '')::numeric
  );
$old$;
    v_new := $new$
  -- Building coverage and impervious-surface ratio are different constraints.
  -- The typology default is a building-footprint cap; ordinance max_isr is the
  -- lot-wide impervious cap used by the GSF frontier and final validation.
  v_max_coverage := coalesce(
    nullif(v_design #>> '{max_coverage_pct,value}', '')::numeric,
    nullif(v_spec ->> 'default_max_coverage_pct', '')::numeric
  );
  v_max_impervious := nullif(v_design #>> '{max_isr,value}', '')::numeric;

  if v_typology = 'multifamily' then
    v_max_buildout := public.fn_max_buildout(p_ogc_fid, v_typology);
  end if;

  -- A five-building sample cannot be called high confidence. Keep the source
  -- selection, but cap the published confidence by sample size.
  v_precedent_n := coalesce((v_built_form->>'n_comps')::integer, 0);
  v_precedent_confidence := case
    when v_precedent_n >= 15 then coalesce(v_built_form->>'confidence', 'medium')
    when v_precedent_n >= 5 then case when v_built_form->>'confidence' = 'insufficient' then 'low' else 'medium' end
    else 'low'
  end;
  if v_precedent_confidence is distinct from v_built_form->>'confidence' then
    v_built_form := v_built_form || jsonb_build_object('confidence', v_precedent_confidence);
    if jsonb_typeof(v_built_form->'selection') = 'object' then
      v_built_form := jsonb_set(
        v_built_form,
        '{selection,confidence}',
        to_jsonb(v_precedent_confidence),
        true
      );
    end if;
    v_built_form := jsonb_set(
      v_built_form,
      '{flags}',
      coalesce(v_built_form->'flags', '[]'::jsonb)
        || jsonb_build_array('precedent_confidence_capped_by_sample_size'),
      true
    );
  end if;
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner compile coverage marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  v_old := $old$
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
$old$;
  v_new := $new$
  -- Product thesis: maximize gross square feet within hard legal, parking and
  -- circulation constraints. Precedents shape form only and never cap quantity.
  v_objectives := jsonb_build_object(
    'profile', 'maximize_gsf_v1',
    'quantity_target', 'max_gsf',
    'weights', jsonb_build_object(
      'financial_return', 0.15,
      'unit_or_program_yield', 0.05,
      'parking_compliance', 0.05,
      'zoning_utilization', 0.55,
      'precedent_fit', 0.05,
      'internal_program_fit', 0.05,
      'circulation_quality', 0.07,
      'open_space_quality', 0.03
    )
  ) || p_user_intent;
$new$;
  if position(v_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_old, v_new);
  elsif position('''profile'', ''maximize_gsf_v1''' in v_definition) = 0 then
    raise exception 'planner objective-profile marker not found';
  end if;

  if position('''max_buildout'', jsonb_build_object' in v_definition) = 0 then
    v_old := $old$
    'program_prior', jsonb_build_object(
      'version', v_program_version,
      'confidence', v_program_confidence,
      'limitations', coalesce(v_program_prior -> 'limitations', '[]'::jsonb)
    )
$old$;
    v_new := $new$
    'program_prior', jsonb_build_object(
      'version', v_program_version,
      'confidence', v_program_confidence,
      'limitations', coalesce(v_program_prior -> 'limitations', '[]'::jsonb)
    ),
    'max_buildout', jsonb_build_object(
      'function', 'public.fn_max_buildout',
      'objective', 'maximize_gsf',
      'binding_constraint', v_max_buildout->>'binding_constraint'
    )
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner provenance marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  if position('''max_building_coverage_pct''' in v_definition) = 0 then
    v_old := $old$
      'max_coverage_pct', jsonb_build_object(
        'value', v_max_coverage,
        'source', case when v_design #>> '{max_coverage_pct,value}' is not null then 'design_context' else 'typology_spec' end
      ),
      'min_open_space_pct', v_design -> 'min_open_space_pct',
$old$;
    v_new := $new$
      'max_coverage_pct', jsonb_build_object(
        'value', v_max_coverage,
        'source', case when v_design #>> '{max_coverage_pct,value}' is not null then 'design_context' else 'typology_spec' end,
        'semantics', 'building_footprint_coverage_only',
        'deprecated_alias_for', 'max_building_coverage_pct'
      ),
      'max_building_coverage_pct', jsonb_build_object(
        'value', v_max_coverage,
        'source', case when v_design #>> '{max_coverage_pct,value}' is not null then 'design_context' else 'typology_spec' end,
        'semantics', 'building_footprint_coverage_only'
      ),
      'max_impervious_pct', jsonb_build_object(
        'value', case when v_max_impervious is null then null
                      when v_max_impervious <= 1 then round(v_max_impervious * 100, 2)
                      else v_max_impervious end,
        'source', v_design #>> '{max_isr,source}',
        'semantics', 'building_plus_parking_plus_drives_and_other_impervious'
      ),
      'entitlement_capacity', v_design -> 'entitlement_capacity',
      'min_open_space_pct', v_design -> 'min_open_space_pct',
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner legal coverage marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  if position('''max_buildout'', v_max_buildout' in v_definition) = 0 then
    v_old := $old$
    'typology_spec', v_spec,
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),
$old$;
    v_new := $new$
    'typology_spec', v_spec,
    'entitlement_capacity', v_design -> 'entitlement_capacity',
    'max_buildout', v_max_buildout,
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner context max-buildout marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  if position('''max_building_coverage_pct'', v_max_coverage' in v_definition) = 0 then
    v_old := $old$
      'max_density_du_acre', v_max_density,
      'max_coverage_pct', v_max_coverage,
      'min_open_space_pct', v_min_open,
$old$;
    v_new := $new$
      'max_density_du_acre', v_max_density,
      'max_coverage_pct', v_max_coverage,
      'max_building_coverage_pct', v_max_coverage,
      'max_impervious_pct', case when v_max_impervious is null then null
                                  when v_max_impervious <= 1 then v_max_impervious * 100
                                  else v_max_impervious end,
      'max_impervious_sqft', nullif(v_design #>> '{entitlement_capacity,max_impervious_sqft}', '')::numeric,
      'coverage_semantics', jsonb_build_object(
        'max_coverage_pct', 'building_footprint_only',
        'max_impervious_pct', 'building_plus_parking_plus_drives_and_other_impervious'
      ),
      'min_open_space_pct', v_min_open,
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner hard-constraint coverage marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  if position('''whole_building_obb_depth_ft''' in v_definition) = 0 then
    v_old := $old$
      'length_ft', v_built_form #> '{distribution,length_ft}',
      'depth_ft', v_built_form #> '{distribution,depth_ft}',
      'aspect_ratio', v_built_form #> '{distribution,aspect_ratio}',
$old$;
    v_new := $new$
      'length_ft', v_built_form #> '{distribution,length_ft}',
      'whole_building_obb_depth_ft', v_built_form #> '{distribution,depth_ft}',
      'depth_ft', v_built_form #> '{distribution,depth_ft}',
      'depth_semantics', 'whole_building_oriented_bounding_box_not_bar_depth',
      'bar_depth_source', 'typology_or_program_spec_only',
      'quantity_role', 'form_only_never_caps_gsf',
      'aspect_ratio', v_built_form #> '{distribution,aspect_ratio}',
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner precedent depth marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  if position('''entitlement_capacity'', v_design -> ''entitlement_capacity''' in v_definition) = 0
     or position('''max_buildout'', v_max_buildout' in v_definition) < position('v_solver_brief := jsonb_build_object' in v_definition) then
    v_old := $old$
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),
    'program_prior_version', v_program_version,
$old$;
    v_new := $new$
    'entitlement_capacity', v_design -> 'entitlement_capacity',
    'max_buildout', v_max_buildout,
    'program_prior', coalesce(v_program_prior, '{}'::jsonb),
    'program_prior_version', v_program_version,
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'planner solver max-buildout marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
  end if;

  execute v_definition;
end
$patch$;

-- Interim U.S. multifamily clear width until the per-type corridor/core table
-- is available. The source remains explicitly low confidence.
update planner.program_prior
set prior = jsonb_set(
      jsonb_set(
        prior,
        '{corridor_width_ft,value}',
        to_jsonb(5.5::numeric),
        true
      ),
      '{corridor_width_ft,source}',
      to_jsonb('interim_us_double_loaded_clear_width_v0_2'::text),
      true
    ) || jsonb_build_object(
      'limitations', coalesce(prior->'limitations','[]'::jsonb)
        || jsonb_build_array('corridor_width_interim_until_unit_spec')
    )
where typology = 'multifamily'
  and active
  and approved_for_solver
  and prior_version = 'existing_engine_bridge_v0_1';

comment on function public.fn_compile_planner_context(integer,text,jsonb) is
  'Compiles planner_context_v2 with a max-GSF buildout frontier, separate building-coverage and impervious constraints, sample-size-capped precedent confidence, form-only Regrid depth semantics, and a GSF-dominant objective profile.';
