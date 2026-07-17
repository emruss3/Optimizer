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

  old := '  supplemental_parking geometry; target_stalls integer;';
  new := E'  supplemental_parking geometry; target_stalls integer;\n  relief_module geometry; relief_drive geometry; relief_parking geometry; relief_connector geometry;\n  relief_len numeric; relief_x0 numeric; relief_y numeric; relief_side integer; relief_found boolean := false; missing_stalls integer;';
  if position(old in d)=0 then
    raise exception 'v3 relief parking declaration marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$
  parking_units_cap := floor(n_stalls/NULLIF(ratio,0))::integer;
$old$;

  new := $new$
  -- If edge parking is still short, search for one compact double-loaded field
  -- connected to the primary spine. Module depth is stall+aisle+stall; module
  -- length is sized only for the missing stalls.
  IF n_stalls<target_stalls THEN
    missing_stalls := target_stalls-n_stalls;
    relief_len := GREATEST(54,ceil(missing_stalls/2.0)*stall_w);

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    FOREACH relief_side IN ARRAY ARRAY[-1,1] LOOP
      relief_x0 := CASE WHEN relief_side<0
        THEN spine_x-aisle/2.0-4-drive_gap
        ELSE spine_x+aisle/2.0+4
      END;
      relief_y := bymin+5;

      WHILE relief_y+relief_len<=bymax-5 AND NOT relief_found LOOP
        relief_module := ST_MakeEnvelope(
          relief_x0,relief_y,
          relief_x0+drive_gap,relief_y+relief_len,
          2274
        );

        IF ST_Covers(rot,relief_module)
           AND COALESCE(ST_Area(ST_Intersection(relief_module,avoid)),0)<1 THEN
          relief_drive := ST_MakeEnvelope(
            relief_x0+stall_d,relief_y,
            relief_x0+stall_d+aisle,relief_y+relief_len,
            2274
          );
          relief_parking := ST_Union(
            ST_MakeEnvelope(relief_x0,relief_y,relief_x0+stall_d,relief_y+relief_len,2274),
            ST_MakeEnvelope(relief_x0+stall_d+aisle,relief_y,relief_x0+drive_gap,relief_y+relief_len,2274)
          );
          relief_connector := ST_Intersection(
            rot,
            ST_Buffer(
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(spine_x,relief_y+relief_len/2.0),2274),
                ST_SetSRID(ST_MakePoint(relief_x0+stall_d+aisle/2.0,relief_y+relief_len/2.0),2274)
              ),
              aisle/2.0,
              'endcap=flat join=mitre'
            )
          );

          IF relief_connector IS NOT NULL
             AND NOT ST_IsEmpty(relief_connector)
             AND COALESCE(ST_Area(ST_Intersection(relief_connector,CASE WHEN bars_u IS NULL THEN relief_connector ELSE ST_Buffer(bars_u,5) END)),0)<1 THEN
            drives := ST_UnaryUnion(ST_Union(drives,ST_Union(relief_drive,relief_connector)));
            parks := ST_UnaryUnion(ST_Union(parks,relief_parking));
            drives_cl := ST_Union(
              drives_cl,
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(spine_x,relief_y+relief_len/2.0),2274),
                ST_SetSRID(ST_MakePoint(relief_x0+stall_d+aisle/2.0,relief_y+relief_len/2.0),2274)
              )
            );
            relief_found := true;
            flags := flags || to_jsonb('double_loaded_relief_parking_connected_to_spine'::text);
          END IF;
        END IF;
        relief_y := relief_y+10;
      END LOOP;
      EXIT WHEN relief_found;
    END LOOP;

    IF relief_found THEN
      tot_drive := ST_Area(drives);
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
    END IF;
  END IF;

  parking_units_cap := floor(n_stalls/NULLIF(ratio,0))::integer;
$new$;

  if position(old in d)=0 then
    raise exception 'v3 parking cap marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver. A compact double-loaded relief field is searched beside the connected entry spine before GSF is reduced for parking.';
