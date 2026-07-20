-- Already applied to Supabase project okxrvetbzpoazrybhcqj on 2026-07-20.
-- Source-controlled for environment parity and regression prevention.

create or replace function public.fn_max_buildout(
  p_ogc_fid integer,
  p_typology text default 'multifamily'::text
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  ctx jsonb;
  ts public.typology_spec%rowtype;
  v_lot numeric;
  v_usable numeric;
  v_density numeric;
  v_height numeric;
  v_isr numeric;
  v_side numeric;
  v_far numeric;
  far_uncapped boolean;
  stall_sf numeric;
  pk_ratio numeric;
  fl_h numeric;
  max_stories integer;
  s integer;
  ug numeric;
  units numeric;
  gsf numeric;
  footprint numeric;
  cap_units numeric;
  land_cap numeric;
  binding text;
  best_gsf numeric := 0;
  best jsonb;
  best_units numeric := 0;
  best_units_pt jsonb;
  ladder jsonb := '[]'::jsonb;
  story_best jsonb;
  story_best_gsf numeric;
  v_unit_gsf_min constant numeric := 750;
  v_unit_gsf_max constant numeric := 1550;
begin
  select * into ts
  from public.typology_spec
  where typology = p_typology;

  if not found or ts.avg_unit_gsf is null then
    return jsonb_build_object(
      'error', 'max_buildout not defined for typology: ' || p_typology
    );
  end if;

  ctx := public.fn_resolve_design_context(p_ogc_fid, p_typology);
  if ctx ? 'error' then
    return ctx;
  end if;

  v_lot := nullif(ctx #>> '{entitlement_capacity,lot_sqft}', '')::numeric;
  v_density := nullif(ctx #>> '{density_max_du_acre,value}', '')::numeric;
  v_height := coalesce(
    nullif(ctx #>> '{height_max_ft,value}', '')::numeric,
    ts.floor_height_ft * 3
  );
  v_isr := coalesce(nullif(ctx #>> '{max_isr,value}', '')::numeric, 0.9);
  v_side := coalesce(nullif(ctx #>> '{setbacks,side,value}', '')::numeric, 5);
  v_far := nullif(ctx #>> '{far_max,value}', '')::numeric;
  far_uncapped := coalesce(
    nullif(ctx #>> '{entitlement_capacity,far_uncapped_for_mf}', '')::boolean,
    false
  );
  pk_ratio := ts.surface_parking_ratio;
  stall_sf := ts.stall_land_sf;
  fl_h := coalesce(ts.floor_height_ft, ts.floor_to_floor_ft, 11);

  if v_lot is null or v_lot <= 0 or fl_h is null or fl_h <= 0 then
    return jsonb_build_object(
      'error', 'max_buildout source contract incomplete',
      'parcel_ogc_fid', p_ogc_fid,
      'typology', p_typology
    );
  end if;

  select st_area(st_buffer((st_dump(geom_2274)).geom, -v_side))
    into v_usable
  from public.parcels
  where ogc_fid = p_ogc_fid;

  v_usable := coalesce(v_usable, v_lot * 0.8);
  max_stories := greatest(1, floor(v_height / fl_h)::integer);
  cap_units := coalesce(v_density, 1e9) * v_lot / 43560.0;

  for s in 1..max_stories loop
    story_best_gsf := 0;
    story_best := null;

    for ug in
      select unnest(array[750, 950, 1150, 1350, 1550]::numeric[])
    loop
      land_cap := least(v_usable, v_isr * v_lot);
      units := greatest(
        0,
        floor(least(cap_units, land_cap / (ug / s + pk_ratio * stall_sf)))
      );
      gsf := units * ug;

      if v_far is not null and not far_uncapped then
        units := greatest(0, floor(least(units, (v_far * v_lot) / ug)));
        gsf := units * ug;
      end if;

      footprint := case when s > 0 then gsf / s else 0 end;
      binding := case
        when units >= floor(cap_units) then 'density(units)'
        when v_far is not null
             and not far_uncapped
             and gsf + ug > v_far * v_lot then 'far'
        when v_isr * v_lot < v_usable then 'impervious_coverage'
        else 'land_after_parking'
      end;

      if gsf > story_best_gsf then
        story_best_gsf := gsf;
        story_best := jsonb_build_object(
          'stories', s,
          'max_gsf', round(gsf),
          'units', units::integer,
          'unit_gsf', ug,
          'footprint_sqft', round(footprint),
          'binding', binding
        );
      end if;

      if units > best_units
         or (
           units = best_units
           and gsf > coalesce((best_units_pt ->> 'gsf')::numeric, 0)
         ) then
        best_units := units;
        best_units_pt := jsonb_build_object(
          'units', units::integer,
          'unit_gsf', ug,
          'gsf', round(gsf),
          'stories', s,
          'footprint_sqft', round(footprint),
          'binding', binding
        );
      end if;
    end loop;

    if story_best is not null then
      ladder := ladder || story_best;
      if story_best_gsf > best_gsf then
        best_gsf := story_best_gsf;
        best := story_best;
      end if;
    end if;
  end loop;

  if best is null then
    return jsonb_build_object(
      'error', 'max_buildout frontier is empty',
      'parcel_ogc_fid', p_ogc_fid,
      'typology', p_typology
    );
  end if;

  return jsonb_build_object(
    'contract_version', 'max_buildout_v3',
    'parcel_ogc_fid', p_ogc_fid,
    'typology', p_typology,
    'max_gsf', (best ->> 'max_gsf')::integer,
    'at_stories', (best ->> 'stories')::integer,
    'at_unit_gsf', (best ->> 'unit_gsf')::numeric,
    'units_at_max', (best ->> 'units')::integer,
    'footprint_at_max', (best ->> 'footprint_sqft')::integer,
    'unit_gsf_min', v_unit_gsf_min,
    'unit_gsf_max', v_unit_gsf_max,
    'binding_constraint', best ->> 'binding',
    'program_frontier', jsonb_build_object(
      'gsf_max_option', best,
      'units_max_option', best_units_pt,
      'unit_gsf_band', jsonb_build_object(
        'min', v_unit_gsf_min,
        'max', v_unit_gsf_max,
        'hard_constraint', true
      ),
      'note', 'Both are legal maxima on different objectives; every program between them is feasible only inside the hard unit-GSF band.'
    ),
    'stories_ladder', ladder,
    'entitlement_capacity', ctx -> 'entitlement_capacity',
    'assumptions', jsonb_build_object(
      'unit_gsf_band', '750-1550 hard',
      'unit_gsf_min', v_unit_gsf_min,
      'unit_gsf_max', v_unit_gsf_max,
      'integer_units', true,
      'parking_ratio', pk_ratio,
      'stall_land_sf', stall_sf,
      'floor_height_ft', fl_h,
      'usable_land_sqft', round(v_usable),
      'usable_basis', 'uniform side-setback inset (directional pending frontage)'
    ),
    'note', 'Objective: MAXIMIZE GSF. Density caps units, not SF. Precedents shape form only. Unit GSF is a hard programming constraint.'
  );
end
$function$;

comment on function public.fn_max_buildout(integer,text) is
  'Read-only integer-unit max-GSF frontier. Contract v3 exposes a hard 750-1550 GSF/unit band so theoretical GSF and programmed unit counts cannot drift.';

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );
  v_old := $old$v_compiler_revision constant text := 'planner_context_v2_gsf_20260717';$old$;
  v_new := $new$v_compiler_revision constant text := 'planner_context_v2_unit_band_20260720';$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'planner compiler revision marker not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$patch$;

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  v_old := $old$  target_gsf numeric; target_fp numeric; target_stories integer; target_unit_gsf numeric; target_units integer; max_unit_gsf numeric;$old$;
  v_new := $new$  target_gsf numeric; target_fp numeric; target_stories integer; target_unit_gsf numeric; target_units integer;
  min_unit_gsf numeric; max_unit_gsf numeric; program_max_units integer;
  legal_floor_cap integer; required_floors_for_coverage integer;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'MF unit-band declaration marker not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  target_unit_gsf := coalesce(
    nullif(mb->>'at_unit_gsf','')::numeric,
    nullif(mb#>>'{program_frontier,gsf_max_option,unit_gsf}','')::numeric
  );
  target_units := coalesce(
    nullif(mb->>'units_at_max','')::integer,
    nullif(mb#>>'{program_frontier,gsf_max_option,units}','')::integer
  );

  IF target_gsf IS NULL OR target_gsf <= 0
     OR target_stories IS NULL OR target_stories <= 0
     OR target_unit_gsf IS NULL OR target_unit_gsf <= 0 THEN
    RETURN jsonb_build_object(
      'error','planner_max_buildout_contract_invalid',
      'contract_version',mb->>'contract_version',
      'has_program_frontier',mb ? 'program_frontier'
    );
  END IF;

  target_stories := GREATEST(1,target_stories);
  target_unit_gsf := GREATEST(1,target_unit_gsf);
  target_units := GREATEST(
    1,
    COALESCE(target_units,ceil(target_gsf/target_unit_gsf)::integer)
  );
  max_unit_gsf := GREATEST(target_unit_gsf,target_gsf/target_units);$old$;
  v_new := $new$  min_unit_gsf := coalesce(
    nullif(mb->>'unit_gsf_min','')::numeric,
    nullif(mb#>>'{program_frontier,unit_gsf_band,min}','')::numeric,
    nullif(mb#>>'{program_frontier,units_max_option,unit_gsf}','')::numeric,
    750
  );
  max_unit_gsf := coalesce(
    nullif(mb->>'unit_gsf_max','')::numeric,
    nullif(mb#>>'{program_frontier,unit_gsf_band,max}','')::numeric,
    nullif(mb#>>'{program_frontier,gsf_max_option,unit_gsf}','')::numeric,
    1550
  );
  target_unit_gsf := coalesce(
    nullif(mb->>'at_unit_gsf','')::numeric,
    nullif(mb#>>'{program_frontier,gsf_max_option,unit_gsf}','')::numeric,
    max_unit_gsf
  );
  target_units := coalesce(
    nullif(mb->>'units_at_max','')::integer,
    nullif(mb#>>'{program_frontier,gsf_max_option,units}','')::integer
  );

  IF target_gsf IS NULL OR target_gsf <= 0
     OR target_stories IS NULL OR target_stories <= 0
     OR target_unit_gsf IS NULL OR target_unit_gsf <= 0
     OR min_unit_gsf IS NULL OR min_unit_gsf <= 0
     OR max_unit_gsf IS NULL OR max_unit_gsf < min_unit_gsf THEN
    RETURN jsonb_build_object(
      'error','planner_max_buildout_contract_invalid',
      'contract_version',mb->>'contract_version',
      'has_program_frontier',mb ? 'program_frontier',
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf
    );
  END IF;

  target_stories := GREATEST(1,target_stories);
  target_unit_gsf := LEAST(max_unit_gsf,GREATEST(min_unit_gsf,target_unit_gsf));
  target_units := GREATEST(
    1,
    COALESCE(target_units,ceil(target_gsf/target_unit_gsf)::integer)
  );
  flags := flags || to_jsonb('unit_gsf_band_from_max_buildout'::text);$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'MF max-buildout parsing marker not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  target_fp := target_gsf/GREATEST(floors,1);
  cov_cap_sqft := CASE WHEN max_cov IS NOT NULL THEN parcel_area*max_cov/100.0 ELSE NULL END;
  IF cov_cap_sqft IS NULL THEN
    cov_cap_sqft := target_fp;
  ELSE
    IF cov_cap_sqft<target_fp THEN
      yield_clamp_reason := 'building_coverage';
      flags := flags || to_jsonb('gsf_target_clamped_by_building_coverage'::text);
    END IF;
    cov_cap_sqft := LEAST(cov_cap_sqft,target_fp);
  END IF;$old$;
  v_new := $new$  legal_floor_cap := CASE
    WHEN max_h IS NOT NULL AND f2f > 0 THEN GREATEST(1,floor(max_h/f2f)::integer)
    ELSE GREATEST(1,target_stories)
  END;
  floors := LEAST(GREATEST(1,floors),legal_floor_cap);
  target_fp := target_gsf/GREATEST(floors,1);
  cov_cap_sqft := CASE WHEN max_cov IS NOT NULL THEN parcel_area*max_cov/100.0 ELSE NULL END;
  IF cov_cap_sqft IS NULL THEN
    cov_cap_sqft := target_fp;
  ELSE
    IF cov_cap_sqft < target_fp AND legal_floor_cap > floors THEN
      required_floors_for_coverage := GREATEST(1,ceil(target_gsf/cov_cap_sqft)::integer);
      floors := LEAST(legal_floor_cap,GREATEST(floors,required_floors_for_coverage));
      target_fp := target_gsf/GREATEST(floors,1);
      flags := flags || to_jsonb('coverage_response_lifted_stories_before_clamping_gsf'::text);
    END IF;
    IF cov_cap_sqft<target_fp THEN
      yield_clamp_reason := 'building_coverage';
      flags := flags || to_jsonb('gsf_target_clamped_by_building_coverage'::text);
    END IF;
    cov_cap_sqft := LEAST(cov_cap_sqft,target_fp);
  END IF;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'MF coverage response marker not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  parking_units_cap := floor(GREATEST(n_stalls-GREATEST(1,ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer),0)/NULLIF(ratio,0))::integer;
  program_min_units := ceil(gfa/NULLIF(max_unit_gsf,0))::integer;
  flags := flags || to_jsonb('parking_geometry_tolerance_reserve_adaptive'::text);
  units := LEAST(COALESCE(units_max,target_units),target_units,parking_units_cap);
  IF units<program_min_units THEN
    RETURN jsonb_build_object(
      'error','planner_parking_infeasible',
      'reason','parking cannot support achieved GSF within the unit-size frontier',
      'gsf',round(gfa),
      'parking_units_cap',parking_units_cap,
      'minimum_program_units',program_min_units,
      'flags',flags
    );
  END IF;
  units := GREATEST(program_min_units,units);
  actual_unit_gsf := gfa/NULLIF(units,0);$old$;
  v_new := $new$  parking_units_cap := floor(GREATEST(n_stalls-GREATEST(1,ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer),0)/NULLIF(ratio,0))::integer;
  program_min_units := ceil(gfa/NULLIF(max_unit_gsf,0))::integer;
  program_max_units := floor(gfa/NULLIF(min_unit_gsf,0))::integer;
  flags := flags || to_jsonb('parking_geometry_tolerance_reserve_adaptive'::text);

  IF program_max_units < 1 OR program_max_units < program_min_units THEN
    RETURN jsonb_build_object(
      'error','planner_unit_gsf_band_infeasible',
      'gsf',round(gfa),
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'minimum_program_units',program_min_units,
      'maximum_program_units',program_max_units,
      'flags',flags
    );
  END IF;

  units := LEAST(
    COALESCE(units_max,target_units),
    target_units,
    parking_units_cap,
    program_max_units
  );
  IF units<program_min_units THEN
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
  units := GREATEST(program_min_units,units);
  actual_unit_gsf := gfa/NULLIF(units,0);
  IF actual_unit_gsf < min_unit_gsf - 0.01 OR actual_unit_gsf > max_unit_gsf + 0.01 THEN
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
  flags := flags || to_jsonb('unit_gsf_band_hard_pass'::text);$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'MF final program marker not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$      'avg_unit_gsf', round(actual_unit_gsf),$old$;
  v_new := $new$      'avg_unit_gsf', round(actual_unit_gsf),
      'unit_gsf_min', min_unit_gsf,
      'unit_gsf_max', max_unit_gsf,$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'MF metrics unit-band marker not found';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Context-required max-GSF multifamily solver. Enforces selected-use binding, legal/parking/circulation hard constraints, a hard 750-1550 GSF/unit program band, and coverage response by increasing stories before sacrificing GSF.';
