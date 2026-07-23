-- Authoritative structure seeds should not fail because a supplemental parking
-- pass left a remote pavement island. If one connected drive component reaches
-- every emitted structure, retain that serving component and its accessible
-- parking, then let the normal parking/impervious hard gates recount.
--
-- This generalizes the existing free-pack recovery to exact Stage-3 seed
-- refinement; it does not waive access or parking requirements.

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('structure_seed_remote_drive_islands_prunable_v1' in d)>0 then
    return;
  end if;

  old := $old$  if not directive_active
     and drives is not null and not ST_IsEmpty(drives)
     and coalesce(array_length(bars_arr,1),0)>0 then$old$;

  new := $new$  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives)
     and coalesce(array_length(bars_arr,1),0)>0 then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_remote_drive_islands_prunable_v1'::text);
    end if;$new$;

  if position(old in d)=0 then
    raise exception 'structure-seed drive-island marker not found';
  end if;
  d:=replace(d,old,new);
  execute d;
end
$patch_core$;

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily Stage-3 solver. Exact mode consumes fn_site_skeleton_v2.structures[]; remote pavement islands may be pruned when one component serves all structures; every emitted plan passes I-1.';

notify pgrst,'reload schema';
