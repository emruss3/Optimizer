-- The reserved side spine reaches the frontage-normalized envelope edge and is
-- itself the authoritative entry root. Inheriting the generic front-drive
-- component contaminated otherwise legal rear-field families. Keep the old
-- parking only as fallback, but build every candidate from the spine alone.

do $patch_helper$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_refill_structure_seed_parking(geometry,geometry,geometry,geometry,numeric,integer,numeric,numeric,numeric,numeric,numeric)'::regprocedure
  ) into d;

  if position('authoritative side spine is the entry root' in d)>0 then
    return;
  end if;

  old := $old$  v_base_drives:=ST_CollectionExtract(ST_UnaryUnion(ST_Collect(array[
    ST_Buffer(v_spine,0.05),
    case when v_entry_root is null then null else ST_Buffer(v_entry_root,0.05) end
  ])),3);
  if v_base_drives is null or ST_IsEmpty(v_base_drives) then
    v_base_drives:=v_spine;
  end if;$old$;

  new := $new$  -- The authoritative side spine is the entry root: it reaches the
  -- frontage-normalized envelope edge. Do not inherit generic front pavement.
  v_base_drives:=ST_CollectionExtract(ST_UnaryUnion(ST_Buffer(v_spine,0.05)),3);
  if v_base_drives is null or ST_IsEmpty(v_base_drives) then
    v_base_drives:=v_spine;
  end if;$new$;

  if position(old in d)=0 then
    raise exception 'structure-seed base-drive marker not found';
  end if;
  d:=replace(d,old,new);
  execute d;
end
$patch_helper$;

comment on function public.fn_mf_refill_structure_seed_parking(geometry,geometry,geometry,geometry,numeric,integer,numeric,numeric,numeric,numeric,numeric) is
  'Uses the authoritative frontage-reaching side spine as the entry root, then returns the smallest routed I-1-valid rear-field family meeting the placed-unit stall target.';

notify pgrst,'reload schema';
