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

  old := '  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives, spine) END;';
  new := E'  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives,spine) END;\n  -- The centerline graph is the connectivity source of truth. Buffer it back\n  -- to aisle width and union it into the pavement so clipped bands cannot leave\n  -- visually adjacent but topologically disconnected drive components.\n  IF drives_cl IS NOT NULL AND NOT ST_IsEmpty(drives_cl) THEN\n    drives := ST_UnaryUnion(ST_Union(\n      drives,\n      ST_Intersection(rot,ST_Buffer(drives_cl,aisle/2.0))\n    ));\n    flags := flags || to_jsonb(''drive_connectors_from_centerline_graph''::text);\n  END IF;';

  if position(old in d)=0 then
    raise exception 'v3 drive-union marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver. Drive pavement is reconstructed from the connected centerline graph before hard connectivity validation.';
