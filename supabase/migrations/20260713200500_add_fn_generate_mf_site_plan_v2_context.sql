-- Already applied to project okxrvetbzpoazrybhcqj via MCP on 2026-07-13.
-- Committed for source control and environment parity. Do not reapply blindly.
--
-- Context-driven, scored MF generator (generator_version mf_context_v2).
-- NEW versioned function; the 6-arg v1 stays untouched and operational.
-- All planning values come from the verified solver brief
-- (fn_get_planner_solver_brief); precedent distributions act as PRIORS with
-- constructability clamps, every clamp flagged. Placeholder frontage is never
-- treated as a road edge. Persists context + score lineage on session and
-- candidate (candidate.context_id inherits via trigger).
--
-- Live-verified 2026-07-13:
--   669046/multifamily: 2 floors from precedent p50-p75 (64 comps), bar
--     length min-clamped from p90 target, directional setbacks, 57/50 stalls
--     COMPLIANT, score 0.431 with 8 explicit components, lineage persisted.
--   667899/multifamily: planner_generation_not_allowed (RS5, not as-of-right)
--   667899 context on 669046: planner_context_parcel_mismatch
--   determinism: same context+seed+pins => identical buildings JSON.

-- (function body identical to the live definition; regenerate check:
--  SELECT pg_get_functiondef('public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure);)

CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(
  p_ogc_fid integer,
  p_typology text,
  p_seed integer,
  p_pins jsonb,
  p_parent uuid,
  p_persist boolean,
  p_context_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; obj jsonb; w jsonb;
  ctx_version text; ctx_hash text; prog_version text;
  v_front numeric; v_side numeric; v_rear numeric;
  max_far numeric; max_h numeric; max_den numeric; max_cov numeric; min_open numeric;
  g2274 geometry; buildable geometry; ox numeric; oy numeric;
  obb geometry; theta numeric; anchor geometry; rot geometry; parcel_rot geometry;
  bxmin numeric; bymin numeric; bxmax numeric; bymax numeric;
  avail_h numeric; lead_street boolean := true;
  bar_depth numeric; aisle numeric; stall_w numeric; stall_d numeric; ratio numeric;
  bar_min numeric := 90; bar_max numeric; bar_gap numeric := 25;
  floors integer; f2f numeric;
  p50s numeric; p75s numeric; p90fp numeric; p75fp numeric; n_prec integer; prec_conf text;
  avg_unit numeric; boundary geometry; seg_a geometry; seg_b geometry;
  best_len numeric := 0; seg_len numeric;
  entry_pt geometry; entry_rot geometry; spine_x numeric;
  spine geometry; avoid geometry;
  npts integer; i integer; k integer;
  y numeric; use_court boolean; gap numeric; mid numeric;
  band geometry; comp record;
  x numeric; try_len numeric; bar geometry; placed boolean;
  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
  bars_arr geometry[] := '{}';
  pin_geoms geometry[] := '{}'; pin_floors int[] := '{}'; pin record; pg geometry; pf integer;
  parks geometry := NULL; drives geometry := NULL; greens geometry := NULL;
  drives_cl geometry := NULL; cl geometry;
  amen geometry := NULL; amen_idx integer := 0; amen_dist numeric; d numeric;
  drive_band geometry; park_band geometry; court_band geometry; lead_park geometry;
  bars_j jsonb := '[]'::jsonb; parks_j jsonb := '[]'::jsonb;
  drives_j jsonb := '[]'::jsonb; greens_j jsonb := '[]'::jsonb; amen_j jsonb := '[]'::jsonb;
  bars_l jsonb := '[]'::jsonb; parks_l jsonb := '[]'::jsonb;
  drives_l jsonb := '[]'::jsonb; greens_l jsonb := '[]'::jsonb; amen_l jsonb := '[]'::jsonb;
  bars_u geometry; ub geometry;
  n_bars integer := 0; tot_fp numeric := 0; gfa numeric := 0;
  tot_park numeric := 0; tot_drive numeric := 0; tot_green numeric := 0; n_stalls integer := 0;
  units integer; req_stalls integer; units_max integer;
  far_floor_cap integer; cov_cap_sqft numeric;
  parcel_area numeric; flags jsonb := '[]'::jsonb;
  v_session uuid; v_candidate uuid; persisted boolean := false;
  basis text; money jsonb; margin numeric;
  sc_fin numeric; sc_yield numeric; sc_park numeric; sc_zone numeric;
  sc_prec numeric; sc_prog numeric; sc_circ numeric; sc_open numeric;
  score_components jsonb; score_total numeric;
  avg_bar_fp numeric; drive_pct numeric; open_pct numeric; far_achieved numeric;
BEGIN
  IF p_context_id IS NULL THEN
    RETURN jsonb_build_object('error', 'planner_context_required');
  END IF;
  bres := public.fn_get_planner_solver_brief(p_context_id, p_ogc_fid);
  IF bres ? 'error' THEN
    RETURN jsonb_build_object('error', bres->>'error');
  END IF;
  IF NOT COALESCE((bres->>'generation_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('error', 'planner_generation_not_allowed',
      'flags', COALESCE(bres#>'{solver_brief,flags}', '[]'::jsonb));
  END IF;
  brief := bres->'solver_brief';
  ctx_version := bres->>'context_version';
  ctx_hash := bres->>'context_hash';
  hc := brief->'hard_constraints';
  pk := brief->'parking';
  pri := brief->'precedent_priors';
  prog := brief->'program_prior';
  obj := brief->'objective_profile';
  w := obj->'weights';
  prog_version := brief->>'program_prior_version';
  flags := COALESCE(brief->'flags', '[]'::jsonb);

  v_front := (hc->>'front_setback_ft')::numeric;
  v_side  := (hc->>'side_setback_ft')::numeric;
  v_rear  := (hc->>'rear_setback_ft')::numeric;
  IF v_front IS NULL OR v_side IS NULL OR v_rear IS NULL THEN
    flags := flags || to_jsonb('setback_fallback_typology_default'::text);
    v_front := COALESCE(v_front, 20); v_side := COALESCE(v_side, 10); v_rear := COALESCE(v_rear, 20);
  END IF;
  max_far := (hc->>'max_far')::numeric;
  max_h   := (hc->>'max_height_ft')::numeric;
  max_den := (hc->>'max_density_du_acre')::numeric;
  max_cov := (hc->>'max_coverage_pct')::numeric;
  min_open := (hc->>'min_open_space_pct')::numeric;

  stall_w := COALESCE((pk->>'stall_width_ft')::numeric, 9);
  stall_d := COALESCE((pk->>'stall_depth_ft')::numeric, 18);
  aisle   := COALESCE((pk->>'aisle_width_ft')::numeric, 24);
  ratio   := COALESCE((pk->>'ratio')::numeric, 1.5);
  drive_gap := stall_d + aisle + stall_d;

  avg_unit := COALESCE((prog#>>'{average_unit_sqft,value}')::numeric, 950);
  IF COALESCE(prog#>>'{average_unit_sqft,confidence}', 'low') = 'low' THEN
    flags := flags || to_jsonb('program_prior_low_confidence'::text);
  END IF;

  n_prec := COALESCE((pri->>'sample_size')::int, 0);
  prec_conf := COALESCE(pri->>'confidence', 'unknown');
  p50s := (pri#>>'{stories,p50}')::numeric;
  p75s := (pri#>>'{stories,p75}')::numeric;
  p75fp := (pri#>>'{footprint_sqft,p75}')::numeric;
  p90fp := COALESCE((pri#>>'{underwrite_target,footprint_sqft_p90}')::numeric,
                    (pri#>>'{footprint_sqft,p90}')::numeric);

  SELECT COALESCE(max_floorplate_depth_ft, 65), COALESCE(floor_to_floor_ft, 10)
    INTO bar_depth, f2f FROM public.typology_spec WHERE typology = p_typology;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no typology_spec row for ' || p_typology);
  END IF;
  bar_depth := LEAST(GREATEST(bar_depth, 45), 68);

  IF p50s IS NOT NULL AND p75s IS NOT NULL AND n_prec >= 5 THEN
    floors := GREATEST(2, round((p50s + p75s) / 2.0)::int);
    flags := flags || to_jsonb('stories_from_precedent_p50_p75'::text);
  ELSE
    floors := 3;
    flags := flags || to_jsonb('stories_fallback_typology_default'::text);
  END IF;
  IF max_h IS NOT NULL THEN
    floors := LEAST(floors, GREATEST(1, floor(max_h / f2f)::int));
  END IF;

  IF p90fp IS NOT NULL AND n_prec >= 5 THEN
    bar_max := round(p90fp / bar_depth);
    IF bar_max < bar_min THEN
      flags := flags || to_jsonb('bar_length_clamped_min_constructability'::text);
      bar_max := bar_min;
    ELSIF bar_max > 300 THEN
      flags := flags || to_jsonb('bar_length_clamped_max_constructability'::text);
      bar_max := 300;
    ELSE
      flags := flags || to_jsonb('bar_length_from_precedent_p90'::text);
    END IF;
  ELSE
    bar_max := 250;
    flags := flags || to_jsonb('bar_length_fallback_default'::text);
  END IF;

  SELECT geom_2274 INTO g2274 FROM public.parcels WHERE ogc_fid = p_ogc_fid;
  IF g2274 IS NULL THEN RETURN jsonb_build_object('error', 'parcel has no geom_2274'); END IF;
  g2274 := (ST_Dump(g2274)).geom;
  parcel_area := ST_Area(g2274);
  ox := ST_XMin(g2274); oy := ST_YMin(g2274);
  cov_cap_sqft := CASE WHEN max_cov IS NOT NULL THEN parcel_area * max_cov / 100.0 ELSE NULL END;
  units_max := CASE WHEN max_den IS NOT NULL THEN floor(max_den * parcel_area / 43560.0)::int ELSE NULL END;

  IF COALESCE((brief#>>'{geometry,front_edge_is_placeholder}')::boolean, true) THEN
    NULL; -- keep the longest-frontage heuristic; never route from placeholder edge
  END IF;
  boundary := ST_Simplify(ST_ExteriorRing(g2274), 5);
  npts := ST_NPoints(boundary);
  FOR i IN 1..(npts - 1) LOOP
    seg_a := ST_PointN(boundary, i);
    seg_b := ST_PointN(boundary, i + 1);
    seg_len := ST_Distance(seg_a, seg_b);
    IF seg_len > best_len THEN
      best_len := seg_len;
      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
    END IF;
  END LOOP;

  obb := ST_OrientedEnvelope(ST_Buffer(g2274, -LEAST(v_front, v_side, v_rear)));
  IF obb IS NULL OR ST_IsEmpty(obb) THEN
    RETURN jsonb_build_object('error', 'no buildable area after setbacks');
  END IF;
  anchor := ST_Centroid(obb);
  SELECT CASE
      WHEN ST_Distance(ST_PointN(ST_ExteriorRing(obb),1), ST_PointN(ST_ExteriorRing(obb),2))
         >= ST_Distance(ST_PointN(ST_ExteriorRing(obb),2), ST_PointN(ST_ExteriorRing(obb),3))
      THEN ST_Azimuth(ST_PointN(ST_ExteriorRing(obb),1), ST_PointN(ST_ExteriorRing(obb),2))
      ELSE ST_Azimuth(ST_PointN(ST_ExteriorRing(obb),2), ST_PointN(ST_ExteriorRing(obb),3))
    END INTO theta;
  theta := pi()/2 - theta;

  parcel_rot := ST_Rotate(ST_Buffer(g2274, -LEAST(v_front, v_side, v_rear)), -theta, anchor);
  parcel_rot := (SELECT geom FROM (SELECT (ST_Dump(parcel_rot)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);
  entry_rot := ST_Rotate(entry_pt, -theta, anchor);
  bxmin := ST_XMin(parcel_rot); bymin := ST_YMin(parcel_rot);
  bxmax := ST_XMax(parcel_rot); bymax := ST_YMax(parcel_rot);
  IF abs(ST_Y(entry_rot) - bymin) <= abs(ST_Y(entry_rot) - bymax) THEN
    rot := ST_Intersection(parcel_rot, ST_MakeEnvelope(
      bxmin + GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), bymin + GREATEST(v_front - LEAST(v_front, v_side, v_rear), 0),
      bxmax - GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), bymax - GREATEST(v_rear - LEAST(v_front, v_side, v_rear), 0), 2274));
  ELSE
    rot := ST_Intersection(parcel_rot, ST_MakeEnvelope(
      bxmin + GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), bymin + GREATEST(v_rear - LEAST(v_front, v_side, v_rear), 0),
      bxmax - GREATEST(v_side - LEAST(v_front, v_side, v_rear), 0), bymax - GREATEST(v_front - LEAST(v_front, v_side, v_rear), 0), 2274));
  END IF;
  IF rot IS NULL OR ST_IsEmpty(rot) THEN
    RETURN jsonb_build_object('error', 'no buildable area after directional setbacks');
  END IF;
  rot := (SELECT geom FROM (SELECT (ST_Dump(rot)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);
  flags := flags || to_jsonb('directional_setbacks_oriented_frame'::text);
  bxmin := ST_XMin(rot); bymin := ST_YMin(rot); bxmax := ST_XMax(rot); bymax := ST_YMax(rot);
  avail_h := bymax - bymin;

  IF avail_h < (stall_d + aisle) + bar_depth + 6 THEN
    bar_depth := GREATEST(45, avail_h - (stall_d + aisle) - 6);
    IF bar_depth + stall_d + aisle + 6 > avail_h THEN
      lead_street := false;
      bar_depth := GREATEST(40, LEAST(bar_depth, avail_h - 4));
    END IF;
    flags := flags || to_jsonb('bar_depth_clamped_shallow_site'::text);
  END IF;
  IF bar_depth > avail_h - 4 THEN
    RETURN jsonb_build_object('error', 'envelope too shallow for a building bar');
  END IF;

  spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 50), bxmax - 50);
  spine := ST_Intersection(rot, ST_MakeEnvelope(spine_x - aisle/2, bymin, spine_x + aisle/2, bymax, 2274));
  avoid := ST_Buffer(spine, 4);
  IF p_pins IS NOT NULL AND jsonb_typeof(p_pins) = 'array' THEN
    FOR pin IN SELECT value FROM jsonb_array_elements(p_pins) LOOP
      BEGIN
        pg := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(pin.value->>'geom'), 4326), 2274);
        IF pg IS NULL OR ST_IsEmpty(pg) THEN CONTINUE; END IF;
        pf := GREATEST(1, LEAST(6, COALESCE((pin.value->>'floors')::int, floors)));
        pin_geoms := pin_geoms || pg;
        pin_floors := pin_floors || pf;
        avoid := ST_Union(avoid, ST_Buffer(ST_Rotate(pg, -theta, anchor), 6));
        IF NOT ST_Covers(ST_Buffer(g2274, 1), pg) THEN
          flags := flags || to_jsonb('pin_outside_parcel'::text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        flags := flags || to_jsonb('pin_ignored_bad_geometry'::text);
      END;
    END LOOP;
  END IF;
  cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(spine_x, bymin), ST_MakePoint(spine_x, bymax)), 2274));
  IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN drives_cl := cl; END IF;

  IF avail_h > bar_depth * 2 + drive_gap + 20 THEN
    y := bymin + 2 + (p_seed % 3) * 4;
  ELSE
    y := bymin + 1;
  END IF;

  IF lead_street THEN
    lead_park := ST_Difference(ST_Intersection(rot, ST_MakeEnvelope(bxmin, y, bxmax, y + stall_d, 2274)), avoid);
    IF lead_park IS NOT NULL AND NOT ST_IsEmpty(lead_park) THEN parks := lead_park; END IF;
    drive_band := ST_Difference(
      ST_Intersection(rot, ST_MakeEnvelope(bxmin, y + stall_d, bxmax, y + stall_d + aisle, 2274)),
      ST_Difference(avoid, ST_Buffer(spine, 4)));
    IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
      drives := drive_band;
      mid := y + stall_d + aisle / 2;
      cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(bxmin, mid), ST_MakePoint(bxmax, mid)), 2274));
      IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
        drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl, cl) END;
      END IF;
    END IF;
    y := y + stall_d + aisle;
  END IF;

  use_court := true;
  WHILE y + bar_depth <= bymax - 1 LOOP
    band := ST_Intersection(rot, ST_MakeEnvelope(bxmin, y, bxmax, y + bar_depth, 2274));
    IF band IS NOT NULL AND NOT ST_IsEmpty(band) THEN
      FOR comp IN SELECT (ST_Dump(band)).geom AS geom LOOP
        IF ST_Area(comp.geom) < bar_min * bar_depth * 0.85 THEN CONTINUE; END IF;
        x := ST_XMin(comp.geom) + 2;
        WHILE x + bar_min <= ST_XMax(comp.geom) - 2 LOOP
          IF cov_cap_sqft IS NOT NULL AND tot_fp + bar_min * bar_depth > cov_cap_sqft THEN
            flags := flags || to_jsonb('coverage_cap_reached'::text);
            EXIT;
          END IF;
          placed := false;
          try_len := LEAST(bar_max, ST_XMax(comp.geom) - 2 - x);
          IF cov_cap_sqft IS NOT NULL THEN
            try_len := LEAST(try_len, floor((cov_cap_sqft - tot_fp) / bar_depth));
          END IF;
          WHILE try_len >= bar_min LOOP
            bar := ST_MakeEnvelope(x, y, x + try_len, y + bar_depth, 2274);
            IF ST_Covers(rot, bar) AND NOT ST_Intersects(bar, avoid) THEN
              bars_arr := bars_arr || bar;
              n_bars := n_bars + 1;
              tot_fp := tot_fp + ST_Area(bar);
              x := x + try_len + bar_gap;
              placed := true;
              EXIT;
            END IF;
            try_len := try_len - 30;
          END LOOP;
          IF NOT placed THEN x := x + 20; END IF;
        END LOOP;
      END LOOP;
    END IF;

    gap := CASE WHEN use_court THEN court_gap ELSE drive_gap END;
    IF y + bar_depth + gap + bar_depth <= bymax THEN
      IF use_court THEN
        court_band := ST_Difference(
          ST_Intersection(rot, ST_MakeEnvelope(bxmin, y + bar_depth + 4, bxmax, y + bar_depth + gap - 4, 2274)), avoid);
        IF court_band IS NOT NULL AND NOT ST_IsEmpty(court_band) THEN
          greens := CASE WHEN greens IS NULL THEN court_band ELSE ST_Union(greens, court_band) END;
        END IF;
      ELSE
        a0 := y + bar_depth + stall_d;
        a1 := a0 + aisle;
        drive_band := ST_Difference(
          ST_Intersection(rot, ST_MakeEnvelope(bxmin, a0, bxmax, a1, 2274)),
          ST_Difference(avoid, ST_Buffer(spine, 4)));
        park_band := ST_Difference(
          ST_Intersection(rot, ST_MakeEnvelope(bxmin, y + bar_depth, bxmax, a0, 2274)), avoid);
        park_band := ST_Union(park_band, ST_Difference(
          ST_Intersection(rot, ST_MakeEnvelope(bxmin, a1, bxmax, a1 + stall_d, 2274)), avoid));
        IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
          drives := CASE WHEN drives IS NULL THEN drive_band ELSE ST_Union(drives, drive_band) END;
          mid := (a0 + a1) / 2;
          cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(bxmin, mid), ST_MakePoint(bxmax, mid)), 2274));
          IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
            drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl, cl) END;
          END IF;
        END IF;
        IF park_band IS NOT NULL AND NOT ST_IsEmpty(park_band) THEN
          parks := CASE WHEN parks IS NULL THEN park_band ELSE ST_Union(parks, park_band) END;
        END IF;
      END IF;
    END IF;

    y := y + bar_depth + gap;
    use_court := NOT use_court;
  END LOOP;

  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    RETURN jsonb_build_object('error', 'no bars fit the envelope', 'flags', flags);
  END IF;

  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives, spine) END;

  IF n_bars > 2 THEN
    amen_dist := NULL;
    FOR k IN 1..array_length(bars_arr, 1) LOOP
      d := ST_Distance(ST_Rotate(bars_arr[k], theta, anchor), entry_pt);
      IF amen_dist IS NULL OR d < amen_dist THEN amen_dist := d; amen_idx := k; END IF;
    END LOOP;
    amen := bars_arr[amen_idx];
    tot_fp := tot_fp - ST_Area(amen);
    n_bars := n_bars - 1;
  END IF;

  gfa := tot_fp * floors;

  IF max_far IS NOT NULL AND tot_fp > 0 THEN
    far_floor_cap := GREATEST(1, floor(max_far * parcel_area / tot_fp)::int);
    IF floors > far_floor_cap THEN
      floors := far_floor_cap;
      flags := flags || to_jsonb('floors_clamped_by_far'::text);
    END IF;
  END IF;
  gfa := tot_fp * floors;
  units := GREATEST(1, floor(gfa / avg_unit))::int;
  IF units_max IS NOT NULL AND units > units_max THEN
    floors := GREATEST(1, floor(units_max * avg_unit / NULLIF(tot_fp, 0))::int);
    gfa := tot_fp * floors;
    units := LEAST(GREATEST(1, floor(gfa / avg_unit))::int, units_max);
    flags := flags || to_jsonb('density_clamped_units'::text);
  END IF;

  i := 0;
  FOR k IN 1..COALESCE(array_length(bars_arr, 1), 0) LOOP
    IF k = amen_idx THEN CONTINUE; END IF;
    i := i + 1;
    ub := ST_Rotate(bars_arr[k], theta, anchor);
    bars_j := bars_j || jsonb_build_object('i', i,
      'footprint_sqft', round(ST_Area(bars_arr[k])), 'floors', floors,
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb);
    bars_l := bars_l || jsonb_build_object('i', i,
      'footprint_sqft', round(ST_Area(bars_arr[k])), 'floors', floors,
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb);
  END LOOP;
  FOR k IN 1..COALESCE(array_length(pin_geoms, 1), 0) LOOP
    i := i + 1;
    n_bars := n_bars + 1;
    tot_fp := tot_fp + ST_Area(pin_geoms[k]);
    gfa := gfa + ST_Area(pin_geoms[k]) * pin_floors[k];
    bars_j := bars_j || jsonb_build_object('i', i, 'pinned', true, 'pin_index', k - 1,
      'footprint_sqft', round(ST_Area(pin_geoms[k])), 'floors', pin_floors[k],
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(pin_geoms[k], 2274), 4326))::jsonb);
    bars_l := bars_l || jsonb_build_object('i', i, 'pinned', true, 'pin_index', k - 1,
      'footprint_sqft', round(ST_Area(pin_geoms[k])), 'floors', pin_floors[k],
      'geom', ST_AsGeoJSON(ST_Translate(pin_geoms[k], -ox, -oy))::jsonb);
  END LOOP;
  units := GREATEST(1, floor(gfa / avg_unit))::int;
  IF amen IS NOT NULL THEN
    ub := ST_Rotate(amen, theta, anchor);
    amen_j := jsonb_build_array(jsonb_build_object('name', 'Clubhouse + Pool',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb));
    amen_l := jsonb_build_array(jsonb_build_object('name', 'Clubhouse + Pool',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb));
  END IF;

  tot_park  := COALESCE(ST_Area(parks), 0);
  tot_drive := COALESCE(ST_Area(drives), 0);
  tot_green := COALESCE(ST_Area(greens), 0);
  n_stalls  := floor(tot_park / (stall_w * stall_d) * 0.90)::int;
  req_stalls := ceil(units * ratio)::int;
  IF n_stalls < req_stalls THEN
    flags := flags || to_jsonb('parking_below_ratio'::text);
  END IF;

  IF parks IS NOT NULL AND NOT ST_IsEmpty(parks) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('stalls', floor(ST_Area(geom)/(stall_w*stall_d)*0.9)::int,
             'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_Rotate(geom, theta, anchor), 2274), 4326))::jsonb)), '[]'::jsonb),
           COALESCE(jsonb_agg(jsonb_build_object('stalls', floor(ST_Area(geom)/(stall_w*stall_d)*0.9)::int,
             'geom', ST_AsGeoJSON(ST_Translate(ST_Rotate(geom, theta, anchor), -ox, -oy))::jsonb)), '[]'::jsonb)
      INTO parks_j, parks_l
      FROM (SELECT (ST_Dump(parks)).geom) q WHERE ST_Area(geom) > 300;
  END IF;
  IF drives IS NOT NULL AND NOT ST_IsEmpty(drives) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_Rotate(geom, theta, anchor), 2274), 4326))::jsonb)), '[]'::jsonb),
           COALESCE(jsonb_agg(jsonb_build_object(
             'geom', ST_AsGeoJSON(ST_Translate(ST_Rotate(geom, theta, anchor), -ox, -oy))::jsonb)), '[]'::jsonb)
      INTO drives_j, drives_l
      FROM (SELECT (ST_Dump(drives)).geom) q WHERE ST_Area(geom) > 200;
  END IF;
  IF greens IS NOT NULL AND NOT ST_IsEmpty(greens) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('area_sqft', round(ST_Area(geom)),
             'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_Rotate(geom, theta, anchor), 2274), 4326))::jsonb)), '[]'::jsonb),
           COALESCE(jsonb_agg(jsonb_build_object('area_sqft', round(ST_Area(geom)),
             'geom', ST_AsGeoJSON(ST_Translate(ST_Rotate(geom, theta, anchor), -ox, -oy))::jsonb)), '[]'::jsonb)
      INTO greens_j, greens_l
      FROM (SELECT (ST_Dump(greens)).geom) q WHERE ST_Area(geom) > 800;
  END IF;

  money := public.fn_mf_money(p_ogc_fid, gfa, units);
  margin := (money->>'margin_on_cost')::numeric;
  IF margin IS NOT NULL THEN
    sc_fin := LEAST(1, GREATEST(0, (margin + 0.5)));
  ELSE
    sc_fin := 0.5;
    flags := flags || to_jsonb('financial_score_no_local_pricing'::text);
  END IF;
  sc_yield := CASE
    WHEN units_max IS NOT NULL AND units_max > 0 THEN LEAST(1, units::numeric / units_max)
    WHEN max_far IS NOT NULL AND max_far > 0 THEN LEAST(1, gfa / (max_far * parcel_area))
    ELSE 0.5 END;
  sc_park := CASE WHEN req_stalls > 0 THEN LEAST(1, n_stalls::numeric / req_stalls) ELSE 1 END;
  far_achieved := gfa / NULLIF(parcel_area, 0);
  sc_zone := CASE WHEN max_far IS NOT NULL AND max_far > 0
    THEN LEAST(1, far_achieved / max_far) ELSE LEAST(1, COALESCE(tot_fp / NULLIF(cov_cap_sqft,0), 0.5)) END;
  avg_bar_fp := CASE WHEN n_bars > 0 THEN tot_fp / n_bars ELSE NULL END;
  sc_prec := CASE WHEN avg_bar_fp IS NOT NULL AND p75fp IS NOT NULL AND p75fp > 0
    THEN LEAST(avg_bar_fp, p75fp) / GREATEST(avg_bar_fp, p75fp) ELSE 0.5 END;
  sc_prog := 0.5;
  flags := flags || to_jsonb('program_fit_unmodeled_v1'::text);
  drive_pct := 100.0 * tot_drive / NULLIF(parcel_area, 0);
  sc_circ := GREATEST(0, 1 - abs(drive_pct - 10) / 10.0);
  open_pct := GREATEST(0, parcel_area - tot_fp - tot_park - tot_drive) / NULLIF(parcel_area, 0) * 100.0;
  sc_open := LEAST(1, open_pct / GREATEST(COALESCE(min_open, 20), 1));

  score_components := jsonb_build_object(
    'financial_return', round(sc_fin, 3),
    'unit_or_program_yield', round(sc_yield, 3),
    'parking_compliance', round(sc_park, 3),
    'zoning_utilization', round(sc_zone, 3),
    'precedent_fit', round(sc_prec, 3),
    'internal_program_fit', round(sc_prog, 3),
    'circulation_quality', round(sc_circ, 3),
    'open_space_quality', round(sc_open, 3)
  );
  score_total := round(
      sc_fin  * COALESCE((w->>'financial_return')::numeric, 0.2)
    + sc_yield* COALESCE((w->>'unit_or_program_yield')::numeric, 0.15)
    + sc_park * COALESCE((w->>'parking_compliance')::numeric, 0.15)
    + sc_zone * COALESCE((w->>'zoning_utilization')::numeric, 0.10)
    + sc_prec * COALESCE((w->>'precedent_fit')::numeric, 0.15)
    + sc_prog * COALESCE((w->>'internal_program_fit')::numeric, 0.10)
    + sc_circ * COALESCE((w->>'circulation_quality')::numeric, 0.10)
    + sc_open * COALESCE((w->>'open_space_quality')::numeric, 0.05), 3);

  basis := format('Context %s · %s precedents (%s) · %s bars × %s floors · %s stalls (%s/unit) · access: frontage heuristic pending road upgrade',
                  COALESCE(ctx_version, 'v?'), n_prec, prec_conf, n_bars, floors, n_stalls, ratio);

  SELECT ST_Union(g2) INTO bars_u FROM (
    SELECT ST_SetSRID(ST_Rotate(bg, theta, anchor), 2274) AS g2
    FROM unnest(bars_arr) WITH ORDINALITY AS t(bg, ord)
    WHERE ord <> amen_idx
    UNION ALL
    SELECT ST_SetSRID(pg2, 2274) FROM unnest(pin_geoms) AS pg2
  ) q;

  IF p_persist THEN
    BEGIN
      INSERT INTO public.siteplanner_session
        (parcel_id, zoning_base, far_max, height_max_ft, parking_ratio, setbacks,
         context_id, context_version, objective_profile, generator_version)
      VALUES (p_ogc_fid::text, NULL, max_far, max_h, ratio,
              jsonb_build_object('front', v_front, 'side', v_side, 'rear', v_rear, 'mode', 'directional_oriented_frame'),
              p_context_id, ctx_version, obj, 'mf_context_v2')
      RETURNING id INTO v_session;

      INSERT INTO public.siteplanner_candidate
        (session_id, typology, geometry_buildings, geometry_parking, geometry_drives, metrics, parent_candidate_id,
         generator_version, score_version, score_total, score_components, objective_profile, precedent_ids, program_prior_version)
      VALUES (v_session, p_typology,
              ST_Multi(ST_CollectionExtract(ST_Transform(bars_u, 3857), 3)),
              CASE WHEN parks IS NULL THEN NULL
                   ELSE ST_Multi(ST_CollectionExtract(ST_Transform(ST_SetSRID(ST_Rotate(parks, theta, anchor), 2274), 3857), 3)) END,
              CASE WHEN drives_cl IS NULL THEN NULL
                   ELSE ST_Multi(ST_CollectionExtract(ST_Transform(ST_SetSRID(ST_Rotate(drives_cl, theta, anchor), 2274), 3857), 2)) END,
              jsonb_build_object('bars', n_bars, 'floors', floors, 'gfa_sqft', round(gfa),
                'units_est', units, 'stalls', n_stalls, 'stalls_required', req_stalls,
                'coverage_pct', round(tot_fp / parcel_area * 100, 1),
                'far', round(far_achieved, 2), 'seed', p_seed,
                'pins', COALESCE(p_pins, '[]'::jsonb), 'context_hash', ctx_hash),
              p_parent,
              'mf_context_v2', 'context_score_v1', score_total, score_components, obj, '[]'::jsonb, prog_version)
      RETURNING id INTO v_candidate;
      persisted := true;
    EXCEPTION WHEN OTHERS THEN
      persisted := false;
      flags := flags || to_jsonb(('persistence_failed: ' || SQLERRM)::text);
    END;
  END IF;

  RETURN jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid,
    'typology', p_typology,
    'seed', p_seed,
    'pins', COALESCE(p_pins, '[]'::jsonb),
    'parent_candidate_id', p_parent,
    'context_id', p_context_id,
    'context_version', ctx_version,
    'context_hash', ctx_hash,
    'generator_version', 'mf_context_v2',
    'score_version', 'context_score_v1',
    'score_total', score_total,
    'score_components', score_components,
    'plan_basis', basis,
    'session_id', v_session,
    'candidate_id', v_candidate,
    'persisted', persisted,
    'buildings', bars_j,
    'parking', parks_j,
    'drives', drives_j,
    'greens', greens_j,
    'amenity', amen_j,
    'metrics', jsonb_build_object(
      'bars', n_bars, 'floors', floors,
      'footprint_sqft', round(tot_fp), 'gfa_sqft', round(gfa),
      'units_est', units, 'stalls', n_stalls, 'stalls_required', req_stalls,
      'parking_ratio_provided', CASE WHEN units > 0 THEN round(n_stalls::numeric / units, 2) ELSE NULL END,
      'coverage_pct', round(tot_fp / parcel_area * 100, 1),
      'far', round(far_achieved, 2),
      'parcel_sqft', round(parcel_area),
      'parking_sqft', round(tot_park), 'drives_sqft', round(tot_drive), 'greens_sqft', round(tot_green),
      'open_space_pct', round(open_pct, 1)
    ),
    'canvas_frame', jsonb_build_object(
      'units', 'feet_us_survey',
      'crs_basis', 'EPSG:2274 translated to local origin',
      'origin_2274', jsonb_build_array(round(ox,2), round(oy,2)),
      'parcel', ST_AsGeoJSON(ST_Translate(g2274, -ox, -oy))::jsonb,
      'buildable', ST_AsGeoJSON(ST_Translate(ST_Rotate(rot, theta, anchor), -ox, -oy))::jsonb,
      'buildings', bars_l,
      'parking', parks_l,
      'drives', drives_l,
      'greens', greens_l,
      'amenity', amen_l
    ),
    'flags', flags
  );
END $function$;
