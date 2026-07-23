-- I-8 ladder totality (Phase 1.1).
--
-- Generic contract repair only: no address, parcel, or jurisdiction branches.
--
-- 1. Publish an integer-consistent max-GSF frontier with an explicit hard
--    average-unit band. Fractional theoretical units may never inflate GSF.
-- 2. Make the current connected-leg massing program backward-compatible with
--    the v2 solver while keeping it a preferred prior.
-- 3. Let the solver consume that seed, keep parking assumptions consistent
--    with the frontier, and never infer a zero-width unit band from a frontier
--    corner.
-- 4. Treat an integer frontier below the multifamily program minimum as a
--    legitimate verdict, and exhaust exact -> split -> plus-one -> free-pack ->
--    compact/tuck-under before returning a structured failure.

create or replace function public.fn_max_buildout(
  p_ogc_fid integer,
  p_typology text default 'multifamily'::text
) returns jsonb
language plpgsql
set search_path = pg_catalog, public, extensions
as $function$
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
      'usable_basis','uniform side-setback inset (directional pending adoption)'
    ),
    'note','Objective: MAXIMIZE GSF. Density caps units, not SF. Integer units and size-consistent parking are enforced before GSF is published.'
  );
end
$function$;

create or replace function public.fn_massing_program(
  p_ogc_fid integer,
  p_typology text default 'multifamily'::text
) returns jsonb
language plpgsql
set search_path = pg_catalog, public, extensions
as $function$
declare
  mb jsonb; up jsonb; fr jsonb;
  target_gsf numeric; target_stories int; bar_depth numeric;
  max_leg numeric := 280; max_legs_per_structure int := 3;
  total_bar_ft numeric; footprint numeric;
  n_structures int; legs_total int; solver_bar_count int; solver_bar_len numeric;
  ct record; eff_stories int;
  front_ft numeric; landlocked boolean; bearing numeric;
  composition text; parti text; legs jsonb := '[]'::jsonb;
  i int; leg_ft numeric; remaining numeric; rationale text;
begin
  mb := public.fn_max_buildout(p_ogc_fid,p_typology);
  if mb ? 'error' then return mb; end if;
  if coalesce((mb->>'degenerate_frontier')::boolean,false)
     or coalesce((mb->>'units_at_max')::integer,0)<coalesce((mb->>'minimum_typology_units')::integer,3) then
    return jsonb_build_object(
      'parcel_ogc_fid',p_ogc_fid,'typology',p_typology,
      'role','no_feasible_typology_program','degenerate_frontier',true,
      'target_gsf',coalesce((mb->>'max_gsf')::numeric,0),
      'building_count',null,'legs','[]'::jsonb,
      'relaxation_ladder',jsonb_build_array(
        jsonb_build_object('step','degenerate_frontier_verdict','description','fewer than the minimum whole units fit the selected typology')
      ),
      'max_buildout',mb-'stories_ladder',
      'note','No massing seed emitted because the integer-consistent frontier cannot support the selected typology minimum.'
    );
  end if;

  up := public.fn_unit_program(p_typology);
  fr := public.fn_parcel_frontage(p_ogc_fid);
  target_gsf := (mb->>'max_gsf')::numeric;
  target_stories := coalesce(nullif(mb->>'at_stories','')::int,nullif(mb#>>'{program_frontier,gsf_max_option,stories}','')::int);
  bar_depth := coalesce(nullif(up->>'implied_bar_depth_ft','')::numeric,67.3);

  select * into ct from public.ibc_construction_types
   where max_stories>=target_stories order by cost_rank limit 1;
  if not found then
    return jsonb_build_object('error','no_construction_type_reaches_target_stories','target_stories',target_stories);
  end if;
  eff_stories := least(target_stories,ct.max_stories);
  footprint := target_gsf/greatest(eff_stories,1);
  total_bar_ft := footprint/nullif(bar_depth,0);

  front_ft := coalesce(nullif(fr#>>'{primary,length_ft}','')::numeric,0);
  landlocked := coalesce((fr->>'landlocked')::boolean,false);
  bearing := coalesce(nullif(fr#>>'{primary,bearing_deg}','')::numeric,0);

  legs_total := greatest(1,ceil(total_bar_ft/max_leg)::int);
  remaining := total_bar_ft;
  for i in 1..legs_total loop
    leg_ft := least(remaining,max_leg);
    if i=1 and not landlocked then
      leg_ft := least(leg_ft,greatest(front_ft-20,100));
    end if;
    legs := legs||jsonb_build_array(jsonb_build_object(
      'leg',i,'length_ft',round(leg_ft),
      'bearing_deg',case when i%2=1 then round(bearing,1) else round(mod(bearing+90,360)::numeric,1) end,
      'role',case when i=1 then 'frontage_leg' else 'wing' end,
      'structure',ceil(i::numeric/max_legs_per_structure)::int
    ));
    remaining := remaining-leg_ft;
    exit when remaining<=20;
  end loop;

  solver_bar_count := greatest(1,jsonb_array_length(legs));
  n_structures := greatest(1,ceil(solver_bar_count::numeric/max_legs_per_structure)::int);
  solver_bar_len := total_bar_ft/solver_bar_count;
  composition := case
    when landlocked then 'courtyard_consolidated_easement_access'
    when solver_bar_count=1 then 'single_bar_on_frontage'
    when solver_bar_count=2 then 'single_L_frontage_plus_wing'
    when solver_bar_count=3 then 'single_U_court_to_interior'
    else n_structures||'_structures_L_or_U_each'
  end;
  parti := case
    when landlocked then 'court_scheme_easement_access'
    when solver_bar_count=1 then 'street_bar_parking_behind'
    when solver_bar_count=2 then 'L_scheme_bar_on_frontage_wing_deep'
    else 'perpendicular_bars_court_to_street'
  end;
  rationale := format(
    '%s GSF @ %s st (%s) = %s ft of %s-ft bar -> %s connected leg(s), %s structure(s): %s. Frontage %s ft.',
    round(target_gsf),eff_stories,ct.const_type,round(total_bar_ft),bar_depth,
    solver_bar_count,n_structures,composition,round(front_ft)
  );

  return jsonb_build_object(
    'parcel_ogc_fid',p_ogc_fid,'typology',p_typology,
    'role','preferred_massing_prior','target_gsf',round(target_gsf),'stories',eff_stories,
    'construction_type',jsonb_build_object('type',ct.const_type,'description',ct.description),
    'building_count',n_structures,'solver_bar_count',solver_bar_count,
    'composition',composition,'parti',parti,'legs',legs,'per_leg_depth_ft',bar_depth,
    'solver_seed',jsonb_build_object(
      'bar_count',solver_bar_count,'bar_length_ft',round(solver_bar_len,2),
      'bar_depth_ft',bar_depth,'parti',parti,'structure_count',n_structures,
      'source','connected_leg_program_compatibility_seed_v1'
    ),
    'per_building',jsonb_build_object(
      'bar_length_ft',round(solver_bar_len,2),'bar_depth_ft',bar_depth,
      'footprint_sqft',round(solver_bar_len*bar_depth),
      'gsf',round(solver_bar_len*bar_depth*eff_stories)
    ),
    'relaxation_ladder',jsonb_build_array(
      jsonb_build_object('step','exact','description','attempt the connected-leg program through its compatibility seed'),
      jsonb_build_object('step','split_one','description','split one bar while preserving total linear demand'),
      jsonb_build_object('step','plus_one','description','add one further bar and repack'),
      jsonb_build_object('step','free_pack','description','release the prior while retaining all hard constraints')
    ),
    'relax_when',jsonb_build_object(
      'recoverable_solver_error',true,'placement_shortfall_gsf_pct_gt',10
    ),
    'form_era',jsonb_build_object(
      'directive','contemporary_consolidated',
      'note','Precedent stock is market corroboration only and never controls quantity or structure count.'
    ),
    'frontage',jsonb_build_object('primary_ft',front_ft,'landlocked',landlocked,'bearing_deg',bearing),
    'rationale',rationale,'max_buildout',mb-'stories_ladder',
    'note','Preferred connected composition prior with a total relaxation ladder. Solver compatibility seed preserves total linear building demand.'
  );
end
$function$;

do $patch_core$
declare
  d text; old text; new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('parking_ratio_consistent_with_max_buildout_frontier_v1' in d)>0 then
    return;
  end if;

  old := '  bar_depth numeric; typology_max_depth numeric; aisle numeric; stall_w numeric; stall_d numeric; ratio numeric; program_parking_ratio numeric;';
  new := '  bar_depth numeric; typology_max_depth numeric; aisle numeric; stall_w numeric; stall_d numeric; ratio numeric; program_parking_ratio numeric; frontier_parking_ratio numeric;';
  if position(old in d)=0 then raise exception 'core parking declaration marker missing'; end if;
  d := replace(d,old,new);

  old := $old$  min_unit_gsf := coalesce(
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
  );$old$;
  new := $new$  min_unit_gsf := coalesce(
    nullif(mb->>'unit_gsf_min','')::numeric,
    nullif(mb#>>'{program_frontier,unit_gsf_band,min}','')::numeric,
    750
  );
  max_unit_gsf := coalesce(
    nullif(mb->>'unit_gsf_max','')::numeric,
    nullif(mb#>>'{program_frontier,unit_gsf_band,max}','')::numeric,
    1550
  );$new$;
  if position(old in d)=0 then raise exception 'core unit-band marker missing'; end if;
  d := replace(d,old,new);

  old := $old$  if jsonb_typeof(massing_program)='object'
     and not (massing_program ? 'error')
     and nullif(massing_program->>'building_count','') is not null
     and nullif(massing_program#>>'{per_building,bar_length_ft}','') is not null
     and nullif(massing_program#>>'{per_building,bar_depth_ft}','') is not null then
    directive_original_count := greatest(1,(massing_program->>'building_count')::integer);
    directive_original_bar_len := greatest(40,(massing_program#>>'{per_building,bar_length_ft}')::numeric);
    directive_original_parti := coalesce(nullif(massing_program->>'parti',''),'street_bar_parking_behind');
    directive_target_linear_ft := directive_original_count*directive_original_bar_len;
    directive_count := directive_original_count;
    directive_bar_len := directive_original_bar_len;
    directive_bar_depth := greatest(28,(massing_program#>>'{per_building,bar_depth_ft}')::numeric);
    directive_stories := greatest(1,coalesce(nullif(massing_program->>'stories','')::integer,target_stories));$old$;
  new := $new$  if jsonb_typeof(massing_program)='object'
     and not (massing_program ? 'error')
     and coalesce(
       nullif(massing_program#>>'{solver_seed,bar_count}',''),
       nullif(massing_program->>'solver_bar_count',''),
       nullif(massing_program->>'building_count','')
     ) is not null
     and coalesce(
       nullif(massing_program#>>'{solver_seed,bar_length_ft}',''),
       nullif(massing_program#>>'{per_building,bar_length_ft}','')
     ) is not null
     and coalesce(
       nullif(massing_program#>>'{solver_seed,bar_depth_ft}',''),
       nullif(massing_program#>>'{per_building,bar_depth_ft}',''),
       nullif(massing_program->>'per_leg_depth_ft','')
     ) is not null then
    directive_original_count := greatest(1,coalesce(
      nullif(massing_program#>>'{solver_seed,bar_count}','')::integer,
      nullif(massing_program->>'solver_bar_count','')::integer,
      nullif(massing_program->>'building_count','')::integer
    ));
    directive_original_bar_len := greatest(40,coalesce(
      nullif(massing_program#>>'{solver_seed,bar_length_ft}','')::numeric,
      nullif(massing_program#>>'{per_building,bar_length_ft}','')::numeric
    ));
    directive_original_parti := coalesce(
      nullif(massing_program#>>'{solver_seed,parti}',''),
      nullif(massing_program->>'parti',''),
      case massing_program->>'composition'
        when 'single_bar_on_frontage' then 'street_bar_parking_behind'
        when 'single_L_frontage_plus_wing' then 'L_scheme_bar_on_frontage_wing_deep'
        when 'courtyard_consolidated_easement_access' then 'court_scheme_easement_access'
        else 'perpendicular_bars_court_to_street'
      end
    );
    directive_target_linear_ft := directive_original_count*directive_original_bar_len;
    directive_count := directive_original_count;
    directive_bar_len := directive_original_bar_len;
    directive_bar_depth := greatest(28,coalesce(
      nullif(massing_program#>>'{solver_seed,bar_depth_ft}','')::numeric,
      nullif(massing_program#>>'{per_building,bar_depth_ft}','')::numeric,
      nullif(massing_program->>'per_leg_depth_ft','')::numeric
    ));
    directive_stories := greatest(1,coalesce(nullif(massing_program->>'stories','')::integer,target_stories));$new$;
  if position(old in d)=0 then raise exception 'core massing compatibility marker missing'; end if;
  d := replace(d,old,new);

  old := $old$  ratio   := COALESCE((pk->>'ratio')::numeric, 1.5);
  program_parking_ratio := nullif(unit_program->>'weighted_parking_ratio', '')::numeric;
  ratio := greatest(ratio, coalesce(program_parking_ratio, ratio));$old$;
  new := $new$  ratio   := COALESCE((pk->>'ratio')::numeric, 1.5);
  program_parking_ratio := nullif(unit_program->>'weighted_parking_ratio', '')::numeric;
  frontier_parking_ratio := coalesce(
    nullif(mb->>'parking_ratio_at_max','')::numeric,
    nullif(mb#>>'{program_frontier,gsf_max_option,parking_ratio}','')::numeric
  );
  ratio := greatest(
    ratio,
    coalesce(program_parking_ratio,ratio),
    coalesce(frontier_parking_ratio,ratio)
  );
  if frontier_parking_ratio is not null then
    flags := flags || to_jsonb('parking_ratio_consistent_with_max_buildout_frontier_v1'::text);
  end if;$new$;
  if position(old in d)=0 then raise exception 'core parking-ratio marker missing'; end if;
  d := replace(d,old,new);

  execute d;
end
$patch_core$;

do $patch_dispatcher$
declare
  d text; old text; new text;
begin
  select pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  ) into d;

  if position('planner_degenerate_frontier_below_typology_minimum' in d)=0 then
    old := $old$  target_gsf := (max_buildout->>'max_gsf')::numeric;$old$;
    new := $new$  target_gsf := (max_buildout->>'max_gsf')::numeric;
  if coalesce((max_buildout->>'degenerate_frontier')::boolean,false)
     or coalesce((max_buildout->>'units_at_max')::integer,0)
          < coalesce((max_buildout->>'minimum_typology_units')::integer,3) then
    return jsonb_build_object(
      'error','planner_generation_not_allowed',
      'reason','planner_degenerate_frontier_below_typology_minimum',
      'verdict_class','program_infeasible_for_selected_typology',
      'minimum_typology_units',coalesce((max_buildout->>'minimum_typology_units')::integer,3),
      'units_at_max',coalesce((max_buildout->>'units_at_max')::integer,0),
      'max_gsf',coalesce((max_buildout->>'max_gsf')::numeric,0),
      'flags',coalesce(brief->'flags','[]'::jsonb)
        || jsonb_build_array('planner_degenerate_frontier_verdict_v1')
    );
  end if;$new$;
    if position(old in d)=0 then raise exception 'dispatcher target marker missing'; end if;
    d := replace(d,old,new);
  end if;

  d := replace(
    d,
    $old$  extra_flags jsonb := jsonb_build_array('massing_program_prior_relaxation_ladder_v1');$old$,
    $new$  extra_flags jsonb := jsonb_build_array(
    'massing_program_prior_relaxation_ladder_v1',
    'massing_program_i8_totality_v1'
  );$new$
  );

  d := replace(
    d,
    $old$  if compact_candidate then$old$,
    $new$  if compact_candidate or (r_free ? 'error') then$new$
  );

  old := $old$  if r_best is null or r_best ? 'error' then
    return coalesce(r_best,r_free,r_exact,jsonb_build_object('error','planner_no_feasible_massing_regime'));
  end if;$old$;
  new := $new$  if r_best is null or r_best ? 'error' then
    return jsonb_build_object(
      'error','planner_no_feasible_massing_regime',
      'reason','all recoverable massing regimes exhausted without a hard-valid plan',
      'attempts',receipts,
      'last_errors',jsonb_strip_nulls(jsonb_build_object(
        'exact',r_exact->>'error',
        'split_one',r_split->>'error',
        'plus_one',r_plus->>'error',
        'free_pack',r_free->>'error',
        'compact',r_compact->>'error',
        'courtyard',r_court->>'error',
        'tuck_under',r_tuck->>'error'
      )),
      'flags',extra_flags||jsonb_build_array('massing_program_ladder_exhausted_v1')
    );
  end if;$new$;
  if position(old in d)=0 then raise exception 'dispatcher final-failure marker missing'; end if;
  d := replace(d,old,new);

  execute d;
end
$patch_dispatcher$;

do $patch_compiler$
declare d text;
begin
  select pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  ) into d;
  d := regexp_replace(
    d,
    $re$v_compiler_revision constant text := '[^']+'$re$,
    $rep$v_compiler_revision constant text := 'planner_context_v2_i8_totality_20260723'$rep$
  );
  execute d;
end
$patch_compiler$;

comment on function public.fn_max_buildout(integer,text) is
  'Integer-consistent max-GSF frontier v4. Publishes a hard 750-1550 average-unit band, size-consistent parking, stable aliases, and a degenerate-frontier verdict signal.';
comment on function public.fn_massing_program(integer,text) is
  'Preferred connected-leg massing prior with a v2 solver compatibility seed and exact/split/plus/free-pack relaxation metadata.';
comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Multifamily I-8 dispatcher: catches recoverable failure classes across the total relaxation ladder, preserves the free-pack floor, and returns structured exhaustion/verdict payloads.';

notify pgrst,'reload schema';
