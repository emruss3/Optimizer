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
  tot_park  := COALESCE(ST_Area(parks), 0);
  tot_drive := COALESCE(ST_Area(drives), 0);
  tot_green := COALESCE(ST_Area(greens), 0);
  n_stalls  := floor(tot_park / (stall_w * stall_d) * 0.90)::int;
  req_stalls := ceil(units * ratio)::int;
  IF n_stalls < req_stalls THEN
    flags := flags || to_jsonb('parking_below_ratio'::text);
  END IF;
$old$;

  new := $new$
  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
  req_stalls := ceil(units*ratio)::integer;
  actual_impervious := tot_fp+tot_park+tot_drive;

  IF flags ? 'pin_outside_parcel' THEN
    RETURN jsonb_build_object('error','planner_pin_outside_parcel','flags',flags);
  END IF;
  IF max_cov IS NOT NULL AND tot_fp>parcel_area*max_cov/100.0+1 THEN
    RETURN jsonb_build_object(
      'error','planner_building_coverage_exceeded',
      'building_footprint_sqft',round(tot_fp),
      'max_building_footprint_sqft',round(parcel_area*max_cov/100.0),
      'flags',flags
    );
  END IF;
  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1 THEN
    RETURN jsonb_build_object(
      'error','planner_impervious_coverage_exceeded',
      'impervious_sqft',round(actual_impervious),
      'max_impervious_sqft',round(max_impervious_sqft),
      'flags',flags
    );
  END IF;
  IF max_far IS NOT NULL AND gfa>max_far*parcel_area+1 THEN
    RETURN jsonb_build_object(
      'error','planner_far_exceeded',
      'gfa_sqft',round(gfa),
      'max_gfa_sqft',round(max_far*parcel_area),
      'flags',flags
    );
  END IF;
  IF units_max IS NOT NULL AND units>units_max THEN
    RETURN jsonb_build_object(
      'error','planner_density_exceeded',
      'units',units,
      'max_units',units_max,
      'flags',flags
    );
  END IF;
  IF n_stalls<req_stalls THEN
    RETURN jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'flags',flags
    );
  END IF;
  IF drives IS NULL OR ST_IsEmpty(drives) THEN
    RETURN jsonb_build_object('error','planner_drive_network_missing','flags',flags);
  END IF;

  drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
  IF drive_components<>1 THEN
    RETURN jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'flags',flags
    );
  END IF;
  IF parks IS NULL OR ST_IsEmpty(parks) THEN
    RETURN jsonb_build_object('error','planner_parking_missing','flags',flags);
  END IF;

  FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
    IF NOT ST_DWithin(bars_arr[k],drives,GREATEST(40,stall_d+aisle/2)) THEN
      stranded_count := stranded_count+1;
    END IF;
    IF NOT ST_DWithin(ST_Centroid(bars_arr[k]),parks,250) THEN
      remote_parking_count := remote_parking_count+1;
    END IF;
  END LOOP;
  FOR k IN 1..COALESCE(array_length(pin_geoms,1),0) LOOP
    pg := ST_Rotate(pin_geoms[k],-theta,anchor);
    IF NOT ST_DWithin(pg,drives,GREATEST(40,stall_d+aisle/2)) THEN
      stranded_count := stranded_count+1;
    END IF;
    IF NOT ST_DWithin(ST_Centroid(pg),parks,250) THEN
      remote_parking_count := remote_parking_count+1;
    END IF;
  END LOOP;
  IF stranded_count>0 THEN
    RETURN jsonb_build_object(
      'error','planner_building_without_vehicle_access',
      'building_count',stranded_count,
      'flags',flags
    );
  END IF;
  IF remote_parking_count>0 THEN
    RETURN jsonb_build_object(
      'error','planner_parking_distribution_failed',
      'building_count',remote_parking_count,
      'max_distance_ft',250,
      'entrance_proxy','building_centroid',
      'flags',flags
    );
  END IF;
  FOR comp IN SELECT (ST_Dump(parks)).geom AS geom LOOP
    IF NOT ST_DWithin(comp.geom,drives,stall_d+5) THEN
      RETURN jsonb_build_object(
        'error','planner_parking_without_drive_access',
        'flags',flags
      );
    END IF;
  END LOOP;

  flags := flags
    || to_jsonb('parking_ratio_hard_pass'::text)
    || to_jsonb('drive_network_connected_hard_pass'::text)
    || to_jsonb('parking_within_250ft_hard_pass'::text)
    || to_jsonb('entrance_proxy_building_centroid'::text);
$new$;

  if position(old in d)=0 then
    raise exception 'v3 parking block not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver with hard building coverage, impervious coverage, FAR, density, parking ratio, connected drive network, per-building vehicle access and 250-foot parking distribution validation.';
