-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- A one-stall reserve was not enough when final polygon clipping removed several
-- nominal stalls. Reserve five percent (minimum one stall) before sizing GSF.

do $patch$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    'parking_units_cap := floor(GREATEST(n_stalls-1,0)/NULLIF(ratio,0))::integer;',
    'parking_units_cap := floor(GREATEST(n_stalls-GREATEST(1,ceil(n_stalls*0.05)::integer),0)/NULLIF(ratio,0))::integer;'
  );
  v_definition := replace(
    v_definition,
    'one_stall_geometry_tolerance_reserve',
    'parking_geometry_tolerance_reserve_5pct'
  );

  if position('parking_geometry_tolerance_reserve_5pct' in v_definition) = 0
     or position('n_stalls-GREATEST(1,ceil(n_stalls*0.05)::integer)' in v_definition) = 0 then
    raise exception 'unable to size MF parking reserve';
  end if;

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF max-GSF solver. Parking programming reserves 5 percent (minimum one stall) before bar sizing so final topology clipping cannot turn a feasible scheme into a late parking shortfall.';

notify pgrst, 'reload schema';
