-- P1-6 v1 (part 3): the TOWNHOME generator's entry point comes from the
-- same verified-frontage detector (fn_parcel_row_frontage). Identical
-- one-hunk upgrade as the MF worker: a real right-of-way edge replaces
-- the longest-edge guess; fabric-locked parcels keep the heuristic and
-- carry 'entry_heuristic_no_row_frontage'. Rails: pre-image md5, exact
-- growth delta, and single-occurrence marker asserts (no local byte copy
-- of this body exists, so the post-image is pinned by construction).

DO $mig$
DECLARE
  v_src text;
  v_new text;
  v_len0 integer;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_th_site_plan';

  IF md5(v_src) <> 'ca1dc7a672f2da35d1b20f83c76c598f' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected ca1dc7a672f2da35d1b20f83c76c598f', md5(v_src);
  END IF;
  IF position('flags := flags ||' in v_src) = 0 THEN
    RAISE EXCEPTION 'TH generator has no flags accumulator — patch assumptions invalid';
  END IF;
  v_len0 := length(v_src);

  v_new := v_src;
  v_new := replace(v_new, $t1o$DECLARE
  bres jsonb; brief jsonb; hc jsonb; pk jsonb; obj jsonb; w jsonb;
$t1o$, $t1n$DECLARE
  bres jsonb; brief jsonb; hc jsonb; pk jsonb; obj jsonb; w jsonb;
  frontage jsonb;
$t1n$);
  v_new := replace(v_new, $t2o$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
    END IF;
  END LOOP;
$t2o$, $t2n$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
    END IF;
  END LOOP;

  -- VERIFIED FRONTAGE (P1-6): same fabric-gap upgrade as the MF worker —
  -- townhome rows entering from a fictional edge are just as wrong.
  frontage := public.fn_parcel_row_frontage(p_ogc_fid);
  IF COALESCE((frontage->>'has_row_frontage')::boolean, false) THEN
    entry_pt := ST_SetSRID(ST_MakePoint(
      (frontage->>'primary_mid_x')::numeric,
      (frontage->>'primary_mid_y')::numeric), 2274);
    flags := flags || to_jsonb('entry_from_row_frontage_v1'::text);
  ELSE
    flags := flags || to_jsonb('entry_heuristic_no_row_frontage'::text);
  END IF;
$t2n$);

  IF length(v_new) <> v_len0 + 583 THEN
    RAISE EXCEPTION 'patched length % does not match expected % (+583)', length(v_new), v_len0 + 583;
  END IF;
  IF (SELECT count(*) FROM regexp_matches(v_new, 'entry_from_row_frontage_v1', 'g')) <> 1
     OR (SELECT count(*) FROM regexp_matches(v_new, 'frontage jsonb;', 'g')) <> 1 THEN
    RAISE EXCEPTION 'patch markers not exactly-once — aborting';
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_th_site_plan(p_ogc_fid integer, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
