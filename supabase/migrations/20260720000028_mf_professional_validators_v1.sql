-- P2-3 v1: PROFESSIONAL VALIDATORS in the MF worker — measured receipts,
-- never refusals. (a) Fire access per the IFC 503.1.1 measure: the worst
-- point of any building (bars AND pins) to the nearest drive pavement,
-- sampled every 20 ft along each footprint ring; flags
-- fire_access_within_150ft / fire_access_exceeds_150ft. (b) ADA stalls
-- required per the IBC 1106 table (2% approximation past 500). (c)
-- EV-capable stalls at 10%. All three land in metrics with a
-- validators_basis receipt so the report cites its sources.

DO $mig$
DECLARE
  v_new text;
BEGIN
  SELECT prosrc INTO v_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_mf_solve_core';

  IF md5(v_new) <> '7469e89c31ea93c25656a6643b3fa089' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 7469e89c31ea93c25656a6643b3fa089', md5(v_new);
  END IF;

  v_new := replace(v_new, $p1o$  park_floors integer := 0;
  frontage jsonb;
$p1o$, $p1n$  park_floors integer := 0;
  frontage jsonb;
  fire_max_ft numeric := 0; ada_req integer := 0; ev_req integer := 0;
$p1n$);
  v_new := replace(v_new, $p2o$  flags := flags
    || to_jsonb('parking_ratio_hard_pass'::text)
    || to_jsonb('drive_network_connected_hard_pass'::text)
    || to_jsonb('parking_within_250ft_hard_pass'::text)
    || to_jsonb('entrance_proxy_building_centroid'::text);
$p2o$, $p2n$  flags := flags
    || to_jsonb('parking_ratio_hard_pass'::text)
    || to_jsonb('drive_network_connected_hard_pass'::text)
    || to_jsonb('parking_within_250ft_hard_pass'::text)
    || to_jsonb('entrance_proxy_building_centroid'::text);

  -- PROFESSIONAL VALIDATORS v1 (P2-3): measured receipts, never refusals.
  -- Fire access (IFC 503.1.1 measure): the worst point of any building to
  -- the nearest drive pavement, sampled every 20 ft along each footprint
  -- ring (hose-lay approximation). Buildings and pins both measured.
  FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
    FOR comp IN SELECT (ST_DumpPoints(ST_Segmentize(ST_ExteriorRing(bars_arr[k]), 20))).geom AS geom LOOP
      fire_max_ft := GREATEST(fire_max_ft, COALESCE(ST_Distance(comp.geom, drives), 0));
    END LOOP;
  END LOOP;
  FOR k IN 1..COALESCE(array_length(pin_geoms,1),0) LOOP
    FOR comp IN SELECT (ST_DumpPoints(ST_Segmentize(ST_ExteriorRing(ST_Rotate(pin_geoms[k],-theta,anchor)), 20))).geom AS geom LOOP
      fire_max_ft := GREATEST(fire_max_ft, COALESCE(ST_Distance(comp.geom, drives), 0));
    END LOOP;
  END LOOP;
  IF fire_max_ft > 150 THEN
    flags := flags || to_jsonb('fire_access_exceeds_150ft'::text);
  ELSE
    flags := flags || to_jsonb('fire_access_within_150ft'::text);
  END IF;
  -- ADA (IBC 1106 table; >500 stalls = 2% approximation) + EV-ready (10%).
  ada_req := CASE
    WHEN n_stalls <= 0 THEN 0
    WHEN n_stalls <= 25 THEN 1
    WHEN n_stalls <= 50 THEN 2
    WHEN n_stalls <= 75 THEN 3
    WHEN n_stalls <= 100 THEN 4
    WHEN n_stalls <= 150 THEN 5
    WHEN n_stalls <= 200 THEN 6
    WHEN n_stalls <= 300 THEN 7
    WHEN n_stalls <= 400 THEN 8
    WHEN n_stalls <= 500 THEN 9
    ELSE ceil(n_stalls * 0.02)::int
  END;
  ev_req := ceil(GREATEST(n_stalls,0) * 0.10)::int;
$p2n$);
  v_new := replace(v_new, $p3o$      'parking_max_distance_ft', 250,
$p3o$, $p3n$      'parking_max_distance_ft', 250,
      'fire_access_max_ft', round(fire_max_ft),
      'ada_stalls_required', ada_req,
      'ev_capable_stalls_required', ev_req,
      'validators_basis', 'ifc_503_150ft; ibc_1106_table_v1; ev_10pct_v1',
$p3n$);

  IF md5(v_new) <> 'a7f6fc2932df630f839a86187303b9db' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected a7f6fc2932df630f839a86187303b9db', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_mf_solve_core(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid, p_regime text)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
