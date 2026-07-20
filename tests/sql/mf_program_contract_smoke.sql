-- Multifamily program-contract regression tests.
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/mf_program_contract_smoke.sql
-- All synthetic snapshots and generated candidates roll back.

\set ON_ERROR_STOP on
\echo '=== MF Program Contract Smoke Tests ==='

begin;

do $smoke$
declare
  intent jsonb := jsonb_build_object('mf_program_contract_nonce',gen_random_uuid());
  c1 jsonb;
  c2 jsonb;
  plan jsonb;
  buildout jsonb;
  sf_context jsonb;
  mismatch jsonb;
  no_context jsonb;
  base_row planner.context_snapshot%rowtype;
  adversarial_brief jsonb;
  adversarial_context_id uuid;
  adversarial_plan jsonb;
  avg_unit_gsf numeric;
begin
  buildout := public.fn_max_buildout(667574,'multifamily');
  if buildout ? 'error' then
    raise exception '2622 W Heiman max-buildout failed: %',buildout;
  end if;
  if buildout->>'contract_version'<>'max_buildout_v3'
     or (buildout->>'unit_gsf_min')::numeric<>750
     or (buildout->>'unit_gsf_max')::numeric<>1550
     or (buildout->>'at_stories')::integer<>4
     or (buildout#>>'{program_frontier,unit_gsf_band,hard_constraint}')::boolean is not true then
    raise exception 'hard unit-GSF frontier is incomplete: %',buildout;
  end if;
  if (buildout->>'max_gsf')::numeric<>(buildout->>'units_at_max')::numeric*(buildout->>'at_unit_gsf')::numeric then
    raise exception 'max-GSF target drifted from its integer unit program: %',buildout;
  end if;

  c1 := public.fn_compile_planner_context(667574,'multifamily',intent);
  c2 := public.fn_compile_planner_context(667574,'multifamily',intent);
  if c1 ? 'error' or c2 ? 'error' then
    raise exception '2622 W Heiman context compile failed: %, %',c1,c2;
  end if;
  if c1->>'cache_status'<>'miss' or c2->>'cache_status'<>'hit'
     or c1->>'context_id'<>c2->>'context_id'
     or c1->>'context_hash'<>c2->>'context_hash' then
    raise exception 'snapshot reuse failed: %, %',c1,c2;
  end if;
  if c2#>>'{solver_brief,precedent_priors,depth_semantics}'<>'whole_building_oriented_bounding_box_not_bar_depth'
     or c2#>>'{solver_brief,precedent_priors,bar_depth_source}'<>'typology_or_program_spec_only' then
    raise exception 'whole-building OBB depth is not excluded from bar depth';
  end if;
  if c2#>>'{solver_brief,hard_constraints,coverage_semantics,max_coverage_pct}'<>'building_footprint_only'
     or c2#>>'{solver_brief,hard_constraints,coverage_semantics,max_impervious_pct}'<>'building_plus_parking_plus_drives_and_other_impervious'
     or (c2#>>'{solver_brief,hard_constraints,max_building_coverage_pct}')::numeric<>60
     or (c2#>>'{solver_brief,hard_constraints,max_impervious_pct}')::numeric<>75 then
    raise exception 'building coverage and ordinance ISR are not separate: %',c2#>'{solver_brief,hard_constraints}';
  end if;
  if (c2#>>'{solver_brief,program_prior,corridor_width_ft,value}')::numeric<5.5 then
    raise exception 'interim corridor clear width regressed below 5.5 feet';
  end if;

  plan := public.fn_generate_mf_site_plan_v2(
    667574,'multifamily',17,'[]'::jsonb,null,false,(c2->>'context_id')::uuid
  );
  if plan ? 'error' then
    raise exception '2622 W Heiman solve failed: %',plan;
  end if;
  avg_unit_gsf := (plan#>>'{metrics,avg_unit_gsf}')::numeric;
  if (plan#>>'{metrics,floors}')::integer<>4
     or avg_unit_gsf<750 or avg_unit_gsf>1550
     or (plan#>>'{metrics,unit_gsf_min}')::numeric<>750
     or (plan#>>'{metrics,unit_gsf_max}')::numeric<>1550
     or not (plan->'flags' ? 'unit_gsf_band_hard_pass') then
    raise exception '2622 W Heiman escaped the hard program band: %',plan;
  end if;
  if (plan#>>'{metrics,stalls}')::integer<(plan#>>'{metrics,stalls_required}')::integer
     or (plan#>>'{metrics,drive_components}')::integer<>1
     or not coalesce((plan#>>'{metrics,hard_constraints_passed}')::boolean,false) then
    raise exception '2622 W Heiman lost parking/access hard constraints: %',plan;
  end if;

  -- Adversarial fixture for the shipped failure: lie that the frontier selected
  -- one story, then impose a footprint cap that requires the legal four stories.
  -- The solver must increase stories before sacrificing GSF and must never emit
  -- a sub-750-GSF unit program.
  select * into base_row
  from planner.context_snapshot
  where id=(c2->>'context_id')::uuid;

  adversarial_brief := base_row.solver_brief;
  adversarial_brief := jsonb_set(adversarial_brief,'{max_buildout,at_stories}','1'::jsonb,true);
  adversarial_brief := jsonb_set(adversarial_brief,'{max_buildout,program_frontier,gsf_max_option,stories}','1'::jsonb,true);
  adversarial_brief := jsonb_set(adversarial_brief,'{hard_constraints,max_building_coverage_pct}','10'::jsonb,true);
  adversarial_brief := jsonb_set(adversarial_brief,'{hard_constraints,max_coverage_pct}','10'::jsonb,true);

  insert into planner.context_snapshot(
    parcel_ogc_fid,selected_use,typology,context_version,context_hash,
    generation_allowed,compiled_context,solver_brief,provenance,
    objective_profile,is_current
  ) values (
    667574,'multifamily','multifamily','planner_context_unit_band_adversary',
    'unit-band-adversary-'||gen_random_uuid(),true,
    base_row.compiled_context,adversarial_brief,base_row.provenance,
    base_row.objective_profile,false
  ) returning id into adversarial_context_id;

  adversarial_plan := public.fn_generate_mf_site_plan_v2(
    667574,'multifamily',17,'[]'::jsonb,null,false,adversarial_context_id
  );
  if adversarial_plan ? 'error' then
    raise exception 'coverage/story adversarial solve failed: %',adversarial_plan;
  end if;
  if (adversarial_plan#>>'{metrics,floors}')::integer<>4
     or (adversarial_plan#>>'{metrics,avg_unit_gsf}')::numeric<750
     or (adversarial_plan#>>'{metrics,avg_unit_gsf}')::numeric>1550
     or not (adversarial_plan->'flags' ? 'coverage_response_lifted_stories_before_clamping_gsf')
     or not (adversarial_plan->'flags' ? 'unit_gsf_band_hard_pass') then
    raise exception 'coverage clamp did not choose more stories + valid units: %',adversarial_plan;
  end if;

  no_context := public.fn_generate_mf_site_plan_v2(
    667574,'multifamily',17,'[]'::jsonb,null,false,null
  );
  if no_context->>'error'<>'planner_context_required' then
    raise exception 'context-free MF solve did not fail closed: %',no_context;
  end if;

  sf_context := public.fn_compile_planner_context(
    667574,'single_family',jsonb_build_object('mf_use_guard_nonce',gen_random_uuid())
  );
  mismatch := public.fn_generate_mf_site_plan_v2(
    667574,'multifamily',17,'[]'::jsonb,null,false,(sf_context->>'context_id')::uuid
  );
  if mismatch->>'error'<>'planner_context_use_mismatch' then
    raise exception 'server-side selected-use guard is missing: %',mismatch;
  end if;
end
$smoke$;

rollback;

\echo '=== MF Program Contract Smoke Tests Passed ==='
