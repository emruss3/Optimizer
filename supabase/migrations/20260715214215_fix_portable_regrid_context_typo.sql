-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

do $patch$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.fn_local_built_form_v2(integer,text,numeric,integer)'::regprocedure);
  if position('c.og_fid' in v_definition)>0 then
    execute replace(v_definition,'c.og_fid','c.ogc_fid');
  end if;
end
$patch$;
