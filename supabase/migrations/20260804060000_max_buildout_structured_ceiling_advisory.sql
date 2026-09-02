-- Order-8 audit (2026-08-04, "are we truly optimizing"): fn_max_buildout's
-- frontier models SURFACE parking only — every stall consumes stall_land_sf
-- (420) of ground — so on intensive districts (ORI, MUG, MUI: FAR 3–5,
-- 65–105 ft) it reports 38–47% of the legal ceiling a podium-parked building
-- reaches, while the design context itself says parking_strategy='structured'.
-- ADDITIVE contract change (max_buildout_v4 fields untouched):
--   structured_parking_ceiling {gsf, stories, binding, basis}  — advisory
--     ceiling with no parking land consumed: height, FAR, density, ISR only.
--   frontier_basis = 'surface_parking'
--   assumptions.height_source = 'ordinance' | 'default_3_stories_height_missing'
--     (the frontier silently assumes 33 ft when the district has no height
--     cap on file — 17% of the MF universe today).
-- Everything else byte-identical to the live 2026-08-04 body.

CREATE OR REPLACE FUNCTION public.fn_max_buildout(p_ogc_fid integer, p_typology text DEFAULT 'multifamily'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  ctx jsonb; ts public.typology_spec%rowtype;
  v_lot numeric; v_usable numeric; v_density numeric; v_height numeric;
  v_isr numeric; v_side numeric; v_far numeric; far_uncapped boolean;
  stall_sf numeric; fl_h numeric;
  max_stories int; s int; ug numeric; units_cont numeric; units_int int;
  gsf numeric; pkr numeric; footprint numeric;
  cap_units numeric; land_cap numeric; far_units_cap numeric;
  best_gsf numeric := 0; best jsonb := null;
  best_units integer := 0; best_units_pt jsonb := null;
  ladder jsonb := '[]'::jsonb; story_best jsonb; story_best_gsf numeric;
  min_unit_gsf constant numeric := 750;
  max_unit_gsf constant numeric := 1550;
  minimum_multifamily_units constant integer := 3;
  degenerate boolean := false;
  height_missing boolean := false;
  struct_gsf numeric; struct_binding text; struct_footprint numeric;
begin
  select * into ts from public.typology_spec where typology=p_typology;
  if not found or ts.avg_unit_gsf is null then
    return jsonb_build_object('error','max_buildout not defined for typology: '||p_typology);
  end if;

  ctx := public.fn_resolve_design_context(p_ogc_fid,p_typology);
  if ctx ? 'error' then return ctx; end if;

  v_lot := nullif(ctx#>>'{entitlement_capacity,lot_sqft}','')::numeric;
  if v_lot is null or v_lot<=0 then
    return jsonb_build_object('error','planner_lot_area_required','parcel_ogc_fid',p_ogc_fid);
  end if;
  v_density := nullif(ctx#>>'{density_max_du_acre,value}','')::numeric;
  height_missing := nullif(ctx#>>'{height_max_ft,value}','') is null;
  v_height := coalesce(nullif(ctx#>>'{height_max_ft,value}','')::numeric,ts.floor_height_ft*3);
  v_isr := coalesce(nullif(ctx#>>'{max_isr,value}','')::numeric,0.9);
  v_side := coalesce(nullif(ctx#>>'{setbacks,side,value}','')::numeric,5);
  v_far := nullif(ctx#>>'{far_max,value}','')::numeric;
  far_uncapped := coalesce(nullif(ctx#>>'{entitlement_capacity,far_uncapped_for_mf}','')::boolean,false);
  stall_sf := coalesce(ts.stall_land_sf,420);
  fl_h := coalesce(ts.floor_height_ft,ts.floor_to_floor_ft,11);

  select st_area(st_buffer((st_dump(geom_2274)).geom,-v_side))
    into v_usable
  from public.parcels where ogc_fid=p_ogc_fid;
  v_usable := greatest(0,coalesce(v_usable,v_lot*0.8));
  max_stories := greatest(1,floor(v_height/nullif(fl_h,0))::int);
  cap_units := coalesce(v_density,1e9)*v_lot/43560.0;

  for s in 1..max_stories loop
    story_best_gsf := 0;
    story_best := jsonb_build_object(
      'stories',s,'max_gsf',0,'units',0,'unit_gsf',min_unit_gsf,
      'parking_ratio',round(public.fn_parking_ratio_for_unit_gsf(p_typology,min_unit_gsf),2),
      'stalls_required',0,'footprint_sqft',0,
      'binding','no_whole_unit_fits','degenerate',true
    );

    for ug in select unnest(array[750,950,1150,1350,1550]::numeric[]) loop
      pkr := public.fn_parking_ratio_for_unit_gsf(p_typology,ug);
      land_cap := least(v_usable,v_isr*v_lot);
      units_cont := least(cap_units,land_cap/nullif(ug/s+pkr*stall_sf,0));
      if v_far is not null and not far_uncapped then
        far_units_cap := greatest(0,(v_far*v_lot)/ug);
        units_cont := least(units_cont,far_units_cap);
      end if;
      units_int := greatest(0,floor(coalesce(units_cont,0))::int);
      gsf := units_int*ug;
      footprint := case when s>0 then gsf/s else 0 end;

      if units_int>0 and gsf>story_best_gsf then
        story_best_gsf := gsf;
        story_best := jsonb_build_object(
          'stories',s,'max_gsf',round(gsf),'units',units_int,'unit_gsf',ug,
          'parking_ratio',round(pkr,2),'stalls_required',ceil(units_int*pkr),
          'footprint_sqft',round(footprint),
          'binding',case
            when v_density is not null and units_int>=floor(cap_units) then 'density(units)'
            when v_far is not null and not far_uncapped and abs(gsf-v_far*v_lot)<ug then 'far'
            when v_isr*v_lot<v_usable then 'impervious_coverage'
            else 'land_after_parking'
          end,
          'integer_units',true
        );
      end if;

      if units_int>best_units
         or (units_int=best_units and gsf>coalesce(nullif(best_units_pt->>'gsf','')::numeric,0)) then
        best_units := units_int;
        best_units_pt := jsonb_build_object(
          'units',units_int,'unit_gsf',ug,'gsf',round(gsf),'max_gsf',round(gsf),'stories',s,
          'parking_ratio',round(pkr,2),'stalls_required',ceil(units_int*pkr),
          'footprint_sqft',round(footprint),'integer_units',true
        );
      end if;
    end loop;

    ladder := ladder||jsonb_build_array(story_best);
    if story_best_gsf>best_gsf then
      best_gsf := story_best_gsf;
      best := story_best;
    end if;
  end loop;

  if best is null then
    best := jsonb_build_object(
      'stories',1,'max_gsf',0,'units',0,'unit_gsf',min_unit_gsf,
      'parking_ratio',round(public.fn_parking_ratio_for_unit_gsf(p_typology,min_unit_gsf),2),
      'stalls_required',0,'footprint_sqft',0,
      'binding','no_whole_unit_fits','degenerate',true,'integer_units',true
    );
  end if;
  if best_units_pt is null then best_units_pt := best; end if;
  degenerate := coalesce((best->>'units')::integer,0)<minimum_multifamily_units;

  -- Order-8 advisory: the ceiling when parking consumes NO ground (podium /
  -- structured) — the same height, FAR, density and ISR caps, no stall land.
  struct_footprint := least(v_usable, v_isr*v_lot);
  struct_gsf := struct_footprint*max_stories; struct_binding := 'height_x_footprint';
  if v_far is not null and not far_uncapped and v_far*v_lot < struct_gsf then
    struct_gsf := v_far*v_lot; struct_binding := 'far'; end if;
  if v_density is not null and cap_units*max_unit_gsf < struct_gsf then
    struct_gsf := cap_units*max_unit_gsf; struct_binding := 'density(units)'; end if;

  return jsonb_build_object(
    'contract_version','max_buildout_v4_integer_consistent',
    'parcel_ogc_fid',p_ogc_fid,'typology',p_typology,
    'max_gsf',(best->>'max_gsf')::int,
    'at_stories',(best->>'stories')::int,
    'at_unit_gsf',(best->>'unit_gsf')::numeric,
    'units_at_max',(best->>'units')::int,
    'footprint_at_max',(best->>'footprint_sqft')::numeric,
    'unit_gsf_min',min_unit_gsf,'unit_gsf_max',max_unit_gsf,
    'minimum_typology_units',minimum_multifamily_units,
    'degenerate_frontier',degenerate,
    'generation_feasible',not degenerate,
    'binding_constraint',best->>'binding',
    'parking_ratio_at_max',(best->>'parking_ratio')::numeric,
    'stalls_required_at_max',(best->>'stalls_required')::int,
    'frontier_basis','surface_parking',
    'structured_parking_ceiling',jsonb_build_object(
      'gsf',round(struct_gsf),'stories',max_stories,'binding',struct_binding,
      'basis','advisory: no parking land consumed (podium/structured); height, FAR, density and ISR caps only'),
    'program_frontier',jsonb_build_object(
      'gsf_max_option',best,
      'units_max_option',best_units_pt,
      'unit_gsf_band',jsonb_build_object(
        'min',min_unit_gsf,'max',max_unit_gsf,'hard_constraint',true,
        'semantics','average dwelling gross square feet'
      ),
      'note','Integer units first, then GSF. Both corners are legal maxima on different objectives inside the hard average-unit band.'
    ),
    'stories_ladder',ladder,
    'entitlement_capacity',ctx->'entitlement_capacity',
    'assumptions',jsonb_build_object(
      'unit_gsf_band','750-1550 hard average-unit band',
      'integer_units',true,
      'parking_ratio','fn_parking_ratio_for_unit_gsf (unit_spec interpolated)',
      'stall_land_sf',stall_sf,'floor_height_ft',fl_h,'usable_land_sqft',round(v_usable),
      'usable_basis','uniform side-setback inset (directional pending adoption)',
      'height_source',case when height_missing then 'default_3_stories_height_missing' else 'ordinance' end
    ),
    'note','Objective: MAXIMIZE GSF. Density caps units, not SF. Integer units and size-consistent parking are enforced before GSF is published.'
  );
end
$function$;
