-- P1-3 v1 correction 2: the rescue dry-run must mirror the placer's
-- shallow-frame adaptations. Probing 669046 after the rescue gate showed
-- the incumbent frame scoring zero bands because the dry run used the
-- pre-adjustment bar depth (up to 65 ft) plus a mandatory parking lead --
-- while the real placer reduces depth to 45, drops to a 28 ft compact
-- plex, or skips the lead entirely on shallow frames. Each candidate now
-- dry-runs with the depth, min-length, and lead the real placer would use
-- in that frame, and one-bar thresholds are per-frame. The rescue fires
-- only when the incumbent truly cannot place one bar and the alternate can.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '0f141cd5fd2d74edc8cd932298842409' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 0f141cd5fd2d74edc8cd932298842409', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $f1o$  inc_score numeric := -1;
$f1o$, $f1n$  inc_score numeric := -1; inc_thr numeric := 0;
  cavail numeric; cbd numeric; cbm numeric; clead boolean; cthr numeric;
$f1n$);
  v_new := replace(v_new, $f2o$    IF cbox IS NULL OR ST_IsEmpty(cbox) THEN CONTINUE; END IF;
    cbox := (SELECT geom FROM (SELECT (ST_Dump(cbox)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);
    cx0 := ST_XMin(cbox); cy0 := ST_YMin(cbox); cx1 := ST_XMax(cbox); cy1 := ST_YMax(cbox);
    cand_score := 0;
    cyy := cy0 + 2 + stall_d + aisle;
    WHILE cyy + bar_depth <= cy1 - 0.5 LOOP
      FOR ccomp IN SELECT (ST_Dump(ST_Intersection(cbox,
                     ST_MakeEnvelope(cx0, cyy, cx1, cyy + bar_depth, 2274)))).geom AS geom LOOP
        IF ST_Area(ccomp.geom) >= bar_min * bar_depth * 0.85 THEN
          cand_score := cand_score + ST_Area(ccomp.geom);
        END IF;
      END LOOP;
      cyy := cyy + bar_depth + drive_gap;
    END LOOP;
    IF i = 1 THEN
      best_score := cand_score;
      inc_score := cand_score;
    ELSIF inc_score < bar_min * bar_depth
      AND cand_score >= bar_min * bar_depth
      AND cand_score > best_score * 1.05 + 1 THEN
      best_score := cand_score;
      best_theta := cand_theta;
    END IF;
$f2o$, $f2n$    IF cbox IS NULL OR ST_IsEmpty(cbox) THEN CONTINUE; END IF;
    cbox := (SELECT geom FROM (SELECT (ST_Dump(cbox)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);
    cx0 := ST_XMin(cbox); cy0 := ST_YMin(cbox); cx1 := ST_XMax(cbox); cy1 := ST_YMax(cbox);
    -- Mirror the placer's shallow-frame adaptations for THIS frame: the dry
    -- run must use the depth, min-length, and lead the real placer would.
    cavail := cy1 - cy0; cbd := bar_depth; cbm := bar_min; clead := true;
    IF cavail >= drive_gap + 45 + 1 AND cavail < (stall_d + aisle) + cbd + 6 THEN
      cbd := 45;
    ELSIF cavail < (stall_d + aisle) + cbd + 6 THEN
      cbd := GREATEST(45, cavail - (stall_d + aisle) - 6);
      IF cbd + stall_d + aisle + 6 > cavail THEN
        clead := false;
        cbd := GREATEST(40, LEAST(cbd, cavail - 4));
      END IF;
    END IF;
    IF cbd > cavail - 4 THEN
      IF cavail >= 34 THEN
        cbd := GREATEST(28, cavail - 6); cbm := LEAST(cbm, 40); clead := false;
      ELSE
        cbd := 0; -- frame is depth-unbuildable: score 0 against a real threshold
      END IF;
    END IF;
    cthr := GREATEST(cbm, 40) * GREATEST(cbd, 28);
    cand_score := 0;
    IF cbd > 0 THEN
      IF NOT clead THEN
        cyy := cy0 + 1;
      ELSIF cavail < 2 * cbd + drive_gap + 20 AND cavail >= drive_gap + cbd + 1 THEN
        cyy := cy0 + 0.5 + drive_gap;
      ELSE
        cyy := cy0 + 2 + stall_d + aisle;
      END IF;
      WHILE cyy + cbd <= cy1 - 0.5 LOOP
        FOR ccomp IN SELECT (ST_Dump(ST_Intersection(cbox,
                       ST_MakeEnvelope(cx0, cyy, cx1, cyy + cbd, 2274)))).geom AS geom LOOP
          IF ST_Area(ccomp.geom) >= cbm * cbd * 0.85 THEN
            cand_score := cand_score + ST_Area(ccomp.geom);
          END IF;
        END LOOP;
        cyy := cyy + cbd + drive_gap;
      END LOOP;
    END IF;
    IF i = 1 THEN
      best_score := cand_score;
      inc_score := cand_score;
      inc_thr := cthr;
    ELSIF inc_score < inc_thr
      AND cand_score >= cthr
      AND cand_score > best_score * 1.05 + 1 THEN
      best_score := cand_score;
      best_theta := cand_theta;
    END IF;
$f2n$);

  IF md5(v_new) <> 'bc9651a1ab424a20192558a73c768901' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected bc9651a1ab424a20192558a73c768901', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
