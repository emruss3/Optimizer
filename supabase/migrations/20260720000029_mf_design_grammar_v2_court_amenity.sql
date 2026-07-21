-- DESIGN GRAMMAR v2 (user directive 2026-07-20): schemes must read as
-- real projects — buildings first, then ONE protected central court with
-- the amenity program at the arrival, then parking consolidated around
-- them. Concretely: (1) the first inter-bar gap on a site with room for
-- it becomes a designed green court that the phase-2b reallocation can
-- never reclaim; (2) at scale (>= 45k residential GSF) a clubhouse
-- occupies the ground floor of the bar nearest the verified entry
-- (amen_gsf honestly subtracts from residential GSF) and a pool court
-- lives in the protected green; (3) receipts: designed_court_sf,
-- amenity_gsf, pool_court_sf in metrics + three flags. Sites too tight
-- for a court keep every gap as a parking street — the court is program
-- where it fits, never a refusal.

DO $mig$
DECLARE
  v_new text;
BEGIN
  SELECT prosrc INTO v_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_mf_solve_core';

  IF md5(v_new) <> 'a7f6fc2932df630f839a86187303b9db' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected a7f6fc2932df630f839a86187303b9db', md5(v_new);
  END IF;

  v_new := replace(v_new, $g0o$  fire_max_ft numeric := 0; ada_req integer := 0; ev_req integer := 0;
$g0o$, $g0n$  fire_max_ft numeric := 0; ada_req integer := 0; ev_req integer := 0;
  court_used boolean := false; protected_court geometry := NULL;
  amen_gsf numeric := 0; pool_rect geometry := NULL; px numeric;
$g0n$);
  v_new := replace(v_new, $g1o$    gap := CASE WHEN use_court THEN court_gap ELSE drive_gap END;
$g1o$, $g1n$    -- DESIGN GRAMMAR v2: ONE central court is program, not residue — the
    -- first inter-bar gap on a site with room for it becomes a designed
    -- green court (the pool/amenity address) and parking consolidates in
    -- the remaining gaps. Sites too tight for a court keep every gap as a
    -- parking street; the court's capture cost is honest and named.
    use_court := (NOT court_used) AND n_bars > 0
                 AND avail_h >= 2*bar_depth + court_gap + drive_gap + stall_d + 6;
    gap := CASE WHEN use_court THEN court_gap ELSE drive_gap END;
$g1n$);
  v_new := replace(v_new, $g2o$      IF use_court THEN
        court_band := ST_Difference(
          ST_Intersection(rot, ST_MakeEnvelope(bxmin, y + bar_depth + 4, bxmax, y + bar_depth + gap - 4, 2274)), avoid);
        IF court_band IS NOT NULL AND NOT ST_IsEmpty(court_band) THEN
          greens := CASE WHEN greens IS NULL THEN court_band ELSE ST_Union(greens, court_band) END;
        END IF;
$g2o$, $g2n$      IF use_court THEN
        court_band := ST_Difference(
          ST_Intersection(rot, ST_MakeEnvelope(bxmin, y + bar_depth + 4, bxmax, y + bar_depth + gap - 4, 2274)), avoid);
        IF court_band IS NOT NULL AND NOT ST_IsEmpty(court_band) THEN
          greens := CASE WHEN greens IS NULL THEN court_band ELSE ST_Union(greens, court_band) END;
          protected_court := court_band;
          flags := flags || to_jsonb('designed_central_court_v1'::text);
        END IF;
        court_used := true;
$g2n$);
  v_new := replace(v_new, $g3o$          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
          ST_Buffer(drives,2),$g3o$, $g3n$          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
          CASE WHEN protected_court IS NULL THEN NULL ELSE ST_Buffer(protected_court,2) END,
          ST_Buffer(drives,2),$g3n$);
  v_new := replace(v_new, $g4o$  -- Do not sacrifice a full residential bar for an amenity before the hard
  -- development frontier is solved. Amenity allocation follows feasibility.
  amen := NULL;
  amen_idx := 0;
  flags := flags || to_jsonb('amenity_bar_conversion_disabled_max_gsf'::text);
$g4o$, $g4n$  -- AMENITY PROGRAM (design grammar v2): at scale, a clubhouse is the
  -- ground-floor program of the bar nearest the arrival — the building
  -- stands, its entry bay stops being residential GSF (amen_gsf carries
  -- the honest capture cost). The pool court lives in the protected
  -- central green when one exists. Small plans (< 45k residential GSF)
  -- carry no amenity program.
  amen := NULL;
  amen_idx := 0;
  IF COALESCE(array_length(bars_arr,1),0) > 0
     AND tot_fp * (floors - park_floors) >= 45000 THEN
    amen_dist := NULL;
    FOR k IN 1..array_length(bars_arr,1) LOOP
      d := ST_Distance(bars_arr[k], entry_rot);
      IF amen_dist IS NULL OR d < amen_dist THEN amen_dist := d; amen_idx := k; END IF;
    END LOOP;
    IF amen_idx > 0 THEN
      amen_gsf := LEAST(GREATEST(1500, tot_fp * (floors - park_floors) / 1300.0 * 20.0),
                        ST_Area(bars_arr[amen_idx]) * 0.5);
      px := GREATEST(ST_YMax(bars_arr[amen_idx]) - ST_YMin(bars_arr[amen_idx]), 1);
      amen := ST_MakeEnvelope(
        ST_XMin(bars_arr[amen_idx]), ST_YMin(bars_arr[amen_idx]),
        LEAST(ST_XMax(bars_arr[amen_idx]), ST_XMin(bars_arr[amen_idx]) + amen_gsf / px),
        ST_YMax(bars_arr[amen_idx]), 2274);
      amen_gsf := COALESCE(ST_Area(amen), 0);
      flags := flags || to_jsonb('amenity_program_ground_floor_v1'::text);
    END IF;
    amen_idx := 0; -- ground-floor use of a standing bar: bar stays in every union
    IF protected_court IS NOT NULL AND NOT ST_IsEmpty(protected_court) THEN
      px := LEAST(GREATEST(ST_X(ST_Centroid(protected_court)) - 40, ST_XMin(protected_court)),
                  ST_XMax(protected_court) - 80);
      pool_rect := ST_Intersection(protected_court, ST_MakeEnvelope(
        px, ST_YMin(protected_court) + 2, px + 80, ST_YMax(protected_court) - 2, 2274));
      IF pool_rect IS NOT NULL AND NOT ST_IsEmpty(pool_rect) AND ST_Area(pool_rect) > 800 THEN
        flags := flags || to_jsonb('pool_court_in_central_green_v1'::text);
      ELSE
        pool_rect := NULL;
      END IF;
    END IF;
  END IF;
$g4n$);
  v_new := replace(v_new, $g5o$gfa := tot_fp*(floors - park_floors);$g5o$, $g5n$gfa := tot_fp*(floors - park_floors) - amen_gsf;$g5n$);
  v_new := replace(v_new, $g6o$  IF amen IS NOT NULL THEN
    ub := ST_Rotate(amen, theta, anchor);
    amen_j := jsonb_build_array(jsonb_build_object('name', 'Clubhouse + Pool',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb));
    amen_l := jsonb_build_array(jsonb_build_object('name', 'Clubhouse + Pool',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb));
  END IF;
$g6o$, $g6n$  IF amen IS NOT NULL THEN
    ub := ST_Rotate(amen, theta, anchor);
    amen_j := jsonb_build_array(jsonb_build_object('name', 'Clubhouse',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb));
    amen_l := jsonb_build_array(jsonb_build_object('name', 'Clubhouse',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb));
  END IF;
  IF pool_rect IS NOT NULL THEN
    ub := ST_Rotate(pool_rect, theta, anchor);
    amen_j := amen_j || jsonb_build_object('name', 'Pool court',
      'area_sqft', round(ST_Area(pool_rect)),
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb);
    amen_l := amen_l || jsonb_build_object('name', 'Pool court',
      'area_sqft', round(ST_Area(pool_rect)),
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb);
  END IF;
$g6n$);
  v_new := replace(v_new, $g7o$      'validators_basis', 'ifc_503_150ft; ibc_1106_table_v1; ev_10pct_v1',
$g7o$, $g7n$      'validators_basis', 'ifc_503_150ft; ibc_1106_table_v1; ev_10pct_v1',
      'designed_court_sf', CASE WHEN protected_court IS NULL THEN 0 ELSE round(ST_Area(protected_court)) END,
      'amenity_gsf', round(amen_gsf),
      'pool_court_sf', CASE WHEN pool_rect IS NULL THEN 0 ELSE round(ST_Area(pool_rect)) END,
$g7n$);

  IF md5(v_new) <> '5ba320fbac46dd2ee9300ad09df246fe' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 5ba320fbac46dd2ee9300ad09df246fe', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_mf_solve_core(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid, p_regime text)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
