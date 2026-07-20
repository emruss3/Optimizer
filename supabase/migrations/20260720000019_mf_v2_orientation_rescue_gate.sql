-- P1-3 v1 correction: the orientation sweep becomes a RESCUE gate.
-- Live probe after the first patch showed the flagship fixture (669046)
-- switching frames on a proxy win and REGRESSING from its solved state:
-- raw placeable band area cannot honestly rank two frames that both place
-- bars, because parking and circulation dominate the real solve. The
-- alternate frame is now considered only when the incumbent cannot place
-- a single qualifying bar (score < bar_min*bar_depth) and the alternate
-- can. Fail-class parcels gain a second frame; every banded parcel solves
-- byte-identically to the pre-sweep planner.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> 'a047e8d68120f5e277e0142a4cfc4f68' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected a047e8d68120f5e277e0142a4cfc4f68', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $r1o$  cyy numeric; cx0 numeric; cy0 numeric; cx1 numeric; cy1 numeric; cand_arr numeric[];
$r1o$, $r1n$  cyy numeric; cx0 numeric; cy0 numeric; cx1 numeric; cy1 numeric; cand_arr numeric[];
  inc_score numeric := -1;
$r1n$);
  v_new := replace(v_new, $r2o$  -- P1-3 ORIENTATION SWEEP (convergence spec phase 3): the OBB long axis is
  -- a prior, not a verdict. Score each candidate frame by dry-running the
  -- band grid (same pitch, same component filter) inside that frame's own
  -- directional-setback box; an alternate frame must beat the incumbent by
  -- 5% of placeable band area to win. Ties keep the long-axis default, so
  -- rectangular parcels solve byte-identically to the pre-sweep planner.
$r2o$, $r2n$  -- P1-3 ORIENTATION RESCUE (convergence spec phase 3): the OBB long axis
  -- is a prior, not a verdict — but the band-area proxy scored here cannot
  -- honestly rank two frames that BOTH place bars (parking and circulation
  -- dominate the real solve; a proxy win was observed to regress a solved
  -- fixture). So alternates are considered ONLY when the incumbent frame
  -- cannot place even one qualifying bar; a rescuing frame must itself
  -- place at least one. Banded parcels solve byte-identically to before;
  -- fail-class parcels get a second frame instead of the slab/packer
  -- fallbacks operating in a hopeless frame.
$r2n$);
  v_new := replace(v_new, $r3o$    IF i = 1 THEN
      best_score := cand_score;
    ELSIF cand_score > best_score * 1.05 + 1 THEN
      best_score := cand_score;
      best_theta := cand_theta;
    END IF;
$r3o$, $r3n$    IF i = 1 THEN
      best_score := cand_score;
      inc_score := cand_score;
    ELSIF inc_score < bar_min * bar_depth
      AND cand_score >= bar_min * bar_depth
      AND cand_score > best_score * 1.05 + 1 THEN
      best_score := cand_score;
      best_theta := cand_theta;
    END IF;
$r3n$);

  IF md5(v_new) <> '0f141cd5fd2d74edc8cd932298842409' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 0f141cd5fd2d74edc8cd932298842409', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
