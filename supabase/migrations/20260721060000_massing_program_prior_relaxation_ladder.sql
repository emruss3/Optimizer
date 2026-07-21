-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-21.
--
-- The frozen massing_program is a preferred composition prior, not a hard gate.
-- Solver order: exact program -> split one bar -> add one further count -> free-pack.
-- The selected result may never fall below the unrestricted free-pack GSF baseline.
--
-- Runtime behavior is generic. Named parcels belong only in regression tests.

create or replace function public.fn_massing_program(
  p_ogc_fid integer,
  p_typology text default 'multifamily'::text
) returns jsonb
language plpgsql
set search_path = pg_catalog, public, extensions
as $function$
declare
  mb jsonb; up jsonb; fr jsonb;
  target_gsf numeric; target_stories int; bar_depth numeric; max_bar_ft numeric := 280;
  total_bar_ft numeric; n_bldgs int; bar_ft numeric; footprint numeric;
  ct record; eff_stories int;
  front_ft numeric; landlocked boolean; parti text; rationale text;
begin
  mb := public.fn_max_buildout(p_ogc_fid, p_typology);
  if mb ? 'error' then return mb; end if;
  up := public.fn_unit_program(p_typology);
  fr := public.fn_parcel_frontage(p_ogc_fid);

  target_gsf := (mb->>'max_gsf')::numeric;
  target_stories := coalesce(
    nullif(mb->>'at_stories','')::int,
    nullif(mb#>>'{program_frontier,gsf_max_option,stories}','')::int
  );
  bar_depth := (up->>'implied_bar_depth_ft')::numeric;

  select * into ct
  from public.ibc_construction_types
  where max_stories >= target_stories
  order by cost_rank
  limit 1;
  if not found then
    return jsonb_build_object(
      'error','no_construction_type_reaches_target_stories',
      'target_stories',target_stories
    );
  end if;
  eff_stories := least(target_stories, ct.max_stories);

  footprint := target_gsf / greatest(eff_stories,1);
  total_bar_ft := footprint / nullif(bar_depth,0);
  n_bldgs := greatest(1, ceil(total_bar_ft / max_bar_ft)::int);
  bar_ft := round(total_bar_ft / n_bldgs);

  front_ft := nullif(fr#>>'{primary,length_ft}','')::numeric;
  landlocked := coalesce((fr->>'landlocked')::boolean, false);
  parti := case
    when landlocked then 'court_scheme_easement_access'
    when front_ft >= bar_ft then 'street_bar_parking_behind'
    when front_ft >= bar_ft*0.55 then 'L_scheme_bar_on_frontage_wing_deep'
    else 'perpendicular_bars_court_to_street'
  end;
  rationale := format(
    '%s GSF @ %s stories (%s) = %s SF footprint = %s ft of %s-ft bar -> preferred prior %s building(s) x %s ft. Frontage %s ft -> %s.',
    target_gsf, eff_stories, ct.const_type, round(footprint), round(total_bar_ft),
    bar_depth, n_bldgs, bar_ft, coalesce(front_ft::text,'0'), parti
  );

  return jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid,
    'typology', p_typology,
    'target_gsf', target_gsf,
    'role', 'preferred_massing_prior',
    'relaxation_ladder', jsonb_build_array(
      jsonb_build_object('step','exact','description','attempt the preferred count and bar dimensions'),
      jsonb_build_object('step','split_one','description','split one preferred bar while preserving total linear bar demand'),
      jsonb_build_object('step','plus_one','description','add one additional count beyond the split attempt and repack'),
      jsonb_build_object('step','free_pack','description','release count, length and parti; keep hard legal/program/access constraints')
    ),
    'relax_when', jsonb_build_object(
      'drive_network_disconnected', true,
      'placement_shortfall_gsf_pct_gt', 10
    ),
    'construction_type', jsonb_build_object(
      'type',ct.const_type,'max_stories',ct.max_stories,
      'max_height_ft',ct.max_height_ft,'description',ct.description,'source',ct.source
    ),
    'stories', eff_stories,
    'building_count', n_bldgs,
    'building_count_basis',
      'preferred consolidation prior: fewest buildings within max_bar_ft='||max_bar_ft||
      ||'; relax through split/count/free-pack when geometry or access requires it; never derived from precedent count',
    'per_building', jsonb_build_object(
      'bar_length_ft',bar_ft,'bar_depth_ft',bar_depth,
      'footprint_sqft',round(bar_ft*bar_depth),
      'gsf',round(bar_ft*bar_depth*eff_stories)
    ),
    'parti', parti,
    'frontage', jsonb_build_object(
      'primary_ft',front_ft,'landlocked',landlocked,
      'bearing_deg',fr#>>'{primary,bearing_deg}'
    ),
    'rationale', rationale,
    'max_buildout', mb - 'stories_ladder',
    'note',
      'Preferred composition prior. The solver must relax it rather than reject or underbuild when exact placement loses more than 10% GSF or fails connected access.'
  );
end
$function$;

do $patch_compile$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );

  v_definition := regexp_replace(
    v_definition,
    $re$v_compiler_revision constant text := '[^']+'$re$,
    $rep$v_compiler_revision constant text := 'planner_context_v2_massing_relaxation_ladder_20260721'$rep$
  );

  if position('massing_program_authoritative_v1' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'massing_program_authoritative_v1',
      'massing_program_preferred_prior_v1'
    );
  end if;

  if position($old$'role','composition_directive'$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$'role','composition_directive'$old$,
      $new$'role','preferred_prior_with_relaxation_ladder'$new$
    );
  end if;

  execute v_definition;
end
$patch_compile$;

do $patch_core$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  );

  if position('massing_program_relaxed_free_pack_v1' in v_definition) > 0 then
    return;
  end if;

  v_old := $old$  directive_count integer; directive_bar_len numeric; directive_bar_depth numeric;
  directive_stories integer; directive_parti text; directive_rationale text;
  directive_active boolean := false; directive_count_met boolean := false;
  density_units integer; density_recovery_target_gsf numeric; density_desired_fp numeric;
  directive_limit integer;$old$;
  v_new := $new$  directive_count integer; directive_bar_len numeric; directive_bar_depth numeric;
  directive_stories integer; directive_parti text; directive_rationale text;
  directive_active boolean := false; directive_count_met boolean := false;
  directive_original_count integer; directive_original_bar_len numeric; directive_original_parti text;
  directive_relaxation text := 'exact'; requested_regime text; directive_target_linear_ft numeric;
  density_units integer; density_recovery_target_gsf numeric; density_desired_fp numeric;
  directive_limit integer;$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'core directive declaration marker not found';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$BEGIN
  IF p_context_id IS NULL THEN$old$;
  v_new := $new$BEGIN
  requested_regime := coalesce(nullif(btrim(p_regime),''),'surface');
  if position(':' in requested_regime)>0 then
    directive_relaxation := lower(split_part(requested_regime,':',2));
    p_regime := split_part(requested_regime,':',1);
  else
    directive_relaxation := 'exact';
    p_regime := requested_regime;
  end if;
  if directive_relaxation not in ('exact','split_one','plus_one','free_pack') then
    return jsonb_build_object(
      'error','planner_massing_relaxation_mode_invalid',
      'mode',directive_relaxation
    );
  end if;
  IF p_context_id IS NULL THEN$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'core begin marker not found';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  -- Composition directive. User pins remain sovereign; otherwise the frozen
  -- massing program is the authoritative building-count/parti/form contract.
  if jsonb_typeof(massing_program)='object'
     and not (massing_program ? 'error')
     and nullif(massing_program->>'building_count','') is not null
     and nullif(massing_program#>>'{per_building,bar_length_ft}','') is not null
     and nullif(massing_program#>>'{per_building,bar_depth_ft}','') is not null then
    directive_count := greatest(1,(massing_program->>'building_count')::integer);
    directive_bar_len := greatest(40,(massing_program#>>'{per_building,bar_length_ft}')::numeric);
    directive_bar_depth := greatest(28,(massing_program#>>'{per_building,bar_depth_ft}')::numeric);
    directive_stories := greatest(1,coalesce(nullif(massing_program->>'stories','')::integer,target_stories));
    directive_parti := coalesce(nullif(massing_program->>'parti',''),'street_bar_parking_behind');
    directive_rationale := massing_program->>'rationale';
    if abs(coalesce(nullif(massing_program->>'target_gsf','')::numeric,target_gsf)-target_gsf)>1 then
      return jsonb_build_object(
        'error','planner_massing_program_contract_mismatch',
        'max_buildout_gsf',round(target_gsf),
        'massing_program_gsf',massing_program->>'target_gsf'
      );
    end if;
    directive_active := coalesce(jsonb_array_length(case when jsonb_typeof(p_pins)='array' then p_pins else '[]'::jsonb end),0)=0;
    if directive_active then
      target_stories := directive_stories;
      flags := flags
        || to_jsonb('massing_program_consumed_v1'::text)
        || to_jsonb('massing_program_building_count_directive'::text)
        || to_jsonb(('massing_program_parti_'||regexp_replace(lower(directive_parti),'[^a-z0-9]+','_','g'))::text)
        || to_jsonb('precedent_count_ignored_for_composition'::text);
    else
      flags := flags || to_jsonb('massing_program_suspended_for_user_pins'::text);
    end if;
  else
    flags := flags || to_jsonb('massing_program_fallback_geometry_search'::text);
  end if;
  directive_limit := case
    when p_regime='compact' then 1
    when directive_active then directive_count
    else null
  end;$old$;

  v_new := $new$  -- Preferred composition PRIOR. User pins remain sovereign. An exact
  -- program is attempted first, but geometry/access may relax it through the
  -- dispatcher ladder. Local precedents never control count or quantity.
  if jsonb_typeof(massing_program)='object'
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
    directive_stories := greatest(1,coalesce(nullif(massing_program->>'stories','')::integer,target_stories));
    directive_parti := directive_original_parti;
    directive_rationale := massing_program->>'rationale';
    if abs(coalesce(nullif(massing_program->>'target_gsf','')::numeric,target_gsf)-target_gsf)>1 then
      return jsonb_build_object(
        'error','planner_massing_program_contract_mismatch',
        'max_buildout_gsf',round(target_gsf),
        'massing_program_gsf',massing_program->>'target_gsf'
      );
    end if;
    directive_active := coalesce(
      jsonb_array_length(case when jsonb_typeof(p_pins)='array' then p_pins else '[]'::jsonb end),
      0
    )=0;

    if directive_active then
      case directive_relaxation
        when 'split_one' then
          directive_count := directive_original_count+1;
          directive_bar_len := greatest(40,directive_target_linear_ft/directive_count);
          flags := flags || to_jsonb('massing_program_relaxed_split_one_bar_v1'::text);
        when 'plus_one' then
          directive_count := directive_original_count+2;
          directive_bar_len := greatest(40,directive_target_linear_ft/directive_count);
          flags := flags || to_jsonb('massing_program_relaxed_plus_one_count_v1'::text);
        when 'free_pack' then
          directive_active := false;
          flags := flags || to_jsonb('massing_program_relaxed_free_pack_v1'::text);
        else
          flags := flags || to_jsonb('massing_program_exact_prior_attempt_v1'::text);
      end case;

      if directive_active then
        target_stories := directive_stories;
        flags := flags
          || to_jsonb('massing_program_consumed_v1'::text)
          || to_jsonb('massing_program_preferred_prior_v1'::text)
          || to_jsonb('massing_program_building_count_prior'::text)
          || to_jsonb(('massing_program_parti_'||
              regexp_replace(lower(directive_parti),'[^a-z0-9]+','_','g'))::text)
          || to_jsonb('precedent_count_ignored_for_composition'::text);
      end if;
    else
      flags := flags || to_jsonb('massing_program_suspended_for_user_pins'::text);
    end if;
  else
    directive_active := false;
    directive_relaxation := 'free_pack';
    flags := flags
      || to_jsonb('massing_program_unavailable_free_pack_v1'::text)
      || to_jsonb('massing_program_relaxed_free_pack_v1'::text);
  end if;

  directive_limit := case
    when p_regime='compact' then 1
    when directive_active then directive_count
    else null
  end;$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'core directive contract marker not found';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_definition := replace(
    v_definition,
    '  -- bar directive is not a hint: seed exactly one long bar per row, leave one',
    '  -- first-priority prior attempt: seed one preferred bar per row, leave one'
  );
  v_definition := replace(
    v_definition,
    '  -- The frozen composition directive assigns one consolidated bar to',
    '  -- The current prior step assigns one consolidated bar to'
  );

  v_old := $old$  directive_count_met := not directive_active or n_bars=directive_count;
  if directive_active then
    flags := flags || case when directive_count_met
      then to_jsonb('massing_program_count_hard_pass'::text)
      else to_jsonb('massing_program_count_clamped_by_geometry'::text) end;
  end if;$old$;
  v_new := $new$  directive_count_met := not directive_active or n_bars=directive_count;
  if directive_active then
    flags := flags || case when directive_count_met
      then to_jsonb('massing_program_count_prior_met'::text)
      else to_jsonb('massing_program_count_prior_relaxed_by_geometry'::text) end;
  end if;$new$;
  if position(v_old in v_definition)=0 then
    raise exception 'core directive receipt marker not found';
  end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_definition := replace(
    v_definition,
    $old$    'massing_program', case when directive_active then massing_program else null end,$old$,
    $new$    'massing_program', case when jsonb_typeof(massing_program)='object' then massing_program else null end,
    'massing_relaxation', directive_relaxation,$new$
  );

  v_definition := replace(
    v_definition,
    $old$      'massing_program_count_met', directive_count_met,$old$,
    $new$      'massing_program_count_met', directive_count_met,
      'massing_program_relaxation', directive_relaxation,
      'massing_program_original_building_count', directive_original_count,
      'massing_program_original_bar_length_ft', directive_original_bar_len,$new$
  );

  execute v_definition;
end
$patch_core$;

create or replace function public.fn_generate_mf_site_plan_v2(
  p_ogc_fid integer,
  p_typology text,
  p_seed integer,
  p_pins jsonb,
  p_parent uuid,
  p_persist boolean,
  p_context_id uuid
) returns jsonb
language plpgsql
set search_path = pg_catalog, public, extensions
as $function$
declare
  r_exact jsonb; r_split jsonb; r_plus jsonb; r_free jsonb;
  r_compact jsonb; r_court jsonb; r_tuck jsonb; r_best jsonb; r_persisted jsonb;
  exact_gsf numeric := -1; split_gsf numeric := -1; plus_gsf numeric := -1;
  free_gsf numeric := -1; compact_gsf numeric := -1; court_gsf numeric := -1;
  tuck_gsf numeric := -1; best_gsf numeric := -1;
  exact_capture numeric := -1; split_capture numeric := -1; plus_capture numeric := -1;
  target_gsf numeric; best_status text;
  bres jsonb; brief jsonb; max_buildout jsonb; massing_program jsonb;
  parti text; primary_regime text := 'surface'; best_regime_arg text := 'surface:free_pack';
  lot_sqft numeric; directive_count integer; directive_bar_len numeric;
  compact_candidate boolean := false;
  need_split boolean := false; need_plus boolean := false;
  relaxation_reason text; chosen_mode text := 'free_pack';
  receipts jsonb := jsonb_build_object(
    'basis','complete_real_solves',
    'policy','massing_prior_relaxation_ladder_v1',
    'shortfall_trigger_pct',10
  );
  extra_flags jsonb := jsonb_build_array('massing_program_prior_relaxation_ladder_v1');
begin
  if p_context_id is null then
    return jsonb_build_object('error','planner_context_required');
  end if;
  bres := public.fn_get_planner_solver_brief(p_context_id,p_ogc_fid);
  if bres ? 'error' then return jsonb_build_object('error',bres->>'error'); end if;
  brief := bres->'solver_brief';
  if lower(btrim(coalesce(p_typology,''))) <> 'multifamily'
     or lower(btrim(coalesce(brief->>'typology',''))) <> 'multifamily'
     or lower(btrim(coalesce(brief->>'selected_use',''))) not in ('multifamily','multi_family','mf') then
    return jsonb_build_object(
      'error','planner_context_use_mismatch',
      'expected_typology','multifamily',
      'requested_typology',lower(btrim(coalesce(p_typology,''))),
      'context_typology',brief->>'typology',
      'context_selected_use',brief->>'selected_use'
    );
  end if;
  if not coalesce((bres->>'generation_allowed')::boolean,false) then
    return jsonb_build_object(
      'error','planner_generation_not_allowed',
      'flags',coalesce(brief->'flags','[]'::jsonb)
    );
  end if;
  max_buildout := brief->'max_buildout';
  if max_buildout is null or max_buildout ? 'error'
     or nullif(max_buildout->>'max_gsf','') is null then
    return jsonb_build_object('error','planner_max_buildout_required');
  end if;
  target_gsf := (max_buildout->>'max_gsf')::numeric;

  massing_program := coalesce(brief->'massing_program','{}'::jsonb);
  if jsonb_typeof(massing_program)='object'
     and not (massing_program ? 'error')
     and nullif(massing_program->>'building_count','') is not null then
    parti := coalesce(nullif(massing_program->>'parti',''),'surface');
    directive_count := greatest(1,(massing_program->>'building_count')::integer);
    directive_bar_len := nullif(massing_program#>>'{per_building,bar_length_ft}','')::numeric;
    lot_sqft := coalesce(
      nullif(max_buildout#>>'{entitlement_capacity,lot_sqft}','')::numeric,
      nullif(brief#>>'{entitlement_capacity,lot_sqft}','')::numeric
    );
    primary_regime := case
      when parti='court_scheme_easement_access' then 'courtyard'
      when parti='street_bar_parking_behind' then 'street_bar'
      when parti='L_scheme_bar_on_frontage_wing_deep' then 'l_scheme'
      when parti='perpendicular_bars_court_to_street' then 'perpendicular'
      else 'surface'
    end;
    compact_candidate := coalesce(lot_sqft,1e9)<=25000
      or (directive_count=1 and coalesce(directive_bar_len,1e9)<=120);
  else
    parti := 'unavailable';
    primary_regime := 'surface';
    extra_flags := extra_flags || jsonb_build_array('massing_program_unavailable_free_pack_v1');
  end if;

  -- Pinned edits are user-authored geometry, not a massing-prior experiment.
  if p_pins is not null and jsonb_typeof(p_pins)='array' and jsonb_array_length(p_pins)>0 then
    return public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,p_persist,p_context_id,'surface:free_pack'
    );
  end if;

  -- Step 0: exact preferred program.
  if parti <> 'unavailable' then
    r_exact := public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,false,p_context_id,primary_regime||':exact'
    );
    exact_gsf := case when r_exact ? 'error' then -1
                      else coalesce((r_exact#>>'{metrics,gfa_sqft}')::numeric,-1) end;
    exact_capture := case when exact_gsf>0 then exact_gsf/nullif(target_gsf,0) else -1 end;
    receipts := receipts || jsonb_build_object(
      'exact',jsonb_build_object(
        'gfa_sqft',case when exact_gsf<0 then null else exact_gsf end,
        'capture_pct',case when exact_capture<0 then null else round(exact_capture*100,1) end,
        'error',r_exact->>'error',
        'regime',primary_regime
      )
    );
    if not (r_exact ? 'error') then
      r_best := r_exact; best_gsf := exact_gsf; chosen_mode := 'exact';
      best_regime_arg := primary_regime||':exact';
    end if;
    need_split := (r_exact ? 'error') or exact_gsf < target_gsf*0.90-1;
    if need_split then
      relaxation_reason := case
        when r_exact->>'error'='planner_drive_network_disconnected'
          then 'drive_network_disconnected'
        when r_exact ? 'error'
          then coalesce(r_exact->>'error','exact_attempt_failed')
        else 'placement_shortfall_gt_10pct_gsf'
      end;
      extra_flags := extra_flags || jsonb_build_array(
        'massing_program_relaxation_trigger_'||
          regexp_replace(lower(relaxation_reason),'[^a-z0-9]+','_','g')
      );
    end if;
  else
    need_split := false;
  end if;

  -- Step 1: split one preferred bar (N -> N+1, total linear demand preserved).
  if need_split then
    r_split := public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,false,p_context_id,primary_regime||':split_one'
    );
    split_gsf := case when r_split ? 'error' then -1
                      else coalesce((r_split#>>'{metrics,gfa_sqft}')::numeric,-1) end;
    split_capture := case when split_gsf>0 then split_gsf/nullif(target_gsf,0) else -1 end;
    receipts := receipts || jsonb_build_object(
      'split_one',jsonb_build_object(
        'gfa_sqft',case when split_gsf<0 then null else split_gsf end,
        'capture_pct',case when split_capture<0 then null else round(split_capture*100,1) end,
        'error',r_split->>'error'
      )
    );
    if split_gsf>best_gsf+1 then
      r_best := r_split; best_gsf := split_gsf; chosen_mode := 'split_one';
      best_regime_arg := primary_regime||':split_one';
    end if;
    need_plus := (r_split ? 'error') or split_gsf < target_gsf*0.90-1;
  end if;

  -- Step 2: add one further count (N -> N+2), still preserving total bar demand.
  if need_plus then
    r_plus := public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,false,p_context_id,primary_regime||':plus_one'
    );
    plus_gsf := case when r_plus ? 'error' then -1
                     else coalesce((r_plus#>>'{metrics,gfa_sqft}')::numeric,-1) end;
    plus_capture := case when plus_gsf>0 then plus_gsf/nullif(target_gsf,0) else -1 end;
    receipts := receipts || jsonb_build_object(
      'plus_one',jsonb_build_object(
        'gfa_sqft',case when plus_gsf<0 then null else plus_gsf end,
        'capture_pct',case when plus_capture<0 then null else round(plus_capture*100,1) end,
        'error',r_plus->>'error'
      )
    );
    if plus_gsf>best_gsf+1 then
      r_best := r_plus; best_gsf := plus_gsf; chosen_mode := 'plus_one';
      best_regime_arg := primary_regime||':plus_one';
    end if;
  end if;

  -- Free-pack is always evaluated and is an absolute performance floor.
  r_free := public.fn_mf_solve_core(
    p_ogc_fid,p_typology,p_seed,p_pins,p_parent,false,p_context_id,'surface:free_pack'
  );
  free_gsf := case when r_free ? 'error' then -1
                   else coalesce((r_free#>>'{metrics,gfa_sqft}')::numeric,-1) end;
  receipts := receipts || jsonb_build_object(
    'free_pack',jsonb_build_object(
      'gfa_sqft',case when free_gsf<0 then null else free_gsf end,
      'capture_pct',case when free_gsf<0 then null else round(free_gsf/nullif(target_gsf,0)*100,1) end,
      'error',r_free->>'error'
    )
  );
  if free_gsf>best_gsf+1 then
    r_best := r_free; best_gsf := free_gsf; chosen_mode := 'free_pack';
    best_regime_arg := 'surface:free_pack';
  end if;

  -- Existing compact leg remains a candidate; the small-lot regime is not
  -- declared closed by this migration.
  if compact_candidate then
    r_compact := public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,false,p_context_id,'compact:free_pack'
    );
    compact_gsf := case when r_compact ? 'error' then -1
                        else coalesce((r_compact#>>'{metrics,gfa_sqft}')::numeric,-1) end;
    receipts := receipts || jsonb_build_object(
      'compact',jsonb_build_object(
        'gfa_sqft',case when compact_gsf<0 then null else compact_gsf end,
        'error',r_compact->>'error'
      )
    );
    if compact_gsf>best_gsf+1 then
      r_best := r_compact; best_gsf := compact_gsf; chosen_mode := 'compact';
      best_regime_arg := 'compact:free_pack';
    end if;
  end if;

  -- Courtyard may win only when it does not fall below the free-pack floor.
  if best_gsf>0 and primary_regime<>'courtyard'
     and coalesce((r_best#>>'{metrics,bars}')::integer,0)>=2
     and coalesce((r_best#>>'{metrics,parcel_sqft}')::numeric,0)>=60000 then
    r_court := public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,false,p_context_id,'courtyard:free_pack'
    );
    court_gsf := case when r_court ? 'error' then -1
                      else coalesce((r_court#>>'{metrics,gfa_sqft}')::numeric,-1) end;
    receipts := receipts || jsonb_build_object(
      'courtyard',jsonb_build_object(
        'gfa_sqft',case when court_gsf<0 then null else court_gsf end,
        'error',r_court->>'error',
        'court_placed',coalesce(r_court->'flags','[]'::jsonb) ? 'designed_central_court_v1'
      )
    );
    if court_gsf>0
       and coalesce(r_court->'flags','[]'::jsonb) ? 'designed_central_court_v1'
       and court_gsf>=greatest(coalesce(free_gsf,0),best_gsf*0.93)
       and court_gsf>best_gsf+1 then
      r_best := r_court; best_gsf := court_gsf; chosen_mode := 'courtyard';
      best_regime_arg := 'courtyard:free_pack';
    end if;
  end if;

  best_status := coalesce(r_best#>>'{metrics,optimization_status}','');
  if (r_best is null or r_best ? 'error')
     or best_status in ('feasible_optimization_incomplete','feasible_demonstrably_constrained') then
    r_tuck := public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,false,p_context_id,'tuck_under:free_pack'
    );
    tuck_gsf := case when r_tuck ? 'error' then -1
                     else coalesce((r_tuck#>>'{metrics,gfa_sqft}')::numeric,-1) end;
    receipts := receipts || jsonb_build_object(
      'tuck_under',jsonb_build_object(
        'gfa_sqft',case when tuck_gsf<0 then null else tuck_gsf end,
        'error',r_tuck->>'error'
      )
    );
    if tuck_gsf>best_gsf+1 and tuck_gsf>=coalesce(free_gsf,-1) then
      r_best := r_tuck; best_gsf := tuck_gsf; chosen_mode := 'tuck_under';
      best_regime_arg := 'tuck_under:free_pack';
    end if;
  end if;

  if r_best is null or r_best ? 'error' then
    return coalesce(r_best,r_free,r_exact,jsonb_build_object('error','planner_no_feasible_massing_regime'));
  end if;

  if free_gsf>0 and best_gsf+1<free_gsf then
    return jsonb_build_object(
      'error','planner_free_pack_floor_violation',
      'selected_gsf',best_gsf,
      'free_pack_gsf',free_gsf
    );
  end if;

  if p_persist then
    r_persisted := public.fn_mf_solve_core(
      p_ogc_fid,p_typology,p_seed,p_pins,p_parent,true,p_context_id,best_regime_arg
    );
    if not (r_persisted ? 'error') then
      r_best := r_persisted;
      best_gsf := coalesce((r_best#>>'{metrics,gfa_sqft}')::numeric,best_gsf);
    end if;
  end if;

  extra_flags := extra_flags || jsonb_build_array(
    case chosen_mode
      when 'exact' then 'massing_program_exact_prior_selected_v1'
      when 'split_one' then 'massing_program_relaxed_split_one_bar_selected_v1'
      when 'plus_one' then 'massing_program_relaxed_plus_one_count_selected_v1'
      when 'free_pack' then 'massing_program_relaxed_free_pack_selected_v1'
      when 'compact' then 'massing_program_relaxed_compact_selected_v1'
      when 'courtyard' then 'massing_program_relaxed_courtyard_selected_v1'
      when 'tuck_under' then 'massing_program_relaxed_tuck_under_selected_v1'
      else 'massing_program_relaxation_selected_v1'
    end
  );
  if free_gsf>0 and best_gsf+1>=free_gsf then
    extra_flags := extra_flags || jsonb_build_array('massing_program_free_pack_floor_verified_v1');
  end if;

  receipts := receipts || jsonb_build_object(
    'chosen',chosen_mode,
    'chosen_gsf',round(best_gsf),
    'target_gsf',round(target_gsf),
    'free_pack_floor_gsf',case when free_gsf<0 then null else round(free_gsf) end,
    'floor_satisfied',free_gsf<0 or best_gsf+1>=free_gsf,
    'relaxation_trigger',relaxation_reason,
    'small_lot_regime_status',case when compact_candidate then 'open' else 'not_applicable' end
  );

  r_best := jsonb_set(
    r_best,'{flags}',
    coalesce(r_best->'flags','[]'::jsonb)||extra_flags,true
  );
  r_best := jsonb_set(r_best,'{metrics,regime_comparison}',receipts,true);
  r_best := jsonb_set(r_best,'{metrics,massing_relaxation_mode}',to_jsonb(chosen_mode),true);
  r_best := jsonb_set(
    r_best,'{metrics,free_pack_floor_gsf}',
    case when free_gsf<0 then 'null'::jsonb else to_jsonb(round(free_gsf)) end,true
  );
  return r_best;
end
$function$;

comment on function public.fn_massing_program(integer,text) is
  'Preferred massing prior. Publishes count, bar dimensions, parti and a generic exact -> split-one -> plus-one -> free-pack relaxation ladder.';
comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Multifamily dispatcher with a massing-prior relaxation ladder and a hard free-pack GSF floor. No parcel-specific runtime branches.';
comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven MF core. Regime arguments may include :exact, :split_one, :plus_one or :free_pack; massing program is a relaxable prior, while legal/program/parking/access constraints remain hard.';

notify pgrst, 'reload schema';
