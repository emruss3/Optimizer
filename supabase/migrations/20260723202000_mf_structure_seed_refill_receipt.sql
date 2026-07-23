-- Structured-as-stable-flags diagnostic receipt for the Stage-3 parking-field
-- handoff. Kept deliberately numeric and generic so census can cluster state
-- mismatches without parcel-specific logging.

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;
  if position('structure_seed_refill_receipt_v1' in d)>0 then return; end if;

  old := $old$    target_stalls:=ceil(target_units*ratio)::integer;
    select x.out_drives,x.out_parking,x.out_stalls,x.out_modules_added
      into drives,parks,n_stalls,added_this_pass$old$;
  new := $new$    target_stalls:=ceil(target_units*ratio)::integer;
    flags:=flags
      ||to_jsonb('structure_seed_refill_receipt_v1'::text)
      ||to_jsonb(('structure_seed_refill_input_fp_'||round(tot_fp))::text)
      ||to_jsonb(('structure_seed_refill_input_rear_depth_'||round(
          ST_YMax(parking_rot)-ST_YMax(bars_u)
        ))::text)
      ||to_jsonb(('structure_seed_refill_input_spine_x_'||round(spine_x))::text)
      ||to_jsonb(('structure_seed_refill_target_stalls_'||target_stalls)::text);
    select x.out_drives,x.out_parking,x.out_stalls,x.out_modules_added
      into drives,parks,n_stalls,added_this_pass$new$;
  if position(old in d)=0 then raise exception 'refill input receipt marker missing'; end if;
  d:=replace(d,old,new);

  old := $old$    tot_drive:=coalesce(ST_Area(drives),0);
    tot_park:=coalesce(ST_Area(parks),0);
    if added_this_pass>0 then$old$;
  new := $new$    tot_drive:=coalesce(ST_Area(drives),0);
    tot_park:=coalesce(ST_Area(parks),0);
    flags:=flags
      ||to_jsonb(('structure_seed_refill_returned_modules_'||coalesce(added_this_pass,0))::text)
      ||to_jsonb(('structure_seed_refill_returned_stalls_'||coalesce(n_stalls,0))::text)
      ||to_jsonb(('structure_seed_refill_returned_drive_components_'||case
          when drives is null or ST_IsEmpty(drives) then 0
          else ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3)) end
        )::text);
    if added_this_pass>0 then$new$;
  if position(old in d)=0 then raise exception 'refill output receipt marker missing'; end if;
  d:=replace(d,old,new);

  execute d;
end
$patch_core$;

notify pgrst,'reload schema';
