-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- Shallow double-loaded modules lose a larger share of nominal parking area
-- during final topology clipping. Use a 10% programming reserve there and 5%
-- elsewhere; this is a sizing reserve, not a displayed parking shortfall.

do $patch$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    'ceil(n_stalls*0.05)::integer',
    'ceil(n_stalls*CASE WHEN flags ? ''bar_depth_reduced_for_double_loaded_parking'' THEN 0.10 ELSE 0.05 END)::integer'
  );
  v_definition := replace(
    v_definition,
    'parking_geometry_tolerance_reserve_5pct',
    'parking_geometry_tolerance_reserve_adaptive'
  );

  if position('parking_geometry_tolerance_reserve_adaptive' in v_definition) = 0
     or position('bar_depth_reduced_for_double_loaded_parking'' THEN 0.10 ELSE 0.05' in v_definition) = 0 then
    raise exception 'unable to adapt MF parking reserve';
  end if;

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF max-GSF solver. Parking programming reserves 10 percent on shallow double-loaded modules and 5 percent otherwise before bar sizing, protecting final topology cleanup.';

notify pgrst, 'reload schema';
