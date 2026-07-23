-- Authoritative exact seeds use the same obstacle-aware circulation recovery
-- ladder as free-pack plans. This preserves connected parking supply before the
-- fallback is allowed to prune a remote island and self-size the program.

do $patch_core$
declare
  d text;
  old text;
  new text;
  before_count integer;
  after_count integer;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('structure_seed_drive_routing_ladder_v1' in d)>0 then
    return;
  end if;

  old := $old$  if not directive_active and drives is not null and not ST_IsEmpty(drives) then$old$;
  new := $new$  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives) then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_drive_routing_ladder_v1'::text);
    end if;$new$;

  before_count := (length(d)-length(replace(d,old,'')))/greatest(length(old),1);
  if before_count<>3 then
    raise exception 'expected 3 structure-seed routing markers, found %',before_count;
  end if;
  d:=replace(d,old,new);
  after_count := (length(d)-length(replace(d,'structure_seed_drive_routing_ladder_v1','')))
                 /length('structure_seed_drive_routing_ladder_v1');
  if after_count<>3 then
    raise exception 'structure-seed routing replacement count %, expected 3',after_count;
  end if;

  execute d;
end
$patch_core$;

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily Stage-3 solver. Exact structure seeds use obstacle-aware collector, dogleg, and shared-axis circulation recovery before any island pruning; every emitted plan passes I-1.';

notify pgrst,'reload schema';
