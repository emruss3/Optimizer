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

  old := '  bars_arr geometry[] := ''{}'';';
  new := E'  bars_arr geometry[] := ''{}'';\n  filtered_bars geometry[] := ''{}'';';
  if position(old in d)=0 then
    raise exception 'v3 bar-array declaration marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$
  flags := flags || to_jsonb('drive_components_bridged_to_spine'::text);
$old$;

  new := $new$
  flags := flags || to_jsonb('drive_components_bridged_to_spine'::text);

  -- If the parcel itself prevents a legal connector, retain only pavement that
  -- is connected to the primary entry spine. Generated bars and parking in
  -- isolated lobes are removed and the yield is recomputed; user pins are not
  -- silently removed and will fail the final access gate instead.
  SELECT ST_UnaryUnion(ST_Collect(x.geom))
    INTO drives
  FROM (
    SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom
  ) x
  WHERE ST_Intersects(x.geom,spine);

  IF drives IS NULL OR ST_IsEmpty(drives) THEN
    RETURN jsonb_build_object('error','planner_drive_network_missing','flags',flags);
  END IF;

  IF parks IS NOT NULL AND NOT ST_IsEmpty(parks) THEN
    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO parks
    FROM (SELECT (ST_Dump(parks)).geom) x
    WHERE ST_DWithin(x.geom,drives,stall_d+5);
  END IF;

  filtered_bars := '{}'::geometry[];
  tot_fp := 0;
  n_bars := 0;
  FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
    IF ST_DWithin(bars_arr[k],drives,GREATEST(40,stall_d+aisle/2))
       AND parks IS NOT NULL
       AND NOT ST_IsEmpty(parks)
       AND ST_DWithin(ST_Centroid(bars_arr[k]),parks,250) THEN
      filtered_bars := filtered_bars || bars_arr[k];
      tot_fp := tot_fp+ST_Area(bars_arr[k]);
      n_bars := n_bars+1;
    ELSE
      yield_clamp_reason := 'circulation_connectivity';
      flags := flags || to_jsonb('disconnected_site_lobe_excluded'::text);
    END IF;
  END LOOP;
  bars_arr := filtered_bars;
  drives_cl := ST_Intersection(drives_cl,drives);
$new$;

  if position(old in d)=0 then
    raise exception 'v3 drive-bridge completion marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver. When parcel geometry prevents a connected aisle, isolated generated site lobes are removed and yield is recomputed; pinned structures still fail closed.';
