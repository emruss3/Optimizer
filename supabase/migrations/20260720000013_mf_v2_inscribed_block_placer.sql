-- P0-1 continuation: INSCRIBED-BLOCK placer for tiny envelopes. The plex
-- machinery (shallow-depth relax + street-loaded stub) engages on 0.2-0.4
-- ac squares but the band grid and 45-ft slab scan still place nothing on
-- their irregular envelopes. One plex block is now anchored street-adjacent
-- (then at the maximum inscribed circle), shrunk through a deterministic
-- size ladder (80..40 ft x bar_depth/34/28) until the true polygon covers
-- it. Gated to envelopes under 140x180 ft with zero placed bars and zero
-- pins; all currently solving parcels untouched.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '8b731f44c6eba1fda73f71fc8774e4cd' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 8b731f44c6eba1fda73f71fc8774e4cd', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $r1o$  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;
  open_after numeric; fp_eligible numeric;$r1o$, $r1n$  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;
  open_after numeric; fp_eligible numeric;
  micc_center geometry; micc_radius numeric; core_g geometry; blen numeric; bdep numeric;$r1n$);
  v_new := replace(v_new, $r2o$  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- Structured refusal: dimensions, not a dead string. Examples identify
    -- failure classes; the payload lets the class be measured.
    RETURN jsonb_build_object('error', 'planner_envelope_unplaceable',$r2o$, $r2n$  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0
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

  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- Structured refusal: dimensions, not a dead string. Examples identify
    -- failure classes; the payload lets the class be measured.
    RETURN jsonb_build_object('error', 'planner_envelope_unplaceable',$r2n$);

  IF md5(v_new) <> '61eb1bfa913a910a74e33ca6059459f9' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 61eb1bfa913a910a74e33ca6059459f9', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
