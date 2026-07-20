-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- The first hard parking solve can shorten bars and expose new connected land.
-- Preserve the maximum connected bar geometry, search newly exposed parking
-- outside the building envelope, and regrow the bars toward the GSF supported
-- by the updated parking and impervious budgets.

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  if position('bars_regrown_after_second_parking_pass' in v_definition) = 0 then
    v_old := $old$
  bars_arr geometry[] := '{}';
  filtered_bars geometry[] := '{}';
$old$;
    v_new := $new$
  bars_arr geometry[] := '{}';
  bars_capacity_arr geometry[] := '{}';
  filtered_bars geometry[] := '{}';
$new$;
    if position(v_old in v_definition)=0 then
      raise exception 'MF bar-array declaration marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);

    v_old := $old$
  n_bars integer := 0; tot_fp numeric := 0; gfa numeric := 0;
$old$;
    v_new := $new$
  n_bars integer := 0; tot_fp numeric := 0; capacity_fp numeric := 0; gfa numeric := 0;
$new$;
    if position(v_old in v_definition)=0 then
      raise exception 'MF capacity declaration marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);

    v_old := $old$
  bars_arr := filtered_bars;
  drives_cl := ST_Intersection(drives_cl,drives);
$old$;
    v_new := $new$
  bars_arr := filtered_bars;
  -- Preserve the maximum connected building geometry before the hard parking
  -- solve trims it. A second parking pass can later regrow toward this capacity
  -- without inventing a new placement or crossing the building envelope.
  bars_capacity_arr := bars_arr;
  capacity_fp := tot_fp;
  drives_cl := ST_Intersection(drives_cl,drives);
$new$;
    if position(v_old in v_definition)=0 then
      raise exception 'MF connected capacity marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);

    v_old := $old$
  IF n_bars=0 AND COALESCE(array_length(pin_geoms,1),0)=0 THEN
$old$;
    v_new := $new$
  -- The first parking solve can shorten bars and expose new land beside the
  -- connected drive network. Search that land once more, but only outside the
  -- directional building envelope, then regrow the preserved bars toward the
  -- legal GSF target supported by the new parking count.
  IF n_bars>0 AND parks IS NOT NULL AND drives IS NOT NULL THEN
    SELECT ST_UnaryUnion(ST_Collect(bg))
      INTO bars_u
    FROM unnest(bars_arr) AS bg;

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,1) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    supplemental_parking := ST_CollectionExtract(
      ST_Difference(
        ST_Intersection(
          ST_Difference(parking_rot,rot),
          ST_Buffer(drives,stall_d)
        ),
        avoid
      ),
      3
    );

    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO supplemental_parking
    FROM (SELECT (ST_Dump(supplemental_parking)).geom) x
    WHERE ST_Area(x.geom)>300;

    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
      parks := ST_UnaryUnion(ST_Union(parks,supplemental_parking));
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
      flags := flags || to_jsonb('second_pass_parking_outside_building_envelope'::text);

      parking_units_cap := floor(GREATEST(
        n_stalls-GREATEST(
          1,
          ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer
        ),
        0
      )/NULLIF(ratio,0))::integer;
      max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);

      desired_fp := LEAST(
        capacity_fp,
        target_gsf/GREATEST(floors,1),
        max_gsf_by_parking/GREATEST(floors,1),
        COALESCE(cov_cap_sqft,capacity_fp),
        COALESCE(max_impervious_sqft-tot_park-tot_drive,capacity_fp)
      );
      desired_fp := GREATEST(0,desired_fp);

      IF capacity_fp>0
         AND desired_fp>tot_fp+1
         AND desired_fp>=COALESCE(array_length(bars_capacity_arr,1),0)*bar_min*bar_depth THEN
        bar_scale := LEAST(1,desired_fp/capacity_fp);
        filtered_bars := '{}'::geometry[];
        tot_fp := 0;
        n_bars := 0;
        FOR k IN 1..COALESCE(array_length(bars_capacity_arr,1),0) LOOP
          new_len := (ST_XMax(bars_capacity_arr[k])-ST_XMin(bars_capacity_arr[k]))*bar_scale;
          bar := ST_MakeEnvelope(
            ST_XMin(bars_capacity_arr[k]),ST_YMin(bars_capacity_arr[k]),
            ST_XMin(bars_capacity_arr[k])+new_len,ST_YMax(bars_capacity_arr[k]),2274
          );
          filtered_bars := filtered_bars || bar;
          tot_fp := tot_fp+ST_Area(bar);
          n_bars := n_bars+1;
        END LOOP;
        bars_arr := filtered_bars;
        gfa := tot_fp*floors;
        IF gfa<target_gsf-1 THEN
          yield_clamp_reason := COALESCE(yield_clamp_reason,'parking_land');
        ELSIF yield_clamp_reason='parking_land' THEN
          yield_clamp_reason := NULL;
        END IF;
        flags := flags || to_jsonb('bars_regrown_after_second_parking_pass'::text);
      END IF;
    END IF;
  END IF;

  IF n_bars=0 AND COALESCE(array_length(pin_geoms,1),0)=0 THEN
$new$;
    if position(v_old in v_definition)=0 then
      raise exception 'MF second-pass insertion marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);
  end if;

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF max-GSF solver. After initial hard parking trim, it performs one outside-building-envelope connected parking pass and regrows preserved bars toward the supported GSF frontier.';

notify pgrst, 'reload schema';
