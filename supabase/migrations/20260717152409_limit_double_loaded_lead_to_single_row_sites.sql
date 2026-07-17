-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.

do $patch$
declare
  d text;
  old text;
  new text;
begin
  d := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  old := '    IF y+drive_gap+bar_depth<=bymax-1 THEN';
  new := '    IF y+drive_gap+bar_depth<=bymax-1 AND avail_h<2*bar_depth+drive_gap+20 THEN';
  if position(old in d)=0 then
    raise exception 'v3 double-loaded lead condition marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. Double-loaded leading parking is used on shallow single-row sites; deeper sites preserve building rows and use inter-bar parking streets.';
