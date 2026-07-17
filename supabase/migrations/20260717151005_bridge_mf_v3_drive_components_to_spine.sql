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
  IF drives_cl IS NOT NULL AND NOT ST_IsEmpty(drives_cl) THEN
    drives := ST_UnaryUnion(ST_Union(
      drives,
      ST_Intersection(rot,ST_Buffer(drives_cl,aisle/2.0))
    ));
    flags := flags || to_jsonb('drive_connectors_from_centerline_graph'::text);
  END IF;
$old$;

  new := $new$
  IF drives_cl IS NOT NULL AND NOT ST_IsEmpty(drives_cl) THEN
    drives := ST_UnaryUnion(ST_Union(
      drives,
      ST_Intersection(rot,ST_Buffer(drives_cl,aisle/2.0))
    ));
    flags := flags || to_jsonb('drive_connectors_from_centerline_graph'::text);
  END IF;

  -- Clipped irregular parcels can leave a transverse aisle segment on the far
  -- side of a notch. Explicitly bridge each such component to the primary
  -- spine, then let the hard graph validator prove the resulting union.
  FOR comp IN
    SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom AS geom
  LOOP
    IF NOT ST_Intersects(comp.geom,spine) THEN
      drive_band := ST_Intersection(
        rot,
        ST_Buffer(ST_ShortestLine(comp.geom,spine),aisle/2.0,'endcap=flat join=mitre')
      );
      IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
        drives := ST_UnaryUnion(ST_Union(drives,drive_band));
      END IF;
    END IF;
  END LOOP;
  flags := flags || to_jsonb('drive_components_bridged_to_spine'::text);
$new$;

  if position(old in d)=0 then
    raise exception 'v3 drive connector block not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver. Every clipped drive component is explicitly bridged to the primary spine and then verified as one connected graph.';
