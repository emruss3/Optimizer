-- P1-3 v1: ORIENTATION SWEEP (convergence spec phase 3, first item).
-- The generator aligned bands to the OBB long axis unconditionally; on
-- near-square, L-shaped, and flag parcels the 90-degree alternate (or the
-- frontage-edge frame) can fit an extra band because band count is a
-- quantized fit of (bar_depth + drive_gap) pitches into the frame height.
-- Each candidate frame is scored by dry-running the band grid -- the same
-- pitch, the same 0.85*bar_min*bar_depth component filter, a uniform lead
-- offset -- inside that frame's own directional-setback box. An alternate
-- frame wins only when it beats the incumbent by 5% + 1 sqft of placeable
-- band area, so rectangular parcels solve byte-identically to before and
-- the flag 'orientation_swept_alternate_axis' marks every changed frame.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '096a1dba2466e39a1563ff86b10127dd' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 096a1dba2466e39a1563ff86b10127dd', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $w1o$  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
$w1o$, $w1n$  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
  cand_theta numeric; best_theta numeric; cand_score numeric; best_score numeric := -1;
  entry_az numeric; cgeom geometry; cbox geometry; centry geometry; ccomp record;
  cyy numeric; cx0 numeric; cy0 numeric; cx1 numeric; cy1 numeric; cand_arr numeric[];
$w1n$);
  v_new := replace(v_new, $w2o$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
$w2o$, $w2n$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
      entry_az := ST_Azimuth(seg_a, seg_b);
$w2n$);
  v_new := replace(v_new, $w3o$  theta := pi()/2 - theta;

  parcel_rot := ST_Rotate($w3o$, $w3n$  theta := pi()/2 - theta;

  -- P1-3 ORIENTATION SWEEP (convergence spec phase 3): the OBB long axis is
  -- a prior, not a verdict. Score each candidate frame by dry-running the
  -- band grid (same pitch, same component filter) inside that frame's own
  -- directional-setback box; an alternate frame must beat the incumbent by
  -- 5% of placeable band area to win. Ties keep the long-axis default, so
  -- rectangular parcels solve byte-identically to the pre-sweep planner.
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
    ELSIF cand_score > best_score * 1.05 + 1 THEN
      best_score := cand_score;
      best_theta := cand_theta;
    END IF;
  END LOOP;
  IF best_theta <> theta THEN
    theta := best_theta;
    flags := flags || to_jsonb('orientation_swept_alternate_axis'::text);
  END IF;

  parcel_rot := ST_Rotate($w3n$);

  IF md5(v_new) <> 'a047e8d68120f5e277e0142a4cfc4f68' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected a047e8d68120f5e277e0142a4cfc4f68', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
