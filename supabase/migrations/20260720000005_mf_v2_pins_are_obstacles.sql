-- Pins are obstacles: parking and drives never run beneath a user-placed
-- building. Live repro (2611 W Heiman): a resized pin re-solved best-effort,
-- but every later parking/drive pass rebuilt its obstacle set from GENERATED
-- bars only - pins were absent - so the returned plan carried building x
-- parking (251 m2) and building x drive (423 m2) overlaps, which the client
-- zero-overlap gate rightly refused to render. The edit loop froze one gate
-- later than before. Pins now join every avoidance rebuild, the final
-- cleanup clips parking AND drives out from under pins, and a pin-severed
-- drive network reports 'drive_network_disconnected_pinned' instead of
-- refusing.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> 'dba0804dd8aae1ff9fd8f25e75e2fa56' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected dba0804dd8aae1ff9fd8f25e75e2fa56', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $p1o$  pin_geoms geometry[] := '{}'; pin_floors int[] := '{}'; pin record; pg geometry; pf integer;$p1o$, $p1n$  pin_geoms geometry[] := '{}'; pin_floors int[] := '{}'; pin record; pg geometry; pf integer;
  pins_rot geometry := NULL;$p1n$);
  v_new := replace(v_new, $p2o$    END LOOP;
  END IF;
  IF flags ? 'pin_outside_parcel' THEN$p2o$, $p2n$    END LOOP;
  END IF;
  -- Rotated-frame union of every pinned footprint: pins are OBSTACLES to all
  -- later parking/drive passes exactly like generated bars (their absence
  -- here was how a resized pin ended up beneath parking and drives).
  IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
    SELECT ST_UnaryUnion(ST_Collect(ST_Rotate(pgeom, -theta, anchor)))
      INTO pins_rot
    FROM unnest(pin_geoms) AS pgeom;
  END IF;
  IF flags ? 'pin_outside_parcel' THEN$p2n$);
  v_new := replace(v_new, $p3o$  IF n_stalls<target_stalls THEN
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
    WHERE g IS NOT NULL;$p3o$, $p3n$  IF n_stalls<target_stalls THEN
    SELECT ST_UnaryUnion(ST_Collect(bg))
      INTO bars_u
    FROM unnest(bars_arr) AS bg;

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;$p3n$);
  v_new := replace(v_new, $p4o$    relief_len := GREATEST(54,ceil(missing_stalls/2.0)*stall_w);

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;$p4o$, $p4n$    relief_len := GREATEST(54,ceil(missing_stalls/2.0)*stall_w);

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;$p4n$);
  v_new := replace(v_new, $p5o$      SELECT ST_UnaryUnion(ST_Collect(g))
        INTO avoid
      FROM (
        VALUES
          (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
          (parks)
      ) obstacle(g)
      WHERE g IS NOT NULL;$p5o$, $p5n$      SELECT ST_UnaryUnion(ST_Collect(g))
        INTO avoid
      FROM (
        VALUES
          (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
          (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
          (parks)
      ) obstacle(g)
      WHERE g IS NOT NULL;$p5n$);
  v_new := replace(v_new, $p6o$        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,1) END),
        (drives),
        (parks)$p6o$, $p6n$        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,1) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,1) END),
        (drives),
        (parks)$p6n$);
  v_new := replace(v_new, $p7o$    parks := ST_CollectionExtract(
      ST_Difference(
        parks,
        ST_UnaryUnion(ST_Collect(ARRAY[
          ST_Buffer(drives,0.05),
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,0.05) END
        ]))
      ),
      3
    );$p7o$, $p7n$    parks := ST_CollectionExtract(
      ST_Difference(
        parks,
        ST_UnaryUnion(ST_Collect(ARRAY[
          ST_Buffer(drives,0.05),
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,0.05) END,
          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,0.05) END
        ]))
      ),
      3
    );$p7n$);
  v_new := replace(v_new, $p8o$  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);$p8o$, $p8n$  -- Pinned buildings claim their ground: pavement never runs beneath a
  -- user-placed footprint. If clipping severs the drive network, that is
  -- reported below as a pinned-best-effort flag, not a refusal.
  IF pins_rot IS NOT NULL AND drives IS NOT NULL AND NOT ST_IsEmpty(drives) THEN
    drives := ST_CollectionExtract(ST_Difference(drives, ST_Buffer(pins_rot, 0.05)), 3);
  END IF;

  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);$p8n$);
  v_new := replace(v_new, $p9o$  drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
  IF drive_components<>1 THEN
    RETURN jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'flags',flags
    );
  END IF;$p9o$, $p9n$  drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
  IF drive_components<>1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('drive_network_disconnected_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'flags',flags
    );
    END IF;
  END IF;$p9n$);

  IF md5(v_new) <> '26b7e759b94611090109977c28c0b4d2' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 26b7e759b94611090109977c28c0b4d2', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
