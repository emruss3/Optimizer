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

  old := 'parking_units_cap := floor(n_stalls/NULLIF(ratio,0))::integer;';
  new := 'parking_units_cap := floor(GREATEST(n_stalls-1,0)/NULLIF(ratio,0))::integer;';
  if position(old in d)=0 then
    raise exception 'v3 parking-unit-cap marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$
  program_min_units := ceil(gfa/NULLIF(max_unit_gsf,0))::integer;
$old$;
  new := $new$
  program_min_units := ceil(gfa/NULLIF(max_unit_gsf,0))::integer;
  flags := flags || to_jsonb('one_stall_geometry_tolerance_reserve'::text);
$new$;
  if position(old in d)=0 then
    raise exception 'v3 parking-reserve flag marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. Parking-supported GSF reserves one stall before unit programming so final topology clipping and integer stall counts cannot create a rendered shortfall.';
