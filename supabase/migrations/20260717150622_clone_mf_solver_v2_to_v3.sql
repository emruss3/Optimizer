-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.
-- Stages the max-GSF solver behind a service-validation function before the
-- stable v2 client contract is switched.

do $patch$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );
  if position('FUNCTION public.fn_generate_mf_site_plan_v2' in v_definition)=0 then
    raise exception 'MF v2 function-name marker not found';
  end if;
  execute replace(
    v_definition,
    'FUNCTION public.fn_generate_mf_site_plan_v2',
    'FUNCTION public.fn_generate_mf_site_plan_v3'
  );
end
$patch$;

revoke all on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) from public;
grant execute on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) to service_role;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF multifamily solver. Not used by the production client until the hard-constraint acceptance suite passes.';
