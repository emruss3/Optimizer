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

  old := '  drive_band geometry; park_band geometry; court_band geometry; lead_park geometry;';
  new := E'  drive_band geometry; park_band geometry; court_band geometry; lead_park geometry;\n  supplemental_parking geometry; target_stalls integer;';
  if position(old in d)=0 then
    raise exception 'v3 parking declaration marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$
  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
  parking_units_cap := floor(n_stalls/NULLIF(ratio,0))::integer;
$old$;

  new := $new$
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  tot_park := COALESCE(ST_Area(parks),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
  target_stalls := ceil(target_units*ratio)::integer;

  -- Before sacrificing GSF, use remaining land next to the connected drive
  -- network for one-row-deep surface parking. The 18-foot buffer is the stall
  -- module; buildings, drives and existing stalls are subtracted explicitly.
  IF n_stalls<target_stalls THEN
    SELECT ST_UnaryUnion(ST_Collect(bg))
      INTO bars_u
    FROM unnest(bars_arr) AS bg;

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    supplemental_parking := ST_CollectionExtract(
      ST_Difference(
        ST_Intersection(rot,ST_Buffer(drives,stall_d)),
        avoid
      ),
      3
    );

    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO supplemental_parking
    FROM (SELECT (ST_Dump(supplemental_parking)).geom) x
    WHERE ST_Area(x.geom)>300;

    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
      parks := CASE WHEN parks IS NULL THEN supplemental_parking
                    ELSE ST_UnaryUnion(ST_Union(parks,supplemental_parking)) END;
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
      flags := flags || to_jsonb('supplemental_parking_along_connected_drives'::text);
    END IF;
  END IF;

  parking_units_cap := floor(n_stalls/NULLIF(ratio,0))::integer;
$old$;

  if position(old in d)=0 then
    raise exception 'v3 parking adaptation marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver. Remaining impervious capacity is first allocated to one-row-deep parking along the connected drive graph; GSF is reduced only after that parking opportunity is exhausted.';
