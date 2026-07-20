-- P0-3 + P0-4b + P0-5 combined: the last three unpinned failure classes.
-- (A) IMPERVIOUS SELF-HEAL: pavement (not buildings) busts the budget on
--     big parcels; shave parking pieces farthest from the buildings until
--     the budget holds, then let the shortfall gate resize the program.
-- (B) FINAL-SHORTFALL SELF-SIZING: the cleanup clip can eat stalls after
--     every upstream pass agreed; resize units to surviving stalls at the
--     top of the unit-size band with proportional bar shrink; refuse only
--     when even one unit cannot be parked.
-- (C) SHORTEST-PATH BRIDGING: connect satellite drive components to the
--     main network with straight pavement strips that never run under a
--     building (three attempts, then the honest gate).

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '953d8ce384f2d35573a75a0785bbcf27' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 953d8ce384f2d35573a75a0785bbcf27', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $w1o$  passes integer; plex_connectors geometry := NULL;$w1o$, $w1n$  passes integer; plex_connectors geometry := NULL;
  heal_i integer; drop_piece geometry; main_comp geometry; sub_comp geometry; bridge geometry; units2 integer;$w1n$);
  v_new := replace(v_new, $w2o$  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('impervious_coverage_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE$w2o$, $w2n$  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1
     AND COALESCE(array_length(pin_geoms,1),0) = 0
     AND parks IS NOT NULL AND NOT ST_IsEmpty(parks) THEN
    -- IMPERVIOUS SELF-HEAL (P0-3): the pavement, not the buildings, busts
    -- the budget on big parcels (supplemental passes add stalls without an
    -- impervious cap). Shave parking pieces FARTHEST from the buildings
    -- until the budget holds; the shortfall gate below then self-sizes the
    -- program to the stalls that remain.
    SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
    FOR heal_i IN 1..40 LOOP
      EXIT WHEN actual_impervious <= max_impervious_sqft + 1;
      drop_piece := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(parks,3))).geom AS g) q
                     ORDER BY CASE WHEN bars_u IS NULL THEN 0 ELSE ST_Distance(g, bars_u) END DESC,
                              ST_Area(g) ASC LIMIT 1);
      EXIT WHEN drop_piece IS NULL;
      parks := ST_CollectionExtract(ST_Difference(parks, ST_Buffer(drop_piece, 0.05)), 3);
      tot_park := COALESCE(ST_Area(parks), 0);
      actual_impervious := tot_fp + tot_park + tot_drive;
      flags := flags || to_jsonb('parking_piece_shed_for_impervious_budget'::text);
      EXIT WHEN parks IS NULL OR ST_IsEmpty(parks);
    END LOOP;
    n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
  END IF;
  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('impervious_coverage_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE$w2n$);
  v_new := replace(v_new, $w3o$  IF n_stalls<req_stalls THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('parking_below_ratio'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'flags',flags
    );
    END IF;
  END IF;$w3o$, $w3n$  IF n_stalls<req_stalls AND COALESCE(array_length(pin_geoms,1),0) = 0 THEN
    -- FINAL-SHORTFALL SELF-SIZING (P0-4b): the cleanup clip can eat stalls
    -- after every upstream pass agreed. Resize the program to the stalls
    -- that actually survived — fewer units at the top of the size band,
    -- bars shrunk proportionally so the band holds — and only refuse when
    -- even one unit cannot be parked.
    units2 := floor(GREATEST(n_stalls - GREATEST(1, ceil(n_stalls*0.05)::integer), 0)/NULLIF(ratio,0))::integer;
    IF units2 >= 1 AND units2 < units THEN
      IF gfa > units2 * max_unit_gsf AND tot_fp > 0 THEN
        bar_scale := (units2 * max_unit_gsf / GREATEST(floors,1)) / tot_fp;
        FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
          new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
          bars_arr[k] := ST_MakeEnvelope(
            ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
            ST_XMin(bars_arr[k])+GREATEST(new_len, 20),ST_YMax(bars_arr[k]),2274);
        END LOOP;
        SELECT COALESCE(SUM(ST_Area(bg)),0) INTO tot_fp FROM unnest(bars_arr) AS bg;
        gfa := tot_fp*floors;
      END IF;
      units := LEAST(units2, GREATEST(floor(gfa/NULLIF(min_unit_gsf,0))::integer, 1));
      req_stalls := ceil(units*ratio)::integer;
      actual_unit_gsf := gfa/NULLIF(units,0);
      actual_impervious := tot_fp + tot_park + tot_drive;
      yield_clamp_reason := COALESCE(yield_clamp_reason,'parking_land');
      flags := flags || to_jsonb('program_self_sized_to_final_parking'::text);
    END IF;
  END IF;
  IF n_stalls<req_stalls THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('parking_below_ratio'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'flags',flags
    );
    END IF;
  END IF;$w3n$);
  v_new := replace(v_new, $w4o$  drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
  IF drive_components<>1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN$w4o$, $w4n$  drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
  IF drive_components > 1 THEN
    -- SHORTEST-PATH BRIDGING (P0-5): connect satellite drive components to
    -- the main network with straight pavement strips that never run under
    -- a building; give up after three attempts and let the gate decide.
    SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
    FOR heal_i IN 1..3 LOOP
      EXIT WHEN drive_components <= 1;
      main_comp := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom AS g) q
                    ORDER BY ST_Area(g) DESC LIMIT 1);
      sub_comp := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom AS g) q
                   ORDER BY ST_Area(g) DESC OFFSET 1 LIMIT 1);
      EXIT WHEN main_comp IS NULL OR sub_comp IS NULL;
      bridge := ST_Buffer(ST_ShortestLine(main_comp, sub_comp), aisle*0.35);
      bridge := ST_Intersection(bridge, parcel_rot);
      IF bridge IS NOT NULL AND NOT ST_IsEmpty(bridge)
         AND (bars_u IS NULL OR NOT ST_Intersects(bridge, ST_Buffer(bars_u, 0.5))) THEN
        drives := ST_UnaryUnion(ST_Union(drives, bridge));
        tot_drive := COALESCE(ST_Area(drives),0);
        flags := flags || to_jsonb('drive_component_bridged_shortest_path'::text);
      ELSE
        EXIT;
      END IF;
      drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    END LOOP;
  END IF;
  IF drive_components<>1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN$w4n$);

  IF md5(v_new) <> '096a1dba2466e39a1563ff86b10127dd' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 096a1dba2466e39a1563ff86b10127dd', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
