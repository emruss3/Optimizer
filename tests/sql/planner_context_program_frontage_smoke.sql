\set ON_ERROR_STOP on

-- Generic contract smoke: examples identify scenario classes, never parcel-specific
-- runtime behavior. This test dynamically selects members of the local cohort.

do $smoke$
declare
  v_program jsonb;
  v_compile_def text;
  v_dispatch_def text;
  v_core_def text;
  v_max_def text;
  v_candidate record;
  v_ctx jsonb;
  v_ctx2 jsonb;
  v_plan jsonb;
  v_solved boolean := false;
  v_landlocked record;
begin
  v_program := public.fn_unit_program('multifamily');
  if jsonb_typeof(v_program->'units') <> 'array'
     or jsonb_array_length(v_program->'units') < 4
     or coalesce((v_program->>'corridor_clear_ft')::numeric, 0) < 5.5
     or coalesce((v_program->>'implied_bar_depth_ft')::numeric, 0) not between 60 and 72
     or coalesce((v_program->>'weighted_parking_ratio')::numeric, 0) <= 0 then
    raise exception 'unit-program contract failed: %', v_program;
  end if;

  v_compile_def := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );
  v_dispatch_def := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );
  v_core_def := pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  );
  v_max_def := pg_get_functiondef(
    'public.fn_max_buildout(integer,text)'::regprocedure
  );

  if position('fn_unit_program' in v_compile_def) = 0
     or position('fn_parcel_frontage' in v_compile_def) = 0
     or position('request_fingerprint' in v_compile_def) = 0 then
    raise exception 'planner compiler is missing unit-program, frontage, or reuse composition';
  end if;

  if position('max_buildout' in v_dispatch_def) = 0
     or position('planner_context_use_mismatch' in v_dispatch_def) = 0
     or position('planner_context_required' in v_dispatch_def) = 0 then
    raise exception 'MF v2 dispatcher does not preflight max-buildout/use/context';
  end if;

  if position('bar_depth_from_unit_program_v1' in v_core_def) = 0
     or position('entry_from_context_frontage_v1' in v_core_def) = 0
     or position('bar_orientation_from_context_frontage_v1' in v_core_def) = 0
     or position('unit_gsf_band_from_max_buildout' in v_core_def) = 0 then
    raise exception 'MF solve core is missing program/frontage/max-buildout consumption';
  end if;

  -- Production functions may branch on inputs and constraint states, never on
  -- a named address or a literal parcel identifier. Named parcels belong only
  -- in historical regression fixtures and documentation.
  if lower(v_compile_def || v_dispatch_def || v_core_def || v_max_def) ~ 'case\s+p_ogc_fid'
     or lower(v_compile_def || v_dispatch_def || v_core_def || v_max_def) ~ 'p_ogc_fid\s*=\s*[0-9]{5,}'
     or lower(v_compile_def || v_dispatch_def || v_core_def || v_max_def) ~ 'address\s*=\s*'''
     or lower(v_compile_def || v_dispatch_def || v_core_def || v_max_def) like '%heiman%' then
    raise exception 'parcel/address-specific production branch detected';
  end if;

  -- Search a bounded generic cohort until one valid geometry solves. Individual
  -- candidates may legitimately fail closed; the contract requires no bad plan
  -- to render, not that every parcel has a surface-parking solution.
  for v_candidate in
    select p.ogc_fid
    from public.parcels p
    cross join lateral public.fn_parcel_frontage(p.ogc_fid) f
    cross join lateral public.fn_resolve_permitted_uses(p.ogc_fid) u
    cross join lateral public.fn_max_buildout(p.ogc_fid, 'multifamily') mb
    where p.geom_2274 is not null
      and p.lot_sqft_2274 between 30000 and 120000
      and upper(coalesce(p.zoning, '')) like 'RM%'
      and coalesce((u#>>'{as_of_right,multi_family}')::boolean, false)
      and coalesce((f->>'landlocked')::boolean, true) = false
      and not (mb ? 'error')
      and coalesce((mb->>'at_stories')::integer, 0) >= 2
    order by md5(p.ogc_fid::text)
    limit 12
  loop
    v_ctx := public.fn_compile_planner_context(
      v_candidate.ogc_fid,
      'multifamily',
      jsonb_build_object('contract_smoke', 'program_frontage_v1')
    );

    if v_ctx ? 'error' then continue; end if;

    if jsonb_typeof(v_ctx#>'{solver_brief,unit_program,units}') <> 'array'
       or coalesce((v_ctx#>>'{solver_brief,geometry,front_edge_is_placeholder}')::boolean, true)
       or nullif(v_ctx#>>'{solver_brief,geometry,frontage_bearing_deg}', '') is null then
      raise exception 'compiled program/frontage contract incomplete: %', v_ctx#>'{solver_brief,geometry}';
    end if;

    v_ctx2 := public.fn_compile_planner_context(
      v_candidate.ogc_fid,
      'multifamily',
      jsonb_build_object('contract_smoke', 'program_frontage_v1')
    );

    if v_ctx2->>'cache_status' <> 'hit'
       or v_ctx2->>'context_id' is distinct from v_ctx->>'context_id'
       or v_ctx2->>'context_hash' is distinct from v_ctx->>'context_hash' then
      raise exception 'identical planner snapshot was not reused';
    end if;

    v_plan := public.fn_generate_mf_site_plan_v2(
      v_candidate.ogc_fid,
      'multifamily',
      23,
      '[]'::jsonb,
      null,
      false,
      (v_ctx->>'context_id')::uuid
    );

    if not (v_plan ? 'error') then
      if not coalesce((v_plan#>>'{metrics,hard_constraints_passed}')::boolean, false)
         or not (coalesce(v_plan->'flags', '[]'::jsonb) ? 'unit_program_consumed_v1')
         or not (coalesce(v_plan->'flags', '[]'::jsonb) ? 'bar_depth_from_unit_program_v1')
         or not (coalesce(v_plan->'flags', '[]'::jsonb) ? 'entry_from_context_frontage_v1')
         or not (coalesce(v_plan->'flags', '[]'::jsonb) ? 'bar_orientation_from_context_frontage_v1')
         or not (coalesce(v_plan->'flags', '[]'::jsonb) ? 'unit_gsf_band_hard_pass') then
        raise exception 'successful plan omitted a required program/frontage receipt: %', v_plan->'flags';
      end if;
      v_solved := true;
      exit;
    end if;
  end loop;

  if not v_solved then
    raise exception 'bounded generic MF cohort produced no valid solve';
  end if;

  -- A landlocked cohort member, when present, must remain a placeholder and
  -- explicitly state that access is assumed by easement.
  select p.ogc_fid into v_landlocked
  from public.parcels p
  cross join lateral public.fn_parcel_frontage(p.ogc_fid) f
  cross join lateral public.fn_resolve_permitted_uses(p.ogc_fid) u
  cross join lateral public.fn_max_buildout(p.ogc_fid, 'multifamily') mb
  where p.geom_2274 is not null
    and p.lot_sqft_2274 between 30000 and 120000
    and upper(coalesce(p.zoning, '')) like 'RM%'
    and coalesce((u#>>'{as_of_right,multi_family}')::boolean, false)
    and coalesce((f->>'landlocked')::boolean, false)
    and not (mb ? 'error')
  order by md5(p.ogc_fid::text)
  limit 1;

  if v_landlocked.ogc_fid is not null then
    v_ctx := public.fn_compile_planner_context(
      v_landlocked.ogc_fid,
      'multifamily',
      jsonb_build_object('contract_smoke', 'landlocked_frontage_v1')
    );

    if not coalesce((v_ctx#>>'{solver_brief,geometry,front_edge_is_placeholder}')::boolean, false)
       or not coalesce((v_ctx#>>'{solver_brief,geometry,landlocked}')::boolean, false)
       or not (coalesce(v_ctx#>'{solver_brief,flags}', '[]'::jsonb)
            ? 'landlocked_access_via_easement_assumed') then
      raise exception 'landlocked frontage semantics failed: %', v_ctx#>'{solver_brief,geometry}';
    end if;
  end if;
end
$smoke$;

select 'planner context program/frontage smoke passed' as result;
