-- Solver convergence, phase 1 (docs/SOLVER_CONVERGENCE_SPEC.md):
-- 1) The parking-search -> stall-recount -> bar-regrow pass now ITERATES
--    (bounded at 4 passes, exit when GSF stops improving) instead of running
--    once and returning at the first feasible answer.
-- 2) Mandatory residual-capacity accounting: before returning, the solver
--    quantifies remaining stall/impervious/coverage/story capacity and the
--    optimistic land bill for the missing GSF.
-- 3) Capture classification: below 85%, results carry optimization_status =
--    feasible_optimization_incomplete OR feasible_demonstrably_constrained,
--    the latter only with a quantified proof object (constraint_proven).
--    A bare clamp string is no longer the final answer.
-- Applied as an md5-guarded in-database patch; capture can only rise
-- (pass 1 is byte-identical to the old single pass).

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '26b7e759b94611090109977c28c0b4d2' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 26b7e759b94611090109977c28c0b4d2', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $c1o$  yield_clamp_reason text; gsf_capture numeric;$c1o$, $c1n$  yield_clamp_reason text; gsf_capture numeric;
  growth_pass integer; prev_gfa numeric;
  resid_stall_headroom integer; resid_impervious numeric; resid_coverage numeric; resid_stories integer;
  gap_gsf numeric; addl_units integer; addl_stalls integer; min_land_needed numeric;
  opt_status text; opt_proof jsonb;$c1n$);
  v_new := replace(v_new, $c2o$  -- The first parking solve can shorten bars and expose new land beside the
  -- connected drive network. Search that land once more, but only outside the
  -- directional building envelope, then regrow the preserved bars toward the
  -- legal GSF target supported by the new parking count.
  IF n_bars>0 AND parks IS NOT NULL AND drives IS NOT NULL THEN
    SELECT ST_UnaryUnion(ST_Collect(bg))
      INTO bars_u
    FROM unnest(bars_arr) AS bg;

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,1) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,1) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    supplemental_parking := ST_CollectionExtract(
      ST_Difference(
        ST_Intersection(
          ST_Difference(parking_rot,rot),
          ST_Buffer(drives,stall_d)
        ),
        avoid
      ),
      3
    );

    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO supplemental_parking
    FROM (SELECT (ST_Dump(supplemental_parking)).geom) x
    WHERE ST_Area(x.geom)>300;

    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
      parks := ST_UnaryUnion(ST_Union(parks,supplemental_parking));
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
      flags := flags || to_jsonb('second_pass_parking_outside_building_envelope'::text);

      parking_units_cap := floor(GREATEST(
        n_stalls-GREATEST(
          1,
          ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer
        ),
        0
      )/NULLIF(ratio,0))::integer;
      max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);

      desired_fp := LEAST(
        capacity_fp,
        target_gsf/GREATEST(floors,1),
        max_gsf_by_parking/GREATEST(floors,1),
        COALESCE(cov_cap_sqft,capacity_fp),
        COALESCE(max_impervious_sqft-tot_park-tot_drive,capacity_fp)
      );
      desired_fp := GREATEST(0,desired_fp);

      IF capacity_fp>0
         AND desired_fp>tot_fp+1
         AND desired_fp>=COALESCE(array_length(bars_capacity_arr,1),0)*bar_min*bar_depth THEN
        bar_scale := LEAST(1,desired_fp/capacity_fp);
        filtered_bars := '{}'::geometry[];
        tot_fp := 0;
        n_bars := 0;
        FOR k IN 1..COALESCE(array_length(bars_capacity_arr,1),0) LOOP
          new_len := (ST_XMax(bars_capacity_arr[k])-ST_XMin(bars_capacity_arr[k]))*bar_scale;
          bar := ST_MakeEnvelope(
            ST_XMin(bars_capacity_arr[k]),ST_YMin(bars_capacity_arr[k]),
            ST_XMin(bars_capacity_arr[k])+new_len,ST_YMax(bars_capacity_arr[k]),2274
          );
          filtered_bars := filtered_bars || bar;
          tot_fp := tot_fp+ST_Area(bar);
          n_bars := n_bars+1;
        END LOOP;
        bars_arr := filtered_bars;
        gfa := tot_fp*floors;
        IF gfa<target_gsf-1 THEN
          yield_clamp_reason := COALESCE(yield_clamp_reason,'parking_land');
        ELSIF yield_clamp_reason='parking_land' THEN
          yield_clamp_reason := NULL;
        END IF;
        flags := flags || to_jsonb('bars_regrown_after_second_parking_pass'::text);
      END IF;
    END IF;
  END IF;$c2o$, $c2n$  -- CONVERGENCE (docs/SOLVER_CONVERGENCE_SPEC.md section 2-3): the
  -- parking-search -> stall-recount -> bar-regrow pass repeats until no
  -- meaningful GSF improvement remains (bounded at 4 passes). A single pass
  -- was the old behavior; land freed beside re-grown bars is now used
  -- instead of being left on the table. Deterministic: no randomness, and
  -- each pass's regrow derives from the same capacity bars.
  FOR growth_pass IN 1..4 LOOP
    prev_gfa := gfa;
  -- The first parking solve can shorten bars and expose new land beside the
  -- connected drive network. Search that land once more, but only outside the
  -- directional building envelope, then regrow the preserved bars toward the
  -- legal GSF target supported by the new parking count.
  IF n_bars>0 AND parks IS NOT NULL AND drives IS NOT NULL THEN
    SELECT ST_UnaryUnion(ST_Collect(bg))
      INTO bars_u
    FROM unnest(bars_arr) AS bg;

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,1) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,1) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    supplemental_parking := ST_CollectionExtract(
      ST_Difference(
        ST_Intersection(
          ST_Difference(parking_rot,rot),
          ST_Buffer(drives,stall_d)
        ),
        avoid
      ),
      3
    );

    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO supplemental_parking
    FROM (SELECT (ST_Dump(supplemental_parking)).geom) x
    WHERE ST_Area(x.geom)>300;

    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
      parks := ST_UnaryUnion(ST_Union(parks,supplemental_parking));
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
      flags := flags || to_jsonb('second_pass_parking_outside_building_envelope'::text);

      parking_units_cap := floor(GREATEST(
        n_stalls-GREATEST(
          1,
          ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer
        ),
        0
      )/NULLIF(ratio,0))::integer;
      max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);

      desired_fp := LEAST(
        capacity_fp,
        target_gsf/GREATEST(floors,1),
        max_gsf_by_parking/GREATEST(floors,1),
        COALESCE(cov_cap_sqft,capacity_fp),
        COALESCE(max_impervious_sqft-tot_park-tot_drive,capacity_fp)
      );
      desired_fp := GREATEST(0,desired_fp);

      IF capacity_fp>0
         AND desired_fp>tot_fp+1
         AND desired_fp>=COALESCE(array_length(bars_capacity_arr,1),0)*bar_min*bar_depth THEN
        bar_scale := LEAST(1,desired_fp/capacity_fp);
        filtered_bars := '{}'::geometry[];
        tot_fp := 0;
        n_bars := 0;
        FOR k IN 1..COALESCE(array_length(bars_capacity_arr,1),0) LOOP
          new_len := (ST_XMax(bars_capacity_arr[k])-ST_XMin(bars_capacity_arr[k]))*bar_scale;
          bar := ST_MakeEnvelope(
            ST_XMin(bars_capacity_arr[k]),ST_YMin(bars_capacity_arr[k]),
            ST_XMin(bars_capacity_arr[k])+new_len,ST_YMax(bars_capacity_arr[k]),2274
          );
          filtered_bars := filtered_bars || bar;
          tot_fp := tot_fp+ST_Area(bar);
          n_bars := n_bars+1;
        END LOOP;
        bars_arr := filtered_bars;
        gfa := tot_fp*floors;
        IF gfa<target_gsf-1 THEN
          yield_clamp_reason := COALESCE(yield_clamp_reason,'parking_land');
        ELSIF yield_clamp_reason='parking_land' THEN
          yield_clamp_reason := NULL;
        END IF;
        flags := flags || to_jsonb('bars_regrown_after_second_parking_pass'::text);
      END IF;
    END IF;
  END IF;
    EXIT WHEN gfa <= prev_gfa + GREATEST(50, prev_gfa*0.005);
  END LOOP;$c2n$);
  v_new := replace(v_new, $c3o$  gsf_capture := LEAST(1,gfa/NULLIF(target_gsf,0));$c3o$, $c3n$  gsf_capture := LEAST(1,gfa/NULLIF(target_gsf,0));
  -- Residual-capacity accounting (docs/SOLVER_CONVERGENCE_SPEC.md section
  -- 3-4): a clamp string is not proof. Quantify what remains and classify.
  gap_gsf := GREATEST(0, target_gsf - gfa);
  resid_stall_headroom := GREATEST(n_stalls - req_stalls, 0);
  resid_impervious := CASE WHEN max_impervious_sqft IS NULL THEN NULL
                           ELSE GREATEST(max_impervious_sqft - actual_impervious, 0) END;
  resid_coverage := CASE WHEN cov_cap_sqft IS NULL THEN NULL ELSE GREATEST(cov_cap_sqft - tot_fp, 0) END;
  resid_stories := GREATEST(COALESCE(legal_floor_cap, floors) - floors, 0);
  addl_units := CASE WHEN max_unit_gsf > 0 THEN ceil(gap_gsf / max_unit_gsf)::integer ELSE 0 END;
  addl_stalls := GREATEST(ceil(addl_units * ratio)::integer - resid_stall_headroom, 0);
  -- Optimistic land bill for the missing GSF: stall bays at packing
  -- efficiency, plus new footprint only when no story headroom remains.
  min_land_needed := addl_stalls * (stall_w*stall_d) / 0.90
                   + CASE WHEN resid_stories > 0 THEN 0 ELSE gap_gsf / GREATEST(floors,1) END;
  IF gsf_capture >= 0.85 THEN
    opt_status := 'feasible';
  ELSIF resid_impervious IS NOT NULL AND min_land_needed > resid_impervious + 1 THEN
    -- Even the OPTIMISTIC bill for the missing GSF exceeds the remaining
    -- impervious budget: the shortfall is a property of the lot, not an
    -- unfinished search.
    opt_status := 'feasible_demonstrably_constrained';
  ELSE
    opt_status := 'feasible_optimization_incomplete';
  END IF;
  opt_proof := jsonb_build_object(
    'binding_constraint', COALESCE(yield_clamp_reason,'none'),
    'required_additional_gsf', round(gap_gsf),
    'additional_units_at_selected_program', addl_units,
    'additional_stalls_required', GREATEST(ceil(addl_units*ratio)::integer,0),
    'remaining_stall_capacity', resid_stall_headroom,
    'remaining_impervious_sqft', CASE WHEN resid_impervious IS NULL THEN NULL ELSE round(resid_impervious) END,
    'remaining_building_coverage_sqft', CASE WHEN resid_coverage IS NULL THEN NULL ELSE round(resid_coverage) END,
    'remaining_stories', resid_stories,
    'minimum_land_needed_sqft', round(min_land_needed),
    'constraint_proven', opt_status = 'feasible_demonstrably_constrained'
  );$c3n$);
  v_new := replace(v_new, $c4o$'gsf_capture_pct', round(gsf_capture*100,1),$c4o$, $c4n$'gsf_capture_pct', round(gsf_capture*100,1),
                'optimization_status', opt_status,
                'optimization_proof', opt_proof,$c4n$);

  IF md5(v_new) <> '587f6dbdc965a36cffad07945e27f7a0' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 587f6dbdc965a36cffad07945e27f7a0', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
