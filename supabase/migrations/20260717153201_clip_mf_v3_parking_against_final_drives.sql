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
  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
  req_stalls := ceil(units*ratio)::integer;
  actual_impervious := tot_fp+tot_park+tot_drive;
$old$;

  new := $new$
  -- Final topology cleanup: parking and drives are disjoint systems. Rebuild
  -- the current bar union after any proportional trimming, then clip parking
  -- against both buildings and the connected drive pavement before counting.
  SELECT ST_UnaryUnion(ST_Collect(bg))
    INTO bars_u
  FROM unnest(bars_arr) AS bg;

  IF parks IS NOT NULL AND NOT ST_IsEmpty(parks) THEN
    parks := ST_CollectionExtract(
      ST_Difference(
        parks,
        ST_UnaryUnion(ST_Collect(ARRAY[
          ST_Buffer(drives,0.05),
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,0.05) END
        ]))
      ),
      3
    );
    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO parks
    FROM (SELECT (ST_Dump(parks)).geom) x
    WHERE ST_Area(x.geom)>50;
  END IF;

  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
  req_stalls := ceil(units*ratio)::integer;
  actual_impervious := tot_fp+tot_park+tot_drive;
$new$;

  if position(old in d)=0 then
    raise exception 'v3 final parking topology marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. Final parking polygons are clipped against the final building and connected-drive systems before stall counting and hard validation.';
