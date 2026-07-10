-- Phase A (A1+A2): pins (edit-as-regeneration), candidate lineage, and
-- view-without-persist on the MF generator; plus fn_list_mf_candidates for
-- the schemes rail.
--
-- NOTE: already applied to the live database via MCP on 2026-07-10.
-- Committed for version control — safe to re-run; the DB is not behind.
--
-- Pinned bars (p_pins: [{geom: 4326 Polygon, floors}]) are kept verbatim in
-- world frame; the row engine treats them as obstacles (padded mask shared
-- with the entry spine), so generated bars, parking streets, courts and
-- drive centerlines all re-flow around them. p_persist=false renders a
-- scheme without writing a candidate row (deterministic from seed + pins).
-- The old 3-arg overload is dropped (PostgREST ambiguity).

DROP FUNCTION IF EXISTS public.fn_generate_mf_site_plan(integer, text, integer);

CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan(
  p_ogc_fid integer,
  p_typology text DEFAULT 'multifamily',
  p_seed integer DEFAULT 1,
  p_pins jsonb DEFAULT NULL,
  p_parent uuid DEFAULT NULL,
  p_persist boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  ctx jsonb; spec record;
  v_front numeric; v_side numeric; v_rear numeric; sb numeric;
  g2274 geometry; buildable geometry; ox numeric; oy numeric;
  obb geometry; theta numeric; anchor geometry; rot geometry;
  bxmin numeric; bymin numeric; bxmax numeric; bymax numeric;
  avail_h numeric; lead_street boolean := true;
  bar_depth numeric; aisle numeric; stall_w numeric; stall_d numeric;
  drive_gap numeric; court_gap numeric;
  bar_min numeric := 90; bar_max numeric := 250; bar_gap numeric := 25;
  floors integer; f2f numeric; hmax numeric; ratio numeric;
  boundary geometry; seg_a geometry; seg_b geometry;
  best_len numeric := 0; seg_len numeric;
  entry_pt geometry; entry_rot geometry; spine_x numeric;
  spine geometry; avoid geometry;
  npts integer; i integer; k integer;
  y numeric; use_court boolean; gap numeric; mid numeric;
  band geometry; comp record;
  x numeric; try_len numeric; bar geometry; placed boolean;
  a0 numeric; a1 numeric;
  bars_arr geometry[] := '{}';
  pin_geoms geometry[] := '{}'; pin_floors int[] := '{}'; pin record; pg geometry;
  parks geometry := NULL; drives geometry := NULL; greens geometry := NULL;
  drives_cl geometry := NULL; cl geometry;
  amen geometry := NULL; amen_idx integer := 0; amen_dist numeric; d numeric;
  drive_band geometry; park_band geometry; court_band geometry; lead_park geometry;
  bars_j jsonb := '[]'::jsonb; parks_j jsonb := '[]'::jsonb;
  drives_j jsonb := '[]'::jsonb; greens_j jsonb := '[]'::jsonb; amen_j jsonb := '[]'::jsonb;
  bars_l jsonb := '[]'::jsonb; parks_l jsonb := '[]'::jsonb;
  drives_l jsonb := '[]'::jsonb; greens_l jsonb := '[]'::jsonb; amen_l jsonb := '[]'::jsonb;
  bars_u geometry;
  n_bars integer := 0; tot_fp numeric := 0; gfa numeric := 0;
  tot_park numeric := 0; tot_drive numeric := 0; tot_green numeric := 0; n_stalls integer := 0;
  units integer; req_stalls integer;
  parcel_area numeric; flags jsonb;
  v_session uuid; v_candidate uuid; persisted boolean := false;
  basis text; ub geometry; pf integer;
BEGIN
  ctx := public.fn_resolve_design_context(p_ogc_fid, p_typology);
  IF ctx ? 'error' THEN RETURN ctx; END IF;
  SELECT * INTO spec FROM public.typology_spec WHERE typology = p_typology;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no typology_spec row for ' || p_typology);
  END IF;
  flags := COALESCE(ctx->'flags', '[]'::jsonb);

  v_front := COALESCE((ctx#>>'{setbacks,front,value}')::numeric, spec.default_front_setback_ft, 20);
  v_side  := COALESCE((ctx#>>'{setbacks,side,value}')::numeric,  spec.default_side_setback_ft, 10);
  v_rear  := COALESCE((ctx#>>'{setbacks,rear,value}')::numeric,  spec.default_rear_setback_ft, 20);
  sb := GREATEST(v_front, v_side, v_rear);

  stall_w := COALESCE(spec.stall_w_ft, 9);
  stall_d := COALESCE(spec.stall_d_ft, 18);
  aisle   := COALESCE(spec.drive_aisle_ft, 24);
  ratio   := COALESCE(spec.surface_parking_ratio, 1.5);
  bar_depth := LEAST(COALESCE(spec.max_floorplate_depth_ft, 65), 65);
  f2f  := COALESCE(spec.floor_to_floor_ft, 10);
  hmax := (ctx#>>'{height_max_ft,value}')::numeric;
  IF hmax IS NULL THEN floors := 3;
  ELSE floors := GREATEST(1, LEAST(4, floor(hmax / f2f)::int));
  END IF;
  drive_gap := stall_d + aisle + stall_d;
  court_gap := 44;

  SELECT geom_2274 INTO g2274 FROM public.parcels WHERE ogc_fid = p_ogc_fid;
  IF g2274 IS NULL THEN RETURN jsonb_build_object('error', 'parcel has no geom_2274'); END IF;
  g2274 := (ST_Dump(g2274)).geom;
  parcel_area := ST_Area(g2274);
  ox := ST_XMin(g2274); oy := ST_YMin(g2274);

  buildable := ST_Buffer(g2274, -sb);
  IF buildable IS NULL OR ST_IsEmpty(buildable) THEN
    RETURN ctx || jsonb_build_object('generation', 'no buildable area after setbacks');
  END IF;
  buildable := (SELECT geom FROM (SELECT (ST_Dump(buildable)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);

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

  obb := ST_OrientedEnvelope(buildable);
  anchor := ST_Centroid(obb);
  SELECT CASE
      WHEN ST_Distance(ST_PointN(ST_ExteriorRing(obb),1), ST_PointN(ST_ExteriorRing(obb),2))
         >= ST_Distance(ST_PointN(ST_ExteriorRing(obb),2), ST_PointN(ST_ExteriorRing(obb),3))
      THEN ST_Azimuth(ST_PointN(ST_ExteriorRing(obb),1), ST_PointN(ST_ExteriorRing(obb),2))
      ELSE ST_Azimuth(ST_PointN(ST_ExteriorRing(obb),2), ST_PointN(ST_ExteriorRing(obb),3))
    END INTO theta;
  theta := pi()/2 - theta;

  rot := ST_Rotate(buildable, -theta, anchor);
  entry_rot := ST_Rotate(entry_pt, -theta, anchor);
  bxmin := ST_XMin(rot); bymin := ST_YMin(rot); bxmax := ST_XMax(rot); bymax := ST_YMax(rot);
  avail_h := bymax - bymin;

  IF avail_h < (stall_d + aisle) + bar_depth + 6 THEN
    bar_depth := GREATEST(45, avail_h - (stall_d + aisle) - 6);
    IF bar_depth + stall_d + aisle + 6 > avail_h THEN
      lead_street := false;
      bar_depth := GREATEST(40, LEAST(bar_depth, avail_h - 4));
    END IF;
  END IF;
  IF bar_depth > avail_h - 4 THEN
    RETURN ctx || jsonb_build_object('generation', 'envelope too shallow for a building bar');
  END IF;

  spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 50), bxmax - 50);
  spine := ST_Intersection(rot, ST_MakeEnvelope(spine_x - aisle/2, bymin, spine_x + aisle/2, bymax, 2274));
  -- Obstacle mask: spine + every pinned bar (rotated into the row frame)
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
    lead_park := ST_Difference(
      ST_Intersection(rot, ST_MakeEnvelope(bxmin, y, bxmax, y + stall_d, 2274)), avoid);
    IF lead_park IS NOT NULL AND NOT ST_IsEmpty(lead_park) THEN
      parks := lead_park;
    END IF;
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
          placed := false;
          try_len := LEAST(bar_max, ST_XMax(comp.geom) - 2 - x);
          WHILE try_len >= bar_min LOOP
            bar := ST_MakeEnvelope(x, y, x + try_len, y + bar_depth, 2274);
            IF ST_Covers(rot, bar) AND NOT ST_Intersects(bar, avoid) THEN
              bars_arr := bars_arr || bar;
              n_bars := n_bars + 1;
              tot_fp := tot_fp + ST_Area(bar);
              gfa := gfa + ST_Area(bar) * floors;
              x := x + try_len + bar_gap;
              placed := true;
              EXIT;
            END IF;
            try_len := try_len - 30;
          END LOOP;
          IF NOT placed THEN
            x := x + 20;
          END IF;
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
    RETURN ctx || jsonb_build_object('generation', 'no bars fit the envelope',
      'canvas_frame', jsonb_build_object('origin_2274', jsonb_build_array(round(ox,2), round(oy,2))));
  END IF;

  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives, spine) END;

  IF n_bars > 2 THEN
    amen_dist := NULL;
    FOR k IN 1..array_length(bars_arr, 1) LOOP
      d := ST_Distance(ST_Rotate(bars_arr[k], theta, anchor), entry_pt);
      IF amen_dist IS NULL OR d < amen_dist THEN
        amen_dist := d; amen_idx := k;
      END IF;
    END LOOP;
    amen := bars_arr[amen_idx];
    tot_fp := tot_fp - ST_Area(amen);
    gfa := gfa - ST_Area(amen) * floors;
    n_bars := n_bars - 1;
  END IF;

  -- Serialize: generated bars (skip amenity), then pinned bars (world frame)
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
  units := GREATEST(1, floor(gfa / 950))::int;
  req_stalls := ceil(units * ratio)::int;
  IF n_stalls < req_stalls THEN
    flags := flags || to_jsonb('parking_below_ratio'::text);
  END IF;
  flags := flags || to_jsonb('entry_from_longest_frontage_heuristic'::text);

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

  basis := format('%s garden bars%s · %s floors · entry drive from primary frontage · %s stalls surface (%s/unit target)',
                  n_bars,
                  CASE WHEN COALESCE(array_length(pin_geoms,1),0) > 0
                       THEN format(' (%s pinned)', array_length(pin_geoms,1)) ELSE '' END,
                  floors, n_stalls, ratio);

  SELECT ST_Union(g2) INTO bars_u FROM (
    SELECT ST_SetSRID(ST_Rotate(bg, theta, anchor), 2274) AS g2
    FROM unnest(bars_arr) WITH ORDINALITY AS t(bg, ord)
    WHERE ord <> amen_idx
    UNION ALL
    SELECT ST_SetSRID(pg2, 2274) FROM unnest(pin_geoms) AS pg2
  ) q;

  IF p_persist THEN
    BEGIN
      INSERT INTO public.siteplanner_session (parcel_id, zoning_base, far_max, height_max_ft, parking_ratio, setbacks)
      VALUES (p_ogc_fid::text, ctx->>'zoning_base',
              (ctx#>>'{far_max,value}')::numeric, hmax, ratio,
              jsonb_build_object('front', v_front, 'side', v_side, 'rear', v_rear, 'applied_uniform', sb))
      RETURNING id INTO v_session;

      INSERT INTO public.siteplanner_candidate (session_id, typology, geometry_buildings, geometry_parking, geometry_drives, metrics, parent_candidate_id)
      VALUES (v_session, p_typology,
              ST_Multi(ST_CollectionExtract(ST_Transform(bars_u, 3857), 3)),
              CASE WHEN parks IS NULL THEN NULL
                   ELSE ST_Multi(ST_CollectionExtract(ST_Transform(ST_SetSRID(ST_Rotate(parks, theta, anchor), 2274), 3857), 3)) END,
              CASE WHEN drives_cl IS NULL THEN NULL
                   ELSE ST_Multi(ST_CollectionExtract(ST_Transform(ST_SetSRID(ST_Rotate(drives_cl, theta, anchor), 2274), 3857), 2)) END,
              jsonb_build_object('bars', n_bars, 'floors', floors, 'gfa_sqft', round(gfa),
                'units_est', units, 'stalls', n_stalls, 'stalls_required', req_stalls,
                'coverage_pct', round(tot_fp / parcel_area * 100, 1),
                'far', round(gfa / parcel_area, 2), 'seed', p_seed,
                'pins', COALESCE(p_pins, '[]'::jsonb)),
              p_parent)
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
    'plan_basis', basis,
    'context_confidence', ctx->>'confidence',
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
      'far', round(gfa / parcel_area, 2),
      'parcel_sqft', round(parcel_area),
      'parking_sqft', round(tot_park), 'drives_sqft', round(tot_drive), 'greens_sqft', round(tot_green),
      'open_space_pct', round(GREATEST(0, parcel_area - tot_fp - tot_park - tot_drive) / parcel_area * 100, 1)
    ),
    'canvas_frame', jsonb_build_object(
      'units', 'feet_us_survey',
      'crs_basis', 'EPSG:2274 translated to local origin',
      'origin_2274', jsonb_build_array(round(ox,2), round(oy,2)),
      'parcel', ST_AsGeoJSON(ST_Translate(g2274, -ox, -oy))::jsonb,
      'buildable', ST_AsGeoJSON(ST_Translate(buildable, -ox, -oy))::jsonb,
      'buildings', bars_l,
      'parking', parks_l,
      'drives', drives_l,
      'greens', greens_l,
      'amenity', amen_l
    ),
    'flags', flags
  );
END $function$;

-- A1: list a parcel's persisted candidates (schemes rail data source)
CREATE OR REPLACE FUNCTION public.fn_list_mf_candidates(
  p_ogc_fid integer,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_agg(row_j ORDER BY created_at DESC), '[]'::jsonb)
  FROM (
    SELECT c.created_at,
           jsonb_build_object(
             'id', c.id,
             'created_at', c.created_at,
             'typology', c.typology,
             'parent_candidate_id', c.parent_candidate_id,
             'seed', c.metrics->>'seed',
             'pins', COALESCE(c.metrics->'pins', '[]'::jsonb),
             'metrics', c.metrics - 'pins'
           ) AS row_j
    FROM public.siteplanner_candidate c
    JOIN public.siteplanner_session s ON s.id = c.session_id
    WHERE s.parcel_id = p_ogc_fid::text
    ORDER BY c.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
  ) q;
$$;
