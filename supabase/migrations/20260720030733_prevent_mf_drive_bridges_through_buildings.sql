-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- A shortest-line connector used to bridge clipped drive components could cross
-- an already placed residential bar. That made the drive graph report one
-- connected component while the rendered building and pavement overlapped.
-- Resolve the bar union before bridge creation and refuse connectors that cross
-- it; the existing lobe-pruning pass then removes unreachable generated areas.

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  if position('drive_bridge_blocked_by_building' in v_definition) = 0 then
    v_old := $old$
  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives,spine) END;
  -- The centerline graph is the connectivity source of truth. Buffer it back
$old$;
    v_new := $new$
  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives,spine) END;
  -- Resolve the generated building union before adding bridge pavement. A
  -- connector may not cross a residential footprint merely to make the drive
  -- graph appear connected.
  SELECT ST_UnaryUnion(ST_Collect(bg))
    INTO bars_u
  FROM unnest(bars_arr) AS bg;
  -- The centerline graph is the connectivity source of truth. Buffer it back
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'MF drive pre-bridge marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);

    v_old := $old$
      IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
        drives := ST_UnaryUnion(ST_Union(drives,drive_band));
      END IF;
$old$;
    v_new := $new$
      IF drive_band IS NOT NULL
         AND NOT ST_IsEmpty(drive_band)
         AND (
           bars_u IS NULL
           OR COALESCE(ST_Area(ST_Intersection(drive_band,ST_Buffer(bars_u,1))),0)<1
         ) THEN
        drives := ST_UnaryUnion(ST_Union(drives,drive_band));
      ELSIF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
        flags := flags || to_jsonb('drive_bridge_blocked_by_building'::text);
      END IF;
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'MF drive bridge marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);
  end if;

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF max-GSF solver. Drive components may be bridged only when the connector avoids building footprints; unreachable lobes are excluded before hard parking/access validation.';

notify pgrst, 'reload schema';
