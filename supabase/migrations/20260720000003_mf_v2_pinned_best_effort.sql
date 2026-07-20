-- Dynamic edit loop: pinned solves are BEST-EFFORT, never dead-end refusals.
--
-- Live repro (2717 W Heiman): resizing a bar streams its footprint as a pin;
-- the inflated GFA pushed minimum program units past the parking cap and the
-- generator hard-refused every re-solve ('planner_parking_infeasible'), so
-- the canvas froze — "nothing dynamically changes". A user's hand outranks
-- the program band: with pins present, the six post-solve gates (program-min
-- units, unit-size band, coverage, impervious, FAR, parking shortfall) now
-- return the honest best-effort plan carrying explicit flags
-- (*_pinned / parking_below_ratio / pinned_best_effort_v1) instead of an
-- error. Unpinned auto-generation keeps every hard refusal. Truly
-- unrenderable states (pin outside parcel, missing/disconnected drives, no
-- parking geometry) still refuse. generator_version -> mf_max_gsf_v1_1.
--
-- Applied as an in-database patch: the DO block reads the live source,
-- md5-guards the pre-image (aborts if the function changed since this patch
-- was authored), applies exact hunk replacements, md5-verifies the result,
-- then re-creates the function. Byte-exact or nothing.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> 'f98a7bc82d78e04d5faf47e328ea0dbf' THEN
    RAISE EXCEPTION 'fn_generate_mf_site_plan_v2 pre-image md5 % does not match expected f98a7bc82d78e04d5faf47e328ea0dbf — source changed since patch was authored; re-derive the patch', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $h1o$  IF units<program_min_units THEN
    RETURN jsonb_build_object(
      'error','planner_parking_infeasible',
      'reason','parking or density cannot support achieved GSF within the hard unit-size band',
      'gsf',round(gfa),
      'parking_units_cap',parking_units_cap,
      'minimum_program_units',program_min_units,
      'maximum_program_units',program_max_units,
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'flags',flags
    );
  END IF;
  units := GREATEST(program_min_units,units);$h1o$, $h1n$  IF units<program_min_units THEN
    -- PINNED BEST-EFFORT: a user-pinned footprint outranks the program band.
    -- The edit loop must never dead-end on a refusal — deliver the parking-
    -- and density-capped unit count (fewer, larger units) and say so in
    -- flags. Unpinned auto-generation keeps the hard refusal: the generator
    -- sized those bars itself, so infeasibility there is a real bug signal.
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      units := GREATEST(units, 1);
      flags := flags || to_jsonb('parking_caps_units_below_program_min'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_parking_infeasible',
      'reason','parking or density cannot support achieved GSF within the hard unit-size band',
      'gsf',round(gfa),
      'parking_units_cap',parking_units_cap,
      'minimum_program_units',program_min_units,
      'maximum_program_units',program_max_units,
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'flags',flags
    );
    END IF;
  ELSE
    units := GREATEST(program_min_units,units);
  END IF;$h1n$);
  v_new := replace(v_new, $h2o$  IF actual_unit_gsf < min_unit_gsf - 0.01 OR actual_unit_gsf > max_unit_gsf + 0.01 THEN
    RETURN jsonb_build_object(
      'error','planner_unit_gsf_out_of_band',
      'gsf',round(gfa),
      'units',units,
      'actual_unit_gsf',round(actual_unit_gsf,2),
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'flags',flags
    );
  END IF;
  flags := flags || to_jsonb('unit_gsf_band_hard_pass'::text);$h2o$, $h2n$  IF actual_unit_gsf < min_unit_gsf - 0.01 OR actual_unit_gsf > max_unit_gsf + 0.01 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('unit_gsf_out_of_band_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_unit_gsf_out_of_band',
      'gsf',round(gfa),
      'units',units,
      'actual_unit_gsf',round(actual_unit_gsf,2),
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'flags',flags
    );
    END IF;
  ELSE
    flags := flags || to_jsonb('unit_gsf_band_hard_pass'::text);
  END IF;$h2n$);
  v_new := replace(v_new, $h3o$  IF max_cov IS NOT NULL AND tot_fp>parcel_area*max_cov/100.0+1 THEN
    RETURN jsonb_build_object(
      'error','planner_building_coverage_exceeded',
      'building_footprint_sqft',round(tot_fp),
      'max_building_footprint_sqft',round(parcel_area*max_cov/100.0),
      'flags',flags
    );
  END IF;$h3o$, $h3n$  IF max_cov IS NOT NULL AND tot_fp>parcel_area*max_cov/100.0+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('building_coverage_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_building_coverage_exceeded',
      'building_footprint_sqft',round(tot_fp),
      'max_building_footprint_sqft',round(parcel_area*max_cov/100.0),
      'flags',flags
    );
    END IF;
  END IF;$h3n$);
  v_new := replace(v_new, $h4o$  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1 THEN
    RETURN jsonb_build_object(
      'error','planner_impervious_coverage_exceeded',
      'impervious_sqft',round(actual_impervious),
      'max_impervious_sqft',round(max_impervious_sqft),
      'flags',flags
    );
  END IF;$h4o$, $h4n$  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('impervious_coverage_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_impervious_coverage_exceeded',
      'impervious_sqft',round(actual_impervious),
      'max_impervious_sqft',round(max_impervious_sqft),
      'flags',flags
    );
    END IF;
  END IF;$h4n$);
  v_new := replace(v_new, $h5o$  IF max_far IS NOT NULL AND gfa>max_far*parcel_area+1 THEN
    RETURN jsonb_build_object(
      'error','planner_far_exceeded',
      'gfa_sqft',round(gfa),
      'max_gfa_sqft',round(max_far*parcel_area),
      'flags',flags
    );
  END IF;$h5o$, $h5n$  IF max_far IS NOT NULL AND gfa>max_far*parcel_area+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('far_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_far_exceeded',
      'gfa_sqft',round(gfa),
      'max_gfa_sqft',round(max_far*parcel_area),
      'flags',flags
    );
    END IF;
  END IF;$h5n$);
  v_new := replace(v_new, $h6o$  IF n_stalls<req_stalls THEN
    RETURN jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'flags',flags
    );
  END IF;$h6o$, $h6n$  IF n_stalls<req_stalls THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('parking_below_ratio'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'flags',flags
    );
    END IF;
  END IF;$h6n$);
  v_new := replace(v_new, $h7o$'mf_max_gsf_v1'$h7o$, $h7n$'mf_max_gsf_v1_1'$h7n$);

  IF md5(v_new) <> '14ee1f8d29a5d4109501337684d5d764' THEN
    RAISE EXCEPTION 'patched source md5 % does not match expected 14ee1f8d29a5d4109501337684d5d764 — refusing to apply', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
