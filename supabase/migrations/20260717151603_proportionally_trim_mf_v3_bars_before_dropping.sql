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

  old := '  max_gsf_by_parking numeric; excess_area numeric; last_area numeric; shrink_len numeric; last_bar geometry;';
  new := E'  max_gsf_by_parking numeric; excess_area numeric; last_area numeric; shrink_len numeric; last_bar geometry;\n  desired_fp numeric; bar_scale numeric; new_len numeric;';
  if position(old in d)=0 then
    raise exception 'v3 proportional-trim declaration marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$
  actual_impervious := tot_fp+tot_park+tot_drive;
  WHILE max_impervious_sqft IS NOT NULL
$old$;
  new := $new$
  actual_impervious := tot_fp+tot_park+tot_drive;
  IF max_impervious_sqft IS NOT NULL
     AND actual_impervious>max_impervious_sqft+1
     AND n_bars>0 THEN
    desired_fp := max_impervious_sqft-tot_park-tot_drive;
    IF desired_fp>=n_bars*bar_min*bar_depth AND desired_fp<tot_fp THEN
      bar_scale := desired_fp/tot_fp;
      FOR k IN 1..array_length(bars_arr,1) LOOP
        new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
        bars_arr[k] := ST_MakeEnvelope(
          ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
          ST_XMin(bars_arr[k])+new_len,ST_YMax(bars_arr[k]),2274);
      END LOOP;
      tot_fp := desired_fp;
      actual_impervious := tot_fp+tot_park+tot_drive;
      yield_clamp_reason := 'impervious_coverage';
      flags := flags || to_jsonb('bars_proportionally_trimmed_for_impervious'::text);
    END IF;
  END IF;
  WHILE max_impervious_sqft IS NOT NULL
$new$;
  if position(old in d)=0 then
    raise exception 'v3 impervious trim marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$
  gfa := tot_fp*floors;
  WHILE gfa>max_gsf_by_parking+1 AND n_bars>0 LOOP
$old$;
  new := $new$
  gfa := tot_fp*floors;
  IF gfa>max_gsf_by_parking+1 AND n_bars>0 THEN
    desired_fp := max_gsf_by_parking/GREATEST(floors,1);
    IF desired_fp>=n_bars*bar_min*bar_depth AND desired_fp<tot_fp THEN
      bar_scale := desired_fp/tot_fp;
      FOR k IN 1..array_length(bars_arr,1) LOOP
        new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
        bars_arr[k] := ST_MakeEnvelope(
          ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
          ST_XMin(bars_arr[k])+new_len,ST_YMax(bars_arr[k]),2274);
      END LOOP;
      tot_fp := desired_fp;
      gfa := tot_fp*floors;
      yield_clamp_reason := 'parking_land';
      flags := flags || to_jsonb('bars_proportionally_trimmed_for_parking'::text);
    END IF;
  END IF;
  WHILE gfa>max_gsf_by_parking+1 AND n_bars>0 LOOP
$new$;
  if position(old in d)=0 then
    raise exception 'v3 parking trim marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver. Bars are proportionally shortened across the connected scheme before any whole bar is dropped for parking or impervious constraints.';
