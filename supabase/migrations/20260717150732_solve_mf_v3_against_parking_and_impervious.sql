-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.

do $patch$
declare
  d text;
  old text;
  new text;
begin
  d := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  old := $old$
  IF n_bars > 2 THEN
    amen_dist := NULL;
    FOR k IN 1..array_length(bars_arr, 1) LOOP
      d := ST_Distance(ST_Rotate(bars_arr[k], theta, anchor), entry_pt);
      IF amen_dist IS NULL OR d < amen_dist THEN amen_dist := d; amen_idx := k; END IF;
    END LOOP;
    amen := bars_arr[amen_idx];
    tot_fp := tot_fp - ST_Area(amen);
    n_bars := n_bars - 1;
  END IF;

  gfa := tot_fp * floors;

  -- HARD caps: FAR then density, satisfied by trimming floors (flagged)
  IF max_far IS NOT NULL AND tot_fp > 0 THEN
    far_floor_cap := GREATEST(1, floor(max_far * parcel_area / tot_fp)::int);
    IF floors > far_floor_cap THEN
      floors := far_floor_cap;
      flags := flags || to_jsonb('floors_clamped_by_far'::text);
    END IF;
  END IF;
  gfa := tot_fp * floors;
  units := GREATEST(1, floor(gfa / avg_unit))::int;
  IF units_max IS NOT NULL AND units > units_max THEN
    floors := GREATEST(1, floor(units_max * avg_unit / NULLIF(tot_fp, 0))::int);
    gfa := tot_fp * floors;
    units := LEAST(GREATEST(1, floor(gfa / avg_unit))::int, units_max);
    flags := flags || to_jsonb('density_clamped_units'::text);
  END IF;
$old$;

  new := $new$
  -- Do not sacrifice a full residential bar for an amenity before the hard
  -- development frontier is solved. Amenity allocation follows feasibility.
  amen := NULL;
  amen_idx := 0;
  flags := flags || to_jsonb('amenity_bar_conversion_disabled_max_gsf'::text);

  gfa := tot_fp*floors;
  IF max_far IS NOT NULL AND tot_fp>0 THEN
    far_floor_cap := GREATEST(1,floor(max_far*parcel_area/tot_fp)::integer);
    IF floors>far_floor_cap THEN
      floors := far_floor_cap;
      yield_clamp_reason := COALESCE(yield_clamp_reason,'far');
      flags := flags || to_jsonb('gsf_target_clamped_by_far'::text);
    END IF;
  END IF;
  gfa := tot_fp*floors;

  -- Parking and drives are now geometrically fixed. Adapt only the final bar,
  -- then final bars, so the result approaches the GSF target while satisfying
  -- parking-land and impervious-land hard limits.
  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
  parking_units_cap := floor(n_stalls/NULLIF(ratio,0))::integer;
  max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);

  actual_impervious := tot_fp+tot_park+tot_drive;
  WHILE max_impervious_sqft IS NOT NULL
        AND actual_impervious>max_impervious_sqft+1
        AND n_bars>0 LOOP
    excess_area := actual_impervious-max_impervious_sqft;
    last_bar := bars_arr[array_length(bars_arr,1)];
    last_area := ST_Area(last_bar);
    IF last_area-excess_area >= bar_min*bar_depth THEN
      shrink_len := excess_area/bar_depth;
      bars_arr[array_length(bars_arr,1)] := ST_MakeEnvelope(
        ST_XMin(last_bar),ST_YMin(last_bar),
        ST_XMax(last_bar)-shrink_len,ST_YMax(last_bar),2274);
      tot_fp := tot_fp-excess_area;
    ELSE
      tot_fp := tot_fp-last_area;
      IF array_length(bars_arr,1)>1 THEN
        bars_arr := bars_arr[1:array_length(bars_arr,1)-1];
      ELSE
        bars_arr := '{}'::geometry[];
      END IF;
      n_bars := n_bars-1;
    END IF;
    actual_impervious := tot_fp+tot_park+tot_drive;
    yield_clamp_reason := 'impervious_coverage';
    flags := flags || to_jsonb('gsf_target_clamped_by_impervious_coverage'::text);
  END LOOP;

  gfa := tot_fp*floors;
  WHILE gfa>max_gsf_by_parking+1 AND n_bars>0 LOOP
    excess_area := (gfa-max_gsf_by_parking)/GREATEST(floors,1);
    last_bar := bars_arr[array_length(bars_arr,1)];
    last_area := ST_Area(last_bar);
    IF last_area-excess_area >= bar_min*bar_depth THEN
      shrink_len := excess_area/bar_depth;
      bars_arr[array_length(bars_arr,1)] := ST_MakeEnvelope(
        ST_XMin(last_bar),ST_YMin(last_bar),
        ST_XMax(last_bar)-shrink_len,ST_YMax(last_bar),2274);
      tot_fp := tot_fp-excess_area;
    ELSE
      tot_fp := tot_fp-last_area;
      IF array_length(bars_arr,1)>1 THEN
        bars_arr := bars_arr[1:array_length(bars_arr,1)-1];
      ELSE
        bars_arr := '{}'::geometry[];
      END IF;
      n_bars := n_bars-1;
    END IF;
    gfa := tot_fp*floors;
    yield_clamp_reason := 'parking_land';
    flags := flags || to_jsonb('gsf_target_clamped_by_parking'::text);
  END LOOP;

  IF n_bars=0 AND COALESCE(array_length(pin_geoms,1),0)=0 THEN
    RETURN jsonb_build_object(
      'error','planner_parking_infeasible',
      'reason','no residential bar remains after hard parking and impervious solve',
      'flags',flags
    );
  END IF;
  gfa := tot_fp*floors;
$new$;

  if position(old in d)=0 then
    raise exception 'v3 post-placement block not found';
  end if;
  d := replace(d,old,new);

  old := '  units := GREATEST(1, floor(gfa / avg_unit))::int;';
  new := E'  -- Unit count is a program variable inside the achieved GSF frontier.\n  parking_units_cap := floor(n_stalls/NULLIF(ratio,0))::integer;\n  program_min_units := ceil(gfa/NULLIF(max_unit_gsf,0))::integer;\n  units := LEAST(COALESCE(units_max,target_units),target_units,parking_units_cap);\n  IF units<program_min_units THEN\n    RETURN jsonb_build_object(\n      ''error'',''planner_parking_infeasible'',\n      ''reason'',''parking cannot support achieved GSF within the unit-size frontier'',\n      ''gsf'',round(gfa),\n      ''parking_units_cap'',parking_units_cap,\n      ''minimum_program_units'',program_min_units,\n      ''flags'',flags\n    );\n  END IF;\n  units := GREATEST(program_min_units,units);\n  actual_unit_gsf := gfa/NULLIF(units,0);';
  if position(old in d)=0 then
    raise exception 'v3 unit programming marker not found';
  end if;
  d := replace(d,old,new);

  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver. Building quantity is trimmed only as required by FAR, building coverage, impervious coverage, parking land and unit-size feasibility.';
