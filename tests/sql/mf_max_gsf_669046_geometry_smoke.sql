-- Parcel-specific regression for the July 20 max-buildout contract failure.
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/mf_max_gsf_669046_geometry_smoke.sql

\set ON_ERROR_STOP on
\echo '=== 669046 Max-GSF Geometry Regression ==='

begin;

do $smoke$
declare
  context_result jsonb;
  plan_result jsonb;
  overlap_sqft numeric;
begin
  context_result:=public.fn_compile_planner_context(
    669046,
    'multifamily',
    jsonb_build_object('geometry_smoke_nonce',gen_random_uuid())
  );
  if context_result ? 'error' then
    raise exception '669046 context compile failed: %',context_result;
  end if;

  plan_result:=public.fn_generate_mf_site_plan_v2(
    669046,
    'multifamily',
    17,
    '[]'::jsonb,
    null,
    false,
    (context_result->>'context_id')::uuid
  );
  if plan_result ? 'error' then
    raise exception '669046 solve failed: %',plan_result;
  end if;

  if (plan_result#>>'{metrics,floors}')::integer<>4
     or (plan_result#>>'{metrics,gsf_capture_pct}')::numeric<60
     or (plan_result#>>'{metrics,stalls}')::integer<(plan_result#>>'{metrics,stalls_required}')::integer
     or (plan_result#>>'{metrics,drive_components}')::integer<>1
     or not coalesce((plan_result#>>'{metrics,hard_constraints_passed}')::boolean,false) then
    raise exception '669046 lost frontier or hard-constraint receipts: %',plan_result;
  end if;

  if not (plan_result->'flags' ? 'max_buildout_program_frontier_consumed') then
    raise exception '669046 did not consume the nested GSF-max frontier: %',plan_result->'flags';
  end if;

  with elems as (
    select 'building' kind,row_number() over() id,
      st_transform(st_setsrid(st_geomfromgeojson(e->>'geom'),4326),2274) g
    from jsonb_array_elements(plan_result->'buildings') e
    union all
    select 'parking',row_number() over(),
      st_transform(st_setsrid(st_geomfromgeojson(e->>'geom'),4326),2274)
    from jsonb_array_elements(plan_result->'parking') e
    union all
    select 'drive',row_number() over(),
      st_transform(st_setsrid(st_geomfromgeojson(e->>'geom'),4326),2274)
    from jsonb_array_elements(plan_result->'drives') e
  )
  select coalesce(sum(st_area(st_intersection(a.g,b.g))),0)
    into overlap_sqft
  from elems a
  join elems b on (a.kind,a.id)<(b.kind,b.id);

  if overlap_sqft>1 then
    raise exception '669046 building/parking/drive overlap exceeds tolerance: % sqft',overlap_sqft;
  end if;
end
$smoke$;

rollback;

\echo '=== 669046 Max-GSF Geometry Regression Passed ==='
