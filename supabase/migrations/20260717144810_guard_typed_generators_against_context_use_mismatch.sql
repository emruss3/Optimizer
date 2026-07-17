-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.
--
-- Critical invariant: a typed generator must never mass a product from a
-- context compiled for another use. This closes the failure where a
-- single-family snapshot supplied Table-A setbacks/FAR while the MF generator
-- produced apartment massing.
--
-- The accessor already enforces parcel identity. These guards additionally
-- enforce context use/typology identity before any planning value is read.

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  if position('planner_context_use_mismatch' in v_definition) = 0 then
    v_old := $old$
  IF bres ? 'error' THEN
    RETURN jsonb_build_object('error', bres->>'error');
  END IF;
  IF NOT COALESCE((bres->>'generation_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('error', 'planner_generation_not_allowed',
      'flags', COALESCE(bres#>'{solver_brief,flags}', '[]'::jsonb));
  END IF;
  brief := bres->'solver_brief';
$old$;
    v_new := $new$
  IF bres ? 'error' THEN
    RETURN jsonb_build_object('error', bres->>'error');
  END IF;
  brief := bres->'solver_brief';
  IF lower(btrim(COALESCE(p_typology, ''))) <> 'multifamily'
     OR lower(btrim(COALESCE(brief->>'typology', ''))) <> 'multifamily'
     OR lower(btrim(COALESCE(brief->>'selected_use', ''))) NOT IN ('multifamily', 'multi_family', 'mf') THEN
    RETURN jsonb_build_object(
      'error', 'planner_context_use_mismatch',
      'expected_typology', 'multifamily',
      'requested_typology', lower(btrim(COALESCE(p_typology, ''))),
      'context_typology', brief->>'typology',
      'context_selected_use', brief->>'selected_use'
    );
  END IF;
  IF NOT COALESCE((bres->>'generation_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('error', 'planner_generation_not_allowed',
      'flags', COALESCE(bres#>'{solver_brief,flags}', '[]'::jsonb));
  END IF;
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'MF generator guard insertion marker not found';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;

  v_definition := pg_get_functiondef(
    'public.fn_generate_th_site_plan(integer,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  if position('planner_context_use_mismatch' in v_definition) = 0 then
    v_old := $old$
  IF bres ? 'error' THEN
    RETURN jsonb_build_object('error', bres->>'error');
  END IF;
  IF NOT COALESCE((bres->>'generation_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('error', 'planner_generation_not_allowed',
      'flags', COALESCE(bres#>'{solver_brief,flags}', '[]'::jsonb));
  END IF;
  brief := bres->'solver_brief';
$old$;
    v_new := $new$
  IF bres ? 'error' THEN
    RETURN jsonb_build_object('error', bres->>'error');
  END IF;
  brief := bres->'solver_brief';
  IF lower(btrim(COALESCE(brief->>'typology', ''))) <> 'multifamily'
     OR lower(btrim(COALESCE(brief->>'selected_use', ''))) NOT IN ('multifamily', 'multi_family', 'mf') THEN
    RETURN jsonb_build_object(
      'error', 'planner_context_use_mismatch',
      'expected_typology', 'multifamily',
      'requested_product', 'townhome',
      'context_typology', brief->>'typology',
      'context_selected_use', brief->>'selected_use'
    );
  END IF;
  IF NOT COALESCE((bres->>'generation_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('error', 'planner_generation_not_allowed',
      'flags', COALESCE(bres#>'{solver_brief,flags}', '[]'::jsonb));
  END IF;
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'Townhome generator guard insertion marker not found';
    end if;
    v_definition := replace(v_definition, v_old, v_new);
    v_definition := replace(
      v_definition,
      $old$
  IF COALESCE(brief->>'typology', '') <> 'multifamily' THEN
    RETURN jsonb_build_object('error', 'townhome_requires_multifamily_context');
  END IF;
$old$,
      E'\n  -- Context use and typology are guarded immediately after the brief is loaded.\n'
    );
    execute v_definition;
  end if;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Context-driven multifamily generator. Rejects parcel mismatch, use/typology mismatch, blocked generation, and invalid hard constraints before producing geometry.';

comment on function public.fn_generate_th_site_plan(integer,integer,jsonb,uuid,boolean,uuid) is
  'Context-driven townhome generator using a multifamily legal context. Rejects parcel mismatch and any non-multifamily context before producing geometry.';
