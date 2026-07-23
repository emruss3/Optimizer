-- Final I-8 drive recovery for pairs whose bounding ranges overlap but whose
-- closest-point route starts beside a building. Sample the shared X/Y range,
-- choose component contact points on that clear axis, and add the shortest
-- obstacle-free bridge that fits the remaining impervious budget.

create or replace function public.fn_mf_connect_drive_components_shared_axis(
  p_drives geometry,
  p_bars geometry,
  p_envelope geometry,
  p_aisle_ft numeric,
  p_max_added_area_sqft numeric default null
) returns geometry
language plpgsql
immutable
set search_path=pg_catalog,public,extensions
as $function$
declare
  original geometry;
  base geometry;
  main_component geometry;
  other_component geometry;
  obstacle geometry;
  probe geometry;
  contact_a geometry;
  contact_b geometry;
  route geometry;
  corridor geometry;
  candidate geometry;
  best geometry;
  half_width numeric;
  low_value numeric;
  high_value numeric;
  sample_value numeric;
  added_area numeric;
  best_added_area numeric;
  current_components integer;
  candidate_components integer;
  best_components integer;
  iteration integer;
  sample_index integer;
  axis text;
begin
  original:=ST_CollectionExtract(ST_UnaryUnion(p_drives),3);
  if original is null or ST_IsEmpty(original) then return p_drives; end if;
  base:=original;
  half_width:=greatest(coalesce(p_aisle_ft,24)*0.35,6);
  obstacle:=case when p_bars is null or ST_IsEmpty(p_bars) then null
                 else ST_Buffer(p_bars,0.5) end;

  for iteration in 1..12 loop
    current_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(base),3));
    exit when current_components<=1;
    main_component:=(select g from (
      select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(base),3))).geom g
    ) q order by ST_Area(g) desc limit 1);
    other_component:=(select g from (
      select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(base),3))).geom g
    ) q where not ST_Equals(g,main_component)
        order by ST_Distance(g,main_component),ST_Area(g) desc limit 1);
    exit when main_component is null or other_component is null;

    best:=base;
    best_components:=current_components;
    best_added_area:=1e30;

    foreach axis in array array['vertical','horizontal'] loop
      if axis='vertical' then
        low_value:=greatest(ST_XMin(main_component),ST_XMin(other_component))+half_width;
        high_value:=least(ST_XMax(main_component),ST_XMax(other_component))-half_width;
      else
        low_value:=greatest(ST_YMin(main_component),ST_YMin(other_component))+half_width;
        high_value:=least(ST_YMax(main_component),ST_YMax(other_component))-half_width;
      end if;
      if high_value<low_value then continue; end if;

      for sample_index in 0..16 loop
        sample_value:=case when high_value=low_value then low_value
          else low_value+(high_value-low_value)*sample_index/16.0 end;
        if axis='vertical' then
          probe:=ST_SetSRID(ST_MakeLine(
            ST_MakePoint(sample_value,ST_YMin(p_envelope)),
            ST_MakePoint(sample_value,ST_YMax(p_envelope))
          ),ST_SRID(base));
        else
          probe:=ST_SetSRID(ST_MakeLine(
            ST_MakePoint(ST_XMin(p_envelope),sample_value),
            ST_MakePoint(ST_XMax(p_envelope),sample_value)
          ),ST_SRID(base));
        end if;
        contact_a:=ST_ClosestPoint(main_component,probe);
        contact_b:=ST_ClosestPoint(other_component,probe);
        route:=ST_SetSRID(ST_MakeLine(contact_a,contact_b),ST_SRID(base));
        corridor:=ST_CollectionExtract(ST_Intersection(
          p_envelope,ST_Buffer(route,half_width,'endcap=flat join=mitre')
        ),3);
        if corridor is null or ST_IsEmpty(corridor) then continue; end if;
        if obstacle is not null
           and coalesce(ST_Area(ST_Intersection(corridor,obstacle)),0)>1 then
          continue;
        end if;
        if not ST_DWithin(corridor,main_component,0.5)
           or not ST_DWithin(corridor,other_component,0.5) then continue; end if;

        candidate:=ST_CollectionExtract(ST_UnaryUnion(ST_Union(
          ST_Buffer(base,0.05),ST_Buffer(corridor,0.05)
        )),3);
        candidate_components:=ST_NumGeometries(candidate);
        added_area:=greatest(ST_Area(candidate)-ST_Area(original),0);
        if p_max_added_area_sqft is not null
           and added_area>greatest(p_max_added_area_sqft,0)+1 then continue; end if;
        if candidate_components<best_components
           or (candidate_components=best_components and added_area<best_added_area) then
          best:=candidate;
          best_components:=candidate_components;
          best_added_area:=added_area;
        end if;
        exit when best_components=1;
      end loop;
      exit when best_components=1;
    end loop;

    exit when best_components>=current_components;
    base:=best;
  end loop;
  return base;
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
  if position('drive_components_connected_by_shared_axis_v1' in d)>0 then return; end if;

  old := $old$  if directive_active then
    flags := flags || to_jsonb('drive_component_prune_deferred_to_hard_graph_gate_v1'::text);
  end if;

  -- Final topology cleanup: parking and drives are disjoint systems.$old$;

  new := $new$  if not directive_active and drives is not null and not ST_IsEmpty(drives) then
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_shared_axis(
        drives,bars_u,parking_rot,aisle,
        case when max_impervious_sqft is null then null
             else greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0) end
      );
      if bridge is not null and not ST_IsEmpty(bridge)
         and ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(bridge),3))<drive_components then
        drives:=bridge;
        tot_drive:=coalesce(ST_Area(drives),0);
        drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
        flags:=flags || to_jsonb('drive_components_connected_by_shared_axis_v1'::text);
      end if;
    end if;
  end if;

  if directive_active then
    flags := flags || to_jsonb('drive_component_prune_deferred_to_hard_graph_gate_v1'::text);
  end if;

  -- Final topology cleanup: parking and drives are disjoint systems.$new$;

  if position(old in d)=0 then
    raise exception 'I-8 shared-axis insertion marker not found';
  end if;
  d:=replace(d,old,new);
  execute d;
end
$patch_core$;

comment on function public.fn_mf_connect_drive_components_shared_axis(geometry,geometry,geometry,numeric,numeric) is
  'Samples shared component X/Y ranges to find a short obstacle-free connection inside the real envelope and impervious headroom.';

notify pgrst,'reload schema';
