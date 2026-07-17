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
    IF relief_found THEN
      tot_drive := ST_Area(drives);
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
    END IF;
$old$;

  new := $new$
    IF NOT relief_found THEN
      -- Long, shallow infill parcels need the same module rotated 90 degrees:
      -- parking rows and the aisle run along the long parcel axis.
      SELECT ST_UnaryUnion(ST_Collect(g))
        INTO avoid
      FROM (
        VALUES
          (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
          (parks)
      ) obstacle(g)
      WHERE g IS NOT NULL;

      relief_y := bymin+5;
      WHILE relief_y+drive_gap<=bymax-5 AND NOT relief_found LOOP
        relief_x0 := bxmin+5;
        WHILE relief_x0+relief_len<=bxmax-5 AND NOT relief_found LOOP
          relief_module := ST_MakeEnvelope(
            relief_x0,relief_y,
            relief_x0+relief_len,relief_y+drive_gap,
            2274
          );
          relief_drive := ST_MakeEnvelope(
            relief_x0,relief_y+stall_d,
            relief_x0+relief_len,relief_y+stall_d+aisle,
            2274
          );
          relief_parking := ST_Union(
            ST_MakeEnvelope(
              relief_x0,relief_y,
              relief_x0+relief_len,relief_y+stall_d,
              2274
            ),
            ST_MakeEnvelope(
              relief_x0,relief_y+stall_d+aisle,
              relief_x0+relief_len,relief_y+drive_gap,
              2274
            )
          );
          mid := relief_y+stall_d+aisle/2.0;

          IF relief_x0+relief_len<spine_x THEN
            relief_connector := ST_Intersection(
              rot,
              ST_Buffer(
                ST_MakeLine(
                  ST_SetSRID(ST_MakePoint(relief_x0+relief_len,mid),2274),
                  ST_SetSRID(ST_MakePoint(spine_x,mid),2274)
                ),
                aisle/2.0,
                'endcap=flat join=mitre'
              )
            );
          ELSIF relief_x0>spine_x THEN
            relief_connector := ST_Intersection(
              rot,
              ST_Buffer(
                ST_MakeLine(
                  ST_SetSRID(ST_MakePoint(spine_x,mid),2274),
                  ST_SetSRID(ST_MakePoint(relief_x0,mid),2274)
                ),
                aisle/2.0,
                'endcap=flat join=mitre'
              )
            );
          ELSE
            relief_connector := NULL;
          END IF;

          IF ST_Covers(rot,relief_module)
             AND COALESCE(ST_Area(ST_Intersection(
                   relief_parking,
                   CASE WHEN avoid IS NULL THEN drives ELSE ST_UnaryUnion(ST_Union(avoid,drives)) END
                 )),0)<1
             AND COALESCE(ST_Area(ST_Intersection(relief_drive,avoid)),0)<1
             AND (
               ST_Intersects(relief_drive,spine)
               OR (
                 relief_connector IS NOT NULL
                 AND NOT ST_IsEmpty(relief_connector)
                 AND COALESCE(ST_Area(ST_Intersection(relief_connector,avoid)),0)<1
               )
             ) THEN
            drives := ST_UnaryUnion(ST_Union(
              drives,
              CASE WHEN relief_connector IS NULL THEN relief_drive
                   ELSE ST_Union(relief_drive,relief_connector) END
            ));
            parks := ST_UnaryUnion(ST_Union(parks,relief_parking));
            drives_cl := ST_Union(
              drives_cl,
              ST_SetSRID(ST_MakeLine(
                ST_MakePoint(relief_x0,mid),
                ST_MakePoint(relief_x0+relief_len,mid)
              ),2274)
            );
            IF relief_connector IS NOT NULL THEN
              drives_cl := ST_Union(
                drives_cl,
                ST_SetSRID(ST_MakeLine(
                  ST_MakePoint(spine_x,mid),
                  ST_MakePoint(
                    CASE WHEN relief_x0>spine_x THEN relief_x0 ELSE relief_x0+relief_len END,
                    mid
                  )
                ),2274)
              );
            END IF;
            relief_found := true;
            flags := flags || to_jsonb('horizontal_double_loaded_relief_parking'::text);
          END IF;

          relief_x0 := relief_x0+10;
        END LOOP;
        relief_y := relief_y+10;
      END LOOP;
    END IF;

    IF relief_found THEN
      tot_drive := ST_Area(drives);
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer;
    END IF;
$new$;

  if position(old in d)=0 then
    raise exception 'v3 relief completion marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. Relief parking searches both vertical and horizontal double-loaded modules, with the horizontal form optimized for long shallow infill parcels.';
