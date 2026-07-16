-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

do $patch$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.fn_local_built_form_v2(integer,text,numeric,integer)'::regprocedure);
  if position('limit 1000' in v_definition)=0 or position('limit 500' in v_definition)=0 then
    raise exception 'Regrid sample limit markers not found';
  end if;
  v_definition:=replace(v_definition,'limit 1000','limit 150');
  v_definition:=replace(v_definition,'limit 500','limit 100');
  v_definition:=replace(v_definition,'''sample_cap'',500','''sample_cap'',100');
  v_definition:=replace(v_definition,'v_available_n>500','v_available_n>100');
  v_definition:=replace(v_definition,'regrid_sample_capped_500','regrid_sample_capped_100');
  v_definition:=replace(v_definition,'up to 500 closest/lot-similar building geometries','up to 100 closest/lot-similar building geometries');
  execute v_definition;
end
$patch$;

comment on function public.fn_local_built_form_v2(integer,text,numeric,integer) is
  'Typology-aware Regrid context using at most 100 deterministic closest/lot-similar building geometries to keep first-load latency bounded.';
