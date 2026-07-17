-- Typed-generator context use guard smoke tests.
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/planner_context_use_guard_smoke.sql
-- All context snapshots created by this test are rolled back.

\set ON_ERROR_STOP on
\echo '=== Planner Context Use Guard Smoke Tests ==='

begin;

do $smoke$
declare
  v_sf_context jsonb;
  v_mf_context jsonb;
  v_result jsonb;
begin
  -- Regression parcel from the shipped failure: 2600 W Heiman.
  v_sf_context := public.fn_compile_planner_context(553450, 'single_family', '{}'::jsonb);
  if v_sf_context ? 'error' then
    raise exception 'could not compile single-family regression context: %', v_sf_context->>'error';
  end if;

  v_result := public.fn_generate_mf_site_plan_v2(
    553450,
    'multifamily',
    1,
    '[]'::jsonb,
    null,
    false,
    (v_sf_context->>'context_id')::uuid
  );
  if v_result->>'error' <> 'planner_context_use_mismatch' then
    raise exception 'MF generator accepted single-family context: %', v_result;
  end if;
  if v_result->>'context_selected_use' <> 'single_family'
     or v_result->>'expected_typology' <> 'multifamily' then
    raise exception 'MF mismatch response lost expected/actual use metadata: %', v_result;
  end if;

  v_result := public.fn_generate_th_site_plan(
    553450,
    1,
    '[]'::jsonb,
    null,
    false,
    (v_sf_context->>'context_id')::uuid
  );
  if v_result->>'error' <> 'planner_context_use_mismatch' then
    raise exception 'Townhome generator accepted single-family context: %', v_result;
  end if;

  -- A valid multifamily context must still work for both typed products.
  v_mf_context := public.fn_compile_planner_context(669046, 'multifamily', '{}'::jsonb);
  if v_mf_context ? 'error' then
    raise exception 'could not compile multifamily control context: %', v_mf_context->>'error';
  end if;

  v_result := public.fn_generate_mf_site_plan_v2(
    669046,
    'multifamily',
    17,
    '[]'::jsonb,
    null,
    false,
    (v_mf_context->>'context_id')::uuid
  );
  if v_result ? 'error' then
    raise exception 'MF generator rejected a valid multifamily context: %', v_result;
  end if;

  v_result := public.fn_generate_th_site_plan(
    669046,
    17,
    '[]'::jsonb,
    null,
    false,
    (v_mf_context->>'context_id')::uuid
  );
  if v_result ? 'error' then
    raise exception 'Townhome generator rejected a valid multifamily context: %', v_result;
  end if;

  -- The caller-controlled typology argument cannot override the context.
  v_result := public.fn_generate_mf_site_plan_v2(
    669046,
    'single_family',
    17,
    '[]'::jsonb,
    null,
    false,
    (v_mf_context->>'context_id')::uuid
  );
  if v_result->>'error' <> 'planner_context_use_mismatch' then
    raise exception 'MF generator accepted a caller typology mismatch: %', v_result;
  end if;
end
$smoke$;

rollback;

\echo '=== Planner Context Use Guard Smoke Tests Passed ==='
