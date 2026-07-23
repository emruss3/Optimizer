-- Authoritative exact seeds use the same obstacle-aware circulation recovery
-- ladder as free-pack plans. This preserves connected parking supply before the
-- fallback is allowed to prune a remote island and self-size the program.

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('structure_seed_drive_routing_ladder_v1' in d)>0 then
    return;
  end if;

  old := $old$  if not directive_active and drives is not null and not ST_IsEmpty(drives) then
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      for heal_i in 1..4 loop$old$;
  new := $new$  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives) then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_drive_routing_ladder_v1'::text);
    end if;
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      for heal_i in 1..4 loop$new$;
  if position(old in d)=0 then raise exception 'side-collector routing marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$  if not directive_active and drives is not null and not ST_IsEmpty(drives) then
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_dogleg($old$;
  new := $new$  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives) then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_drive_routing_ladder_v1'::text);
    end if;
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_dogleg($new$;
  if position(old in d)=0 then raise exception 'dogleg routing marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$  if not directive_active and drives is not null and not ST_IsEmpty(drives) then
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_shared_axis($old$;
  new := $new$  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives) then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_drive_routing_ladder_v1'::text);
    end if;
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_shared_axis($new$;
  if position(old in d)=0 then raise exception 'shared-axis routing marker missing'; end if;
  d:=replace(d,old,new);

  execute d;
end
$patch_core$;

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily Stage-3 solver. Exact structure seeds use obstacle-aware collector, dogleg, and shared-axis circulation recovery before any island pruning; every emitted plan passes I-1.';

notify pgrst,'reload schema';
