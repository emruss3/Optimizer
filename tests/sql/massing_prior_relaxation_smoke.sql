\set ON_ERROR_STOP on

-- Massing-program contract regression.
--
-- Production functions stay generic. The three named IDs below are immutable
-- regression fixtures for previously observed failure classes, never runtime
-- branches or tuning inputs.

do $smoke$
declare
  v_core_def text;
  v_dispatch_def text;
  v_compile_def text;
  v_program_def text;
  v_candidate record;
  v_fixture record;
  v_ctx jsonb;
  v_free jsonb;
  v_plan jsonb;
  v_cmp jsonb;
  v_selected_gsf numeric;
  v_free_gsf numeric;
  v_tested integer := 0;
  v_floor_cases integer := 0;
begin
  v_core_def := pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  );
  v_dispatch_def := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );
  v_compile_def := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );
  v_program_def := pg_get_functiondef(
    'public.fn_massing_program(integer,text)'::regprocedure
  );

  if position('massing_program_relaxed_split_one_bar_v1' in v_core_def)=0
     or position('massing_program_relaxed_plus_one_count_v1' in v_core_def)=0
     or position('massing_program_relaxed_free_pack_v1' in v_core_def)=0 then
    raise exception 'solve core is missing an exact/split/plus/free-pack mode';
  end if;

  if position('massing_program_free_pack_floor_verified_v1' in v_dispatch_def)=0
     or position('planner_free_pack_floor_violation' in v_dispatch_def)=0
     or position('massing_prior_relaxation_ladder_v1' in v_dispatch_def)=0 then
    raise exception 'dispatcher is missing the free-pack floor invariant';
  end if;

  if position('massing_program_preferred_prior_v1' in v_compile_def)=0
     or position('planner_context_v2_massing_relaxation_ladder_20260721' in v_compile_def)=0 then
    raise exception 'compiler still publishes the massing program as a hard directive';
  end if;

  if position('preferred_massing_prior' in v_program_def)=0
     or position('relaxation_ladder' in v_program_def)=0
     or position('placement_shortfall_gsf_pct_gt' in v_program_def)=0 then
    raise exception 'massing-program contract does not publish the relaxation policy';
  end if;

  -- Static defense: examples may appear below as fixtures, never in production
  -- function bodies. Reject address or literal-parcel branching.
  if lower(v_core_def || v_dispatch_def || v_compile_def || v_program_def) ~ 'heiman|meharry'
     or lower(v_core_def || v_dispatch_def || v_compile_def || v_program_def) ~ 'case[[:space:]]+p_ogc_fid'
     or lower(v_core_def || v_dispatch_def || v_compile_def || v_program_def)
          ~ 'p_ogc_fid[[:space:]]*=[[:space:]]*[0-9]{4,}' then
    raise exception 'parcel/address-specific runtime behavior detected';
  end if;

  -- Generic cohort: whenever free-pack is feasible, the dispatcher must return
  -- a hard-valid result whose GSF is at least that baseline. The cohort is
  -- selected from data, not hard-coded parcel behavior.
  for v_candidate in
    select p.ogc_fid
    from public.parcels p
    cross join lateral public.fn_resolve_permitted_uses(p.ogc_fid) u
    cross join lateral public.fn_max_buildout(p.ogc_fid,'multifamily') mb
    where p.geom_2274 is not null
      and p.lot_sqft_2274 between 30000 and 140000
      and upper(coalesce(p.zoning,'')) like 'RM%'
      and coalesce((u#>>'{as_of_right,multi_family}')::boolean,false)
      and not (mb ? 'error')
    order by md5(p.ogc_fid::text)
    limit 6
  loop
    v_ctx := public.fn_compile_planner_context(
      v_candidate.ogc_fid,
      'multifamily',
      jsonb_build_object('contract_smoke','massing_prior_relaxation_v1')
    );
    if v_ctx ? 'error' then continue; end if;

    v_free := public.fn_mf_solve_core(
      v_candidate.ogc_fid,'multifamily',23,'[]'::jsonb,null,false,
      (v_ctx->>'context_id')::uuid,'surface:free_pack'
    );
    v_plan := public.fn_generate_mf_site_plan_v2(
      v_candidate.ogc_fid,'multifamily',23,'[]'::jsonb,null,false,
      (v_ctx->>'context_id')::uuid
    );
    v_tested := v_tested+1;

    if not (v_free ? 'error') then
      v_floor_cases := v_floor_cases+1;
      if v_plan ? 'error' then
        raise exception 'dispatcher failed although free-pack was feasible for cohort member %: %',
          v_candidate.ogc_fid,v_plan;
      end if;
      v_free_gsf := (v_free#>>'{metrics,gfa_sqft}')::numeric;
      v_selected_gsf := (v_plan#>>'{metrics,gfa_sqft}')::numeric;
      if v_selected_gsf+1 < v_free_gsf then
        raise exception 'selected GSF % fell below free-pack % for cohort member %',
          v_selected_gsf,v_free_gsf,v_candidate.ogc_fid;
      end if;
      if not coalesce((v_plan#>>'{metrics,hard_constraints_passed}')::boolean,false)
         or not coalesce(v_plan->'flags','[]'::jsonb) ? 'massing_program_free_pack_floor_verified_v1'
         or not coalesce((v_plan#>>'{metrics,regime_comparison,floor_satisfied}')::boolean,false) then
        raise exception 'free-pack floor receipt/hard gate missing for cohort member %: %',
          v_candidate.ogc_fid,v_plan#>'{metrics,regime_comparison}';
      end if;
    elsif not (v_plan ? 'error') then
      -- A split/compact prior may solve a geometry that unrestricted surface
      -- free-pack cannot. It must still be hard-valid and disclose the ladder.
      if not coalesce((v_plan#>>'{metrics,hard_constraints_passed}')::boolean,false)
         or not coalesce(v_plan->'flags','[]'::jsonb) ? 'massing_program_prior_relaxation_ladder_v1' then
        raise exception 'non-free-pack recovery omitted hard/ladder receipt for %',v_candidate.ogc_fid;
      end if;
    end if;
  end loop;

  if v_tested < 3 or v_floor_cases < 1 then
    raise exception 'generic cohort coverage insufficient: tested %, floor cases %',v_tested,v_floor_cases;
  end if;

  -- Required regression reruns. These IDs are test fixtures only.
  for v_fixture in
    select * from (values
      (553450,'large_connected_failure'),
      (488278,'medium_parking_failure'),
      (480089,'small_lot_open')
    ) as f(ogc_fid,scenario)
  loop
    v_ctx := public.fn_compile_planner_context(
      v_fixture.ogc_fid,
      'multifamily',
      jsonb_build_object('contract_smoke','massing_prior_fixture_v1')
    );
    if v_ctx ? 'error' then
      raise exception 'fixture % context failed: %',v_fixture.scenario,v_ctx;
    end if;

    v_free := public.fn_mf_solve_core(
      v_fixture.ogc_fid,'multifamily',23,'[]'::jsonb,null,false,
      (v_ctx->>'context_id')::uuid,'surface:free_pack'
    );
    v_plan := public.fn_generate_mf_site_plan_v2(
      v_fixture.ogc_fid,'multifamily',23,'[]'::jsonb,null,false,
      (v_ctx->>'context_id')::uuid
    );

    if v_plan ? 'error' then
      raise exception 'fixture % dispatcher failed: %',v_fixture.scenario,v_plan;
    end if;

    v_cmp := v_plan#>'{metrics,regime_comparison}';
    if jsonb_typeof(v_cmp)<>'object'
       or v_cmp->>'policy'<>'massing_prior_relaxation_ladder_v1' then
      raise exception 'fixture % omitted ladder comparison: %',v_fixture.scenario,v_cmp;
    end if;

    if not (v_free ? 'error') then
      v_free_gsf := (v_free#>>'{metrics,gfa_sqft}')::numeric;
      v_selected_gsf := (v_plan#>>'{metrics,gfa_sqft}')::numeric;
      if v_selected_gsf+1 < v_free_gsf
         or not coalesce((v_cmp->>'floor_satisfied')::boolean,false) then
        raise exception 'fixture % solved below free-pack: selected %, free %',
          v_fixture.scenario,v_selected_gsf,v_free_gsf;
      end if;
    end if;

    if v_fixture.scenario in ('large_connected_failure','medium_parking_failure') then
      if not coalesce((v_plan#>>'{metrics,hard_constraints_passed}')::boolean,false)
         or coalesce((v_plan#>>'{metrics,drive_components}')::integer,99)<>1
         or coalesce((v_plan#>>'{metrics,stalls}')::integer,0)
              < coalesce((v_plan#>>'{metrics,stalls_required}')::integer,1) then
        raise exception 'fixture % did not recover a connected, parked, hard-valid plan: %',
          v_fixture.scenario,v_plan->'metrics';
      end if;
    end if;

    if v_fixture.scenario='large_connected_failure'
       and coalesce((v_plan#>>'{metrics,gsf_capture_pct}')::numeric,0)<90 then
      raise exception 'large connected fixture regressed below 90%% capture: %',v_plan->'metrics';
    end if;

    if v_fixture.scenario='small_lot_open'
       and v_cmp->>'small_lot_regime_status'<>'open' then
      raise exception 'small-lot work was incorrectly declared closed: %',v_cmp;
    end if;
  end loop;
end
$smoke$;

select 'massing prior relaxation smoke passed' as result;
