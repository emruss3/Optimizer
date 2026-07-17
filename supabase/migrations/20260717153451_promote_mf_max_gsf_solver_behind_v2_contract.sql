-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.
--
-- The frontend keeps the stable v2 RPC signature. The tested v3 body is copied
-- behind that contract after determinism, persistence, parking, access, pin,
-- use-mismatch and zero-overlap acceptance checks pass.

do $promote$
declare
  d text;
begin
  d := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );
  if position('FUNCTION public.fn_generate_mf_site_plan_v3' in d)=0 then
    raise exception 'MF v3 function-name marker not found';
  end if;
  execute replace(
    d,
    'FUNCTION public.fn_generate_mf_site_plan_v3',
    'FUNCTION public.fn_generate_mf_site_plan_v2'
  );
end
$promote$;

revoke all on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) from public;
revoke execute on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) from anon,authenticated;
grant execute on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) to service_role;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production max-GSF multifamily solver. The stable v2 API now targets context.max_buildout.max_gsf; parking ratio, connected vehicle access, 250-foot parking distribution, FAR, density, building coverage and impervious coverage are hard constraints.';
comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Service-role validation copy of the production max-GSF MF solver. Browser clients use fn_generate_mf_site_plan_v2.';

notify pgrst,'reload schema';
