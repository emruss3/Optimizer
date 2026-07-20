-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- fn_max_buildout was extended with a program_frontier object but its legacy
-- at_stories / at_unit_gsf / units_at_max aliases were removed. The production
-- MF solver and frontend still consumed those aliases, so a missing story value
-- collapsed the solve to one story. Preserve the richer frontier and restore
-- compatibility, while teaching the solver to consume either contract shape.

create or replace function public.fn_max_buildout(
  p_ogc_fid integer,
  p_typology text default 'multifamily'::text
)
returns jsonb
language plpgsql
set search_path to pg_catalog, public, extensions
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
      units := least(cap_units, land_cap / (ug / s + pk_ratio * stall_sf));
      gsf := units * ug;

      if v_far is not null and not far_uncapped then
        gsf := least(gsf, v_far * v_lot);
        units := least(units, gsf / ug);
      end if;

      footprint := gsf / s;
      binding := case
        when units >= cap_units - 0.5 then 'density(units)'
        when v_far is not null
             and not far_uncapped
             and abs(gsf - v_far * v_lot) < 1 then 'far'
        when v_isr * v_lot < v_usable then 'impervious_coverage'
        else 'land_after_parking'
      end;

      if gsf > story_best_gsf then
        story_best_gsf := gsf;
        story_best := jsonb_build_object(
          'stories', s,
          'max_gsf', round(gsf),
          'units', floor(units),
          'unit_gsf', ug,
          'footprint_sqft', round(footprint),
          'binding', binding
        );
      end if;

      if floor(units) > best_units
         or (
           floor(units) = best_units
           and gsf > coalesce((best_units_pt ->> 'gsf')::numeric, 0)
         ) then
        best_units := floor(units);
        best_units_pt := jsonb_build_object(
          'units', floor(units),
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
    'contract_version', 'max_buildout_v2',
    'parcel_ogc_fid', p_ogc_fid,
    'typology', p_typology,
    'max_gsf', (best ->> 'max_gsf')::integer,
    'at_stories', (best ->> 'stories')::integer,
    'at_unit_gsf', (best ->> 'unit_gsf')::numeric,
    'units_at_max', (best ->> 'units')::integer,
    'footprint_at_max', (best ->> 'footprint_sqft')::integer,
    'binding_constraint', best ->> 'binding',
    'program_frontier', jsonb_build_object(
      'gsf_max_option', best,
      'units_max_option', best_units_pt,
      'note', 'Both are legal maxima on different objectives; every program between them is feasible.'
    ),
    'stories_ladder', ladder,
    'entitlement_capacity', ctx -> 'entitlement_capacity',
    'assumptions', jsonb_build_object(
      'unit_gsf_band', '750-1550 swept',
      'parking_ratio', pk_ratio,
      'stall_land_sf', stall_sf,
      'floor_height_ft', fl_h,
      'usable_land_sqft', round(v_usable),
      'usable_basis', 'uniform side-setback inset (directional pending frontage)'
    ),
    'note', 'Objective: MAXIMIZE GSF. Density caps units, not SF. Precedents shape form only.'
  );
end
$function$;

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  v_old := $old$
  IF mb IS NULL OR mb ? 'error' OR nullif(mb->>'max_gsf','') IS NULL THEN
    RETURN jsonb_build_object('error','planner_max_buildout_required');
  END IF;
  target_gsf := (mb->>'max_gsf')::numeric;
  target_stories := GREATEST(1,(mb->>'at_stories')::integer);
  target_unit_gsf := GREATEST(1,COALESCE((mb->>'at_unit_gsf')::numeric,1550));
  target_units := GREATEST(1,COALESCE((mb->>'units_at_max')::integer,ceil(target_gsf/target_unit_gsf)::integer));
  max_unit_gsf := GREATEST(target_unit_gsf,target_gsf/target_units);
  flags := flags || to_jsonb('max_gsf_target_from_context'::text);
$old$;

  v_new := $new$
  IF mb IS NULL OR mb ? 'error' OR nullif(mb->>'max_gsf','') IS NULL THEN
    RETURN jsonb_build_object('error','planner_max_buildout_required');
  END IF;

  target_gsf := nullif(mb->>'max_gsf','')::numeric;
  target_stories := coalesce(
    nullif(mb->>'at_stories','')::integer,
    nullif(mb#>>'{program_frontier,gsf_max_option,stories}','')::integer,
    (
      select nullif(r->>'stories','')::integer
      from jsonb_array_elements(coalesce(mb->'stories_ladder','[]'::jsonb)) as x(r)
      where nullif(r->>'max_gsf','') is not null
        and nullif(r->>'stories','') is not null
      order by (r->>'max_gsf')::numeric desc, (r->>'stories')::integer desc
      limit 1
    )
  );
  target_unit_gsf := coalesce(
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
  max_unit_gsf := GREATEST(target_unit_gsf,target_gsf/target_units);
  IF mb#>'{program_frontier,gsf_max_option}' IS NOT NULL THEN
    flags := flags || to_jsonb('max_buildout_program_frontier_consumed'::text);
  END IF;
  flags := flags || to_jsonb('max_gsf_target_from_context'::text);
$new$;

  if position(v_old in v_definition) = 0 then
    if position('max_buildout_program_frontier_consumed' in v_definition) = 0 then
      raise exception 'MF solver max-buildout target block not found';
    end if;
  else
    v_definition := replace(v_definition, v_old, v_new);
    execute v_definition;
  end if;
end
$patch$;

comment on function public.fn_max_buildout(integer,text) is
  'Read-only max-GSF development frontier. max_buildout_v2 preserves program_frontier plus top-level compatibility aliases consumed by the planner UI and solver.';

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF solver. Consumes max_buildout_v2 or the program_frontier GSF-max option, maximizes GSF under hard parking/circulation constraints, and fails closed on an invalid frontier contract.';

grant execute on function public.fn_max_buildout(integer,text) to anon, authenticated, service_role;
revoke execute on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
