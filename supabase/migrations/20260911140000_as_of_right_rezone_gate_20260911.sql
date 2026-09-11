-- As-of-right gate (Eric product rule): default planner path is highest & best as-of-right.
-- Non-as-of-right compiles require p_user_intent.rezone=true OR scenario=rezone.
-- Otherwise REFUSE before inventing MF/design context on commercial-only lots.
-- When rezone is set, annotate result as not-by-right.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'fn_compile_planner_context'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'fn_compile_planner_context_ungated'
  ) THEN
    ALTER FUNCTION public.fn_compile_planner_context(integer, text, jsonb)
      RENAME TO fn_compile_planner_context_ungated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_compile_planner_context(
  p_ogc_fid integer,
  p_use text,
  p_user_intent jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_selected_use text;
  v_typology text;
  v_use_key text;
  v_uses jsonb;
  v_permitted boolean := false;
  v_rezone boolean := false;
  v_entitlement_path text := 'as_of_right';
  v_result jsonb;
BEGIN
  IF p_ogc_fid IS NULL OR p_ogc_fid <= 0 THEN
    RETURN jsonb_build_object('error', 'valid p_ogc_fid is required');
  END IF;
  IF p_use IS NULL OR btrim(p_use) = '' OR length(p_use) > 64 THEN
    RETURN jsonb_build_object('error', 'valid p_use is required');
  END IF;
  IF p_user_intent IS NULL THEN
    p_user_intent := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_user_intent) <> 'object' THEN
    RETURN jsonb_build_object('error', 'p_user_intent must be a JSON object');
  END IF;

  v_selected_use := lower(btrim(p_use));
  v_typology := CASE
    WHEN v_selected_use IN ('multi_family', 'multifamily', 'mf') THEN 'multifamily'
    WHEN v_selected_use IN ('single_family', 'sf', 'two_family', 'duplex') THEN 'single_family'
    ELSE v_selected_use
  END;
  v_use_key := CASE
    WHEN v_typology = 'multifamily' THEN 'multi_family'
    WHEN v_selected_use IN ('two_family', 'duplex') THEN 'two_family'
    WHEN v_typology = 'single_family' THEN 'single_family'
    ELSE v_selected_use
  END;

  v_uses := public.fn_resolve_permitted_uses(p_ogc_fid);
  IF v_uses ? 'error' THEN
    RETURN v_uses;
  END IF;

  v_permitted := coalesce((v_uses -> 'as_of_right' ->> v_use_key)::boolean, false);
  v_rezone := coalesce((p_user_intent ->> 'rezone')::boolean, false)
    OR lower(coalesce(p_user_intent ->> 'scenario', '')) = 'rezone';

  IF NOT v_permitted AND NOT v_rezone THEN
    RETURN jsonb_build_object(
      'error', 'selected_use_not_as_of_right',
      'message',
        'Selected use is not as-of-right for this parcel. Pass p_user_intent.rezone=true (or scenario=rezone) for an explicit not-by-right rezone scenario.',
      'entitlement_path', 'as_of_right_required',
      'not_by_right', false,
      'parcel_ogc_fid', p_ogc_fid,
      'selected_use', v_selected_use,
      'use_key', v_use_key,
      'permitted_uses', v_uses,
      'suggested_primary_use', v_uses ->> 'suggested_primary_use',
      'generation_allowed', false
    );
  END IF;

  IF v_rezone AND NOT v_permitted THEN
    v_entitlement_path := 'rezone_not_by_right';
  ELSE
    v_entitlement_path := 'as_of_right';
  END IF;

  v_result := public.fn_compile_planner_context_ungated(p_ogc_fid, p_use, p_user_intent);
  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'compile returned null');
  END IF;
  IF v_result ? 'error' THEN
    RETURN v_result;
  END IF;

  v_result := v_result
    || jsonb_build_object(
      'entitlement_path', v_entitlement_path,
      'not_by_right', (v_entitlement_path = 'rezone_not_by_right')
    );

  IF jsonb_typeof(v_result -> 'context') = 'object' THEN
    v_result := jsonb_set(
      v_result,
      '{context,entitlement_path}',
      to_jsonb(v_entitlement_path),
      true
    );
    v_result := jsonb_set(
      v_result,
      '{context,not_by_right}',
      to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
      true
    );
    IF jsonb_typeof(v_result #> '{context,legal}') = 'object' THEN
      v_result := jsonb_set(
        v_result,
        '{context,legal,entitlement_path}',
        to_jsonb(v_entitlement_path),
        true
      );
      v_result := jsonb_set(
        v_result,
        '{context,legal,not_by_right}',
        to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
        true
      );
      v_result := jsonb_set(
        v_result,
        '{context,legal,rezone_scenario}',
        to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
        true
      );
    END IF;
    IF v_entitlement_path = 'rezone_not_by_right' THEN
      v_result := jsonb_set(
        v_result,
        '{context,flags}',
        coalesce(v_result #> '{context,flags}', '[]'::jsonb)
          || jsonb_build_array('rezone_scenario_not_by_right'),
        true
      );
    END IF;
  END IF;

  IF jsonb_typeof(v_result -> 'solver_brief') = 'object' THEN
    v_result := jsonb_set(
      v_result,
      '{solver_brief,entitlement_path}',
      to_jsonb(v_entitlement_path),
      true
    );
    v_result := jsonb_set(
      v_result,
      '{solver_brief,not_by_right}',
      to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
      true
    );
    IF v_entitlement_path = 'rezone_not_by_right' THEN
      v_result := jsonb_set(
        v_result,
        '{solver_brief,flags}',
        coalesce(v_result #> '{solver_brief,flags}', '[]'::jsonb)
          || jsonb_build_array('rezone_scenario_not_by_right'),
        true
      );
    END IF;
  END IF;

  IF v_entitlement_path = 'rezone_not_by_right' THEN
    IF coalesce((v_result #>> '{context,physical,developable}')::boolean,
                (v_result #>> '{solver_brief,hard_constraints,developable}')::boolean,
                true) THEN
      v_result := jsonb_set(v_result, '{generation_allowed}', 'true'::jsonb, true);
      IF jsonb_typeof(v_result -> 'context') = 'object' THEN
        v_result := jsonb_set(v_result, '{context,generation_allowed}', 'true'::jsonb, true);
      END IF;
      IF jsonb_typeof(v_result -> 'solver_brief') = 'object' THEN
        v_result := jsonb_set(v_result, '{solver_brief,generation_allowed}', 'true'::jsonb, true);
      END IF;
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_compile_planner_context(integer, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_compile_planner_context_ungated(integer, text, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_compile_planner_context_ungated(integer, text, jsonb) FROM PUBLIC, anon, authenticated;
