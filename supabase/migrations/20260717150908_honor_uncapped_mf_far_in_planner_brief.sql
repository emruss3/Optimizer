-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.

do $patch$
declare
  d text;
  old text;
  new text;
begin
  d := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );

  old := $old$
  v_max_far := nullif(v_design #>> '{far_max,value}', '')::numeric;
  v_max_height := nullif(v_design #>> '{height_max_ft,value}', '')::numeric;
$old$;
  new := $new$
  v_max_far := nullif(v_design #>> '{far_max,value}', '')::numeric;
  IF v_typology='multifamily'
     AND COALESCE((v_design #>> '{entitlement_capacity,far_uncapped_for_mf}')::boolean,false) THEN
    v_max_far := NULL;
  END IF;
  v_max_height := nullif(v_design #>> '{height_max_ft,value}', '')::numeric;
$new$;
  if position(old in d)=0 then
    raise exception 'planner FAR assignment marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$
    || coalesce(v_built_form -> 'flags', '[]'::jsonb)
    || jsonb_build_array('frontage_geometry_is_placeholder_until_road_edge_upgrade');
$old$;
  new := $new$
    || coalesce(v_built_form -> 'flags', '[]'::jsonb)
    || case when v_typology='multifamily'
                  and coalesce((v_design #>> '{entitlement_capacity,far_uncapped_for_mf}')::boolean,false)
            then jsonb_build_array('far_uncapped_for_multifamily') else '[]'::jsonb end
    || jsonb_build_array('frontage_geometry_is_placeholder_until_road_edge_upgrade');
$new$;
  if position(old in d)=0 then
    raise exception 'planner flags marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_compile_planner_context(integer,text,jsonb) is
  'Compiles the max-GSF planner brief. Multifamily FAR is null when the entitlement resolver explicitly marks FAR uncapped; density, height, building coverage, impervious coverage, parking and physical limits remain authoritative.';
