-- P0-1 completion + P0-2: MICC BLOCK PACKER. The single-block inscribed
-- placer was gated to <140x180 ft envelopes — introspection showed the
-- shape-bound failures (2.3 ac bent parcel, 0.5 ac, 0.36 ac) all carry
-- inscribed radii of 42-100 ft; the gate, not the land, was the blocker.
-- The placer is now general: whenever band grid + slab scan place ZERO
-- bars, pack up to four inscribed-circle-anchored blocks (street-adjacent
-- first, ladder 200..40 ft x depth/45/34/28), each with a flush connector
-- strip toward the spine so the access contract can hold. Connectors join
-- the drive network. Final hard gates unchanged.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> 'd8863e829375dc9c50934161db2d2215' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected d8863e829375dc9c50934161db2d2215', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $v1o$  micc_center geometry; micc_radius numeric; core_g geometry; blen numeric; bdep numeric;$v1o$, $v1n$  micc_center geometry; micc_radius numeric; core_g geometry; blen numeric; bdep numeric;
  passes integer; plex_connectors geometry := NULL;$v1n$);
  v_new := replace(v_new, $v2o$  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0
     AND (bxmax-bxmin) < 140 AND (bymax-bymin) < 180 THEN
    -- INSCRIBED-BLOCK PLACER (P0-1): tiny irregular envelopes defeat both
    -- the band grid and the slab scan (nothing near-rectangular at 45 ft
    -- runs). Anchor ONE plex block — street-adjacent first, then on the
    -- maximum inscribed circle — and shrink through a deterministic size
    -- ladder until the true polygon covers it. One small walk-up block with
    -- street-loaded aprons is how these lots actually develop.
    core_g := ST_Difference(rot, ST_Buffer(spine, 3));
    IF core_g IS NOT NULL AND NOT ST_IsEmpty(core_g) THEN
      core_g := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(core_g,3))).geom AS g) q
                 ORDER BY ST_Area(g) DESC LIMIT 1);
      SELECT (mic).center, (mic).radius INTO micc_center, micc_radius
      FROM (SELECT ST_MaximumInscribedCircle(core_g) AS mic) m;
      IF micc_radius IS NOT NULL AND micc_radius >= 14 THEN
        <<plex_search>>
        FOREACH blen IN ARRAY ARRAY[80,70,60,50,40] LOOP
          FOREACH bdep IN ARRAY ARRAY[bar_depth, 34, 28] LOOP
            FOR tries IN 0..1 LOOP
              IF tries = 0 THEN
                IF abs(ST_Y(entry_rot) - bymin) <= abs(ST_Y(entry_rot) - bymax) THEN
                  yoff := bymin + aisle + 8 + bdep/2;
                ELSE
                  yoff := bymax - aisle - 8 - bdep/2;
                END IF;
              ELSE
                yoff := ST_Y(micc_center);
              END IF;
              cand := ST_MakeEnvelope(
                ST_X(micc_center)-blen/2, yoff-bdep/2,
                ST_X(micc_center)+blen/2, yoff+bdep/2, 2274);
              CONTINUE WHEN NOT ST_Covers(ST_Buffer(core_g,0.3), cand);
              bars_arr := bars_arr || cand;
              bars_capacity_arr := bars_capacity_arr || cand;
              tot_fp := tot_fp + ST_Area(cand);
              n_bars := 1;
              flags := flags || to_jsonb('compact_plex_inscribed_block'::text);
              EXIT plex_search;
            END LOOP;
          END LOOP;
        END LOOP;
      END IF;
    END IF;
  END IF;

$v2o$, $v2n$  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- MICC BLOCK PACKER (P0-1/P0-2): when the band grid and slab scan both
    -- place nothing — tiny lots AND large irregular/bent envelopes (their
    -- inscribed radii measured 42-100 ft while every rectangle test
    -- failed) — pack up to four blocks anchored on the maximum inscribed
    -- circle (street-adjacent first), shrinking through a size ladder
    -- until the true polygon covers each. A flush connector strip runs
    -- from each block toward the spine so the access contract can hold;
    -- the final hard gates still decide honesty.
    core_g := ST_Difference(rot, ST_Buffer(spine, 3));
    FOR passes IN 1..4 LOOP
      EXIT WHEN core_g IS NULL OR ST_IsEmpty(core_g);
      core_g := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(core_g,3))).geom AS g) q
                 ORDER BY ST_Area(g) DESC LIMIT 1);
      EXIT WHEN core_g IS NULL OR ST_IsEmpty(core_g) OR ST_Area(core_g) < 1500;
      SELECT (mic).center, (mic).radius INTO micc_center, micc_radius
      FROM (SELECT ST_MaximumInscribedCircle(core_g) AS mic) m;
      EXIT WHEN micc_radius IS NULL OR micc_radius < 14;
      placed := false;
      <<plex_search>>
      FOREACH blen IN ARRAY ARRAY[200,160,120,100,80,70,60,50,40] LOOP
        FOREACH bdep IN ARRAY ARRAY[bar_depth, 45, 34, 28] LOOP
          FOR tries IN 0..1 LOOP
            IF tries = 0 AND passes = 1 THEN
              IF abs(ST_Y(entry_rot) - bymin) <= abs(ST_Y(entry_rot) - bymax) THEN
                yoff := bymin + aisle + 8 + bdep/2;
              ELSE
                yoff := bymax - aisle - 8 - bdep/2;
              END IF;
            ELSE
              yoff := ST_Y(micc_center);
            END IF;
            bar := ST_MakeEnvelope(
              ST_X(micc_center)-blen/2, yoff-bdep/2,
              ST_X(micc_center)+blen/2, yoff+bdep/2, 2274);
            CONTINUE WHEN bar IS NULL OR ST_Area(bar) < 1120;
            CONTINUE WHEN NOT ST_Covers(ST_Buffer(core_g,0.3), bar);
            bars_arr := bars_arr || bar;
            bars_capacity_arr := bars_capacity_arr || bar;
            tot_fp := tot_fp + ST_Area(bar);
            n_bars := n_bars + 1;
            flags := flags || to_jsonb('compact_plex_inscribed_block'::text);
            -- Flush connector toward the spine (never beneath the block)
            IF spine_x < ST_XMin(bar) - 1 THEN
              cand := ST_Intersection(rot, ST_MakeEnvelope(
                spine_x - aisle/2, yoff - aisle*0.35, ST_XMin(bar), yoff + aisle*0.35, 2274));
            ELSIF spine_x > ST_XMax(bar) + 1 THEN
              cand := ST_Intersection(rot, ST_MakeEnvelope(
                ST_XMax(bar), yoff - aisle*0.35, spine_x + aisle/2, yoff + aisle*0.35, 2274));
            ELSE
              cand := NULL;
            END IF;
            IF cand IS NOT NULL AND NOT ST_IsEmpty(cand) THEN
              plex_connectors := CASE WHEN plex_connectors IS NULL THEN cand
                                      ELSE ST_Union(plex_connectors, cand) END;
              core_g := ST_Difference(core_g, ST_Buffer(cand, 2));
            END IF;
            core_g := ST_Difference(core_g, ST_Buffer(bar, 12));
            placed := true;
            EXIT plex_search;
          END LOOP;
        END LOOP;
      END LOOP;
      EXIT WHEN NOT placed;
    END LOOP;
  END IF;

$v2n$);
  v_new := replace(v_new, $v3o$drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives,spine) END;$v3o$, $v3n$drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives,spine) END;
  IF plex_connectors IS NOT NULL THEN
    drives := ST_Union(drives, plex_connectors);
  END IF;$v3n$);

  IF md5(v_new) <> '953d8ce384f2d35573a75a0785bbcf27' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 953d8ce384f2d35573a75a0785bbcf27', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
