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

  old := $old$
  cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(spine_x, bymin), ST_MakePoint(spine_x, bymax)), 2274));
$old$;
  new := $new$
  IF flags ? 'pin_outside_parcel' THEN
    RETURN jsonb_build_object(
      'error','planner_pin_outside_parcel',
      'flags',flags
    );
  END IF;

  cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(spine_x, bymin), ST_MakePoint(spine_x, bymax)), 2274));
$new$;
  if position(old in d)=0 then
    raise exception 'v3 early pin-rejection marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. Outside-parcel pins are rejected immediately after pin ingestion, before they can affect parking, GSF, density or scoring.';
