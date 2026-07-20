-- Convergence phase 2b: court reallocation. Green courts are reclaimable
-- for infill footprint as long as the open-space guard holds (>= the
-- binding minimum, 15%% floor when none binds); the green under an accepted
-- bar is subtracted and the move is flagged. 2611 W Heiman is the
-- acceptance fixture: at 40%% open with no binding minimum, its residual
-- land was green-locked while the objective said build.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '2bab6e6327f55858549ea364dbd4d68a' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 2bab6e6327f55858549ea364dbd4d68a', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $h1o$  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;$h1o$, $h1n$  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;
  open_after numeric;$h1n$);
  v_new := replace(v_new, $h2o$      residual := ST_CollectionExtract(ST_Difference(rot,
        ST_UnaryUnion(ST_Collect(ARRAY[
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,12) END,
          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
          ST_Buffer(drives,2),
          ST_Buffer(parks,1),
          CASE WHEN greens IS NULL THEN NULL ELSE ST_Buffer(greens,1) END
        ]))), 3);$h2o$, $h2n$      -- COURT REALLOCATION (spec phase 2b): green courts are reclaimable
      -- for footprint as long as the open-space guard below holds — a lot
      -- at 40% open with no binding minimum is hoarding land the objective
      -- says to build on.
      residual := ST_CollectionExtract(ST_Difference(rot,
        ST_UnaryUnion(ST_Collect(ARRAY[
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,12) END,
          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
          ST_Buffer(drives,2),
          ST_Buffer(parks,1)
        ]))), 3);$h2n$);
  v_new := replace(v_new, $h3o$              CONTINUE WHEN NOT ST_DWithin(cand, drives, GREATEST(40,stall_d+aisle/2));
              CONTINUE WHEN NOT ST_DWithin(ST_Centroid(cand), parks, 250);
              bars_arr := bars_arr || cand;$h3o$, $h3n$              CONTINUE WHEN NOT ST_DWithin(cand, drives, GREATEST(40,stall_d+aisle/2));
              CONTINUE WHEN NOT ST_DWithin(ST_Centroid(cand), parks, 250);
              -- Open-space guard: the addition must leave the lot at or
              -- above the binding minimum (15% floor when none binds).
              open_after := GREATEST(0, parcel_area - (tot_fp + ST_Area(cand)) - tot_park - tot_drive)
                            / NULLIF(parcel_area,0) * 100.0;
              CONTINUE WHEN open_after < GREATEST(COALESCE(min_open, 15), 15);
              IF greens IS NOT NULL AND ST_Intersects(cand, greens) THEN
                greens := ST_CollectionExtract(ST_Difference(greens, ST_Buffer(cand,2)), 3);
                tot_green := COALESCE(ST_Area(greens),0);
                flags := flags || to_jsonb('court_land_reallocated_to_infill_bar'::text);
              END IF;
              bars_arr := bars_arr || cand;$h3n$);

  IF md5(v_new) <> 'c2c3f52c9c5e22196f3793a3cf791209' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected c2c3f52c9c5e22196f3793a3cf791209', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
