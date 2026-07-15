-- Typology-aware Regrid planner-context smoke tests.
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/regrid_context_smoke.sql
-- The test uses known Nashville parcel 669046 and rolls back all snapshots.

\set ON_ERROR_STOP on
\echo '=== Regrid Context Smoke Tests ==='

begin;

do $smoke$
declare
  v_sf jsonb;
  v_mf jsonb;
  v_sf_ctx jsonb;
  v_mf_ctx jsonb;
  v_mf_repeat jsonb;
  v_plan jsonb;
  v_short_plan jsonb;
  v_long_plan jsonb;
  v_base planner.context_snapshot%rowtype;
  v_short_id uuid;
  v_long_id uuid;
begin
  if public.fn_regrid_use_class('011','SINGLE FAMILY') <> 'single_family' then
    raise exception 'single-family Regrid classification failed';
  end if;
  if public.fn_regrid_use_class('038','APARTMENT: LOW RISE (BUILT SINCE 1960)') <> 'multifamily' then
    raise exception 'multifamily Regrid classification failed';
  end if;
  if public.fn_regrid_typology_match('multifamily','multifamily') <> 2
     or public.fn_regrid_typology_match('multifamily','residential_condo') <> 1
     or public.fn_regrid_typology_match('multifamily','single_family') <> 0 then
    raise exception 'Regrid typology match tiers failed';
  end if;

  v_sf:=public.fn_local_built_form_v2(669046,'single_family',5280,5);
  v_mf:=public.fn_local_built_form_v2(669046,'multifamily',5280,5);

  if v_sf ? 'error' or v_mf ? 'error' then
    raise exception 'typology-aware built-form resolver failed: sf=%, mf=%',v_sf->>'error',v_mf->>'error';
  end if;
  if v_sf#>>'{selection,requested_typology}' <> 'single_family'
     or v_mf#>>'{selection,requested_typology}' <> 'multifamily' then
    raise exception 'selected typology is missing from Regrid selection provenance';
  end if;
  if not (v_sf->'type_mix' ? 'single_family') then
    raise exception 'single-family selection did not select single-family Regrid parcels';
  end if;
  if not (v_mf->'type_mix' ? 'multifamily') then
    raise exception 'multifamily selection did not select apartment Regrid parcels';
  end if;
  if (v_sf#>>'{distribution,footprint_sqft,p50}')::numeric
     >= (v_mf#>>'{distribution,footprint_sqft,p50}')::numeric then
    raise exception 'single-family and multifamily footprint priors are not differentiated';
  end if;
  if (v_sf#>>'{distribution,depth_ft,p50}')::numeric
     >= (v_mf#>>'{distribution,depth_ft,p50}')::numeric then
    raise exception 'single-family and multifamily depth priors are not differentiated';
  end if;

  v_sf_ctx:=public.fn_compile_planner_context(669046,'single_family','{}'::jsonb);
  v_mf_ctx:=public.fn_compile_planner_context(669046,'multifamily','{}'::jsonb);
  v_mf_repeat:=public.fn_compile_planner_context(669046,'multifamily','{}'::jsonb);

  if v_sf_ctx->>'context_version' <> 'planner_context_v2'
     or v_mf_ctx->>'context_version' <> 'planner_context_v2' then
    raise exception 'planner_context_v2 was not returned';
  end if;
  if v_sf_ctx->>'context_hash' = v_mf_ctx->>'context_hash' then
    raise exception 'different requested uses produced the same context hash';
  end if;
  if v_mf_ctx->>'context_hash' <> v_mf_repeat->>'context_hash'
     or v_mf_ctx->>'context_id' <> v_mf_repeat->>'context_id' then
    raise exception 'identical context compiles are not hash/id stable';
  end if;
  if v_mf_ctx#>>'{solver_brief,precedent_priors,selection,requested_typology}' <> 'multifamily' then
    raise exception 'solver brief lost the typology-aware Regrid selection';
  end if;

  v_plan:=public.fn_generate_mf_site_plan_v2(
    669046,'multifamily',17,'[]'::jsonb,null,false,(v_mf_ctx->>'context_id')::uuid
  );
  if v_plan ? 'error' then
    raise exception 'context-driven multifamily generation failed: %',v_plan->>'error';
  end if;
  if v_plan->>'generator_version' <> 'mf_context_v2_regrid_typology_v1'
     or v_plan->>'score_version' <> 'context_score_v2' then
    raise exception 'generator/score lineage was not upgraded';
  end if;
  if not (v_plan->'flags' ? 'bar_depth_from_regrid_geometry_p50')
     or not (v_plan->'flags' ? 'bar_length_target_from_regrid_geometry_p75')
     or not (v_plan->'flags' ? 'stories_from_precedent_p50_p75') then
    raise exception 'generator did not report consuming Regrid geometry/story priors';
  end if;

  select * into v_base
  from planner.context_snapshot
  where id=(v_mf_ctx->>'context_id')::uuid;

  insert into planner.context_snapshot(
    parcel_ogc_fid,selected_use,typology,context_version,context_hash,
    generation_allowed,compiled_context,solver_brief,provenance,
    objective_profile,is_current
  ) values (
    v_base.parcel_ogc_fid,v_base.selected_use,v_base.typology,
    'planner_context_ab_test','ab-short-'||gen_random_uuid(),true,
    v_base.compiled_context,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_base.solver_brief,
              '{precedent_priors,depth_ft,p50}',to_jsonb(50::numeric),true),
            '{precedent_priors,length_ft,p75}',to_jsonb(100::numeric),true),
          '{precedent_priors,underwrite_target,length_ft_p75}',to_jsonb(100::numeric),true),
        '{precedent_priors,stories,p50}',to_jsonb(2::numeric),true),
      '{precedent_priors,stories,p75}',to_jsonb(2::numeric),true),
    v_base.provenance,v_base.objective_profile,false
  ) returning id into v_short_id;

  insert into planner.context_snapshot(
    parcel_ogc_fid,selected_use,typology,context_version,context_hash,
    generation_allowed,compiled_context,solver_brief,provenance,
    objective_profile,is_current
  ) values (
    v_base.parcel_ogc_fid,v_base.selected_use,v_base.typology,
    'planner_context_ab_test','ab-long-'||gen_random_uuid(),true,
    v_base.compiled_context,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_base.solver_brief,
              '{precedent_priors,depth_ft,p50}',to_jsonb(72::numeric),true),
            '{precedent_priors,length_ft,p75}',to_jsonb(250::numeric),true),
          '{precedent_priors,underwrite_target,length_ft_p75}',to_jsonb(250::numeric),true),
        '{precedent_priors,stories,p50}',to_jsonb(4::numeric),true),
      '{precedent_priors,stories,p75}',to_jsonb(4::numeric),true),
    v_base.provenance,v_base.objective_profile,false
  ) returning id into v_long_id;

  v_short_plan:=public.fn_generate_mf_site_plan_v2(
    669046,'multifamily',17,'[]'::jsonb,null,false,v_short_id
  );
  v_long_plan:=public.fn_generate_mf_site_plan_v2(
    669046,'multifamily',17,'[]'::jsonb,null,false,v_long_id
  );

  if (v_short_plan#>>'{metrics,footprint_sqft}')::numeric
       = (v_long_plan#>>'{metrics,footprint_sqft}')::numeric
     and (v_short_plan#>>'{metrics,floors}')::integer
       = (v_long_plan#>>'{metrics,floors}')::integer then
    raise exception 'A/B context sensitivity failed: geometry and floors did not change';
  end if;
end
$smoke$;

rollback;

\echo '=== Regrid Context Smoke Tests Passed ==='
