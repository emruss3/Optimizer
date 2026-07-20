-- Solver convergence phase 2a (docs/SOLVER_CONVERGENCE_SPEC.md section 2):
-- capacity bars are not the ceiling. Two new moves INSIDE the convergence
-- loop, both deterministic and capped by live headroom so no downstream
-- gate can trip:
-- (a) in-envelope supplemental parking — stall land beside the drive
--     network INSIDE the building envelope (the outside-only search missed
--     exactly the land the residual proof pointed at);
-- (b) infill bars carved from residual envelope land, bounded by live
--     parking/coverage/impervious headroom and the access contract (within
--     drive reach, within 250 ft of parking).
-- The residual-capacity proof measures the effect on every parcel.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '587f6dbdc965a36cffad07945e27f7a0' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 587f6dbdc965a36cffad07945e27f7a0', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $f1o$  opt_status text; opt_proof jsonb;$f1o$, $f1n$  opt_status text; opt_proof jsonb;
  residual geometry; rpiece record; cand geometry; allowed_add_fp numeric;
  added_this_pass integer; pminx numeric; pmaxx numeric; pminy numeric; pmaxy numeric;
  depth_used numeric;$f1n$);
  v_new := replace(v_new, $f2o$    EXIT WHEN gfa <= prev_gfa + GREATEST(50, prev_gfa*0.005);
  END LOOP;$f2o$, $f2n$    -- PHASE 2 (spec section 2): capacity bars are not the ceiling.
    -- (a) IN-ENVELOPE supplemental parking: stall land beside the drive
    --     network INSIDE the building envelope — the outside-only search
    --     missed exactly the land the residual proof points at.
    IF n_bars>0 AND parks IS NOT NULL AND drives IS NOT NULL THEN
      SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
      SELECT ST_UnaryUnion(ST_Collect(g)) INTO avoid
      FROM (VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
        (CASE WHEN greens IS NULL THEN NULL ELSE greens END),
        (drives),
        (parks)
      ) obstacle(g)
      WHERE g IS NOT NULL;
      supplemental_parking := ST_CollectionExtract(
        ST_Difference(ST_Intersection(rot, ST_Buffer(drives,stall_d)), avoid), 3);
      SELECT ST_UnaryUnion(ST_Collect(x.geom)) INTO supplemental_parking
      FROM (SELECT (ST_Dump(supplemental_parking)).geom) x WHERE ST_Area(x.geom)>300;
      IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
        parks := ST_UnaryUnion(ST_Union(parks,supplemental_parking));
        tot_park := ST_Area(parks);
        n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
        parking_units_cap := floor(GREATEST(n_stalls-GREATEST(1,ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer),0)/NULLIF(ratio,0))::integer;
        max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);
        flags := flags || to_jsonb('in_envelope_supplemental_parking'::text);
      END IF;
    END IF;

    -- (b) INFILL BARS from residual envelope land, capped by LIVE parking /
    --     coverage / impervious headroom (no downstream gate can trip) and
    --     honoring the access contract: near a drive, near parking.
    allowed_add_fp := GREATEST(0, LEAST(
      COALESCE(cov_cap_sqft - tot_fp, capacity_fp),
      COALESCE(max_impervious_sqft - tot_park - tot_drive - tot_fp, capacity_fp),
      GREATEST(max_gsf_by_parking - gfa, 0)/GREATEST(floors,1),
      GREATEST(target_gsf - gfa, 0)/GREATEST(floors,1)
    ));
    IF n_bars>0 AND allowed_add_fp > 2000
       AND drives IS NOT NULL AND parks IS NOT NULL THEN
      SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
      residual := ST_CollectionExtract(ST_Difference(rot,
        ST_UnaryUnion(ST_Collect(ARRAY[
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,12) END,
          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
          ST_Buffer(drives,2),
          ST_Buffer(parks,1),
          CASE WHEN greens IS NULL THEN NULL ELSE ST_Buffer(greens,1) END
        ]))), 3);
      added_this_pass := 0;
      IF residual IS NOT NULL AND NOT ST_IsEmpty(residual) THEN
        FOR rpiece IN
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
        END LOOP;
      END IF;
      IF added_this_pass > 0 AND gfa >= target_gsf-1 AND yield_clamp_reason = 'parking_land' THEN
        yield_clamp_reason := NULL;
      END IF;
    END IF;

    EXIT WHEN gfa <= prev_gfa + GREATEST(50, prev_gfa*0.005);
  END LOOP;$f2n$);

  IF md5(v_new) <> '8a71b8e74a73d729844ea6eb02a79aa0' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 8a71b8e74a73d729844ea6eb02a79aa0', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
