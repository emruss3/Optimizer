-- Generalization fix (random-sweep finding, 2026-07-20): 9 of 12 randomly
-- sampled eligible multifamily parcels produced NOTHING; the dominant class
-- (6 failures) was 'no bars fit the envelope' — the band grid demands
-- OBB-aligned rectangles the true polygon must cover, so irregular
-- envelopes placed zero bars. A slab-fallback placement now runs before any
-- refusal (near-rectangular slab pieces hugging the spine corridor, 45 ft
-- minimum run), and the residual refusal is STRUCTURED
-- ('planner_envelope_unplaceable' with envelope dimensions and grammar
-- minimums) instead of a dead string.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '3a9938e55acd3b5e743f00dcb0e9c028' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 3a9938e55acd3b5e743f00dcb0e9c028', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $m1o$  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    RETURN jsonb_build_object('error', 'no bars fit the envelope',
      'flags', flags);
  END IF;$m1o$, $m1n$  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- SLAB-FALLBACK PLACEMENT (generalization sweep 2026-07-20): the band
    -- grid demands OBB-aligned rectangles the true polygon must COVER, so
    -- irregular envelopes placed ZERO bars — the dominant class in a random
    -- 12-parcel sample (6 of 9 failures). Scan bar-depth slabs across the
    -- envelope, keep near-rectangular pieces hugging the spine corridor
    -- (access contract), relax the minimum run to 45 ft. Downstream parking
    -- machinery operates on these bars normally.
    residual := ST_CollectionExtract(ST_Difference(rot,
      ST_UnaryUnion(ST_Collect(ARRAY[
        ST_Buffer(avoid, 0.1),
        CASE WHEN parks IS NULL THEN NULL ELSE ST_Buffer(parks, 1) END,
        CASE WHEN drives IS NULL THEN NULL ELSE ST_Buffer(drives, 2) END
      ]))), 3);
    IF residual IS NOT NULL AND NOT ST_IsEmpty(residual) THEN
      yoff := bymin + 2;
      WHILE yoff + bar_depth*0.6 <= bymax AND n_bars < 6 LOOP
        slab := ST_Intersection(residual,
                  ST_MakeEnvelope(bxmin, yoff, bxmax, LEAST(yoff+bar_depth, bymax-1), 2274));
        IF slab IS NOT NULL AND NOT ST_IsEmpty(slab) THEN
          FOR spiece IN
            SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(slab,3))).geom AS g) q
            ORDER BY ST_Area(g) DESC, ST_XMin(g)
          LOOP
            EXIT WHEN n_bars >= 6;
            pminx := ST_XMin(spiece.g); pmaxx := ST_XMax(spiece.g);
            pminy := ST_YMin(spiece.g); pmaxy := ST_YMax(spiece.g);
            CONTINUE WHEN (pmaxx-pminx) < 45 OR (pmaxy-pminy) < bar_depth*0.6;
            CONTINUE WHEN (pmaxx-pminx)*(pmaxy-pminy) > ST_Area(spiece.g)*1.08;
            cand := ST_MakeEnvelope(pminx+0.5, pminy+0.5, pmaxx-0.5, pmaxy-0.5, 2274);
            CONTINUE WHEN cand IS NULL OR ST_Area(cand) < 45*bar_depth*0.6;
            CONTINUE WHEN NOT ST_Covers(ST_Buffer(spiece.g,0.3), cand);
            CONTINUE WHEN NOT ST_DWithin(cand, spine, GREATEST(40,stall_d+aisle/2));
            bars_arr := bars_arr || cand;
            bars_capacity_arr := bars_capacity_arr || cand;
            tot_fp := tot_fp + ST_Area(cand);
            n_bars := n_bars + 1;
            avoid := ST_Union(avoid, ST_Buffer(cand, 10));
            residual := ST_CollectionExtract(ST_Difference(residual, ST_Buffer(cand, 10)), 3);
            flags := flags || to_jsonb('bar_placement_slab_fallback_irregular_envelope'::text);
          END LOOP;
        END IF;
        yoff := yoff + bar_depth + bar_gap;
      END LOOP;
    END IF;
  END IF;

  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- Structured refusal: dimensions, not a dead string. Examples identify
    -- failure classes; the payload lets the class be measured.
    RETURN jsonb_build_object('error', 'planner_envelope_unplaceable',
      'reason', 'no bar placement satisfies the grammar in this envelope, including the slab fallback',
      'envelope_width_ft', round(bxmax-bxmin),
      'envelope_depth_ft', round(bymax-bymin),
      'min_bar_ft', jsonb_build_object('length', 45, 'depth', round(bar_depth*0.6)),
      'flags', flags);
  END IF;$m1n$);

  IF md5(v_new) <> '1453d43d14be5bc39fae2a35826495e6' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 1453d43d14be5bc39fae2a35826495e6', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
