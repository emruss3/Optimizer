-- P1-3 v1 conclusion: REVERT the orientation sweep entirely — falsified by
-- head-to-head evidence, twice.
--   * Proxy comparison of two banded frames regressed the flagship fixture
--     (669046: feasible/100% capture -> constrained) — parking and
--     circulation dominate the real solve; band area cannot rank frames.
--   * Even the narrowed "rescue" (incumbent places no bar, alternate does)
--     regressed 408769 from 13,650 GSF / 62.9% capture (fallback placers in
--     the default frame) to 6,120 GSF / 28.2% (banded alternate frame):
--     the slab-scan/packer/compact-plex grammars exist precisely for
--     band-less frames and outperform a banded alternate.
--   * Across the random-24 acceptance sample the sweep converted zero
--     refusals (both depth-terminals stayed terminal with alternates
--     considered).
-- Honest configuration comparison requires comparing REAL solves; that is
-- the phase-3 multi-solve restructure, not an in-function proxy. This
-- migration restores the generator byte-exactly to its pre-sweep source
-- (md5 096a1dba2466e39a1563ff86b10127dd) and drops the diagnostic copy.

DO $mig$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';
  IF md5(v_src) <> 'bc9651a1ab424a20192558a73c768901' THEN
    RAISE EXCEPTION 'live md5 % unexpected', md5(v_src);
  END IF;
  v_src := replace(v_src, $d1$  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
  cand_theta numeric; best_theta numeric; cand_score numeric; best_score numeric := -1;
  entry_az numeric; cgeom geometry; cbox geometry; centry geometry; ccomp record;
  cyy numeric; cx0 numeric; cy0 numeric; cx1 numeric; cy1 numeric; cand_arr numeric[];
  inc_score numeric := -1; inc_thr numeric := 0;
  cavail numeric; cbd numeric; cbm numeric; clead boolean; cthr numeric;
$d1$, $d2$  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
$d2$);
  v_src := replace(v_src, $d3$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
      entry_az := ST_Azimuth(seg_a, seg_b);
$d3$, $d4$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
$d4$);
  v_src := replace(v_src, $d5$  theta := pi()/2 - theta;

  -- P1-3 ORIENTATION RESCUE (convergence spec phase 3): the OBB long axis
  -- is a prior, not a verdict — but the band-area proxy scored here cannot
  -- honestly rank two frames that BOTH place bars (parking and circulation
  -- dominate the real solve; a proxy win was observed to regress a solved
  -- fixture). So alternates are considered ONLY when the incumbent frame
  -- cannot place even one qualifying bar; a rescuing frame must itself
  -- place at least one. Banded parcels solve byte-identically to before;
  -- fail-class parcels get a second frame instead of the slab/packer
  -- fallbacks operating in a hopeless frame.
  cand_arr := ARRAY[theta, theta + pi()/2];
  IF entry_az IS NOT NULL THEN
    cand_theta := pi()/2 - entry_az;
    IF abs(sin(cand_theta - theta)) > 0.05 AND abs(cos(cand_theta - theta)) > 0.05 THEN
      cand_arr := cand_arr || cand_theta;
    END IF;
  END IF;
  best_theta := theta;
  FOR i IN 1..array_length(cand_arr,1) LOOP
    cand_theta := cand_arr[i];
    cgeom := ST_Rotate(ST_Buffer(g2274, -LEAST(v_front, v_side, v_rear)), -cand_theta, anchor);
    cgeom := (SELECT geom FROM (SELECT (ST_Dump(cgeom)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);
    IF cgeom IS NULL OR ST_IsEmpty(cgeom) THEN CONTINUE; END IF;
    centry := ST_Rotate(entry_pt, -cand_theta, anchor);
    cx0 := ST_XMin(cgeom); cy0 := ST_YMin(cgeom); cx1 := ST_XMax(cgeom); cy1 := ST_YMax(cgeom);
    IF abs(ST_Y(centry) - cy0) <= abs(ST_Y(centry) - cy1) THEN
      cbox := ST_Intersection(cgeom, ST_MakeEnvelope(
        cx0 + GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), cy0 + GREATEST(v_front - LEAST(v_front, v_side, v_rear), 0),
        cx1 - GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), cy1 - GREATEST(v_rear - LEAST(v_front, v_side, v_rear), 0), 2274));
    ELSE
      cbox := ST_Intersection(cgeom, ST_MakeEnvelope(
        cx0 + GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), cy0 + GREATEST(v_rear - LEAST(v_front, v_side, v_rear), 0),
        cx1 - GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), cy1 - GREATEST(v_front - LEAST(v_front, v_side, v_rear), 0), 2274));
    END IF;
    IF cbox IS NULL OR ST_IsEmpty(cbox) THEN CONTINUE; END IF;
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
  END LOOP;
  IF best_theta <> theta THEN
    theta := best_theta;
    flags := flags || to_jsonb('orientation_swept_alternate_axis'::text);
  END IF;

  parcel_rot := ST_Rotate($d5$, $d6$  theta := pi()/2 - theta;

  parcel_rot := ST_Rotate($d6$);
  IF md5(v_src) <> '096a1dba2466e39a1563ff86b10127dd' THEN
    RAISE EXCEPTION 'reverted md5 % does not match pre-sweep source', md5(v_src);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_src || '$fnbody$';
  DROP FUNCTION IF EXISTS public.zz_diag_mf_presweep(integer, text, integer, jsonb, uuid, boolean, uuid);
END
$mig$;
