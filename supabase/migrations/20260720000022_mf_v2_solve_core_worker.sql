-- P1-4 phase A: extract the generator into a REGIME-AWARE WORKER.
-- fn_mf_solve_core(...7 shared args..., p_regime text) is the full solver
-- body derived from the live fn_generate_mf_site_plan_v2 source by eight
-- mechanical transforms, every one of which collapses to the original
-- expression when park_floors = 0 (surface regime). Tuck-under regime:
-- ground floor of every bar hosts parking (~380 sqft gross per stall),
-- residential floors = floors - 1 (with a story bought back inside the
-- legal caps when available), stall supply gains floor(footprint/380),
-- coverage/footprint targets size against residential floors, trim loops
-- may not consume the parking floor, and both metrics builds carry
-- 'regime' + 'tuck_under_stalls' receipts. The final md5 assert proves
-- every transform landed exactly; the dispatcher cutover is a separate
-- migration so this one is pure addition (nothing references the worker
-- yet).

DO $mig$
DECLARE
  v_new text;
BEGIN
  SELECT prosrc INTO v_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_new) <> '096a1dba2466e39a1563ff86b10127dd' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 096a1dba2466e39a1563ff86b10127dd', md5(v_new);
  END IF;

  v_new := replace(v_new, $k0o$  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
$k0o$, $k0n$  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
  park_floors integer := 0;
$k0n$);
  v_new := replace(v_new, $k1o$  floors := LEAST(GREATEST(1,floors),legal_floor_cap);
  target_fp := target_gsf/GREATEST(floors,1);$k1o$, $k1n$  floors := LEAST(GREATEST(1,floors),legal_floor_cap);
  IF p_regime = 'tuck_under' THEN
    -- TUCK-UNDER REGIME (P1-4): the ground floor of every bar hosts parking
    -- (~380 sqft gross per stall including internal aisles); residential
    -- floors are floors - 1. Buy the story back within the legal caps so
    -- the residential program is not automatically one floor smaller.
    floors := floors + 1;
    IF max_h IS NOT NULL THEN
      floors := LEAST(floors, GREATEST(1, floor(max_h/f2f)::integer));
    END IF;
    floors := LEAST(GREATEST(1, floors), legal_floor_cap);
    IF floors < 2 THEN
      RETURN jsonb_build_object('error','planner_regime_infeasible',
        'regime','tuck_under',
        'reason','tuck_under_requires_two_stories_within_height_cap',
        'flags', flags);
    END IF;
    park_floors := 1;
    flags := flags || to_jsonb('regime_tuck_under_v1'::text);
  END IF;
  target_fp := target_gsf/GREATEST(floors - park_floors,1);$k1n$);
  v_new := replace(v_new, $k2o$      floors := LEAST(legal_floor_cap,GREATEST(floors,required_floors_for_coverage));
      target_fp := target_gsf/GREATEST(floors,1);$k2o$, $k2n$      floors := LEAST(legal_floor_cap,GREATEST(floors,required_floors_for_coverage));
      target_fp := target_gsf/GREATEST(floors - park_floors,1);$k2n$);
  v_new := replace(v_new, $k3o$      required_floors_for_coverage := GREATEST(1,ceil(target_gsf/cov_cap_sqft)::integer);$k3o$, $k3n$      required_floors_for_coverage := GREATEST(1,ceil(target_gsf/cov_cap_sqft)::integer) + park_floors;$k3n$);
  v_new := replace(v_new, $k4o$gfa := tot_fp*floors;$k4o$, $k4n$gfa := tot_fp*(floors - park_floors);$k4n$);
  v_new := replace(v_new, $k5o$floor(tot_park/(stall_w*stall_d)*0.90)::integer;$k5o$, $k5n$floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;$k5n$);
  v_new := replace(v_new, $k6o$      ELSIF floors > 1 THEN$k6o$, $k6n$      ELSIF floors > 1 + park_floors THEN$k6n$);
  v_new := replace(v_new, $k7o$'stalls', n_stalls, 'stalls_required', req_stalls,$k7o$, $k7n$'stalls', n_stalls, 'stalls_required', req_stalls,
                'regime', p_regime, 'tuck_under_stalls', floor(tot_fp * park_floors / 380.0)::integer,$k7n$);

  IF md5(v_new) <> '0554f68b3e74bcdf789a4a6a9b1f0c98' THEN
    RAISE EXCEPTION 'worker md5 % does not match expected 0554f68b3e74bcdf789a4a6a9b1f0c98', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_mf_solve_core(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid, p_regime text)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
