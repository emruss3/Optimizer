-- 2026-09-09 · Parking is laid out aisle-first.
--
-- Eric, 1200 W H Davis (669046, a 147 × 828 ft landlocked strip with a
-- 301 × 67 ft bar along it): "This is not how parking would actually be laid
-- out for a building like this. We've now tried to clean up the example 10+
-- times."
--
-- He is right, and the reason the clean-ups never held is that the seed
-- never had a drive aisle in it. fn_seed_parking placed 60-ft stall MODULES
-- (a double-loaded bay with its own internal aisle) as free-standing
-- rectangles to reach a stall count — rows beside the building, rows past
-- its ends, a field behind it — and picked whichever set counted highest.
-- On a strip the "end rows" stack module after module along the strip with
-- each module's internal aisle running ACROSS it, open onto the property
-- lines and joined to nothing: the ladder in the screenshot. Every earlier
-- fix drew a road to modules that were laid out as if roads did not exist.
--
-- This replaces the body of fn_seed_parking with the way a site planner
-- actually works: the DRIVE AISLE NETWORK is laid out first, then stalls
-- hang off it. Everything is drawn in the building's frame, so every drive
-- and every row is parallel or perpendicular to the building.
--
--  1. Frame: the building's oriented box (a along its long face, n across).
--  2. Ring: a 24-ft aisle beside each long face and past each end of the
--     building — the building's own extent plus a corner — kept only where
--     it fits beside the building (a 20-ft front yard or a 5-ft side yard
--     does not get one; the side the placer reserved for the access lane
--     always does).
--  3. Connector: from the entry (the lane's centre on the curb, or the
--     easement end of a landlocked strip) a 26-ft drive to the ring, straight
--     along one of the frame's axes where one reaches; else an L around a
--     corner of the building's box; a diagonal only when nothing square
--     fits. If the given entry cannot reach the ring at all, the curb cut
--     moves along the frontage to where the building leaves room.
--  4. Field aisles: beyond each side of the building, runs perpendicular to
--     it on a 60-ft module keyed off the ring's end aisle (so rows meet back
--     to back) or off either site edge (so a strip or a corner takes full
--     rows); runs parallel to it 48 ft off the ring aisle (two rows back to
--     back between them) and then every 60 ft; past the ends, runs that
--     continue the flank aisles, a centred pair, and edge-keyed runs. One
--     that does not touch the network is joined by a short square
--     cross-connector. A run is refused where an aisle already runs the
--     same way, and it meets an aisle running the other way as a T, never a
--     crossing (a crossing chops the rows on both sides into three-stall
--     scraps): the part beyond the aisle is kept. They are added in order of stalls
--     gained per foot from the entry until the rows cover the need — the
--     need of the building actually placed, derived as the dispatcher
--     derives it, not fn_max_buildout's figure for the biggest building the
--     lot could hold (that had every plan carrying a third more parking than
--     it required; the max figure is still reported as stalls_target_at_max).
--  5. Stalls: one 18-ft row beside each side of every aisle, each its own
--     rectangle in the frame — never a buffer of the network, never a union
--     across aisles (a union merged rows at angles into wedges and counted
--     an 11-ft strip beside the building as stalls) — clipped to the site,
--     never in the front yard, never over an aisle or another row, never
--     under 16 ft deep; a row counts floor(length / 9). The rows nearest the
--     entry are kept: one radius from the entry is found that covers the
--     need, and every row is cut square at it, so a field fills evenly from
--     the way in and stops together.
--  6. Every field aisle is cut back to the rows it serves (plus where the
--     network joins it); a ring side that carries no stalls and is not the
--     way in is dropped, one at a time, unless removing it breaks the
--     network apart; aisles are put back where the network would otherwise
--     fall into pieces.
--
-- Emitted as before: parking_seed.bays (now the stall rows, one row each,
-- which the client stripes) and drives[] (the aisle network, real polygons);
-- strategy = 'aisle_first', with a debug block naming what was decided.
-- fn_site_skeleton_v2_bars (the placer with its reserved lane) and the
-- dispatcher are unchanged.

-- Stalls in a row: floor(length / 9) per piece at least 16 ft deep and two
-- stalls long, capped by its area, summed over the pieces.
CREATE OR REPLACE FUNCTION public.fn_band_count(p_band geometry, p_stall numeric DEFAULT 18, p_pitch numeric DEFAULT 9)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE e record; n int := 0; obb geometry; bring geometry; bl double precision; bs double precision;
BEGIN
  IF p_band IS NULL OR ST_IsEmpty(p_band) THEN RETURN 0; END IF;
  FOR e IN SELECT d.geom FROM (SELECT (ST_Dump(p_band)).geom) d LOOP
    CONTINUE WHEN ST_GeometryType(e.geom) <> 'ST_Polygon' OR ST_Area(e.geom) < 2*p_stall*p_pitch;
    obb := ST_OrientedEnvelope(e.geom);
    CONTINUE WHEN ST_GeometryType(obb) <> 'ST_Polygon';
    bring := ST_ExteriorRing(obb);
    bl := GREATEST(ST_Distance(ST_PointN(bring,1),ST_PointN(bring,2)), ST_Distance(ST_PointN(bring,2),ST_PointN(bring,3)));
    bs := LEAST(ST_Distance(ST_PointN(bring,1),ST_PointN(bring,2)), ST_Distance(ST_PointN(bring,2),ST_PointN(bring,3)));
    CONTINUE WHEN bs < 16;
    n := n + LEAST(floor(bl / p_pitch), floor(ST_Area(e.geom) / (p_stall*p_pitch)))::int;
  END LOOP;
  RETURN n;
END $function$;

-- A row rectangle fitted to the site: clipped to it, less the aisles, the
-- front yard and the rows already kept; only the pieces that hold stalls.
CREATE OR REPLACE FUNCTION public.fn_band_fit(p_rect geometry, p_site geometry, p_net geometry, p_no_stall geometry, p_kept geometry, p_stall numeric DEFAULT 18, p_pitch numeric DEFAULT 9)
RETURNS geometry
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE gg geometry; out_g geometry := NULL; e record; obb geometry; bring geometry; bl double precision; bs double precision;
BEGIN
  IF p_rect IS NULL OR ST_IsEmpty(p_rect) OR p_site IS NULL THEN RETURN NULL; END IF;
  gg := ST_Intersection(p_rect, p_site);
  IF p_net IS NOT NULL AND NOT ST_IsEmpty(p_net) THEN gg := ST_Difference(gg, ST_Buffer(p_net, 0.3, 'join=mitre')); END IF;
  IF p_no_stall IS NOT NULL AND NOT ST_IsEmpty(p_no_stall) THEN gg := ST_Difference(gg, p_no_stall); END IF;
  IF p_kept IS NOT NULL AND NOT ST_IsEmpty(p_kept) THEN gg := ST_Difference(gg, ST_Buffer(p_kept, 0.3, 'join=mitre')); END IF;
  IF gg IS NULL OR ST_IsEmpty(gg) THEN RETURN NULL; END IF;
  FOR e IN SELECT d.geom FROM (SELECT (ST_Dump(gg)).geom) d LOOP
    CONTINUE WHEN ST_GeometryType(e.geom) <> 'ST_Polygon' OR ST_Area(e.geom) < 2*p_stall*p_pitch;
    obb := ST_OrientedEnvelope(e.geom);
    CONTINUE WHEN ST_GeometryType(obb) <> 'ST_Polygon';
    bring := ST_ExteriorRing(obb);
    bl := GREATEST(ST_Distance(ST_PointN(bring,1),ST_PointN(bring,2)), ST_Distance(ST_PointN(bring,2),ST_PointN(bring,3)));
    bs := LEAST(ST_Distance(ST_PointN(bring,1),ST_PointN(bring,2)), ST_Distance(ST_PointN(bring,2),ST_PointN(bring,3)));
    CONTINUE WHEN bs < 16 OR floor(bl / p_pitch) < 2 OR floor(ST_Area(e.geom) / (p_stall*p_pitch)) < 2;
    out_g := CASE WHEN out_g IS NULL THEN e.geom ELSE ST_Union(out_g, e.geom) END;
  END LOOP;
  RETURN out_g;
END $function$;

-- [min, max] of a geometry's vertices projected on a unit axis through (ox, oy).
CREATE OR REPLACE FUNCTION public.fn_axis_span(g geometry, ox double precision, oy double precision, ux double precision, uy double precision)
RETURNS double precision[]
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT ARRAY[min((ST_X(q.geom)-ox)*ux+(ST_Y(q.geom)-oy)*uy), max((ST_X(q.geom)-ox)*ux+(ST_Y(q.geom)-oy)*uy)]
  FROM ST_DumpPoints(g) q;
$function$;

CREATE OR REPLACE FUNCTION public.fn_seed_parking(p_ogc_fid integer, p_typology text DEFAULT 'multifamily', p_need_ft numeric DEFAULT NULL, p_stories integer DEFAULT NULL, p_stalls_needed integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  sk jsonb; mb jsonb; std jsonb; ctx jsonb; fr jsonb;
  g geometry; site geometry; structure geometry; clear geometry; obb geometry; ring geometry; p geometry[];
  L12 double precision; L23 double precision; ax double precision;
  dx double precision; dy double precision; nx double precision; ny double precision;
  cx double precision; cy double precision; slen double precision; half_d double precision;
  a_lo double precision; a_hi double precision; n_lo double precision; n_hi double precision;
  lane numeric; aisle numeric := 24; stall numeric := 18; pitch numeric := 9; module numeric := 60;
  need int; v_front numeric; fline geometry; no_stall geometry; fpart geometry; faz double precision;
  entry geometry; net geometry; cand geometry; candc geometry; nominal geometry; cc geometry;
  sides geometry[] := '{}'; side_ok boolean[] := '{}'; s int;
  conn geometry; best_conn geometry; best_line geometry; best_cost double precision; best_entry geometry; best_kind text := 'blocked';
  piece geometry; line geometry; hit geometry; ray geometry; mpt geometry; corner geometry; pts geometry[];
  cost double precision; a_e double precision; n_e double precision; ea double precision; en double precision; ca double precision; cn double precision; lmax double precision;
  t int; k int; j int; r int; i int; it int; cand_entry geometry; access_note text := 'ok';
  pos double precision; off0 double precision; depth double precision; o double precision; o1 double precision;
  ra0 double precision; ra1 double precision; rn0 double precision; rn1 double precision;
  ax_ text; r0 double precision; r1 double precision; c0 double precision; c1 double precision; span double precision[]; tspan double precision[];
  -- field aisle candidates
  f_geom geometry[] := '{}'; f_cc geometry[] := '{}'; f_axis text[] := '{}'; f_r0 double precision[] := '{}'; f_r1 double precision[] := '{}';
  f_c0 double precision[] := '{}'; f_c1 double precision[] := '{}'; f_d double precision[] := '{}';
  -- selected field aisles
  s_geom geometry[] := '{}'; s_cc geometry[] := '{}'; s_axis text[] := '{}'; s_r0 double precision[] := '{}'; s_r1 double precision[] := '{}';
  s_c0 double precision[] := '{}'; s_c1 double precision[] := '{}'; s_keep boolean[] := '{}'; n_sel int := 0;
  -- stall rows (bands): ring + connector + selected fields
  b_rect geometry[] := '{}'; b_axis text[] := '{}'; b_r0 double precision[] := '{}'; b_r1 double precision[] := '{}';
  b_c0 double precision[] := '{}'; b_c1 double precision[] := '{}'; b_field int[] := '{}'; b_piece geometry[] := '{}'; b_n int[] := '{}'; nb int := 0;
  kept geometry; est int := 0; total int := 0; new_n int; best_i int; best_score double precision; score double precision;
  seg record; sa0 double precision; sa1 double precision; sn0 double precision; sn1 double precision;
  r_lo double precision; r_hi double precision; r_mid double precision; cnt int; dn double precision; w double precision; e_run double precision; e_cross double precision;
  cut geometry; cutp geometry; b_cut geometry[]; b_cn int[]; cut_r double precision := NULL;
  test_net geometry; net_others geometry; touch geometry; keep_bays jsonb := '[]'::jsonb; e record;
  drives jsonb := '[]'::jsonb; pi_ int := 0; n_fields int := 0; dropped int := 0; n_kept_fields int := 0;
  net_a geometry; net_n geometry; f_run geometry[] := '{}'; f_anchor text[] := '{}'; anchor_ text;
  need_max int; need_placed int; fp numeric; gsf numeric; unit_gsf numeric; units int; pkr numeric; stories_ int;
  split_q geometry[] := '{}'; split_ax text[] := '{}'; xa geometry; xax text; xg geometry; x0 double precision; x1 double precision; keep_lo boolean;
BEGIN
  sk := public.fn_site_skeleton_v2(p_ogc_fid, p_typology, p_need_ft, p_stories);
  IF sk ? 'error' OR NOT (sk ? 'structures') THEN RETURN sk; END IF;
  mb := public.fn_max_buildout(p_ogc_fid, p_typology);
  std := public.fn_site_standards(p_typology);
  lane := coalesce((std#>>'{fire_access,lane_width_ft}')::numeric, 26);
  need_max := (mb->>'stalls_required_at_max')::int;
  -- the need for the building actually placed, derived as the dispatcher
  -- derives it (a plan no longer carries the max-buildout need's parking)
  need_placed := NULL;
  BEGIN
    stories_ := coalesce((sk->>'stories')::int, 4);
    SELECT sum((x->>'footprint_sqft')::numeric) INTO fp FROM jsonb_array_elements(sk->'structures') x;
    gsf := coalesce(fp, 0) * stories_;
    unit_gsf := coalesce((mb#>>'{program_frontier,gsf_max_option,unit_gsf}')::numeric, 1200);
    units := floor(gsf*0.88/unit_gsf);
    pkr := public.fn_parking_ratio_for_unit_gsf(p_typology, unit_gsf);
    IF gsf > 0 AND pkr IS NOT NULL THEN need_placed := ceil(units*pkr); END IF;
  EXCEPTION WHEN others THEN need_placed := NULL; END;
  need := coalesce(p_stalls_needed, need_placed, need_max, 100);
  IF need <= 0 THEN
    RETURN sk || jsonb_build_object('parking_seed', jsonb_build_object('stalls_target',0,'stalls_achieved_est',0,
      'coverage_of_target_pct',100,'strategy','none_needed','bays','[]'::jsonb)); END IF;

  SELECT (ST_Dump(geom_2274)).geom INTO g FROM public.parcels WHERE ogc_fid = p_ogc_fid LIMIT 1;
  SELECT ST_UnaryUnion(ST_Collect(ST_SetSRID(ST_GeomFromGeoJSON((x->'geom_2274')::text),2274)))
    INTO structure FROM jsonb_array_elements(sk->'structures') x;
  IF g IS NULL OR structure IS NULL OR ST_IsEmpty(structure) THEN
    RETURN sk || jsonb_build_object('parking_seed', jsonb_build_object('stalls_target',need,'stalls_achieved_est',0,
      'coverage_of_target_pct',0,'strategy','no_geometry','bays','[]'::jsonb)); END IF;
  clear := ST_Buffer(structure, 2, 'join=mitre');
  -- pavement may run to within 3 ft of the line; never under or against the building
  site := ST_Difference(ST_Buffer(g, -3, 'join=mitre'), clear);

  -- no stalls in the front yard (the drive may cross it)
  ctx := public.fn_resolve_design_context(p_ogc_fid, p_typology);
  v_front := coalesce((ctx#>>'{setbacks,front,value}')::numeric, 20);
  no_stall := NULL; fline := NULL; fpart := NULL; faz := NULL;
  BEGIN
    fr := public.fn_parcel_frontage(p_ogc_fid);
    IF NOT coalesce((fr->>'landlocked')::boolean, true) THEN
      fline := ST_SetSRID(ST_GeomFromGeoJSON((fr#>'{primary,geom_2274}')::text),2274);
      no_stall := ST_Buffer(fline, v_front + 2);
      SELECT d.geom INTO fpart FROM (SELECT (ST_Dump(ST_LineMerge(fline))).geom) d ORDER BY ST_Length(d.geom) DESC LIMIT 1;
      IF fpart IS NOT NULL AND ST_Length(fpart) > 1 THEN faz := ST_Azimuth(ST_StartPoint(fpart), ST_EndPoint(fpart)); END IF;
    END IF;
  EXCEPTION WHEN others THEN no_stall := NULL; fline := NULL; fpart := NULL; faz := NULL; END;

  -- 1. The building frame: a along the long face, n across it
  obb := ST_OrientedEnvelope(structure); ring := ST_ExteriorRing(obb);
  p := ARRAY[ST_PointN(ring,1),ST_PointN(ring,2),ST_PointN(ring,3)];
  L12 := ST_Distance(p[1],p[2]); L23 := ST_Distance(p[2],p[3]);
  IF L12 >= L23 THEN ax := ST_Azimuth(p[1],p[2]); slen := L12; half_d := L23/2;
  ELSE ax := ST_Azimuth(p[2],p[3]); slen := L23; half_d := L12/2; END IF;
  dx := sin(ax); dy := cos(ax); nx := sin(ax+pi()/2); ny := cos(ax+pi()/2);
  cx := ST_X(ST_Centroid(obb)); cy := ST_Y(ST_Centroid(obb));
  span := public.fn_axis_span(g, cx, cy, dx, dy); a_lo := span[1]; a_hi := span[2];
  span := public.fn_axis_span(g, cx, cy, nx, ny); n_lo := span[1]; n_hi := span[2];
  lmax := GREATEST(a_hi - a_lo, n_hi - n_lo) + 50;
  BEGIN
    entry := ST_SetSRID(ST_GeomFromGeoJSON((sk#>'{skeleton,entry_2274}')::text),2274);
  EXCEPTION WHEN others THEN entry := NULL; END;
  IF entry IS NULL THEN entry := ST_ClosestPoint(ST_Boundary(g), ST_Centroid(structure)); END IF;

  -- 2. Ring: sides 1/2 = flank lanes beside the long faces (n > 0 / n < 0),
  --    3/4 = end aisles past the ends (a > 0 / a < 0); each the building's
  --    own extent plus an aisle width so the corners join, kept when the part
  --    beside the building fits (>= 85%). Each side carries one row on the
  --    side away from the building.
  FOR s IN 1..4 LOOP
    IF s = 1 THEN
      ra0 := -slen/2-2-aisle; ra1 := slen/2+2+aisle; rn0 := half_d+2; rn1 := half_d+2+aisle;
      nominal := public.fn_axis_rect(cx,cy,dx,dy,nx,ny, -slen/2, slen/2, rn0, rn1);
      ax_ := 'a'; r0 := ra0; r1 := ra1; c0 := rn1; c1 := rn1+stall;
    ELSIF s = 2 THEN
      ra0 := -slen/2-2-aisle; ra1 := slen/2+2+aisle; rn0 := -half_d-2-aisle; rn1 := -half_d-2;
      nominal := public.fn_axis_rect(cx,cy,dx,dy,nx,ny, -slen/2, slen/2, rn0, rn1);
      ax_ := 'a'; r0 := ra0; r1 := ra1; c0 := rn0-stall; c1 := rn0;
    ELSIF s = 3 THEN
      ra0 := slen/2+2; ra1 := slen/2+2+aisle; rn0 := -half_d-2-aisle; rn1 := half_d+2+aisle;
      nominal := public.fn_axis_rect(cx,cy,dx,dy,nx,ny, ra0, ra1, -half_d, half_d);
      ax_ := 'n'; r0 := rn0; r1 := rn1; c0 := ra1; c1 := ra1+stall;
    ELSE
      ra0 := -slen/2-2-aisle; ra1 := -slen/2-2; rn0 := -half_d-2-aisle; rn1 := half_d+2+aisle;
      nominal := public.fn_axis_rect(cx,cy,dx,dy,nx,ny, ra0, ra1, -half_d, half_d);
      ax_ := 'n'; r0 := rn0; r1 := rn1; c0 := ra0-stall; c1 := ra0;
    END IF;
    cand := public.fn_axis_rect(cx,cy,dx,dy,nx,ny, ra0, ra1, rn0, rn1);
    candc := ST_Intersection(cand, site);
    IF ST_Area(ST_Intersection(nominal, site)) >= 0.85*ST_Area(nominal) AND NOT ST_IsEmpty(candc) THEN
      sides := sides || candc; side_ok := side_ok || true;
      nb := nb + 1;
      b_rect := b_rect || (CASE WHEN ax_ = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, r0,r1,c0,c1) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, c0,c1,r0,r1) END);
      b_axis := b_axis || ax_; b_r0 := b_r0 || r0; b_r1 := b_r1 || r1; b_c0 := b_c0 || c0; b_c1 := b_c1 || c1; b_field := b_field || 0;
    ELSE
      sides := sides || ST_GeomFromText('POLYGON EMPTY', 2274); side_ok := side_ok || false;
    END IF;
  END LOOP;
  -- net_a / net_n: the aisles running along a / along n, so a candidate is
  -- refused only where an aisle already runs the same way (a crossing is fine)
  net := ST_GeomFromText('POLYGON EMPTY', 2274); net_a := net; net_n := net;
  FOR s IN 1..4 LOOP
    IF side_ok[s] THEN
      net := ST_Union(net, sides[s]);
      IF s IN (1,2) THEN net_a := ST_Union(net_a, sides[s]); ELSE net_n := ST_Union(net_n, sides[s]); END IF;
    END IF;
  END LOOP;

  -- 3. Connector: entry → ring. Straight along a frame axis where a ray from
  --    the entry meets the ring; else an L round a corner of the building's
  --    box; a diagonal only when nothing square fits. A first leg that runs
  --    along the street rather than in from it costs extra. If the given
  --    entry reaches nothing, the curb cut moves along the frontage.
  best_conn := NULL; best_line := NULL; best_cost := NULL; best_entry := entry;
  IF ST_IsEmpty(net) THEN
    -- a building with no room on any side: the aisle is wherever the entry can reach
    best_line := ST_ShortestLine(entry, clear);
    best_conn := ST_Intersection(ST_Buffer(best_line, lane/2, 'endcap=square join=mitre'), site);
    best_kind := 'to building';
  ELSE
    FOR t IN 0..6 LOOP
      IF t = 0 THEN cand_entry := entry;
      ELSE
        CONTINUE WHEN fpart IS NULL;
        cand_entry := ST_LineInterpolatePoint(fpart, (ARRAY[0.1, 0.25, 0.4, 0.6, 0.75, 0.9])[t]);
      END IF;
      ea := (ST_X(cand_entry)-cx)*dx+(ST_Y(cand_entry)-cy)*dy; en := (ST_X(cand_entry)-cx)*nx+(ST_Y(cand_entry)-cy)*ny;
      -- rays along ±a and ±n
      FOR k IN 1..4 LOOP
        ray := ST_MakeLine(cand_entry, ST_SetSRID(ST_MakePoint(
          cx + dx*(ea + CASE k WHEN 1 THEN lmax WHEN 2 THEN -lmax ELSE 0 END) + nx*(en + CASE k WHEN 3 THEN lmax WHEN 4 THEN -lmax ELSE 0 END),
          cy + dy*(ea + CASE k WHEN 1 THEN lmax WHEN 2 THEN -lmax ELSE 0 END) + ny*(en + CASE k WHEN 3 THEN lmax WHEN 4 THEN -lmax ELSE 0 END)), 2274));
        hit := ST_Intersection(ray, net);
        CONTINUE WHEN hit IS NULL OR ST_IsEmpty(hit);
        hit := ST_ClosestPoint(hit, cand_entry);
        line := ST_MakeLine(cand_entry, hit);
        CONTINUE WHEN ST_Length(line) < 3;
        CONTINUE WHEN ST_Intersects(ST_Buffer(line, 1), clear);
        conn := ST_Difference(ST_Intersection(ST_Buffer(line, lane/2, 'endcap=square join=mitre'), ST_Buffer(g, -3, 'join=mitre')), clear);
        CONTINUE WHEN conn IS NULL OR ST_IsEmpty(conn) OR ST_Area(conn) < 0.85 * ST_Length(line) * lane;
        cost := ST_Length(line) + CASE WHEN faz IS NOT NULL AND abs(sin(ST_Azimuth(cand_entry, hit) - faz)) < 0.5 THEN 30 ELSE 0 END;
        IF best_cost IS NULL OR cost < best_cost THEN best_cost := cost; best_conn := conn; best_line := line; best_entry := cand_entry; best_kind := 'straight'; END IF;
      END LOOP;
      -- L-routes round the box corners: along a then n, or n then a
      FOR k IN 1..4 LOOP
        ca := CASE WHEN k IN (1,2) THEN slen/2+2+aisle/2 ELSE -slen/2-2-aisle/2 END;
        cn := CASE WHEN k IN (1,3) THEN half_d+2+aisle/2 ELSE -half_d-2-aisle/2 END;
        corner := ST_SetSRID(ST_MakePoint(cx + dx*ca + nx*cn, cy + dy*ca + ny*cn), 2274);
        FOR j IN 1..2 LOOP
          IF j = 1 THEN mpt := ST_SetSRID(ST_MakePoint(cx + dx*ca + nx*en, cy + dy*ca + ny*en), 2274);
          ELSE mpt := ST_SetSRID(ST_MakePoint(cx + dx*ea + nx*cn, cy + dy*ea + ny*cn), 2274); END IF;
          pts := ARRAY[cand_entry, mpt, corner];
          IF NOT ST_DWithin(net, corner, 1) THEN pts := pts || ST_ClosestPoint(net, corner); END IF;
          line := ST_RemoveRepeatedPoints(ST_MakeLine(pts), 1);
          CONTINUE WHEN ST_NumPoints(line) < 2 OR ST_Length(line) < 3;
          CONTINUE WHEN ST_Intersects(ST_Buffer(line, 1), clear);
          conn := ST_Difference(ST_Intersection(ST_Buffer(line, lane/2, 'endcap=square join=mitre'), ST_Buffer(g, -3, 'join=mitre')), clear);
          CONTINUE WHEN conn IS NULL OR ST_IsEmpty(conn) OR ST_Area(conn) < 0.85 * ST_Length(line) * lane;
          cost := ST_Length(line) + 40 * (ST_NumPoints(line) - 2)
                + CASE WHEN faz IS NOT NULL AND abs(sin(ST_Azimuth(ST_PointN(line,1), ST_PointN(line,2)) - faz)) < 0.5 THEN 30 ELSE 0 END;
          IF best_cost IS NULL OR cost < best_cost THEN best_cost := cost; best_conn := conn; best_line := line; best_entry := cand_entry; best_kind := 'L'; END IF;
        END LOOP;
      END LOOP;
      -- diagonals, only if nothing square reached the ring
      IF best_conn IS NULL THEN
        FOR piece IN SELECT (ST_Dump(net)).geom LOOP
          line := ST_ShortestLine(cand_entry, piece);
          CONTINUE WHEN ST_Length(line) < 3 OR ST_Intersects(ST_Buffer(line, 1), clear);
          conn := ST_Difference(ST_Intersection(ST_Buffer(line, lane/2, 'endcap=square join=mitre'), ST_Buffer(g, -3, 'join=mitre')), clear);
          CONTINUE WHEN conn IS NULL OR ST_IsEmpty(conn) OR ST_Area(conn) < 0.85 * ST_Length(line) * lane;
          cost := ST_Length(line) + 200;
          IF best_cost IS NULL OR cost < best_cost THEN best_cost := cost; best_conn := conn; best_line := line; best_entry := cand_entry; best_kind := 'diagonal'; END IF;
        END LOOP;
        FOR k IN 1..4 LOOP
          ca := CASE WHEN k IN (1,2) THEN slen/2+2+aisle/2 ELSE -slen/2-2-aisle/2 END;
          cn := CASE WHEN k IN (1,3) THEN half_d+2+aisle/2 ELSE -half_d-2-aisle/2 END;
          corner := ST_SetSRID(ST_MakePoint(cx + dx*ca + nx*cn, cy + dy*ca + ny*cn), 2274);
          line := ST_RemoveRepeatedPoints(ST_MakeLine(ARRAY[cand_entry, corner, ST_ClosestPoint(net, corner)]), 1);
          CONTINUE WHEN ST_NumPoints(line) < 2 OR ST_Length(line) < 3 OR ST_Intersects(ST_Buffer(line, 1), clear);
          conn := ST_Difference(ST_Intersection(ST_Buffer(line, lane/2, 'endcap=square join=mitre'), ST_Buffer(g, -3, 'join=mitre')), clear);
          CONTINUE WHEN conn IS NULL OR ST_IsEmpty(conn) OR ST_Area(conn) < 0.85 * ST_Length(line) * lane;
          cost := ST_Length(line) + 240;
          IF best_cost IS NULL OR cost < best_cost THEN best_cost := cost; best_conn := conn; best_line := line; best_entry := cand_entry; best_kind := 'diagonal round a corner'; END IF;
        END LOOP;
      END IF;
      EXIT WHEN t = 0 AND best_conn IS NOT NULL; -- the given entry reaches the ring: keep it
    END LOOP;
    entry := best_entry;
    IF best_conn IS NULL THEN
      best_line := ST_ShortestLine(entry, net);
      best_conn := ST_Difference(ST_Intersection(ST_Buffer(best_line, lane/2, 'endcap=flat join=mitre'), ST_Buffer(g, -3, 'join=mitre')), clear);
      best_kind := 'blocked';
      access_note := 'blocked: no straight, L or diagonal way from the frontage to the ring';
    END IF;
  END IF;
  IF best_conn IS NOT NULL AND NOT ST_IsEmpty(best_conn) THEN net := ST_Union(net, best_conn); END IF;
  a_e := (ST_X(entry)-cx)*dx+(ST_Y(entry)-cy)*dy; n_e := (ST_X(entry)-cx)*nx+(ST_Y(entry)-cy)*ny;
  -- rows beside each square leg of the connector (30 ft or longer)
  IF best_line IS NOT NULL THEN
    FOR seg IN SELECT (ST_DumpSegments(best_line)).geom AS geom LOOP
      sa0 := (ST_X(ST_StartPoint(seg.geom))-cx)*dx+(ST_Y(ST_StartPoint(seg.geom))-cy)*dy; sn0 := (ST_X(ST_StartPoint(seg.geom))-cx)*nx+(ST_Y(ST_StartPoint(seg.geom))-cy)*ny;
      sa1 := (ST_X(ST_EndPoint(seg.geom))-cx)*dx+(ST_Y(ST_EndPoint(seg.geom))-cy)*dy; sn1 := (ST_X(ST_EndPoint(seg.geom))-cx)*nx+(ST_Y(ST_EndPoint(seg.geom))-cy)*ny;
      piece := ST_Buffer(seg.geom, lane/2, 'endcap=square join=mitre');
      IF abs(sn1 - sn0) < 1 THEN net_a := ST_Union(net_a, piece);
      ELSIF abs(sa1 - sa0) < 1 THEN net_n := ST_Union(net_n, piece);
      ELSE net_a := ST_Union(net_a, piece); net_n := ST_Union(net_n, piece); END IF;
      IF abs(sa1 - sa0) >= 30 AND abs(sn1 - sn0) < 1 THEN
        FOR j IN 1..2 LOOP
          nb := nb + 1; ax_ := 'a'; r0 := LEAST(sa0,sa1); r1 := GREATEST(sa0,sa1);
          IF j = 1 THEN c0 := sn0 + lane/2; c1 := sn0 + lane/2 + stall; ELSE c0 := sn0 - lane/2 - stall; c1 := sn0 - lane/2; END IF;
          b_rect := b_rect || public.fn_axis_rect(cx,cy,dx,dy,nx,ny, r0,r1,c0,c1);
          b_axis := b_axis || ax_; b_r0 := b_r0 || r0; b_r1 := b_r1 || r1; b_c0 := b_c0 || c0; b_c1 := b_c1 || c1; b_field := b_field || 0;
        END LOOP;
      ELSIF abs(sn1 - sn0) >= 30 AND abs(sa1 - sa0) < 1 THEN
        FOR j IN 1..2 LOOP
          nb := nb + 1; ax_ := 'n'; r0 := LEAST(sn0,sn1); r1 := GREATEST(sn0,sn1);
          IF j = 1 THEN c0 := sa0 + lane/2; c1 := sa0 + lane/2 + stall; ELSE c0 := sa0 - lane/2 - stall; c1 := sa0 - lane/2; END IF;
          b_rect := b_rect || public.fn_axis_rect(cx,cy,dx,dy,nx,ny, c0,c1,r0,r1);
          b_axis := b_axis || ax_; b_r0 := b_r0 || r0; b_r1 := b_r1 || r1; b_c0 := b_c0 || c0; b_c1 := b_c1 || c1; b_field := b_field || 0;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- 4. Field aisle candidates beyond each side of the building, each with
  --    its own two rows: perpendicular runs on a 60-ft module, parallel runs
  --    48 ft off the ring aisle (two rows back to back) then every 60 ft;
  --    past the ends, runs continuing the flank aisles, a centred pair, and
  --    edge-keyed runs. One that does not touch the network is joined by a
  --    square cross-connector or is not a candidate.
  FOR s IN 1..4 LOOP
    IF s = 1 THEN off0 := half_d + 2 + (CASE WHEN side_ok[1] THEN aisle ELSE 0 END); depth := n_hi - off0;
    ELSIF s = 2 THEN off0 := -half_d - 2 - (CASE WHEN side_ok[2] THEN aisle ELSE 0 END); depth := off0 - n_lo;
    ELSIF s = 3 THEN off0 := slen/2 + 2 + (CASE WHEN side_ok[3] THEN aisle ELSE 0 END); depth := a_hi - off0;
    ELSE off0 := -slen/2 - 2 - (CASE WHEN side_ok[4] THEN aisle ELSE 0 END); depth := off0 - a_lo; END IF;
    IF depth < stall + aisle THEN CONTINUE; END IF;
    o1 := CASE WHEN side_ok[s] THEN 2*stall + aisle/2 ELSE stall + aisle/2 END;
    FOR j IN 0..33 LOOP
      IF j <= 25 THEN
        -- runs perpendicular to this side of the building
        IF s IN (1,2) THEN
          k := j % 7;
          IF j < 7 THEN pos := (-slen/2-2-aisle/2) + k*module;           -- keyed off the end aisle
          ELSIF j < 14 THEN pos := (a_lo + 3 + stall + aisle/2) + k*module; -- keyed off the low site edge
          ELSIF j < 21 THEN pos := (a_hi - 3 - stall - aisle/2) - k*module; -- keyed off the high site edge
          ELSE CONTINUE; END IF;
          CONTINUE WHEN pos - aisle/2 < a_lo OR pos + aisle/2 > a_hi;
          ax_ := 'n'; c0 := pos-aisle/2; c1 := pos+aisle/2;
          IF s = 1 THEN r0 := off0; r1 := n_hi; anchor_ := 'lo'; ELSE r0 := n_lo; r1 := off0; anchor_ := 'hi'; END IF;
        ELSE
          IF j < 4 THEN pos := (CASE WHEN j IN (0,1) THEN 1 ELSE -1 END) * (half_d+2+aisle/2) + (CASE WHEN j IN (0,2) THEN 0 ELSE 1 END) * (CASE WHEN j IN (0,1) THEN 1 ELSE -1 END) * module; -- continuing the flank aisles, then a module out
          ELSIF j = 4 THEN pos := 0;                                                     -- centred single
          ELSIF j < 11 THEN pos := (CASE WHEN j % 2 = 1 THEN 1 ELSE -1 END) * (stall + aisle/2 + ((j-5)/2)*module); -- centred pair, then modules out
          ELSIF j < 18 THEN pos := (n_lo + 3 + stall + aisle/2) + (j-11)*module;        -- keyed off the low site edge
          ELSE pos := (n_hi - 3 - stall - aisle/2) - (j-18)*module; END IF;             -- keyed off the high site edge
          CONTINUE WHEN pos - aisle/2 < n_lo OR pos + aisle/2 > n_hi;
          ax_ := 'a'; c0 := pos-aisle/2; c1 := pos+aisle/2;
          IF s = 3 THEN r0 := off0; r1 := a_hi; anchor_ := 'lo'; ELSE r0 := a_lo; r1 := off0; anchor_ := 'hi'; END IF;
        END IF;
      ELSE
        anchor_ := 'cc';
        -- runs parallel to this side: two rows back to back off the ring row, then every 60 ft
        o := o1 + (j - 26) * module;
        CONTINUE WHEN o + aisle/2 > depth;
        IF s = 1 THEN ax_ := 'a'; r0 := a_lo; r1 := a_hi; c0 := off0 + o - aisle/2; c1 := off0 + o + aisle/2;
        ELSIF s = 2 THEN ax_ := 'a'; r0 := a_lo; r1 := a_hi; c0 := off0 - o - aisle/2; c1 := off0 - o + aisle/2;
        ELSIF s = 3 THEN ax_ := 'n'; r0 := n_lo; r1 := n_hi; c0 := off0 + o - aisle/2; c1 := off0 + o + aisle/2;
        ELSE ax_ := 'n'; r0 := n_lo; r1 := n_hi; c0 := off0 - o - aisle/2; c1 := off0 - o + aisle/2; END IF;
      END IF;
      cand := CASE WHEN ax_ = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, r0,r1,c0,c1) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, c0,c1,r0,r1) END;
      candc := ST_Intersection(cand, site);
      IF candc IS NULL OR ST_IsEmpty(candc) THEN CONTINUE; END IF;
      -- a usable straight run: the largest piece, >= 60 ft
      SELECT d.geom INTO candc FROM (SELECT (ST_Dump(candc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      IF ST_Area(candc) < aisle*60 THEN CONTINUE; END IF;
      IF ST_Area(ST_Intersection(candc, ST_Buffer(CASE WHEN ax_ = 'a' THEN net_a ELSE net_n END, 17))) > 0.3*ST_Area(candc) THEN CONTINUE; END IF; -- on top of an aisle already running this way
      -- the rows run only as far as the run itself
      span := public.fn_axis_span(candc, cx, cy, CASE WHEN ax_ = 'a' THEN dx ELSE nx END, CASE WHEN ax_ = 'a' THEN dy ELSE ny END);
      r0 := GREATEST(r0, span[1]); r1 := LEAST(r1, span[2]);
      cc := ST_GeomFromText('POLYGON EMPTY', 2274);
      IF NOT ST_DWithin(candc, net, 1) THEN
        line := ST_ShortestLine(candc, net);
        IF ST_Length(line) > 70 THEN CONTINUE; END IF;
        -- square: straight where the shortest line already runs on an axis, else an L
        sa0 := abs((ST_X(ST_EndPoint(line))-ST_X(ST_StartPoint(line)))*dx + (ST_Y(ST_EndPoint(line))-ST_Y(ST_StartPoint(line)))*dy) / GREATEST(ST_Length(line), 0.001);
        IF sa0 < 0.97 AND sa0 > 0.24 THEN
          pts := NULL;
          FOR k IN 1..2 LOOP
            ea := (ST_X(ST_StartPoint(line))-cx)*dx+(ST_Y(ST_StartPoint(line))-cy)*dy; en := (ST_X(ST_StartPoint(line))-cx)*nx+(ST_Y(ST_StartPoint(line))-cy)*ny;
            ca := (ST_X(ST_EndPoint(line))-cx)*dx+(ST_Y(ST_EndPoint(line))-cy)*dy; cn := (ST_X(ST_EndPoint(line))-cx)*nx+(ST_Y(ST_EndPoint(line))-cy)*ny;
            IF k = 1 THEN mpt := ST_SetSRID(ST_MakePoint(cx + dx*ca + nx*en, cy + dy*ca + ny*en), 2274);
            ELSE mpt := ST_SetSRID(ST_MakePoint(cx + dx*ea + nx*cn, cy + dy*ea + ny*cn), 2274); END IF;
            hit := ST_RemoveRepeatedPoints(ST_MakeLine(ARRAY[ST_StartPoint(line), mpt, ST_EndPoint(line)]), 1);
            CONTINUE WHEN ST_Intersects(ST_Buffer(hit, 1), clear);
            cc := ST_Difference(ST_Intersection(ST_Buffer(hit, aisle/2, 'endcap=square join=mitre'), site), clear);
            IF cc IS NOT NULL AND NOT ST_IsEmpty(cc) AND ST_Area(cc) >= 0.8*ST_Length(hit)*aisle THEN pts := ARRAY[mpt]; EXIT; END IF;
          END LOOP;
          IF pts IS NULL THEN CONTINUE; END IF;
        ELSE
          cc := ST_Difference(ST_Intersection(ST_Buffer(line, aisle/2, 'endcap=square join=mitre'), site), clear);
          IF cc IS NULL OR ST_IsEmpty(cc) OR ST_Area(cc) < 0.8*ST_Length(line)*aisle THEN CONTINUE; END IF;
        END IF;
      END IF;
      f_geom := f_geom || ST_Union(candc, cc); f_run := f_run || candc; f_cc := f_cc || cc; f_axis := f_axis || ax_; f_anchor := f_anchor || anchor_;
      f_r0 := f_r0 || r0; f_r1 := f_r1 || r1; f_c0 := f_c0 || c0; f_c1 := f_c1 || c1;
      f_d := f_d || ST_Distance(entry, candc);
    END LOOP;
  END LOOP;
  -- a run meets an aisle already there as a T, never a crossing (a crossing
  -- chops the rows on both sides into three-stall scraps): the connector
  -- first, then each field aisle as it is added
  IF best_conn IS NOT NULL AND NOT ST_IsEmpty(best_conn) THEN split_q := split_q || best_conn; split_ax := split_ax || NULL::text; END IF;

  -- 5. Rows: fit every row (ring, connector, selected fields, in that order
  --    so overlaps go to the earlier one) and count; add the field aisle
  --    with the most new stalls per foot from the entry until the rows cover
  --    the need.
  LOOP
    WHILE coalesce(array_length(split_q,1),0) > 0 LOOP
      xa := split_q[1]; xax := split_ax[1];
      split_q := split_q[2:array_length(split_q,1)]; split_ax := split_ax[2:array_length(split_ax,1)];
      FOR r IN 1..coalesce(array_length(f_run,1),0) LOOP
        CONTINUE WHEN f_run[r] IS NULL OR ST_IsEmpty(f_run[r]);
        CONTINUE WHEN xax IS NOT NULL AND xax = f_axis[r];
        xg := ST_Intersection(f_run[r], xa);
        CONTINUE WHEN xg IS NULL OR ST_IsEmpty(xg) OR ST_Area(xg) < 300;
        span := public.fn_axis_span(xg, cx, cy, CASE WHEN f_axis[r] = 'a' THEN dx ELSE nx END, CASE WHEN f_axis[r] = 'a' THEN dy ELSE ny END);
        x0 := span[1]; x1 := span[2];
        -- keep the part beyond the crossing from where the run is anchored; a
        -- free run keeps its longer part
        IF f_anchor[r] = 'lo' THEN keep_lo := false;
        ELSIF f_anchor[r] = 'hi' THEN keep_lo := true;
        ELSE keep_lo := (x0 - f_r0[r]) >= (f_r1[r] - x1); END IF;
        IF keep_lo THEN r0 := f_r0[r]; r1 := x0; ELSE r0 := x1; r1 := f_r1[r]; END IF;
        IF r1 - r0 < 60 THEN f_run[r] := ST_GeomFromText('POLYGON EMPTY', 2274); CONTINUE; END IF;
        cand := CASE WHEN f_axis[r] = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, r0,r1,f_c0[r],f_c1[r]) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, f_c0[r],f_c1[r],r0,r1) END;
        candc := ST_Intersection(cand, site);
        IF candc IS NULL OR ST_IsEmpty(candc) THEN f_run[r] := ST_GeomFromText('POLYGON EMPTY', 2274); CONTINUE; END IF;
        SELECT d.geom INTO candc FROM (SELECT (ST_Dump(candc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
        IF ST_Area(candc) < aisle*60 OR NOT ST_DWithin(candc, xa, 1) THEN f_run[r] := ST_GeomFromText('POLYGON EMPTY', 2274); CONTINUE; END IF;
        span := public.fn_axis_span(candc, cx, cy, CASE WHEN f_axis[r] = 'a' THEN dx ELSE nx END, CASE WHEN f_axis[r] = 'a' THEN dy ELSE ny END);
        f_r0[r] := GREATEST(r0, span[1]); f_r1[r] := LEAST(r1, span[2]);
        f_run[r] := candc; f_geom[r] := candc; f_cc[r] := ST_GeomFromText('POLYGON EMPTY', 2274); f_d[r] := ST_Distance(entry, candc);
        f_anchor[r] := CASE WHEN keep_lo THEN 'hi' ELSE 'lo' END;
      END LOOP;
    END LOOP;
    kept := ST_GeomFromText('POLYGON EMPTY', 2274); est := 0; b_piece := '{}'; b_n := '{}';
    FOR i IN 1..nb LOOP
      piece := public.fn_band_fit(b_rect[i], site, net, no_stall, kept, stall, pitch);
      b_piece := b_piece || piece; new_n := public.fn_band_count(piece, stall, pitch); b_n := b_n || new_n;
      IF piece IS NOT NULL THEN kept := ST_Union(kept, piece); est := est + new_n; END IF;
    END LOOP;
    EXIT WHEN est >= need OR coalesce(array_length(f_geom,1),0) = 0;
    best_i := NULL; best_score := NULL;
    FOR r IN 1..array_length(f_geom,1) LOOP
      CONTINUE WHEN f_run[r] IS NULL OR ST_IsEmpty(f_run[r]);
      CONTINUE WHEN ST_Area(ST_Intersection(f_run[r], ST_Buffer(CASE WHEN f_axis[r] = 'a' THEN net_a ELSE net_n END, 17))) > 0.3*ST_Area(f_run[r]);
      CONTINUE WHEN ST_Area(ST_Intersection(f_run[r], CASE WHEN f_axis[r] = 'a' THEN net_n ELSE net_a END)) > 300; -- would cross an aisle
      new_n := 0;
      FOR j IN 1..2 LOOP
        IF j = 1 THEN c0 := f_c0[r] - stall; c1 := f_c0[r]; ELSE c0 := f_c1[r]; c1 := f_c1[r] + stall; END IF;
        cand := CASE WHEN f_axis[r] = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, f_r0[r],f_r1[r],c0,c1) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, c0,c1,f_r0[r],f_r1[r]) END;
        new_n := new_n + public.fn_band_count(public.fn_band_fit(cand, site, ST_Union(net, f_geom[r]), no_stall, kept, stall, pitch), stall, pitch);
      END LOOP;
      CONTINUE WHEN new_n < 2;
      score := (f_d[r] + 30) / new_n;
      IF best_score IS NULL OR score < best_score THEN best_score := score; best_i := r; END IF;
    END LOOP;
    EXIT WHEN best_i IS NULL;
    net := ST_Union(net, f_geom[best_i]); n_sel := n_sel + 1; n_fields := n_fields + 1;
    IF f_axis[best_i] = 'a' THEN net_a := ST_Union(net_a, f_run[best_i]); ELSE net_n := ST_Union(net_n, f_run[best_i]); END IF;
    IF f_cc[best_i] IS NOT NULL AND NOT ST_IsEmpty(f_cc[best_i]) THEN net_a := ST_Union(net_a, f_cc[best_i]); net_n := ST_Union(net_n, f_cc[best_i]); END IF;
    split_q := split_q || f_run[best_i]; split_ax := split_ax || f_axis[best_i];
    s_geom := s_geom || f_geom[best_i]; s_cc := s_cc || f_cc[best_i]; s_axis := s_axis || f_axis[best_i];
    s_r0 := s_r0 || f_r0[best_i]; s_r1 := s_r1 || f_r1[best_i]; s_c0 := s_c0 || f_c0[best_i]; s_c1 := s_c1 || f_c1[best_i]; s_keep := s_keep || true;
    FOR j IN 1..2 LOOP
      IF j = 1 THEN c0 := f_c0[best_i] - stall; c1 := f_c0[best_i]; ELSE c0 := f_c1[best_i]; c1 := f_c1[best_i] + stall; END IF;
      nb := nb + 1;
      b_rect := b_rect || (CASE WHEN f_axis[best_i] = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, f_r0[best_i],f_r1[best_i],c0,c1) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, c0,c1,f_r0[best_i],f_r1[best_i]) END);
      b_axis := b_axis || f_axis[best_i]; b_r0 := b_r0 || f_r0[best_i]; b_r1 := b_r1 || f_r1[best_i]; b_c0 := b_c0 || c0; b_c1 := b_c1 || c1; b_field := b_field || n_sel;
    END LOOP;
    f_geom := f_geom[1:best_i-1] || f_geom[best_i+1:array_length(f_geom,1)];
    f_run := f_run[1:best_i-1] || f_run[best_i+1:array_length(f_run,1)];
    f_anchor := f_anchor[1:best_i-1] || f_anchor[best_i+1:array_length(f_anchor,1)];
    f_cc := f_cc[1:best_i-1] || f_cc[best_i+1:array_length(f_cc,1)];
    f_axis := f_axis[1:best_i-1] || f_axis[best_i+1:array_length(f_axis,1)];
    f_r0 := f_r0[1:best_i-1] || f_r0[best_i+1:array_length(f_r0,1)];
    f_r1 := f_r1[1:best_i-1] || f_r1[best_i+1:array_length(f_r1,1)];
    f_c0 := f_c0[1:best_i-1] || f_c0[best_i+1:array_length(f_c0,1)];
    f_c1 := f_c1[1:best_i-1] || f_c1[best_i+1:array_length(f_c1,1)];
    f_d := f_d[1:best_i-1] || f_d[best_i+1:array_length(f_d,1)];
  END LOOP;

  -- The rows nearest the entry: the smallest radius from the entry whose
  -- square cut of every row still covers the need; then every row is cut at it.
  total := est;
  IF est > need + 1 THEN
    r_lo := 0; r_hi := 0;
    FOR i IN 1..nb LOOP IF b_piece[i] IS NOT NULL THEN r_hi := GREATEST(r_hi, ST_MaxDistance(entry, b_piece[i])); END IF; END LOOP;
    r_hi := r_hi + 1;
    FOR it IN 1..14 LOOP
      r_mid := (r_lo + r_hi) / 2; cnt := 0;
      FOR i IN 1..nb LOOP
        CONTINUE WHEN b_piece[i] IS NULL;
        e_run := CASE WHEN b_axis[i] = 'a' THEN a_e ELSE n_e END; e_cross := CASE WHEN b_axis[i] = 'a' THEN n_e ELSE a_e END;
        dn := GREATEST(0, b_c0[i] - e_cross, e_cross - b_c1[i]);
        CONTINUE WHEN dn >= r_mid;
        w := sqrt(r_mid*r_mid - dn*dn);
        r0 := GREATEST(b_r0[i], e_run - w); r1 := LEAST(b_r1[i], e_run + w);
        CONTINUE WHEN r1 - r0 < 2*pitch;
        cut := CASE WHEN b_axis[i] = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, r0,r1,b_c0[i],b_c1[i]) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, b_c0[i],b_c1[i],r0,r1) END;
        cnt := cnt + public.fn_band_count(public.fn_band_fit(cut, b_piece[i], NULL, NULL, NULL, stall, pitch), stall, pitch);
      END LOOP;
      IF cnt >= need THEN r_hi := r_mid; ELSE r_lo := r_mid; END IF;
    END LOOP;
    cut_r := r_hi; b_cut := '{}'; b_cn := '{}'; total := 0;
    FOR i IN 1..nb LOOP
      cutp := NULL;
      IF b_piece[i] IS NOT NULL THEN
        e_run := CASE WHEN b_axis[i] = 'a' THEN a_e ELSE n_e END; e_cross := CASE WHEN b_axis[i] = 'a' THEN n_e ELSE a_e END;
        dn := GREATEST(0, b_c0[i] - e_cross, e_cross - b_c1[i]);
        IF dn < cut_r THEN
          w := sqrt(cut_r*cut_r - dn*dn);
          r0 := GREATEST(b_r0[i], e_run - w); r1 := LEAST(b_r1[i], e_run + w);
          IF r1 - r0 >= 2*pitch THEN
            cut := CASE WHEN b_axis[i] = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, r0,r1,b_c0[i],b_c1[i]) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, b_c0[i],b_c1[i],r0,r1) END;
            cutp := public.fn_band_fit(cut, b_piece[i], NULL, NULL, NULL, stall, pitch);
          END IF;
        END IF;
      END IF;
      b_cut := b_cut || cutp; new_n := public.fn_band_count(cutp, stall, pitch); b_cn := b_cn || new_n; total := total + new_n;
    END LOOP;
    b_piece := b_cut; b_n := b_cn;
  END IF;
  kept := ST_GeomFromText('POLYGON EMPTY', 2274);
  FOR i IN 1..nb LOOP IF b_piece[i] IS NOT NULL THEN kept := ST_Union(kept, b_piece[i]); END IF; END LOOP;

  -- 6. Each field aisle runs only as far as the rows it serves, plus where
  --    the network joins it; one serving no row is dropped (put back below
  --    if the network needs it).
  FOR i IN 1..n_sel LOOP
    piece := NULL;
    FOR r IN 1..nb LOOP IF b_field[r] = i AND b_piece[r] IS NOT NULL THEN piece := CASE WHEN piece IS NULL THEN b_piece[r] ELSE ST_Union(piece, b_piece[r]) END; END IF; END LOOP;
    IF piece IS NULL THEN s_keep[i] := false; CONTINUE; END IF;
    span := public.fn_axis_span(piece, cx, cy, CASE WHEN s_axis[i] = 'a' THEN dx ELSE nx END, CASE WHEN s_axis[i] = 'a' THEN dy ELSE ny END);
    r0 := span[1] - 2; r1 := span[2] + 2;
    net_others := ST_GeomFromText('POLYGON EMPTY', 2274);
    FOR s IN 1..4 LOOP IF side_ok[s] THEN net_others := ST_Union(net_others, sides[s]); END IF; END LOOP;
    IF best_conn IS NOT NULL AND NOT ST_IsEmpty(best_conn) THEN net_others := ST_Union(net_others, best_conn); END IF;
    FOR r IN 1..n_sel LOOP IF r <> i THEN net_others := ST_Union(net_others, s_geom[r]); END IF; END LOOP;
    IF s_cc[i] IS NOT NULL AND NOT ST_IsEmpty(s_cc[i]) THEN net_others := ST_Union(net_others, s_cc[i]); END IF;
    touch := ST_Intersection(ST_Buffer(s_geom[i], 0.5), net_others);
    IF touch IS NOT NULL AND NOT ST_IsEmpty(touch) THEN
      tspan := public.fn_axis_span(touch, cx, cy, CASE WHEN s_axis[i] = 'a' THEN dx ELSE nx END, CASE WHEN s_axis[i] = 'a' THEN dy ELSE ny END);
      r0 := LEAST(r0, tspan[1]); r1 := GREATEST(r1, tspan[2]);
    END IF;
    r0 := GREATEST(r0, s_r0[i] - aisle); r1 := LEAST(r1, s_r1[i] + aisle);
    cand := CASE WHEN s_axis[i] = 'a' THEN public.fn_axis_rect(cx,cy,dx,dy,nx,ny, r0,r1,s_c0[i],s_c1[i]) ELSE public.fn_axis_rect(cx,cy,dx,dy,nx,ny, s_c0[i],s_c1[i],r0,r1) END;
    candc := ST_Intersection(cand, site);
    IF candc IS NOT NULL AND NOT ST_IsEmpty(candc) THEN
      SELECT d.geom INTO candc FROM (SELECT (ST_Dump(candc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      s_geom[i] := CASE WHEN s_cc[i] IS NOT NULL AND NOT ST_IsEmpty(s_cc[i]) THEN ST_Union(candc, s_cc[i]) ELSE candc END;
    END IF;
  END LOOP;

  -- A ring side earns its pavement by carrying stalls or being the way in;
  -- the others go, one at a time, unless removing one breaks the network.
  IF NOT ST_IsEmpty(kept) THEN
    FOR s IN 1..4 LOOP
      CONTINUE WHEN NOT side_ok[s];
      CONTINUE WHEN ST_DWithin(sides[s], kept, 1);
      CONTINUE WHEN best_conn IS NOT NULL AND NOT ST_IsEmpty(best_conn) AND ST_Area(ST_Intersection(sides[s], ST_Buffer(best_conn, 1))) > 100;
      test_net := ST_GeomFromText('POLYGON EMPTY', 2274);
      FOR r IN 1..4 LOOP IF side_ok[r] AND r <> s THEN test_net := ST_Union(test_net, sides[r]); END IF; END LOOP;
      IF best_conn IS NOT NULL AND NOT ST_IsEmpty(best_conn) THEN test_net := ST_Union(test_net, best_conn); END IF;
      FOR r IN 1..n_sel LOOP IF s_keep[r] THEN test_net := ST_Union(test_net, s_geom[r]); END IF; END LOOP;
      IF ST_NumGeometries(ST_UnaryUnion(ST_Buffer(test_net, 0.5))) <= 1 THEN
        side_ok[s] := false; dropped := dropped + 1;
      END IF;
    END LOOP;
  END IF;
  net := ST_GeomFromText('POLYGON EMPTY', 2274);
  FOR s IN 1..4 LOOP IF side_ok[s] THEN net := ST_Union(net, sides[s]); END IF; END LOOP;
  IF best_conn IS NOT NULL AND NOT ST_IsEmpty(best_conn) THEN net := ST_Union(net, best_conn); END IF;
  FOR r IN 1..n_sel LOOP IF s_keep[r] THEN net := ST_Union(net, s_geom[r]); n_kept_fields := n_kept_fields + 1; END IF; END LOOP;
  -- a field aisle whose rows were not kept may still be the link to one
  -- whose were: put pieces back, aisles first then sides, until the
  -- network is one piece
  FOR k IN 1..8 LOOP
    EXIT WHEN ST_NumGeometries(ST_UnaryUnion(ST_Buffer(net, 0.5))) <= 1;
    best_i := NULL;
    FOR r IN 1..n_sel LOOP
      IF NOT s_keep[r] AND ST_DWithin(s_geom[r], net, 1)
         AND ST_Area(ST_Intersection(s_geom[r], ST_Buffer(net, 1))) < 0.5*ST_Area(s_geom[r]) THEN best_i := r; EXIT; END IF;
    END LOOP;
    IF best_i IS NOT NULL THEN s_keep[best_i] := true; net := ST_Union(net, s_geom[best_i]); n_kept_fields := n_kept_fields + 1; CONTINUE; END IF;
    FOR s IN 1..4 LOOP
      IF NOT side_ok[s] AND NOT ST_IsEmpty(sides[s]) AND ST_DWithin(sides[s], net, 1) THEN
        side_ok[s] := true; dropped := dropped - 1; net := ST_Union(net, sides[s]); best_i := s; EXIT; END IF;
    END LOOP;
    EXIT WHEN best_i IS NULL;
  END LOOP;

  -- rows out, one bay per piece
  FOR i IN 1..nb LOOP
    CONTINUE WHEN b_piece[i] IS NULL;
    FOR e IN SELECT d.geom FROM (SELECT (ST_Dump(b_piece[i])).geom) d LOOP
      new_n := public.fn_band_count(e.geom, stall, pitch);
      CONTINUE WHEN new_n < 2;
      keep_bays := keep_bays || jsonb_build_object('geom_2274', ST_AsGeoJSON(e.geom)::jsonb, 'area_sqft', round(ST_Area(e.geom)), 'stalls', new_n, 'rows', 1,
        'along', CASE WHEN b_field[i] = 0 THEN 'ring' ELSE 'field' END);
    END LOOP;
  END LOOP;

  drives := '[]'::jsonb; pi_ := 0;
  FOR piece IN SELECT d.geom FROM (SELECT (ST_Dump(net)).geom) d ORDER BY ST_Area(d.geom) DESC LOOP
    CONTINUE WHEN ST_Area(piece) < 200;
    pi_ := pi_ + 1;
    drives := drives || (jsonb_build_object('kind','access','geom_2274',ST_AsGeoJSON(piece)::jsonb,
      'area_sqft',round(ST_Area(piece)),'lane_ft',aisle)
      || CASE WHEN pi_ = 1 THEN jsonb_build_object('entry_2274', ST_AsGeoJSON(entry)::jsonb, 'spine_2274', sk#>'{skeleton,spine_2274}') ELSE '{}'::jsonb END);
  END LOOP;

  RETURN sk || jsonb_build_object('parking_seed', jsonb_build_object(
    'stalls_target', need, 'stalls_target_at_max', need_max, 'stalls_target_placed', need_placed,
    'stalls_achieved_est', total, 'coverage_of_target_pct', round(100.0*total/GREATEST(need,1)),
    'strategy', 'aisle_first', 'bays', keep_bays,
    'basis', 'aisle-first (2026-09-09): ring lanes where they fit beside the building, a square connector from the entry, field aisles by stalls gained per foot from the entry, one 18-ft row beside each side of every aisle, none in the front yard, cut square to the need nearest the entry, aisles cut back to their rows',
    'debug', jsonb_build_object('sides_ok', to_jsonb(side_ok), 'sides_dropped', dropped, 'fields_added', n_fields, 'fields_kept', n_kept_fields,
      'access', access_note, 'connector', best_kind, 'cut_radius_ft', round(cut_r::numeric),
      'stalls_available_est', est, 'frame', jsonb_build_object('slen', round(slen::numeric), 'depth', round((2*half_d)::numeric),
      'a_lo', round(a_lo::numeric), 'a_hi', round(a_hi::numeric), 'n_lo', round(n_lo::numeric), 'n_hi', round(n_hi::numeric)))))
    || CASE WHEN jsonb_array_length(drives) = 0 THEN '{}'::jsonb ELSE jsonb_build_object('drives', drives) END;
END $function$;
