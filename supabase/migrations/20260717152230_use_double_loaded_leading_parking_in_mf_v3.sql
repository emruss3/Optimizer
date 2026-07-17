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
  IF lead_street THEN
    lead_park := ST_Difference(ST_Intersection(rot, ST_MakeEnvelope(bxmin, y, bxmax, y + stall_d, 2274)), avoid);
    IF lead_park IS NOT NULL AND NOT ST_IsEmpty(lead_park) THEN parks := lead_park; END IF;
    drive_band := ST_Difference(
      ST_Intersection(rot, ST_MakeEnvelope(bxmin, y + stall_d, bxmax, y + stall_d + aisle, 2274)),
      ST_Difference(avoid, ST_Buffer(spine, 4)));
    IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
      drives := drive_band;
      mid := y + stall_d + aisle / 2;
      cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(bxmin, mid), ST_MakePoint(bxmax, mid)), 2274));
      IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
        drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl, cl) END;
      END IF;
    END IF;
    y := y + stall_d + aisle;
  END IF;
$old$;

  new := $new$
  IF lead_street THEN
    lead_park := ST_Difference(
      ST_Intersection(rot,ST_MakeEnvelope(bxmin,y,bxmax,y+stall_d,2274)),
      avoid
    );
    drive_band := ST_Difference(
      ST_Intersection(rot,ST_MakeEnvelope(bxmin,y+stall_d,bxmax,y+stall_d+aisle,2274)),
      ST_Difference(avoid,ST_Buffer(spine,4))
    );

    IF y+drive_gap+bar_depth<=bymax-1 THEN
      park_band := ST_Difference(
        ST_Intersection(rot,ST_MakeEnvelope(
          bxmin,y+stall_d+aisle,bxmax,y+drive_gap,2274
        )),
        avoid
      );
      IF park_band IS NOT NULL AND NOT ST_IsEmpty(park_band) THEN
        lead_park := CASE WHEN lead_park IS NULL OR ST_IsEmpty(lead_park)
          THEN park_band ELSE ST_UnaryUnion(ST_Union(lead_park,park_band)) END;
      END IF;
      y := y+drive_gap;
      flags := flags || to_jsonb('double_loaded_leading_parking'::text);
    ELSE
      y := y+stall_d+aisle;
      flags := flags || to_jsonb('single_loaded_leading_parking_shallow_site'::text);
    END IF;

    IF lead_park IS NOT NULL AND NOT ST_IsEmpty(lead_park) THEN
      parks := lead_park;
    END IF;
    IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
      drives := drive_band;
      mid := ST_YMin(drive_band)+aisle/2.0;
      cl := ST_Intersection(rot,ST_SetSRID(ST_MakeLine(
        ST_MakePoint(bxmin,mid),ST_MakePoint(bxmax,mid)
      ),2274));
      IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
        drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl,cl) END;
      END IF;
    END IF;
  END IF;
$new$;

  if position(old in d)=0 then
    raise exception 'v3 leading parking block not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. The leading parking street becomes double-loaded whenever the buildable depth supports the full parking module plus a residential bar.';
