-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15.
-- Corrects the schema qualification used by the Regrid geometry normalizer.

do $patch$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.fn_local_built_form_v2(integer,text,numeric,integer)'::regprocedure);
  if position('public.degrees' in v_definition)=0 then
    raise exception 'public.degrees marker not found';
  end if;
  v_definition:=replace(v_definition,'public.degrees','degrees');
  execute v_definition;
end
$patch$;
