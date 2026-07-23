-- Final self-sizing can move a structure edge a few feet after an earlier
-- infrastructure clip. Re-apply the I-1 construction order to the final
-- geometry: structures claim ground first, circulation second, parking third.
-- Recount stalls and connectivity after the clip, then run the proof gate.

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('i1_final_constructive_clip_v1' in d)>0 then
    return;
  end if;

  old := $old$  filtered_bars:=bars_arr;
  for k in 1..coalesce(array_length(pin_geoms,1),0) loop
    filtered_bars:=filtered_bars||ST_Rotate(pin_geoms[k],-theta,anchor);
  end loop;
  overlap_report:=public.fn_mf_validate_element_disjointness(filtered_bars,parks,drives,1);$old$;

  new := $new$  filtered_bars:=bars_arr;
  for k in 1..coalesce(array_length(pin_geoms,1),0) loop
    filtered_bars:=filtered_bars||ST_Rotate(pin_geoms[k],-theta,anchor);
  end loop;

  select ST_UnaryUnion(ST_Collect(bg)) into bars_u
  from unnest(filtered_bars) bg;

  if bars_u is not null and not ST_IsEmpty(bars_u) then
    if drives is not null and not ST_IsEmpty(drives) then
      drives:=ST_CollectionExtract(
        ST_Difference(drives,ST_Buffer(bars_u,0.05)),3
      );
      select ST_UnaryUnion(ST_Collect(q.geom)) into drives
      from (select (ST_Dump(drives)).geom) q
      where ST_Area(q.geom)>10;
    end if;

    if parks is not null and not ST_IsEmpty(parks) then
      parks:=ST_CollectionExtract(
        ST_Difference(
          parks,
          ST_UnaryUnion(ST_Collect(array[
            ST_Buffer(bars_u,0.05),
            case when drives is null then null else ST_Buffer(drives,0.05) end
          ]))
        ),3
      );
      select ST_UnaryUnion(ST_Collect(q.geom)) into parks
      from (select (ST_Dump(parks)).geom) q
      where ST_Area(q.geom)>50;
    end if;
  end if;

  tot_drive:=coalesce(ST_Area(drives),0);
  tot_park:=coalesce(ST_Area(parks),0);
  n_stalls:=floor(tot_park/(stall_w*stall_d)*0.90)::integer
    + floor(tot_fp*park_floors/380.0)::integer;
  req_stalls:=ceil(units*ratio)::integer;
  actual_impervious:=tot_fp+tot_park+tot_drive;
  drive_components:=case when drives is null or ST_IsEmpty(drives) then 0
    else ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3)) end;
  flags:=flags||to_jsonb('i1_final_constructive_clip_v1'::text);

  if drive_components<>1 then
    return jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'reason','final I-1 structure clip severed circulation',
      'flags',flags
    );
  end if;
  if parks is null or ST_IsEmpty(parks) then
    return jsonb_build_object(
      'error','planner_parking_missing',
      'reason','no parking remains after final I-1 structure/circulation clip',
      'flags',flags
    );
  end if;
  if n_stalls<req_stalls then
    return jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'reason','parking fell below the placed-unit requirement after final I-1 clip',
      'flags',flags
    );
  end if;

  overlap_report:=public.fn_mf_validate_element_disjointness(filtered_bars,parks,drives,1);$new$;

  if position(old in d)=0 then
    raise exception 'I-1 constructive clip marker not found';
  end if;
  d:=replace(d,old,new);
  execute d;
end
$patch_core$;

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily Stage-3 solver. Final structures claim ground before circulation and parking; counts/connectivity are recomputed, then I-1 proves pairwise disjointness.';

notify pgrst,'reload schema';
