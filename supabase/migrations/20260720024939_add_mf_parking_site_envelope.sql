-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- fn_max_buildout assumes parking and access can use the site envelope after a
-- uniform side-setback inset. The MF solver previously had only the narrower
-- directional building envelope, so its surface-parking search could not use
-- otherwise available land. Keep both envelopes explicit: `rot` remains the
-- building envelope; `parking_rot` is the side-setback site envelope.

do $patch$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  if position('parking_rot geometry' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '  obb geometry; theta numeric; anchor geometry; rot geometry; parcel_rot geometry;',
      '  obb geometry; theta numeric; anchor geometry; rot geometry; parcel_rot geometry; parking_rot geometry;'
    );
  end if;

  if position('parking_rot := parcel_rot;' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '  parcel_rot := (SELECT geom FROM (SELECT (ST_Dump(parcel_rot)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);' || chr(10) ||
      '  entry_rot := ST_Rotate(entry_pt, -theta, anchor);',
      '  parcel_rot := (SELECT geom FROM (SELECT (ST_Dump(parcel_rot)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);' || chr(10) ||
      '  parking_rot := parcel_rot;' || chr(10) ||
      '  entry_rot := ST_Rotate(entry_pt, -theta, anchor);'
    );
  end if;

  if position('parking_rot geometry' in v_definition) = 0
     or position('parking_rot := parcel_rot;' in v_definition) = 0 then
    raise exception 'unable to add MF parking site envelope';
  end if;

  execute v_definition;
end
$patch$;
