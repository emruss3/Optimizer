-- Complete the side-collector recovery: existing legal drive pavement may
-- touch a building buffer, so obstacle rejection applies to the NEW corridor,
-- not to the entire candidate union. Iterate because one collector can reduce
-- five fragments to two before a second pass closes the graph.

create or replace function public.fn_mf_connect_drive_components_collector(
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
  base geometry;
  best geometry;
  candidate geometry;
  centerline geometry;
  links geometry;
  link geometry;
  corridor geometry;
  obstacle geometry;
  component record;
  position numeric;
  positions numeric[];
  xmin numeric; xmax numeric; ymin numeric; ymax numeric;
  bxmin numeric; bxmax numeric; bymin numeric; bymax numeric;
  env_xmin numeric; env_xmax numeric; env_ymin numeric; env_ymax numeric;
  half_width numeric;
  original_components integer;
  candidate_components integer;
  best_components integer;
  added_area numeric;
  best_added_area numeric := 1e30;
  axis text;
begin
  base:=ST_CollectionExtract(ST_UnaryUnion(p_drives),3);
  if base is null or ST_IsEmpty(base) then return p_drives; end if;
  original_components:=ST_NumGeometries(base);
  if original_components<=1 then return base; end if;

  half_width:=greatest(coalesce(p_aisle_ft,24)*0.35,6);
  xmin:=ST_XMin(base); xmax:=ST_XMax(base); ymin:=ST_YMin(base); ymax:=ST_YMax(base);
  env_xmin:=ST_XMin(p_envelope); env_xmax:=ST_XMax(p_envelope);
  env_ymin:=ST_YMin(p_envelope); env_ymax:=ST_YMax(p_envelope);
  obstacle:=case when p_bars is null or ST_IsEmpty(p_bars) then null
                 else ST_Buffer(p_bars,0.5) end;
  if obstacle is not null then
    bxmin:=ST_XMin(obstacle); bxmax:=ST_XMax(obstacle);
    bymin:=ST_YMin(obstacle); bymax:=ST_YMax(obstacle);
  end if;

  best:=base;
  best_components:=original_components;

  foreach axis in array array['vertical','horizontal'] loop
    positions:=case axis
      when 'vertical' then array[
        env_xmin+half_width,env_xmax-half_width,
        xmin+half_width,xmax-half_width,
        case when obstacle is null then (xmin+xmax)/2 else bxmin-half_width-1 end,
        case when obstacle is null then (xmin+xmax)/2 else bxmax+half_width+1 end
      ]
      else array[
        env_ymin+half_width,env_ymax-half_width,
        ymin+half_width,ymax-half_width,
        case when obstacle is null then (ymin+ymax)/2 else bymin-half_width-1 end,
        case when obstacle is null then (ymin+ymax)/2 else bymax+half_width+1 end
      ]
    end;

    foreach position in array positions loop
      if position is null then continue; end if;
      if axis='vertical' then
        if position<env_xmin+half_width or position>env_xmax-half_width then continue; end if;
        centerline:=ST_SetSRID(ST_MakeLine(
          ST_MakePoint(position,env_ymin+half_width),
          ST_MakePoint(position,env_ymax-half_width)),ST_SRID(base));
      else
        if position<env_ymin+half_width or position>env_ymax-half_width then continue; end if;
        centerline:=ST_SetSRID(ST_MakeLine(
          ST_MakePoint(env_xmin+half_width,position),
          ST_MakePoint(env_xmax-half_width,position)),ST_SRID(base));
      end if;

      links:=centerline;
      for component in select (ST_Dump(base)).geom loop
        link:=ST_ShortestLine(component.geom,centerline);
        if link is not null and not ST_IsEmpty(link) then
          links:=ST_UnaryUnion(ST_Collect(links,link));
        end if;
      end loop;

      corridor:=ST_CollectionExtract(ST_Intersection(
        p_envelope,ST_Buffer(links,half_width,'endcap=flat join=mitre')
      ),3);
      if corridor is null or ST_IsEmpty(corridor) then continue; end if;
      if obstacle is not null
         and coalesce(ST_Area(ST_Intersection(corridor,obstacle)),0)>1 then
        continue;
      end if;

      candidate:=ST_CollectionExtract(ST_UnaryUnion(ST_Union(
        ST_Buffer(base,0.05),ST_Buffer(corridor,0.05)
      )),3);
      if candidate is null or ST_IsEmpty(candidate) then continue; end if;
      candidate_components:=ST_NumGeometries(candidate);
      added_area:=greatest(ST_Area(candidate)-ST_Area(base),0);
      if p_max_added_area_sqft is not null
         and added_area>greatest(p_max_added_area_sqft,0)+1 then continue; end if;

      if candidate_components<best_components
         or (candidate_components=best_components and added_area<best_added_area) then
        best:=candidate;
        best_components:=candidate_components;
        best_added_area:=added_area;
      end if;
      if best_components=1 then return best; end if;
    end loop;
  end loop;
  return best;
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
  if position('drive_side_collector_iterated_v2' in d)>0 then return; end if;

  old := $old$    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_collector(
        drives,bars_u,parking_rot,aisle,
        case when max_impervious_sqft is null then null
             else greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0) end
      );
      if bridge is not null and not ST_IsEmpty(bridge)
         and ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(bridge),3))<drive_components then
        drives:=bridge;
        tot_drive:=coalesce(ST_Area(drives),0);
        drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
        flags:=flags || to_jsonb('drive_components_connected_by_side_collector_v1'::text);
      end if;
    end if;$old$;

  new := $new$    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      for heal_i in 1..4 loop
        exit when drive_components<=1;
        bridge:=public.fn_mf_connect_drive_components_collector(
          drives,bars_u,parking_rot,aisle,
          case when max_impervious_sqft is null then null
               else greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0) end
        );
        exit when bridge is null or ST_IsEmpty(bridge)
          or ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(bridge),3))>=drive_components;
        drives:=bridge;
        tot_drive:=coalesce(ST_Area(drives),0);
        drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
        flags:=flags || to_jsonb('drive_components_connected_by_side_collector_v1'::text);
      end loop;
      flags:=flags || to_jsonb('drive_side_collector_iterated_v2'::text);
    end if;$new$;

  if position(old in d)=0 then
    raise exception 'I-8 side collector iteration marker not found';
  end if;
  d:=replace(d,old,new);
  execute d;
end
$patch_core$;

notify pgrst,'reload schema';
