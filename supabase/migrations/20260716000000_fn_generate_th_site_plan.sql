-- Townhome site-plan generator (th_context_v1).
--
-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-16 as migrations
-- add_fn_generate_th_site_plan + fix_th_court_shallow_sites; this file is
-- the final function body (byte-equal to the fix migration).
--
-- Additive: creates a NEW function only; no other agent's functions are
-- modified. Contract mirror of fn_generate_mf_site_plan_v2: same context
-- gate (fn_get_planner_solver_brief), same response shape (buildings /
-- parking / drives / greens / metrics / score / canvas_frame / flags), same
-- candidate persistence with lineage, so the existing client pipeline —
-- pins, drag-regeneration, schemes rail, money loop — works unchanged.
--
-- Legal basis: townhomes generate off the MULTIFAMILY compiled context
-- (attached residential rides the multi_family as-of-right gate in RM
-- districts). Townhome-specific standards are then read from the ordinance
-- dataset's 'attached' use-class rows (Metro 17.12.020.B.1: party-wall side
-- setbacks, min lot area per unit, stories cap) via
-- fn_ordinance_standards(district, 'attached') — an additive read. Unit form
-- comes from townhome-typology Regrid priors (fn_local_built_form_v2), and
-- internal program fit from an AGGREGATE (median habitable sqft only) of the
-- owned townhome precedent corpus, which is approved for program extraction.
-- SECURITY DEFINER exists solely for that aggregate read; no private row
-- contents are returned.

CREATE OR REPLACE FUNCTION public.fn_generate_th_site_plan(
  p_ogc_fid integer,
  p_seed integer,
  p_pins jsonb,
  p_parent uuid,
  p_persist boolean,
  p_context_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  bres jsonb; brief jsonb; hc jsonb; pk jsonb; obj jsonb; w jsonb;
  ctx_version text; ctx_hash text; prog_version text;
  th_pri jsonb; n_th integer; th_conf text;
  v_front numeric; v_side numeric; v_rear numeric;
  max_far numeric; max_h numeric; max_den numeric; max_cov numeric; min_open numeric;
  z_base text; ord public.jurisdiction_zoning_standards;
  min_lot numeric := 1500; stories_cap integer := 3;
  unit_w numeric; unit_d numeric; dim_a numeric; dim_b numeric;
  floors integer; f2f numeric := 10.5;
  th_s50 numeric; th_s75 numeric;
  g2274 geometry; ox numeric; oy numeric;
  obb geometry; theta numeric; anchor geometry; parcel_rot geometry; rot geometry;
  boundary geometry; seg_a geometry; seg_b geometry;
  best_len numeric := 0; seg_len numeric; npts integer; i integer; k integer;
  entry_pt geometry; entry_rot geometry; spine_x numeric; spine geometry; avoid geometry;
  bxmin numeric; bymin numeric; bxmax numeric; bymax numeric; avail_h numeric;
  aisle numeric; stall_w numeric; stall_d numeric; ratio numeric;
  apron numeric := 18; mews numeric := 28; bldg_gap numeric := 12;
  y numeric; row_idx integer := 0; facing_pair boolean;
  band geometry; comp record; x numeric; n_units integer; blen numeric; bar geometry; placed boolean;
  rows_arr geometry[] := '{}'; rows_units int[] := '{}';
  pin_geoms geometry[] := '{}'; pin_floors int[] := '{}'; pin record; pg geometry; pf integer;
  drives geometry := NULL; greens geometry := NULL; aprons geometry := NULL;
  drives_cl geometry := NULL; cl geometry;
  drive_band geometry; apron_band geometry; mews_band geometry;
  bars_j jsonb := '[]'::jsonb; parks_j jsonb := '[]'::jsonb;
  drives_j jsonb := '[]'::jsonb; greens_j jsonb := '[]'::jsonb;
  bars_l jsonb := '[]'::jsonb; parks_l jsonb := '[]'::jsonb;
  drives_l jsonb := '[]'::jsonb; greens_l jsonb := '[]'::jsonb;
  bars_u geometry; ub geometry; mid numeric;
  n_bldgs integer := 0; units integer := 0; tot_fp numeric := 0; gfa numeric := 0;
  tot_drive numeric := 0; tot_green numeric := 0; tot_apron numeric := 0;
  n_stalls integer := 0; req_stalls integer;
  units_cap integer; cov_cap_sqft numeric; far_floor_cap integer;
  parcel_area numeric; flags jsonb := '[]'::jsonb;
  own_p50 numeric; own_n integer := 0; unit_gfa numeric;
  v_session uuid; v_candidate uuid; persisted boolean := false;
  basis text; money jsonb; margin numeric;
  sc_fin numeric; sc_yield numeric; sc_park numeric; sc_zone numeric;
  sc_prec numeric; sc_prog numeric; sc_circ numeric; sc_open numeric;
  score_components jsonb; score_total numeric;
  drive_pct numeric; open_pct numeric; far_achieved numeric;
  ord_source text := 'mf_brief_fallback';
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
  IF COALESCE(brief->>'typology', '') <> 'multifamily' THEN
    RETURN jsonb_build_object('error', 'townhome_requires_multifamily_context');
  END IF;
  hc := brief->'hard_constraints';
  pk := brief->'parking';
  obj := brief->'objective_profile';
  w := obj->'weights';
  prog_version := brief->>'program_prior_version';
  flags := COALESCE(brief->'flags', '[]'::jsonb)
    || to_jsonb('townhome_on_multifamily_legal_basis'::text);

  v_front := (hc->>'front_setback_ft')::numeric;
  v_side  := (hc->>'side_setback_ft')::numeric;
  v_rear  := (hc->>'rear_setback_ft')::numeric;
  max_far := (hc->>'max_far')::numeric;
  max_h   := (hc->>'max_height_ft')::numeric;
  max_den := (hc->>'max_density_du_acre')::numeric;
  max_cov := (hc->>'max_coverage_pct')::numeric;
  min_open := (hc->>'min_open_space_pct')::numeric;

  -- Attached-dwelling ordinance standards (Metro 17.12.020.B.1) override the
  -- generic multifamily numbers where present.
  SELECT pz.base INTO z_base
  FROM public.parcels p LEFT JOIN public.planner_zoning pz ON pz.zoning_id = p.zoning_id
  WHERE p.ogc_fid = p_ogc_fid;
  IF z_base IS NOT NULL THEN
    ord := public.fn_ordinance_standards(z_base, 'attached');
    IF ord.district IS NOT NULL THEN
      ord_source := 'ordinance_attached_' || ord.source;
      v_front := COALESCE(ord.front_setback_ft, v_front, 20);
      v_side  := COALESCE(ord.side_setback_ft, v_side, 5);
      v_rear  := COALESCE(ord.rear_setback_ft, v_rear, 5);
      min_lot := COALESCE(ord.min_lot_area_sqft, min_lot);
      stories_cap := COALESCE(ord.max_height_stories, stories_cap);
      max_far := COALESCE(ord.max_far, max_far);
      max_den := COALESCE(ord.max_density_du_acre, max_den);
      flags := flags || to_jsonb('attached_ordinance_standards_applied'::text);
    ELSE
      flags := flags || to_jsonb('attached_ordinance_missing_mf_brief_fallback'::text);
    END IF;
  ELSE
    flags := flags || to_jsonb('attached_ordinance_missing_mf_brief_fallback'::text);
  END IF;
  IF v_front IS NULL OR v_side IS NULL OR v_rear IS NULL THEN
    flags := flags || to_jsonb('setback_fallback_typology_default'::text);
    v_front := COALESCE(v_front, 20); v_side := COALESCE(v_side, 5); v_rear := COALESCE(v_rear, 5);
  END IF;

  -- Parking geometry from the brief; townhome supply model is garage + apron.
  stall_w := COALESCE((pk->>'stall_width_ft')::numeric, 9);
  stall_d := COALESCE((pk->>'stall_depth_ft')::numeric, 18);
  aisle   := COALESCE((pk->>'aisle_width_ft')::numeric, 24);
  ratio   := COALESCE((pk->>'ratio')::numeric, 2.0);
  apron := GREATEST(apron, stall_d);

  -- Townhome unit form from typology-aware Regrid priors.
  th_pri := public.fn_local_built_form_v2(p_ogc_fid, 'townhome', 5280, 5);
  n_th := COALESCE((th_pri->>'n_comps')::int, 0);
  th_conf := COALESCE(th_pri->>'confidence', 'unknown');
  dim_a := (th_pri#>>'{distribution,length_ft,p50}')::numeric;
  dim_b := (th_pri#>>'{distribution,depth_ft,p50}')::numeric;
  th_s50 := (th_pri#>>'{distribution,stories,p50}')::numeric;
  th_s75 := (th_pri#>>'{distribution,stories,p75}')::numeric;
  IF n_th >= 5 AND dim_a IS NOT NULL AND dim_b IS NOT NULL THEN
    unit_w := LEAST(GREATEST(LEAST(dim_a, dim_b), 16), 28);
    unit_d := LEAST(GREATEST(GREATEST(dim_a, dim_b), 30), 46);
    flags := flags || to_jsonb('unit_form_from_regrid_townhome_p50'::text);
  ELSE
    unit_w := 20; unit_d := 38;
    flags := flags || to_jsonb('unit_form_fallback_defaults'::text);
  END IF;
  IF th_s50 IS NOT NULL AND th_s75 IS NOT NULL AND n_th >= 5 THEN
    floors := GREATEST(2, round((th_s50 + th_s75) / 2.0)::int);
    flags := flags || to_jsonb('stories_from_regrid_townhome_p50_p75'::text);
  ELSE
    floors := 2;
    flags := flags || to_jsonb('stories_fallback_townhome_default'::text);
  END IF;
  floors := LEAST(floors, stories_cap);
  IF max_h IS NOT NULL THEN
    floors := LEAST(floors, GREATEST(1, floor(max_h / f2f)::int));
  END IF;

  -- Internal program fit: AGGREGATE median habitable sqft from the owned
  -- townhome corpus (program extraction is an approved use; no row contents
  -- leave the database).
  BEGIN
    IF to_regclass('training.precedent_units') IS NOT NULL THEN
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY pu.habitable_sqft), count(*)
        INTO own_p50, own_n
      FROM training.precedent_units pu
      JOIN training.site_precedents sp ON sp.id = pu.precedent_id
      JOIN training.dataset_registry dr ON dr.id = sp.dataset_id
      WHERE dr.slug = 'owned_townhome_cd_20260311'
        AND pu.habitable_sqft IS NOT NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    own_p50 := NULL; own_n := 0;
  END;

  SELECT geom_2274 INTO g2274 FROM public.parcels WHERE ogc_fid = p_ogc_fid;
  IF g2274 IS NULL THEN RETURN jsonb_build_object('error', 'parcel has no geom_2274'); END IF;
  g2274 := (ST_Dump(g2274)).geom;
  parcel_area := ST_Area(g2274);
  ox := ST_XMin(g2274); oy := ST_YMin(g2274);
  cov_cap_sqft := CASE WHEN max_cov IS NOT NULL THEN parcel_area * max_cov / 100.0 ELSE NULL END;
  units_cap := GREATEST(1, floor(parcel_area / min_lot)::int);
  IF max_den IS NOT NULL THEN
    units_cap := LEAST(units_cap, GREATEST(1, floor(max_den * parcel_area / 43560.0)::int));
  END IF;

  -- Entry heuristic: longest frontage (front_edge is still a placeholder).
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

  -- Oriented frame + directional setbacks (same approach as mf_context_v2).
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
  IF avail_h < unit_d + apron + aisle THEN
    RETURN jsonb_build_object('error', 'envelope too shallow for a townhome row', 'flags', flags);
  END IF;

  -- Entry spine + pin obstacles.
  spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 40), bxmax - 40);
  spine := ST_Intersection(rot, ST_MakeEnvelope(spine_x - aisle/2, bymin, spine_x + aisle/2, bymax, 2274));
  avoid := ST_Buffer(spine, 4);
  IF p_pins IS NOT NULL AND jsonb_typeof(p_pins) = 'array' THEN
    FOR pin IN SELECT value FROM jsonb_array_elements(p_pins) LOOP
      BEGIN
        pg := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(pin.value->>'geom'), 4326), 2274);
        IF pg IS NULL OR ST_IsEmpty(pg) THEN CONTINUE; END IF;
        pf := GREATEST(1, LEAST(4, COALESCE((pin.value->>'floors')::int, floors)));
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

  -- Row grammar: facing pairs share a motor court (apron + aisle + apron);
  -- pairs are separated by green mews. Seed shifts the start and cluster mix.
  y := bymin + 1 + (p_seed % 3) * 3;
  facing_pair := true;
  WHILE y + unit_d <= bymax - 1 AND units < units_cap LOOP
    row_idx := row_idx + 1;
    band := ST_Intersection(rot, ST_MakeEnvelope(bxmin, y, bxmax, y + unit_d, 2274));
    IF band IS NOT NULL AND NOT ST_IsEmpty(band) THEN
      FOR comp IN SELECT (ST_Dump(band)).geom AS geom LOOP
        IF ST_Area(comp.geom) < 3 * unit_w * unit_d * 0.85 THEN CONTINUE; END IF;
        x := ST_XMin(comp.geom) + 2;
        WHILE x + 3 * unit_w <= ST_XMax(comp.geom) - 2 AND units < units_cap LOOP
          n_units := 4 + ((p_seed + row_idx + n_bldgs) % 5);
          n_units := LEAST(n_units, units_cap - units);
          n_units := LEAST(n_units, floor((ST_XMax(comp.geom) - 2 - x) / unit_w)::int);
          IF n_units < 3 THEN EXIT; END IF;
          IF cov_cap_sqft IS NOT NULL AND tot_fp + n_units * unit_w * unit_d > cov_cap_sqft THEN
            n_units := floor((cov_cap_sqft - tot_fp) / (unit_w * unit_d))::int;
            IF n_units < 3 THEN
              flags := flags || to_jsonb('coverage_cap_reached'::text);
              EXIT;
            END IF;
          END IF;
          placed := false;
          WHILE n_units >= 3 LOOP
            blen := n_units * unit_w;
            bar := ST_MakeEnvelope(x, y, x + blen, y + unit_d, 2274);
            IF ST_Covers(rot, bar) AND NOT ST_Intersects(bar, avoid) THEN
              rows_arr := rows_arr || bar;
              rows_units := rows_units || n_units;
              n_bldgs := n_bldgs + 1;
              units := units + n_units;
              tot_fp := tot_fp + ST_Area(bar);
              x := x + blen + bldg_gap;
              placed := true;
              EXIT;
            END IF;
            n_units := n_units - 1;
          END LOOP;
          IF NOT placed THEN x := x + unit_w; END IF;
        END LOOP;
      END LOOP;
    END IF;

    IF facing_pair AND y + unit_d + apron + aisle + apron + unit_d <= bymax THEN
      -- Motor court between facing rows: apron / aisle / apron.
      apron_band := ST_Difference(ST_Intersection(rot,
        ST_MakeEnvelope(bxmin, y + unit_d, bxmax, y + unit_d + apron, 2274)), avoid);
      IF apron_band IS NOT NULL AND NOT ST_IsEmpty(apron_band) THEN
        aprons := CASE WHEN aprons IS NULL THEN apron_band ELSE ST_Union(aprons, apron_band) END;
      END IF;
      drive_band := ST_Difference(ST_Intersection(rot,
        ST_MakeEnvelope(bxmin, y + unit_d + apron, bxmax, y + unit_d + apron + aisle, 2274)),
        ST_Difference(avoid, ST_Buffer(spine, 4)));
      IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
        drives := CASE WHEN drives IS NULL THEN drive_band ELSE ST_Union(drives, drive_band) END;
        mid := y + unit_d + apron + aisle / 2;
        cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(bxmin, mid), ST_MakePoint(bxmax, mid)), 2274));
        IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
          drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl, cl) END;
        END IF;
      END IF;
      apron_band := ST_Difference(ST_Intersection(rot,
        ST_MakeEnvelope(bxmin, y + unit_d + apron + aisle, bxmax, y + unit_d + apron + aisle + apron, 2274)), avoid);
      IF apron_band IS NOT NULL AND NOT ST_IsEmpty(apron_band) THEN
        aprons := CASE WHEN aprons IS NULL THEN apron_band ELSE ST_Union(aprons, apron_band) END;
      END IF;
      y := y + unit_d + apron + aisle + apron;
      facing_pair := false;
    ELSIF facing_pair AND y + unit_d + apron + aisle <= bymax THEN
      -- Shallow remainder: single front-loaded row — apron + aisle only. The
      -- next row (if any) alley-loads directly off the far side of the aisle.
      apron_band := ST_Difference(ST_Intersection(rot,
        ST_MakeEnvelope(bxmin, y + unit_d, bxmax, y + unit_d + apron, 2274)), avoid);
      IF apron_band IS NOT NULL AND NOT ST_IsEmpty(apron_band) THEN
        aprons := CASE WHEN aprons IS NULL THEN apron_band ELSE ST_Union(aprons, apron_band) END;
      END IF;
      drive_band := ST_Difference(ST_Intersection(rot,
        ST_MakeEnvelope(bxmin, y + unit_d + apron, bxmax, y + unit_d + apron + aisle, 2274)),
        ST_Difference(avoid, ST_Buffer(spine, 4)));
      IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
        drives := CASE WHEN drives IS NULL THEN drive_band ELSE ST_Union(drives, drive_band) END;
        mid := y + unit_d + apron + aisle / 2;
        cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(bxmin, mid), ST_MakePoint(bxmax, mid)), 2274));
        IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
          drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl, cl) END;
        END IF;
      END IF;
      y := y + unit_d + apron + aisle;
      facing_pair := true;
    ELSE
      -- Green mews before the next pair (or trailing open space).
      IF y + unit_d + mews <= bymax THEN
        mews_band := ST_Difference(ST_Intersection(rot,
          ST_MakeEnvelope(bxmin, y + unit_d + 4, bxmax, y + unit_d + mews - 4, 2274)), avoid);
        IF mews_band IS NOT NULL AND NOT ST_IsEmpty(mews_band) THEN
          greens := CASE WHEN greens IS NULL THEN mews_band ELSE ST_Union(greens, mews_band) END;
        END IF;
      END IF;
      y := y + unit_d + mews;
      facing_pair := true;
    END IF;
  END LOOP;

  IF n_bldgs = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    RETURN jsonb_build_object('error', 'no townhome rows fit the envelope', 'flags', flags);
  END IF;
  IF units >= units_cap THEN
    flags := flags || to_jsonb('unit_cap_reached_min_lot_or_density'::text);
  END IF;

  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives, spine) END;

  -- FAR is a hard cap satisfied by trimming floors.
  gfa := tot_fp * floors;
  IF max_far IS NOT NULL AND tot_fp > 0 THEN
    far_floor_cap := GREATEST(1, floor(max_far * parcel_area / tot_fp)::int);
    IF floors > far_floor_cap THEN
      floors := far_floor_cap;
      flags := flags || to_jsonb('floors_clamped_by_far'::text);
    END IF;
  END IF;
  gfa := tot_fp * floors;
  unit_gfa := unit_w * unit_d * floors;

  -- Serialize rows, then pins.
  i := 0;
  FOR k IN 1..COALESCE(array_length(rows_arr, 1), 0) LOOP
    i := i + 1;
    ub := ST_Rotate(rows_arr[k], theta, anchor);
    bars_j := bars_j || jsonb_build_object('i', i, 'units', rows_units[k],
      'footprint_sqft', round(ST_Area(rows_arr[k])), 'floors', floors,
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb);
    bars_l := bars_l || jsonb_build_object('i', i, 'units', rows_units[k],
      'footprint_sqft', round(ST_Area(rows_arr[k])), 'floors', floors,
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb);
  END LOOP;
  FOR k IN 1..COALESCE(array_length(pin_geoms, 1), 0) LOOP
    i := i + 1;
    n_bldgs := n_bldgs + 1;
    tot_fp := tot_fp + ST_Area(pin_geoms[k]);
    gfa := gfa + ST_Area(pin_geoms[k]) * pin_floors[k];
    units := units + GREATEST(1, round(ST_Area(pin_geoms[k]) / (unit_w * unit_d))::int);
    bars_j := bars_j || jsonb_build_object('i', i, 'pinned', true, 'pin_index', k - 1,
      'footprint_sqft', round(ST_Area(pin_geoms[k])), 'floors', pin_floors[k],
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(pin_geoms[k], 2274), 4326))::jsonb);
    bars_l := bars_l || jsonb_build_object('i', i, 'pinned', true, 'pin_index', k - 1,
      'footprint_sqft', round(ST_Area(pin_geoms[k])), 'floors', pin_floors[k],
      'geom', ST_AsGeoJSON(ST_Translate(pin_geoms[k], -ox, -oy))::jsonb);
  END LOOP;

  -- Parking: each unit carries a garage bay + apron pad (2/unit), the Metro
  -- convention for fee-simple townhomes; aprons are counted as paved supply.
  tot_apron := COALESCE(ST_Area(aprons), 0);
  tot_drive := COALESCE(ST_Area(drives), 0);
  tot_green := COALESCE(ST_Area(greens), 0);
  n_stalls := units * 2;
  req_stalls := ceil(units * ratio)::int;
  flags := flags || to_jsonb('parking_garage_plus_apron_2_per_unit'::text);
  IF n_stalls < req_stalls THEN
    flags := flags || to_jsonb('parking_below_ratio'::text);
  END IF;

  -- Serialize site systems: aprons render as parking pads, mews as greens.
  IF aprons IS NOT NULL AND NOT ST_IsEmpty(aprons) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('stalls', floor(ST_Area(geom)/(stall_w*stall_d))::int,
             'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_Rotate(geom, theta, anchor), 2274), 4326))::jsonb)), '[]'::jsonb),
           COALESCE(jsonb_agg(jsonb_build_object('stalls', floor(ST_Area(geom)/(stall_w*stall_d))::int,
             'geom', ST_AsGeoJSON(ST_Translate(ST_Rotate(geom, theta, anchor), -ox, -oy))::jsonb)), '[]'::jsonb)
      INTO parks_j, parks_l
      FROM (SELECT (ST_Dump(aprons)).geom) q WHERE ST_Area(geom) > 200;
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
      FROM (SELECT (ST_Dump(greens)).geom) q WHERE ST_Area(geom) > 600;
  END IF;

  -- Contextual scoring (context_score_v2 components, same weight profile).
  money := public.fn_mf_money(p_ogc_fid, gfa, units);
  margin := (money->>'margin_on_cost')::numeric;
  flags := flags || to_jsonb('money_model_mf_sales_basis'::text);
  IF margin IS NOT NULL THEN
    sc_fin := LEAST(1, GREATEST(0, (margin + 0.5)));
  ELSE
    sc_fin := 0.5;
    flags := flags || to_jsonb('financial_score_no_local_pricing'::text);
  END IF;
  sc_yield := CASE WHEN units_cap > 0 THEN LEAST(1, units::numeric / units_cap) ELSE 0.5 END;
  sc_park := CASE WHEN req_stalls > 0 THEN LEAST(1, n_stalls::numeric / req_stalls) ELSE 1 END;
  far_achieved := gfa / NULLIF(parcel_area, 0);
  sc_zone := CASE WHEN max_far IS NOT NULL AND max_far > 0
    THEN LEAST(1, far_achieved / max_far)
    ELSE LEAST(1, units::numeric / NULLIF(units_cap, 0)) END;
  sc_prec := 0.5 * (CASE WHEN n_th >= 5 AND dim_a IS NOT NULL
      THEN LEAST(unit_w, LEAST(dim_a, dim_b)) / GREATEST(unit_w, LEAST(dim_a, dim_b)) ELSE 0.5 END)
    + 0.5 * (CASE WHEN th_s50 IS NOT NULL AND th_s50 > 0
      THEN LEAST(floors::numeric, th_s50) / GREATEST(floors::numeric, th_s50) ELSE 0.5 END);
  IF own_p50 IS NOT NULL AND own_p50 > 0 AND unit_gfa > 0 THEN
    sc_prog := LEAST(unit_gfa, own_p50) / GREATEST(unit_gfa, own_p50);
    flags := flags || to_jsonb(format('program_fit_owned_townhome_corpus_n_%s', own_n)::text);
  ELSE
    sc_prog := 0.5;
    flags := flags || to_jsonb('program_fit_unmodeled_no_owned_corpus'::text);
  END IF;
  drive_pct := 100.0 * (tot_drive + tot_apron) / NULLIF(parcel_area, 0);
  sc_circ := GREATEST(0, 1 - abs(drive_pct - 14) / 14.0);
  open_pct := GREATEST(0, parcel_area - tot_fp - tot_apron - tot_drive) / NULLIF(parcel_area, 0) * 100.0;
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

  basis := format('Townhomes on %s · %s TH comps (%s) · %s bldgs / %s units × %s fl · %s ft units · standards: %s · parking garage+apron',
                  COALESCE(ctx_version, 'v?'), n_th, th_conf, n_bldgs, units, floors, round(unit_w), ord_source);

  SELECT ST_Union(g2) INTO bars_u FROM (
    SELECT ST_SetSRID(ST_Rotate(bg, theta, anchor), 2274) AS g2 FROM unnest(rows_arr) AS bg
    UNION ALL
    SELECT ST_SetSRID(pg2, 2274) FROM unnest(pin_geoms) AS pg2
  ) q;

  IF p_persist THEN
    BEGIN
      INSERT INTO public.siteplanner_session
        (parcel_id, zoning_base, far_max, height_max_ft, parking_ratio, setbacks,
         context_id, context_version, objective_profile, generator_version)
      VALUES (p_ogc_fid::text, z_base, max_far, max_h, ratio,
              jsonb_build_object('front', v_front, 'side', v_side, 'rear', v_rear,
                                 'mode', 'directional_oriented_frame_attached', 'standards', ord_source),
              p_context_id, ctx_version, obj, 'th_context_v1')
      RETURNING id INTO v_session;

      INSERT INTO public.siteplanner_candidate
        (session_id, typology, geometry_buildings, geometry_parking, geometry_drives, metrics, parent_candidate_id,
         generator_version, score_version, score_total, score_components, objective_profile, precedent_ids, program_prior_version)
      VALUES (v_session, 'townhome',
              ST_Multi(ST_CollectionExtract(ST_Transform(bars_u, 3857), 3)),
              CASE WHEN aprons IS NULL THEN NULL
                   ELSE ST_Multi(ST_CollectionExtract(ST_Transform(ST_SetSRID(ST_Rotate(aprons, theta, anchor), 2274), 3857), 3)) END,
              CASE WHEN drives_cl IS NULL THEN NULL
                   ELSE ST_Multi(ST_CollectionExtract(ST_Transform(ST_SetSRID(ST_Rotate(drives_cl, theta, anchor), 2274), 3857), 2)) END,
              jsonb_build_object('buildings', n_bldgs, 'floors', floors, 'gfa_sqft', round(gfa),
                'units_est', units, 'stalls', n_stalls, 'stalls_required', req_stalls,
                'unit_w_ft', round(unit_w, 1), 'unit_d_ft', round(unit_d, 1),
                'coverage_pct', round(tot_fp / parcel_area * 100, 1),
                'far', round(far_achieved, 2), 'seed', p_seed,
                'pins', COALESCE(p_pins, '[]'::jsonb), 'context_hash', ctx_hash,
                'regrid_precedent_selection', th_pri->'selection'),
              p_parent,
              'th_context_v1', 'context_score_v2', score_total, score_components, obj,
              COALESCE(th_pri->'precedent_parcel_ids', '[]'::jsonb), prog_version)
      RETURNING id INTO v_candidate;
      persisted := true;
    EXCEPTION WHEN OTHERS THEN
      persisted := false;
      flags := flags || to_jsonb(('persistence_failed: ' || SQLERRM)::text);
    END;
  END IF;

  RETURN jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid,
    'typology', 'townhome',
    'seed', p_seed,
    'pins', COALESCE(p_pins, '[]'::jsonb),
    'parent_candidate_id', p_parent,
    'context_id', p_context_id,
    'context_version', ctx_version,
    'context_hash', ctx_hash,
    'generator_version', 'th_context_v1',
    'score_version', 'context_score_v2',
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
    'amenity', '[]'::jsonb,
    'metrics', jsonb_build_object(
      'buildings', n_bldgs, 'bars', n_bldgs, 'floors', floors,
      'footprint_sqft', round(tot_fp), 'gfa_sqft', round(gfa),
      'units_est', units, 'unit_cap', units_cap,
      'unit_w_ft', round(unit_w, 1), 'unit_d_ft', round(unit_d, 1),
      'stalls', n_stalls, 'stalls_required', req_stalls,
      'parking_ratio_provided', CASE WHEN units > 0 THEN round(n_stalls::numeric / units, 2) ELSE NULL END,
      'coverage_pct', round(tot_fp / parcel_area * 100, 1),
      'far', round(far_achieved, 2),
      'parcel_sqft', round(parcel_area),
      'parking_sqft', round(tot_apron), 'drives_sqft', round(tot_drive), 'greens_sqft', round(tot_green),
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
      'amenity', '[]'::jsonb
    ),
    'flags', flags
  );
END $function$;

-- Same execute posture as the other plan generators (the app also runs in
-- anonymous sessions). SECURITY DEFINER only ever surfaces one aggregate
-- (a program-fit score component); no private row contents are returned.
GRANT EXECUTE ON FUNCTION public.fn_generate_th_site_plan(integer, integer, jsonb, uuid, boolean, uuid) TO anon, authenticated, service_role;
