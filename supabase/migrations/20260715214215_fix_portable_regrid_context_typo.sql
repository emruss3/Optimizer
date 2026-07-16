-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15.
-- The production function was already correct; this guarded patch corrects the
-- consolidated portable migration before a clean environment first executes it.

do $patch$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.fn_local_built_form_v2(integer,text,numeric,integer)'::regprocedure);
  if position('c.og_fid' in v_definition)>0 then
    execute replace(v_definition,'c.og_fid','c.ogc_fid');
  end if;
end
$patch$;
