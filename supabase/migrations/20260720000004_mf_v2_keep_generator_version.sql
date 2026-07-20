-- Keep generator_version at 'mf_max_gsf_v1': the max-GSF contract smoke tests
-- (tests/sql/mf_max_gsf_smoke.sql) pin this version in three assertions, and
-- the pinned best-effort change is additive — every softened solve already
-- self-identifies via the 'pinned_best_effort_v1' flag, which is the honest
-- lineage marker. Reverts only the version literal introduced by
-- mf_v2_pinned_best_effort; the best-effort behavior itself stays.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '14ee1f8d29a5d4109501337684d5d764' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 14ee1f8d29a5d4109501337684d5d764', md5(v_src);
  END IF;

  v_new := replace(v_src, $v$'mf_max_gsf_v1_1'$v$, $v$'mf_max_gsf_v1'$v$);

  IF md5(v_new) <> 'dba0804dd8aae1ff9fd8f25e75e2fa56' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected dba0804dd8aae1ff9fd8f25e75e2fa56', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
