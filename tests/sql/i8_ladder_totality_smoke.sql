\set ON_ERROR_STOP on

-- I-8 ladder-totality contract.
-- Named parcels below are immutable regression fixtures only; production
-- functions are statically checked for parcel/address-specific branching.

do $smoke$
declare
  v_max_def text;
  v_program_def text;
  v_core_def text;
  v_dispatch_def text;
  v_compile_def text;
  v_mb jsonb;
  v_buildability jsonb;
  v_ctx jsonb;
  v_plan jsonb;
  v_capture numeric;
  v_case record;
  v_candidate record;
  v_checked integer := 0;
  v_bad_raw_errors integer := 0;
  v_degenerate integer;
begin
  v_max_def := pg_get_functiondef('public.fn_max_buildout(integer,text)'::regprocedure);
  v_program_def := pg_get_functiondef('public.fn_massing_program(integer,text)'::regprocedure);
  v_core_def := pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  );
  v_dispatch_def := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );
  v_compile_def := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );

  if position('max_buildout_v4_integer_consistent' in v_max_def)=0
     or position('integer_units' in v_max_def)=0
     or position('minimum_typology_units' in v_max_def)=0 then
    raise exception 'integer-consistent max-buildout v4 is not installed';
  end if;
  if position('connected_leg_program_compatibility_seed_v1' in v_program_def)=0
     or position('relaxation_ladder' in v_program_def)=0 then
    raise exception 'massing program does not publish the compatibility seed and ladder';
  end if;
  if position('parking_ratio_consistent_with_max_buildout_frontier_v1' in v_core_def)=0
     or position('solver_seed,bar_count' in v_core_def)=0 then
    raise exception 'solve core does not consume the totality contract';
  end if;
  if position('planner_no_feasible_massing_regime' in v_dispatch_def)=0
     or position('massing_program_i8_totality_v1' in v_dispatch_def)=0
     or position('fn_parcel_buildability' in v_dispatch_def)=0
     or position('planner_buildability_verdict_v1' in v_dispatch_def)=0
     or position('planner_degenerate_frontier_band_step_skipped_v1' in v_dispatch_def)=0
     or position('planner_degenerate_frontier_straight_to_placement_relaxation_v1' in v_dispatch_def)=0 then
    raise exception 'dispatcher totality/buildability contract is missing';
  end if;
  if position('planner_context_v2_i8_totality_buildability_20260723' in v_compile_def)=0 then
    raise exception 'compiler revision was not advanced for canonical I-8 scope';
  end if;

  -- Examples may regress a failure, but may never drive production behavior.
  if lower(v_max_def||v_program_def||v_core_def||v_dispatch_def||v_compile_def)
       ~ 'heiman|meharry'
     or lower(v_max_def||v_program_def||v_core_def||v_dispatch_def||v_compile_def)
       ~ 'case[[:space:]]+p_ogc_fid'
     or lower(v_max_def||v_program_def||v_core_def||v_dispatch_def||v_compile_def)
       ~ 'p_ogc_fid[[:space:]]*=[[:space:]]*[0-9]{4,}' then
    raise exception 'parcel/address-specific runtime behavior detected';
  end if;

  v_mb := public.fn_max_buildout(488278,'multifamily');
  if v_mb->>'contract_version'<>'max_buildout_v4_integer_consistent'
     or (v_mb->>'max_gsf')::numeric
          <> (v_mb->>'units_at_max')::numeric*(v_mb->>'at_unit_gsf')::numeric
     or (v_mb#>>'{program_frontier,unit_gsf_band,min}')::numeric<>750
     or (v_mb#>>'{program_frontier,unit_gsf_band,max}')::numeric<>1550
     or not coalesce((v_mb#>>'{program_frontier,unit_gsf_band,hard_constraint}')::boolean,false) then
    raise exception 'max-buildout integer/band identity failed: %',v_mb;
  end if;

  -- Canonical refusals are deliverables. They do not enter the massing ladder
  -- and may not carry authoritative plan metrics or a plan-basis statement.
  for v_case in
    select * from (values
      (480089,'unbuildable_depth'),
      (609035,'unbuildable_area')
    ) q(ogc_fid,expected_reason)
  loop
    v_buildability := public.fn_parcel_buildability(v_case.ogc_fid,'multifamily');
    if v_buildability->>'verdict'<>v_case.expected_reason then
      raise exception 'fixture % canonical verdict %, expected %',
        v_case.ogc_fid,v_buildability,v_case.expected_reason;
    end if;
    v_ctx := public.fn_compile_planner_context(
      v_case.ogc_fid,'multi_family',
      jsonb_build_object('contract_smoke','i8_refusal_v1','fid',v_case.ogc_fid)
    );
    if v_ctx ? 'error' then
      raise exception 'refusal fixture % context failed: %',v_case.ogc_fid,v_ctx;
    end if;
    v_plan := public.fn_generate_mf_site_plan_v2(
      v_case.ogc_fid,'multifamily',1,null,null,false,(v_ctx->>'context_id')::uuid
    );
    if v_plan->>'error'<>'planner_generation_not_allowed'
       or v_plan->>'reason'<>v_case.expected_reason
       or v_plan#>>'{buildability,verdict}'<>v_case.expected_reason
       or v_plan ? 'metrics'
       or v_plan ? 'plan_basis'
       or v_plan ? 'attempts' then
      raise exception 'fixture % did not return a clean canonical refusal: %',
        v_case.ogc_fid,v_plan;
    end if;
  end loop;

  -- Required plan floors. 669046 also locks the proven three-bar composition;
  -- the showcase consolidation ceiling remains a later constructive-pipeline task.
  for v_case in
    select * from (values
      (488278,83.0::numeric,null::integer),
      (553450,98.5::numeric,null::integer),
      (669046,98.3::numeric,3::integer)
    ) q(ogc_fid,min_capture,max_bars)
  loop
    v_buildability := public.fn_parcel_buildability(v_case.ogc_fid,'multifamily');
    if coalesce(v_buildability->>'verdict','') not like 'buildable%' then
      raise exception 'floor fixture % is no longer canonically buildable: %',
        v_case.ogc_fid,v_buildability;
    end if;
    v_ctx := public.fn_compile_planner_context(
      v_case.ogc_fid,'multi_family',
      jsonb_build_object('contract_smoke','i8_totality_v2','fid',v_case.ogc_fid)
    );
    if v_ctx ? 'error' then
      raise exception 'fixture % context failed: %',v_case.ogc_fid,v_ctx;
    end if;
    v_plan := public.fn_generate_mf_site_plan_v2(
      v_case.ogc_fid,'multifamily',1,null,null,false,(v_ctx->>'context_id')::uuid
    );
    if v_plan ? 'error' then
      raise exception 'fixture % solve failed: %',v_case.ogc_fid,v_plan;
    end if;
    v_mb := public.fn_max_buildout(v_case.ogc_fid,'multifamily');
    v_capture := (v_plan#>>'{metrics,gfa_sqft}')::numeric
                 /nullif((v_mb->>'max_gsf')::numeric,0)*100;
    if v_capture+0.05<v_case.min_capture then
      raise exception 'fixture % capture % below floor %',
        v_case.ogc_fid,round(v_capture,1),v_case.min_capture;
    end if;
    if v_case.max_bars is not null
       and jsonb_array_length(coalesce(v_plan->'buildings','[]'::jsonb))>v_case.max_bars then
      raise exception 'fixture % returned % bars above cap %',
        v_case.ogc_fid,jsonb_array_length(v_plan->'buildings'),v_case.max_bars;
    end if;
    if not coalesce((v_plan#>>'{metrics,hard_constraints_passed}')::boolean,false)
       or coalesce((v_plan#>>'{metrics,drive_components}')::integer,99)<>1
       or coalesce((v_plan#>>'{metrics,stalls}')::integer,0)
            < coalesce((v_plan#>>'{metrics,stalls_required}')::integer,1) then
      raise exception 'fixture % returned an invalid plan: %',v_case.ogc_fid,v_plan->'metrics';
    end if;
    if v_plan#>>'{metrics,regime_comparison,policy}'<>'massing_prior_relaxation_ladder_v1'
       or coalesce(v_plan#>>'{buildability,verdict}','') not like 'buildable%' then
      raise exception 'fixture % omitted ladder/buildability receipts',v_case.ogc_fid;
    end if;
  end loop;

  -- If the current corpus contains a canonically buildable single-point
  -- frontier, it must skip the program/band gate and enter placement recovery.
  select p.ogc_fid into v_degenerate
  from public.parcels p
  cross join lateral public.fn_parcel_buildability(p.ogc_fid,'multifamily') b
  cross join lateral public.fn_max_buildout(p.ogc_fid,'multifamily') mb
  where coalesce(b->>'verdict','') like 'buildable%'
    and coalesce((mb->>'degenerate_frontier')::boolean,false)
  order by md5(p.ogc_fid::text||':i8-buildable-degenerate')
  limit 1;
  if v_degenerate is not null then
    v_ctx := public.fn_compile_planner_context(
      v_degenerate,'multi_family',jsonb_build_object('contract_smoke','i8_degenerate_skip_v1')
    );
    v_plan := public.fn_generate_mf_site_plan_v2(
      v_degenerate,'multifamily',1,null,null,false,(v_ctx->>'context_id')::uuid
    );
    if v_plan->>'reason'='planner_degenerate_frontier_below_typology_minimum'
       or v_plan->>'error'='planner_unit_gsf_band_infeasible' then
      raise exception 'buildable degenerate frontier did not skip to placement relaxation: %',v_plan;
    end if;
  end if;

  -- Fresh deterministic buildable cohort: legacy recoverable classes may
  -- appear inside attempt receipts, but may not escape the total dispatcher.
  for v_candidate in
    select q.ogc_fid
    from (
      select p.ogc_fid,public.fn_parcel_buildability(p.ogc_fid,'multifamily') b
      from public.parcels p
      where upper(coalesce(p.zoning,'')) like 'RM%'
        and coalesce(p.lot_sqft_2274,0)>=5000
      order by md5(p.ogc_fid::text||':i8-totality-buildable-smoke')
      limit 80
    ) q
    where coalesce(q.b->>'verdict','') like 'buildable%'
    limit 8
  loop
    v_checked := v_checked+1;
    v_ctx := public.fn_compile_planner_context(
      v_candidate.ogc_fid,'multi_family',
      jsonb_build_object('contract_smoke','i8_fresh_buildable_cohort_v2')
    );
    if v_ctx ? 'error' then
      raise exception 'fresh cohort compile failed for %: %',v_candidate.ogc_fid,v_ctx;
    end if;
    v_plan := public.fn_generate_mf_site_plan_v2(
      v_candidate.ogc_fid,'multifamily',1,null,null,false,(v_ctx->>'context_id')::uuid
    );
    if v_plan->>'error' in (
      'planner_unit_gsf_band_infeasible',
      'planner_envelope_unplaceable',
      'planner_envelope_unbuildable_depth',
      'planner_parking_infeasible',
      'planner_drive_network_disconnected'
    ) then
      v_bad_raw_errors := v_bad_raw_errors+1;
    end if;
    if v_plan->>'error'='planner_no_feasible_massing_regime'
       and (jsonb_typeof(v_plan->'last_errors')<>'object'
            or jsonb_typeof(v_plan->'attempts')<>'object') then
      raise exception 'ladder exhaustion for % omitted structured errors: %',
        v_candidate.ogc_fid,v_plan;
    end if;
  end loop;

  if v_checked<5 or v_bad_raw_errors<>0 then
    raise exception 'fresh buildable cohort totality failed: checked %, raw errors %',
      v_checked,v_bad_raw_errors;
  end if;
end
$smoke$;

select 'I-8 ladder totality and canonical buildability smoke passed' as result;
