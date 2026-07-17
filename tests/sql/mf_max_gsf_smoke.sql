-- Max-GSF multifamily planner contract smoke tests.
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/mf_max_gsf_smoke.sql
-- Known Nashville fixtures are used; all generated snapshots/candidates roll back.

\set ON_ERROR_STOP on
\echo '=== Max-GSF Multifamily Smoke Tests ==='

begin;

do $smoke$
declare
  intent jsonb := jsonb_build_object('smoke_nonce',gen_random_uuid());
  c1 jsonb;
  c2 jsonb;
  sf_context jsonb;
  plan_a jsonb;
  plan_b jsonb;
  result jsonb;
  buildout jsonb;
  bad_pin jsonb;
  base_row planner.context_snapshot%rowtype;
  high_ratio_id uuid;
  persisted public.siteplanner_candidate%rowtype;
  persisted_session public.siteplanner_session%rowtype;
  overlap_sqft numeric;
  capture numeric;
  total_score numeric;
begin
  buildout:=public.fn_max_buildout(553450,'multifamily');
  if buildout ? 'error' then raise exception 'max buildout failed: %',buildout; end if;
  if (buildout->>'max_gsf')::numeric<100000
     or (buildout->>'at_stories')::integer<2
     or nullif(buildout->>'at_unit_gsf','') is null
     or nullif(buildout->>'units_at_max','') is null then
    raise exception 'max-GSF frontier is incomplete: %',buildout;
  end if;

  c1:=public.fn_compile_planner_context(553450,'multifamily',intent);
  c2:=public.fn_compile_planner_context(553450,'multifamily',intent);
  if c1 ? 'error' then raise exception 'context compile failed: %',c1; end if;
  if c1->>'cache_status'<>'miss' or c2->>'cache_status'<>'hit' then
    raise exception 'bounded snapshot reuse failed: first %, second %',c1->>'cache_status',c2->>'cache_status';
  end if;
  if c1->>'context_id'<>c2->>'context_id' or c1->>'context_hash'<>c2->>'context_hash' then
    raise exception 'cache reuse changed snapshot identity';
  end if;
  if c1#>>'{solver_brief,objective_profile,profile}'<>'maximize_gsf_v1'
     or (c1#>>'{solver_brief,objective_profile,weights,zoning_utilization}')::numeric<0.50 then
    raise exception 'GSF objective profile missing: %',c1#>'{solver_brief,objective_profile}';
  end if;
  if c1#>>'{solver_brief,max_buildout,max_gsf}' is null
     or c1#>>'{solver_brief,entitlement_capacity,lot_sqft}' is null then
    raise exception 'solver brief lost buildout or entitlement capacity';
  end if;
  if c1#>>'{solver_brief,precedent_priors,depth_semantics}'<>'whole_building_oriented_bounding_box_not_bar_depth'
     or c1#>>'{solver_brief,precedent_priors,bar_depth_source}'<>'typology_or_program_spec_only' then
    raise exception 'Regrid OBB depth is not clearly excluded from bar depth';
  end if;
  if (c1#>>'{solver_brief,precedent_priors,sample_size}')::integer<15
     and c1#>>'{solver_brief,precedent_priors,confidence}'='high' then
    raise exception 'small precedent sample incorrectly reported high confidence';
  end if;
  if (c1#>>'{solver_brief,program_prior,corridor_width_ft,value}')::numeric<5.5 then
    raise exception 'interim multifamily corridor width is below 5.5 feet';
  end if;
  if c1#>>'{solver_brief,hard_constraints,coverage_semantics,max_coverage_pct}'<>'building_footprint_only'
     or c1#>>'{solver_brief,hard_constraints,coverage_semantics,max_impervious_pct}'<>'building_plus_parking_plus_drives_and_other_impervious' then
    raise exception 'building coverage and impervious coverage are conflated';
  end if;

  plan_a:=public.fn_generate_mf_site_plan_v2(
    553450,'multifamily',17,'[]'::jsonb,null,false,(c1->>'context_id')::uuid
  );
  plan_b:=public.fn_generate_mf_site_plan_v2(
    553450,'multifamily',17,'[]'::jsonb,null,false,(c1->>'context_id')::uuid
  );
  if plan_a ? 'error' or plan_b ? 'error' then
    raise exception 'production MF solve failed: %, %',plan_a->>'error',plan_b->>'error';
  end if;
  if plan_a->>'generator_version'<>'mf_max_gsf_v1'
     or plan_a->>'score_version'<>'context_score_gsf_v1' then
    raise exception 'production solver lineage is stale: %, %',plan_a->>'generator_version',plan_a->>'score_version';
  end if;
  if plan_a->'buildings'<>plan_b->'buildings'
     or plan_a->'parking'<>plan_b->'parking'
     or plan_a->'drives'<>plan_b->'drives'
     or plan_a->'metrics'<>plan_b->'metrics' then
    raise exception 'same context + seed + pins is not deterministic';
  end if;
  if (plan_a#>>'{metrics,stalls}')::integer<(plan_a#>>'{metrics,stalls_required}')::integer then
    raise exception 'renderable plan has a parking shortfall';
  end if;
  if not coalesce((plan_a#>>'{metrics,hard_constraints_passed}')::boolean,false)
     or (plan_a#>>'{metrics,drive_components}')::integer<>1 then
    raise exception 'renderable plan lacks hard-constraint/access receipts';
  end if;

  capture:=(plan_a#>>'{metrics,gsf_capture_pct}')::numeric/100.0;
  total_score:=(plan_a->>'score_total')::numeric;
  if capture<0.85 and total_score>capture*0.65+0.002 then
    raise exception 'under-85%% capture plan scored too highly: capture %, score %',capture,total_score;
  end if;
  if capture<0.85 and plan_a#>>'{metrics,yield_clamp_reason}' is null then
    raise exception 'under-85%% capture lacks a clamp reason';
  end if;

  with elems as (
    select 'building' kind,row_number() over() id,
      st_transform(st_setsrid(st_geomfromgeojson(e->>'geom'),4326),2274) g
    from jsonb_array_elements(plan_a->'buildings') e
    union all
    select 'parking',row_number() over(),
      st_transform(st_setsrid(st_geomfromgeojson(e->>'geom'),4326),2274)
    from jsonb_array_elements(plan_a->'parking') e
    union all
    select 'drive',row_number() over(),
      st_transform(st_setsrid(st_geomfromgeojson(e->>'geom'),4326),2274)
    from jsonb_array_elements(plan_a->'drives') e
  )
  select coalesce(sum(st_area(st_intersection(a.g,b.g))),0)
    into overlap_sqft
  from elems a join elems b on (a.kind,a.id)<(b.kind,b.id);
  if overlap_sqft>1 then
    raise exception 'building/parking/drive overlap exceeds tolerance: % sqft',overlap_sqft;
  end if;

  bad_pin:=jsonb_build_array(jsonb_build_object(
    'floors',4,
    'geom',jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(jsonb_build_array(
      jsonb_build_array(-87.5,36.8),jsonb_build_array(-87.49,36.8),
      jsonb_build_array(-87.49,36.81),jsonb_build_array(-87.5,36.81),
      jsonb_build_array(-87.5,36.8)
    )))
  ));
  result:=public.fn_generate_mf_site_plan_v2(
    553450,'multifamily',17,bad_pin,null,false,(c1->>'context_id')::uuid
  );
  if result->>'error'<>'planner_pin_outside_parcel' then
    raise exception 'outside pin did not fail closed: %',result;
  end if;

  sf_context:=public.fn_compile_planner_context(553450,'single_family',jsonb_build_object('smoke_nonce',gen_random_uuid()));
  result:=public.fn_generate_mf_site_plan_v2(
    553450,'multifamily',17,'[]'::jsonb,null,false,(sf_context->>'context_id')::uuid
  );
  if result->>'error'<>'planner_context_use_mismatch' then
    raise exception 'single-family context entered the MF generator: %',result;
  end if;

  select * into base_row
  from planner.context_snapshot
  where id=(c1->>'context_id')::uuid;
  insert into planner.context_snapshot(
    parcel_ogc_fid,selected_use,typology,context_version,context_hash,
    generation_allowed,compiled_context,solver_brief,provenance,
    objective_profile,is_current
  ) values (
    base_row.parcel_ogc_fid,base_row.selected_use,base_row.typology,
    'planner_context_hard_parking_test','parking-test-'||gen_random_uuid(),true,
    base_row.compiled_context,
    jsonb_set(base_row.solver_brief,'{parking,ratio}',to_jsonb(10::numeric),true),
    base_row.provenance,base_row.objective_profile,false
  ) returning id into high_ratio_id;
  result:=public.fn_generate_mf_site_plan_v2(
    553450,'multifamily',17,'[]'::jsonb,null,false,high_ratio_id
  );
  if result->>'error' not in ('planner_parking_infeasible','planner_parking_shortfall') then
    raise exception 'forced parking shortage rendered instead of rejecting: %',result;
  end if;

  result:=public.fn_generate_mf_site_plan_v2(
    553450,'multifamily',19,'[]'::jsonb,null,true,(c1->>'context_id')::uuid
  );
  if result ? 'error' or not coalesce((result->>'persisted')::boolean,false) then
    raise exception 'candidate persistence failed: %',result;
  end if;
  select * into persisted_session from public.siteplanner_session where id=(result->>'session_id')::uuid;
  select * into persisted from public.siteplanner_candidate where id=(result->>'candidate_id')::uuid;
  if persisted_session.context_id<>(c1->>'context_id')::uuid
     or persisted.context_id<>(c1->>'context_id')::uuid
     or persisted_session.generator_version<>'mf_max_gsf_v1'
     or persisted.generator_version<>'mf_max_gsf_v1'
     or persisted.score_version<>'context_score_gsf_v1'
     or persisted.metrics#>>'{target_max_gsf}' is null
     or persisted.metrics#>>'{yield_clamp_reason}' is null then
    raise exception 'persisted candidate lost context/GSF lineage';
  end if;
end
$smoke$;

rollback;

\echo '=== Max-GSF Multifamily Smoke Tests Passed ==='
