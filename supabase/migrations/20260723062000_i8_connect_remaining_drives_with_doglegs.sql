-- Second-stage I-8 drive recovery. A side collector handles fragmented
-- clipped spines; any components that remain are joined with the shortest
-- obstacle-free direct/L/perimeter dogleg available inside the real envelope.
-- Runs before parking clipping and hard impervious/access gates.

create or replace function public.fn_mf_connect_drive_components_dogleg(
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
  obstacle_piece record;
  a geometry;
  b geometry;
  p1 geometry;
  p2 geometry;
  route geometry;
  routes geometry[];
  corridor geometry;
  candidate geometry;
  best geometry;
  route_item geometry;
  half_width numeric;
  margin numeric;
  xmin numeric; xmax numeric; ymin numeric; ymax numeric;
  ax numeric; ay numeric; bx numeric; by numeric;
  original_components integer;
  current_components integer;
  candidate_components integer;
  best_components integer;
  added_area numeric;
  best_added_area numeric;
  iteration integer;
begin
  original:=ST_CollectionExtract(ST_UnaryUnion(p_drives),3);
  if original is null or ST_IsEmpty(original) then return p_drives; end if;
  original_components:=ST_NumGeometries(original);
  if original_components<=1 then return original; end if;

  base:=original;
  half_width:=greatest(coalesce(p_aisle_ft,24)*0.35,6);
  margin:=half_width+2;
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

    a:=ST_ClosestPoint(main_component,other_component);
    b:=ST_ClosestPoint(other_component,main_component);
    ax:=ST_X(a); ay:=ST_Y(a); bx:=ST_X(b); by:=ST_Y(b);
    routes:='{}'::geometry[];

    routes:=routes || ST_SetSRID(ST_MakeLine(a,b),ST_SRID(base));
    routes:=routes || ST_SetSRID(ST_MakeLine(array[
      a,ST_SetSRID(ST_MakePoint(bx,ay),ST_SRID(base)),b
    ]),ST_SRID(base));
    routes:=routes || ST_SetSRID(ST_MakeLine(array[
      a,ST_SetSRID(ST_MakePoint(ax,by),ST_SRID(base)),b
    ]),ST_SRID(base));

    if obstacle is not null then
      for obstacle_piece in
        select (ST_Dump(ST_CollectionExtract(obstacle,3))).geom g
        order by ST_Distance((ST_Dump(ST_CollectionExtract(obstacle,3))).geom,ST_MakeLine(a,b))
      loop
        xmin:=ST_XMin(obstacle_piece.g)-margin;
        xmax:=ST_XMax(obstacle_piece.g)+margin;
        ymin:=ST_YMin(obstacle_piece.g)-margin;
        ymax:=ST_YMax(obstacle_piece.g)+margin;

        p1:=ST_SetSRID(ST_MakePoint(xmin,ay),ST_SRID(base));
        p2:=ST_SetSRID(ST_MakePoint(xmin,by),ST_SRID(base));
        routes:=routes || ST_SetSRID(ST_MakeLine(array[a,p1,p2,b]),ST_SRID(base));

        p1:=ST_SetSRID(ST_MakePoint(xmax,ay),ST_SRID(base));
        p2:=ST_SetSRID(ST_MakePoint(xmax,by),ST_SRID(base));
        routes:=routes || ST_SetSRID(ST_MakeLine(array[a,p1,p2,b]),ST_SRID(base));

        p1:=ST_SetSRID(ST_MakePoint(ax,ymin),ST_SRID(base));
        p2:=ST_SetSRID(ST_MakePoint(bx,ymin),ST_SRID(base));
        routes:=routes || ST_SetSRID(ST_MakeLine(array[a,p1,p2,b]),ST_SRID(base));

        p1:=ST_SetSRID(ST_MakePoint(ax,ymax),ST_SRID(base));
        p2:=ST_SetSRID(ST_MakePoint(bx,ymax),ST_SRID(base));
        routes:=routes || ST_SetSRID(ST_MakeLine(array[a,p1,p2,b]),ST_SRID(base));
      end loop;

      xmin:=ST_XMin(obstacle)-margin;
      xmax:=ST_XMax(obstacle)+margin;
      ymin:=ST_YMin(obstacle)-margin;
      ymax:=ST_YMax(obstacle)+margin;
      routes:=routes
        || ST_SetSRID(ST_MakeLine(array[a,ST_SetSRID(ST_MakePoint(xmin,ay),ST_SRID(base)),ST_SetSRID(ST_MakePoint(xmin,by),ST_SRID(base)),b]),ST_SRID(base))
        || ST_SetSRID(ST_MakeLine(array[a,ST_SetSRID(ST_MakePoint(xmax,ay),ST_SRID(base)),ST_SetSRID(ST_MakePoint(xmax,by),ST_SRID(base)),b]),ST_SRID(base))
        || ST_SetSRID(ST_MakeLine(array[a,ST_SetSRID(ST_MakePoint(ax,ymin),ST_SRID(base)),ST_SetSRID(ST_MakePoint(bx,ymin),ST_SRID(base)),b]),ST_SRID(base))
        || ST_SetSRID(ST_MakeLine(array[a,ST_SetSRID(ST_MakePoint(ax,ymax),ST_SRID(base)),ST_SetSRID(ST_MakePoint(bx,ymax),ST_SRID(base)),b]),ST_SRID(base));
    end if;

    best:=base;
    best_components:=current_components;
    best_added_area:=1e30;
    foreach route_item in array routes loop
      if route_item is null or ST_IsEmpty(route_item) then continue; end if;
      corridor:=ST_CollectionExtract(ST_Intersection(
        p_envelope,ST_Buffer(route_item,half_width,'endcap=flat join=mitre')
      ),3);
      if corridor is null or ST_IsEmpty(corridor) then continue; end if;
      if obstacle is not null
         and coalesce(ST_Area(ST_Intersection(corridor,obstacle)),0)>1 then
        continue;
      end if;
      if not ST_DWithin(corridor,main_component,0.5)
         or not ST_DWithin(corridor,other_component,0.5) then
        continue;
      end if;

      candidate:=ST_CollectionExtract(ST_UnaryUnion(ST_Union(
        ST_Buffer(base,0.05),ST_Buffer(corridor,0.05)
      )),3);
      candidate_components:=ST_NumGeometries(candidate);
      added_area:=greatest(ST_Area(candidate)-ST_Area(original),0);
      if p_max_added_area_sqft is not null
         and added_area>greatest(p_max_added_area_sqft,0)+1 then
        continue;
      end if;
      if candidate_components<best_components
         or (candidate_components=best_components and added_area<best_added_area) then
        best:=candidate;
        best_components:=candidate_components;
        best_added_area:=added_area;
      end if;
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
  if position('drive_components_connected_by_obstacle_dogleg_v1' in d)>0 then
    return;
  end if;

  old := $old$  if directive_active then
    flags := flags || to_jsonb('drive_component_prune_deferred_to_hard_graph_gate_v1'::text);
  end if;

  -- Final topology cleanup: parking and drives are disjoint systems.$old$;

  new := $new$  if not directive_active and drives is not null and not ST_IsEmpty(drives) then
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_dogleg(
        drives,bars_u,parking_rot,aisle,
        case when max_impervious_sqft is null then null
             else greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0) end
      );
      if bridge is not null and not ST_IsEmpty(bridge)
         and ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(bridge),3))<drive_components then
        drives:=bridge;
        tot_drive:=coalesce(ST_Area(drives),0);
        drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
        flags:=flags || to_jsonb('drive_components_connected_by_obstacle_dogleg_v1'::text);
      end if;
    end if;
  end if;

  if directive_active then
    flags := flags || to_jsonb('drive_component_prune_deferred_to_hard_graph_gate_v1'::text);
  end if;

  -- Final topology cleanup: parking and drives are disjoint systems.$new$;

  if position(old in d)=0 then
    raise exception 'I-8 dogleg insertion marker not found';
  end if;
  d:=replace(d,old,new);
  execute d;
end
$patch_core$;

comment on function public.fn_mf_connect_drive_components_dogleg(geometry,geometry,geometry,numeric,numeric) is
  'Obstacle-aware direct/L/perimeter dogleg router for residual fragmented drive components. Respects the real envelope, building obstacles, and impervious headroom.';

notify pgrst,'reload schema';
