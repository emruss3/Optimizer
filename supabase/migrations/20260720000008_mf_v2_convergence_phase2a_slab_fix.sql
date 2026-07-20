-- Convergence phase 2a fix: irregular residual pieces defeated the bbox
-- infill candidate (ST_Covers failed on L-shaped land, zero bars placed).
-- The infill search now scans a bar-depth slab at three vertical anchors
-- inside each residual piece and keeps near-rectangular slab pieces only.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '8a71b8e74a73d729844ea6eb02a79aa0' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 8a71b8e74a73d729844ea6eb02a79aa0', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $g1o$  residual geometry; rpiece record; cand geometry; allowed_add_fp numeric;
  added_this_pass integer; pminx numeric; pmaxx numeric; pminy numeric; pmaxy numeric;
  depth_used numeric;$g1o$, $g1n$  residual geometry; rpiece record; cand geometry; allowed_add_fp numeric;
  added_this_pass integer; pminx numeric; pmaxx numeric; pminy numeric; pmaxy numeric;
  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;$g1n$);
  v_new := replace(v_new, $g2o$        FOR rpiece IN
          SELECT g FROM (SELECT (ST_Dump(residual)).geom AS g) q
          ORDER BY ST_Area(g) DESC, ST_YMin(g), ST_XMin(g)
        LOOP
          EXIT WHEN added_this_pass >= 2 OR allowed_add_fp < 2000;
          pminx := ST_XMin(rpiece.g); pmaxx := ST_XMax(rpiece.g);
          pminy := ST_YMin(rpiece.g); pmaxy := ST_YMax(rpiece.g);
          CONTINUE WHEN (pmaxx-pminx) < 50 OR (pmaxy-pminy) < bar_depth*0.85;
          depth_used := LEAST(bar_depth, (pmaxy-pminy)-1);
          cand := ST_MakeEnvelope(
            pminx+0.5, pminy+0.5,
            LEAST(pmaxx-0.5, pminx+0.5+allowed_add_fp/GREATEST(depth_used,1)),
            pminy+0.5+depth_used, 2274);
          CONTINUE WHEN cand IS NULL OR ST_Area(cand) < 2000;
          CONTINUE WHEN NOT ST_Covers(ST_Buffer(rpiece.g,0.2), cand);
          CONTINUE WHEN NOT ST_DWithin(cand, drives, GREATEST(40,stall_d+aisle/2));
          CONTINUE WHEN NOT ST_DWithin(ST_Centroid(cand), parks, 250);
          bars_arr := bars_arr || cand;
          bars_capacity_arr := bars_capacity_arr || cand;
          capacity_fp := capacity_fp + ST_Area(cand);
          tot_fp := tot_fp + ST_Area(cand);
          n_bars := n_bars + 1;
          gfa := tot_fp*floors;
          allowed_add_fp := allowed_add_fp - ST_Area(cand);
          added_this_pass := added_this_pass + 1;
          flags := flags || to_jsonb('infill_bar_added_from_residual_envelope'::text);
        END LOOP;$g2o$, $g2n$        FOR rpiece IN
          SELECT g FROM (SELECT (ST_Dump(residual)).geom AS g) q
          ORDER BY ST_Area(g) DESC, ST_YMin(g), ST_XMin(g)
        LOOP
          EXIT WHEN added_this_pass >= 2 OR allowed_add_fp < 2000;
          pminy := ST_YMin(rpiece.g); pmaxy := ST_YMax(rpiece.g);
          CONTINUE WHEN (pmaxy-pminy) < bar_depth*0.85 OR ST_Area(rpiece.g) < 2000;
          depth_used := LEAST(bar_depth, (pmaxy-pminy)-1);
          -- Irregular residuals defeat a bbox candidate; scan a bar-depth
          -- slab at three vertical anchors and keep near-rectangular pieces.
          FOR tries IN 0..2 LOOP
            EXIT WHEN added_this_pass >= 2 OR allowed_add_fp < 2000;
            yoff := pminy + 0.5 + (((pmaxy-pminy) - depth_used - 1) / 2.0) * tries;
            slab := ST_Intersection(rpiece.g,
                     ST_MakeEnvelope(ST_XMin(rpiece.g), yoff, ST_XMax(rpiece.g), yoff+depth_used, 2274));
            CONTINUE WHEN slab IS NULL OR ST_IsEmpty(slab);
            FOR spiece IN
              SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(slab,3))).geom AS g) q2
              ORDER BY ST_Area(g) DESC, ST_XMin(g)
            LOOP
              EXIT WHEN added_this_pass >= 2 OR allowed_add_fp < 2000;
              pminx := ST_XMin(spiece.g); pmaxx := ST_XMax(spiece.g);
              CONTINUE WHEN (pmaxx-pminx) < 50 OR ST_Area(spiece.g) < 2000;
              CONTINUE WHEN (pmaxx-pminx)*depth_used > ST_Area(spiece.g)*1.05;
              cand := ST_MakeEnvelope(
                pminx+0.5, yoff+0.1,
                LEAST(pmaxx-0.5, pminx+0.5+allowed_add_fp/GREATEST(depth_used,1)),
                yoff+depth_used-0.1, 2274);
              CONTINUE WHEN cand IS NULL OR ST_Area(cand) < 2000;
              CONTINUE WHEN NOT ST_Covers(ST_Buffer(spiece.g,0.3), cand);
              CONTINUE WHEN NOT ST_DWithin(cand, drives, GREATEST(40,stall_d+aisle/2));
              CONTINUE WHEN NOT ST_DWithin(ST_Centroid(cand), parks, 250);
              bars_arr := bars_arr || cand;
              bars_capacity_arr := bars_capacity_arr || cand;
              capacity_fp := capacity_fp + ST_Area(cand);
              tot_fp := tot_fp + ST_Area(cand);
              n_bars := n_bars + 1;
              gfa := tot_fp*floors;
              allowed_add_fp := allowed_add_fp - ST_Area(cand);
              added_this_pass := added_this_pass + 1;
              flags := flags || to_jsonb('infill_bar_added_from_residual_envelope'::text);
            END LOOP;
          END LOOP;
        END LOOP;$g2n$);

  IF md5(v_new) <> '2bab6e6327f55858549ea364dbd4d68a' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 2bab6e6327f55858549ea364dbd4d68a', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
