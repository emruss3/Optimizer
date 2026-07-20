-- P2-2 v1: TOWNHOME HONESTY — lane-verified parking + the missing verdict.
-- The lane-network grammar (facing pairs across rear lanes with aprons,
-- mews greens between fronts) already ships; what was dishonest:
-- (a) stalls were a flat units*2 even for rows with no lane behind them
--     (mews-locked rows cannot reach a garage) and for pinned rows whose
--     garages are unmodeled — now stalls count only where a row backs
--     onto a real apron, with 'th_row_without_lane_access' naming every
--     unreachable row;
-- (b) townhome responses carried NO optimization verdict, leaving the
--     verdict-first client blank for the product — now units placed vs
--     the entitlement unit cap (min-lot + density, a legal ceiling)
--     classifies 'feasible' (cap reached, constraint_proven) or
--     'feasible_optimization_incomplete', with the proof object.
-- Rails: pre-image md5 + exact growth delta + exactly-once markers.

DO $mig$
DECLARE
  v_src text;
  v_new text;
  v_len0 integer;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_th_site_plan';

  IF md5(v_src) <> '20c091764da8e6a2576cedd969862d75' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 20c091764da8e6a2576cedd969862d75', md5(v_src);
  END IF;
  v_len0 := length(v_src);

  v_new := v_src;
  v_new := replace(v_new, $u1o$  n_stalls := units * 2;
  req_stalls := ceil(units * ratio)::int;
  flags := flags || to_jsonb('parking_garage_plus_apron_2_per_unit'::text);
$u1o$, $u1n$  -- LANE-VERIFIED PARKING (P2-2): garage+apron stalls exist only where a
  -- row actually backs onto a lane apron; rows without rear-lane access
  -- park nothing, and pinned rows count zero until their garages are
  -- modeled. The flat units*2 was fiction for mews-locked rows.
  n_stalls := 0;
  FOR k IN 1..COALESCE(array_length(rows_arr, 1), 0) LOOP
    IF aprons IS NOT NULL AND NOT ST_IsEmpty(aprons)
       AND ST_DWithin(rows_arr[k], aprons, 1.0) THEN
      n_stalls := n_stalls + rows_units[k] * 2;
    ELSE
      flags := flags || to_jsonb('th_row_without_lane_access'::text);
    END IF;
  END LOOP;
  req_stalls := ceil(units * ratio)::int;
  flags := flags || to_jsonb('parking_garage_plus_apron_lane_verified_v1'::text);
$u1n$);
  v_new := replace(v_new, $u2o$      'units_est', units, 'unit_cap', units_cap,
$u2o$, $u2n$      'units_est', units, 'unit_cap', units_cap,
      'optimization_status', CASE
        WHEN units >= units_cap THEN 'feasible'
        ELSE 'feasible_optimization_incomplete' END,
      'optimization_proof', jsonb_build_object(
        'proof_basis', CASE WHEN units >= units_cap
          THEN 'entitlement_unit_cap_reached'
          ELSE 'search_incomplete' END,
        'units_placed', units,
        'entitlement_unit_cap', units_cap,
        'constraint_proven', units >= units_cap),
$u2n$);

  IF length(v_new) <> v_len0 + 1040 THEN
    RAISE EXCEPTION 'patched length % does not match expected % (+1040)', length(v_new), v_len0 + 1040;
  END IF;
  IF (SELECT count(*) FROM regexp_matches(v_new, 'parking_garage_plus_apron_lane_verified_v1', 'g')) <> 1
     OR (SELECT count(*) FROM regexp_matches(v_new, 'entitlement_unit_cap_reached', 'g')) <> 1
     OR (SELECT count(*) FROM regexp_matches(v_new, 'optimization_status', 'g')) <> 1 THEN
    RAISE EXCEPTION 'patch markers not exactly-once — aborting';
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_th_site_plan(p_ogc_fid integer, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
