-- When routing cannot connect a remote pavement island, it should not block a
-- valid plan if one existing component already reaches every residential bar.
-- Keep the all-building-serving component, discard inaccessible pavement and
-- its parking, then let the normal parking/impervious hard gates recount.

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;
  if position('drive_islands_pruned_to_all_building_serving_component_v1' in d)>0 then
    return;
  end if;

  old := $old$  if directive_active then
    flags := flags || to_jsonb('drive_component_prune_deferred_to_hard_graph_gate_v1'::text);
  end if;

  -- Final topology cleanup: parking and drives are disjoint systems.$old$;

  new := $new$  if not directive_active
     and drives is not null and not ST_IsEmpty(drives)
     and coalesce(array_length(bars_arr,1),0)>0 then
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select c.g into main_comp
      from (
        select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom g
      ) c
      where not exists (
        select 1
        from generate_subscripts(bars_arr,1) s(k)
        where not ST_DWithin(
          bars_arr[s.k],c.g,greatest(40,stall_d+aisle/2)
        )
      )
      order by (
        select coalesce(sum(ST_Area(p.g)),0)
        from (select (ST_Dump(ST_CollectionExtract(parks,3))).geom g) p
        where parks is not null and ST_DWithin(p.g,c.g,stall_d+5)
      ) desc,ST_Area(c.g) desc
      limit 1;

      if main_comp is not null and not ST_IsEmpty(main_comp) then
        drives:=main_comp;
        if parks is not null and not ST_IsEmpty(parks) then
          select ST_UnaryUnion(ST_Collect(p.g)) into parks
          from (select (ST_Dump(ST_CollectionExtract(parks,3))).geom g) p
          where ST_DWithin(p.g,drives,stall_d+5);
        end if;
        tot_drive:=coalesce(ST_Area(drives),0);
        tot_park:=coalesce(ST_Area(parks),0);
        drive_components:=1;
        flags:=flags || to_jsonb('drive_islands_pruned_to_all_building_serving_component_v1'::text);
      end if;
    end if;
  end if;

  if directive_active then
    flags := flags || to_jsonb('drive_component_prune_deferred_to_hard_graph_gate_v1'::text);
  end if;

  -- Final topology cleanup: parking and drives are disjoint systems.$new$;

  if position(old in d)=0 then
    raise exception 'I-8 drive-island prune insertion marker not found';
  end if;
  d:=replace(d,old,new);
  execute d;
end
$patch_core$;

notify pgrst,'reload schema';
