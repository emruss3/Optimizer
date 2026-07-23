-- Constructive Stage-3 intake + complete I-1 emit gate.
--
-- Exact/in-family solves consume fn_site_skeleton_v2.structures[] as the
-- building geometry on both verified-frontage and landlocked/easement lots.
-- Separate seed legs remain metadata; one structure is one emitted building.
--
-- The final overlap gate now checks every relevant element-class pair:
-- building×building, building×parking, building×circulation, and
-- parking×circulation. Any positive-area collision over the one-square-foot
-- tolerance is a recoverable planner_element_overlap error, so the I-8
-- dispatcher can relax rather than rendering roads or bays through buildings.

create or replace function public.fn_mf_validate_element_disjointness(
  p_buildings geometry[],
  p_parking geometry,
  p_drives geometry,
  p_tolerance_sqft numeric default 1
) returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,public,extensions
as $function$
declare
  overlaps jsonb:='[]'::jsonb;
  a geometry;
  b geometry;
  area_sqft numeric;
  i integer;
  j integer;
  n integer:=coalesce(array_length(p_buildings,1),0);
begin
  if n>1 then
    for i in 1..n-1 loop
      for j in i+1..n loop
        a:=p_buildings[i];
        b:=p_buildings[j];
        if a is null or b is null or ST_IsEmpty(a) or ST_IsEmpty(b) then
          continue;
        end if;
        if a && b then
          area_sqft:=coalesce(ST_Area(ST_Intersection(a,b)),0);
          if area_sqft>p_tolerance_sqft then
            overlaps:=overlaps || jsonb_build_object(
              'element_a','building','index_a',i,
              'element_b','building','index_b',j,
              'pair','building×building',
              'overlap_sqft',round(area_sqft,1)
            );
          end if;
        end if;
      end loop;
    end loop;
  end if;

  if n>0 then
    for i in 1..n loop
      a:=p_buildings[i];
      if a is null or ST_IsEmpty(a) then continue; end if;

      if p_parking is not null and not ST_IsEmpty(p_parking) and a && p_parking then
        area_sqft:=coalesce(ST_Area(ST_Intersection(a,p_parking)),0);
        if area_sqft>p_tolerance_sqft then
          overlaps:=overlaps || jsonb_build_object(
            'element_a','building','index_a',i,
            'element_b','parking',
            'pair','building×parking',
            'overlap_sqft',round(area_sqft,1)
          );
        end if;
      end if;

      if p_drives is not null and not ST_IsEmpty(p_drives) and a && p_drives then
        area_sqft:=coalesce(ST_Area(ST_Intersection(a,p_drives)),0);
        if area_sqft>p_tolerance_sqft then
          overlaps:=overlaps || jsonb_build_object(
            'element_a','building','index_a',i,
            'element_b','circulation',
            'pair','building×circulation',
            'overlap_sqft',round(area_sqft,1)
          );
        end if;
      end if;
    end loop;
  end if;

  if p_parking is not null and not ST_IsEmpty(p_parking)
     and p_drives is not null and not ST_IsEmpty(p_drives)
     and p_parking && p_drives then
    area_sqft:=coalesce(ST_Area(ST_Intersection(p_parking,p_drives)),0);
    if area_sqft>p_tolerance_sqft then
      overlaps:=overlaps || jsonb_build_object(
        'element_a','parking',
        'element_b','circulation',
        'pair','parking×circulation',
        'overlap_sqft',round(area_sqft,1)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(overlaps)=0,
    'law','I-1',
    'tolerance_sqft',p_tolerance_sqft,
    'pairs_checked',jsonb_build_array(
      'building×building',
      'building×parking',
      'building×circulation',
      'parking×circulation'
    ),
    'overlaps',overlaps
  );
end
$function$;

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('site_skeleton_v2_structures_consumed_v1' in d)>0
     and position('i1_pairwise_element_disjointness_hard_pass' in d)>0 then
    return;
  end if;

  old := $old$  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; unit_program jsonb; massing_program jsonb; obj jsonb; w jsonb; mb jsonb; ent jsonb;$old$;
  new := $new$  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; unit_program jsonb; massing_program jsonb; obj jsonb; w jsonb; mb jsonb; ent jsonb;
  site_skeleton_v2 jsonb; structure_seed_item jsonb; overlap_report jsonb;$new$;
  if position(old in d)=0 then raise exception 'structure/I-1 declaration marker 1 missing'; end if;
  d:=replace(d,old,new);

  old := $old$  directive_limit integer;$old$;
  new := $new$  directive_limit integer;
  structure_seed_active boolean:=false;
  structure_seed_landlocked boolean:=false;
  structure_seed_count integer:=0;$new$;
  if position(old in d)=0 then raise exception 'structure/I-1 declaration marker 2 missing'; end if;
  d:=replace(d,old,new);

  old := $old$  IF directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') THEN
    spine_x := case when ST_X(entry_rot) <= (bxmin+bxmax)/2
                    then bxmin+aisle/2 else bxmax-aisle/2 end;$old$;
  new := $new$  -- Stage-3 exact intake: the engine has already placed and clipped the
  -- intended structures. Consume that geometry instead of re-discovering a
  -- composition from bars. Relaxed rungs retain the previous generic packer.
  if directive_active
     and directive_relaxation='exact'
     and coalesce(jsonb_array_length(
       case when jsonb_typeof(p_pins)='array' then p_pins else '[]'::jsonb end
     ),0)=0 then
    site_skeleton_v2:=public.fn_site_skeleton_v2(p_ogc_fid,p_typology);
    if not (site_skeleton_v2 ? 'error')
       and jsonb_typeof(site_skeleton_v2->'structures')='array'
       and jsonb_array_length(site_skeleton_v2->'structures')>0 then
      bars_arr:='{}'::geometry[];
      n_bars:=0;
      tot_fp:=0;
      for structure_seed_item in
        select value from jsonb_array_elements(site_skeleton_v2->'structures')
      loop
        begin
          bar:=ST_SetSRID(ST_GeomFromGeoJSON(
            (structure_seed_item->'geom_2274')::text
          ),2274);
          bar:=ST_CollectionExtract(ST_Intersection(
            ST_Rotate(bar,-theta,anchor),rot
          ),3);
          if bar is not null and not ST_IsEmpty(bar)
             and ST_NumGeometries(bar)=1
             and ST_Area(bar)>1000 then
            bar:=(select q.geom from (select (ST_Dump(bar)).geom) q
                  order by ST_Area(q.geom) desc limit 1);
            bars_arr:=bars_arr||bar;
            n_bars:=n_bars+1;
            tot_fp:=tot_fp+ST_Area(bar);
          end if;
        exception when others then
          flags:=flags||to_jsonb('site_skeleton_v2_structure_parse_failed_v1'::text);
        end;
      end loop;

      structure_seed_count:=jsonb_array_length(site_skeleton_v2->'structures');
      if n_bars=structure_seed_count then
        structure_seed_active:=true;
        structure_seed_landlocked:=coalesce(
          (site_skeleton_v2#>>'{skeleton_v2,easement_assumed}')::boolean,
          false
        ) or site_skeleton_v2->>'skeleton'='landlocked_court_scheme';
        directive_original_count:=structure_seed_count;
        directive_count:=structure_seed_count;
        directive_limit:=structure_seed_count;
        bars_capacity_arr:=bars_arr;
        capacity_fp:=tot_fp;
        flags:=flags
          || coalesce(site_skeleton_v2->'flags','[]'::jsonb)
          || to_jsonb('site_skeleton_v2_structures_consumed_v1'::text)
          || case when structure_seed_landlocked
               then to_jsonb('site_skeleton_v2_landlocked_structure_consumed_v1'::text)
               else to_jsonb('site_skeleton_v2_frontage_structure_consumed_v1'::text)
             end;
      else
        bars_arr:='{}'::geometry[];
        n_bars:=0;
        tot_fp:=0;
        structure_seed_count:=0;
        flags:=flags||to_jsonb('site_skeleton_v2_structure_set_rejected_v1'::text);
      end if;
    end if;
  end if;

  IF structure_seed_active and structure_seed_landlocked THEN
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    spine_x:=case
      when ST_XMin(bars_u)-bxmin >= bxmax-ST_XMax(bars_u)
        then greatest(bxmin+aisle/2,ST_XMin(bars_u)-aisle/2-2)
      else least(bxmax-aisle/2,ST_XMax(bars_u)+aisle/2+2)
    end;
    spine:=ST_Intersection(rot,ST_MakeEnvelope(
      spine_x-aisle/2,bymin,spine_x+aisle/2,bymax,2274
    ));
    lead_street:=false;
    flags:=flags
      || to_jsonb('landlocked_access_via_easement_assumed'::text)
      || to_jsonb('site_skeleton_v2_easement_side_spine_v1'::text);
  ELSIF directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') THEN
    spine_x := case when ST_X(entry_rot) <= (bxmin+bxmax)/2
                    then bxmin+aisle/2 else bxmax-aisle/2 end;$new$;
  if position(old in d)=0 then raise exception 'structure seed/spine marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$  IF flags ? 'pin_outside_parcel' THEN
    RETURN jsonb_build_object(
      'error','planner_pin_outside_parcel',
      'flags',flags
    );
  END IF;

  if directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') then$old$;
  new := $new$  IF flags ? 'pin_outside_parcel' THEN
    RETURN jsonb_build_object(
      'error','planner_pin_outside_parcel',
      'flags',flags
    );
  END IF;

  if structure_seed_active then
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    avoid:=ST_UnaryUnion(ST_Collect(array[avoid,ST_Buffer(bars_u,5)]));
    flags:=flags||to_jsonb('site_skeleton_v2_structures_reserved_from_infrastructure_v1'::text);
  end if;

  if directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') then$new$;
  if position(old in d)=0 then raise exception 'structure infrastructure-reservation marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$  if directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
     and p_regime in ('street_bar','surface','l_scheme') then$old$;
  new := $new$  if directive_active
     and not structure_seed_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
     and p_regime in ('street_bar','surface','l_scheme') then$new$;
  if position(old in d)=0 then raise exception 'structure generic-seed bypass marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$  END IF;
  IF parks IS NULL OR ST_IsEmpty(parks) THEN
    RETURN jsonb_build_object('error','planner_parking_missing','flags',flags);
  END IF;$old$;
  new := $new$  END IF;

  -- Law I-1 is pairwise across element classes, not merely between buildings.
  filtered_bars:=bars_arr;
  for k in 1..coalesce(array_length(pin_geoms,1),0) loop
    filtered_bars:=filtered_bars||ST_Rotate(pin_geoms[k],-theta,anchor);
  end loop;
  overlap_report:=public.fn_mf_validate_element_disjointness(
    filtered_bars,parks,drives,1
  );
  if not coalesce((overlap_report->>'ok')::boolean,false) then
    return jsonb_build_object(
      'error','planner_element_overlap',
      'law','I-1',
      'reason','positive-area overlap between plan element classes',
      'overlap_report',overlap_report,
      'flags',flags
    );
  end if;
  flags:=flags||to_jsonb('i1_pairwise_element_disjointness_hard_pass'::text);

  IF parks IS NULL OR ST_IsEmpty(parks) THEN
    RETURN jsonb_build_object('error','planner_parking_missing','flags',flags);
  END IF;$new$;
  if position(old in d)=0 then raise exception 'I-1 final gate marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$    'massing_program', case when jsonb_typeof(massing_program)='object' then massing_program else null end,
    'massing_relaxation', directive_relaxation,
    'session_id', v_session,$old$;
  new := $new$    'massing_program', case when jsonb_typeof(massing_program)='object' then massing_program else null end,
    'massing_relaxation', directive_relaxation,
    'structure_seed',case when structure_seed_active then jsonb_build_object(
      'source','fn_site_skeleton_v2.structures',
      'structure_count',structure_seed_count,
      'access_mode',site_skeleton_v2#>>'{skeleton_v2,access_mode}',
      'easement_assumed',coalesce((site_skeleton_v2#>>'{skeleton_v2,easement_assumed}')::boolean,false)
    ) else null end,
    'session_id', v_session,$new$;
  if position(old in d)=0 then raise exception 'structure receipt marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$      'bars', n_bars, 'floors', floors,
      'footprint_sqft', round(tot_fp), 'gfa_sqft', round(gfa),$old$;
  new := $new$      'bars', n_bars, 'floors', floors,
      'structure_seed_consumed',structure_seed_active,
      'structure_seed_count',case when structure_seed_active then structure_seed_count else null end,
      'element_disjointness_law','I-1',
      'footprint_sqft', round(tot_fp), 'gfa_sqft', round(gfa),$new$;
  if position(old in d)=0 then raise exception 'structure/I-1 metric marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$      'validators_basis', 'ifc_503_150ft; ibc_1106_table_v1; ev_10pct_v1',$old$;
  new := $new$      'validators_basis', 'I-1_pairwise_disjoint; ifc_503_150ft; ibc_1106_table_v1; ev_10pct_v1',$new$;
  if position(old in d)=0 then raise exception 'I-1 validator-basis marker missing'; end if;
  d:=replace(d,old,new);

  execute d;
end
$patch_core$;

comment on function public.fn_mf_validate_element_disjointness(geometry[],geometry,geometry,numeric) is
  'Law I-1 final geometry gate: positive-area overlaps are forbidden for building×building, building×parking, building×circulation, and parking×circulation.';

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily Stage-3 solver. Exact mode consumes fn_site_skeleton_v2.structures[]; every emitted plan passes the I-1 all-element pairwise disjointness gate.';

notify pgrst,'reload schema';
