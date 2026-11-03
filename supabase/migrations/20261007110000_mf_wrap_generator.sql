-- 2026-10-07 · The wrap generator: units round a garage, a court on the deck.
--
-- fn_generate_wrap_site_plan draws the organization of The Caroline (101
-- Cool Springs Blvd, Franklin: Kimley-Horn / 906 Studio, 2024 — see
-- 20261007100000_mf_wrap_exemplar_and_pattern.sql) from a parcel's own shape,
-- in the frontage frame (a along the primary frontage, n inward):
--
--  1. The L of drives. A 26-ft access drive down one side of the lot from the
--     curb to the rear and a 26-ft drive across the rear, 3 ft inside the
--     lines — the fire lane (every wall within 150 ft of a lane or the street)
--     and the way to the garage. A row of 8 × 22 visitor stalls lies between
--     the side drive and the line where the block can spare the width. The
--     side is whichever leaves the bigger block.
--  2. The block. The largest rectangle, square to the frontage, inside the
--     setback envelope less the drives (and a 2-ft clear), found by a grid
--     search with the front edge at the front setback where it fits.
--  3. The ring. Four double-loaded bars at the unit program's bar depth
--     (~67 ft) round the block; the court inside must clear the site
--     standards' minimum court width or the parcel is refused for a wrap
--     (the dispatcher then falls through to the seed / search core).
--  4. The garage. Under the court and the three bars away from the street,
--     the block less the frontage bar (liner units, leasing and any retail
--     face the street at the garage levels), at ~370 sf per stall per level.
--     Levels: as many as the stalls need (1–3), the rest of the stories to the
--     district's limit are residential. Units = GSF × 0.88 / the frontier's
--     average unit GSF, capped by the district's density; stalls at the
--     typology's ratio for that unit size; a plan short of its need is
--     parking-limited exactly as the seed is.
--  5. The court. Pool and deck on the street side of the court beside the
--     entry drive; the rest open space.
--  6. The garage entries: off the side drive near the rear corner and off the
--     rear drive — never from the frontage.
--
-- The payload is the seed family (geom_2274 everywhere, parking as one
-- object): buildings[] are the four bars (stories = garage + residential,
-- the frontage bar carrying liner units at the garage levels),
-- parking.garage is the structure, parking.bays the visitor row, drives[]
-- the L, greens[] the court, amenity[] the pool deck; metrics and plan_basis
-- as the dispatcher writes them. generator_version 'wrap_v1'.

-- The largest rectangle square to a frame inside a region: a grid search
-- over the a-range at `p_step`, the front edge at the low n (or 10 / 20 ft
-- back), the depth by bisection. Returns [a0, a1, n0, n1] or NULL.
CREATE OR REPLACE FUNCTION public.fn_frame_inscribed_rect(p_region geometry, ox double precision, oy double precision, dx double precision, dy double precision, nx double precision, ny double precision,
  p_a_lo double precision, p_a_hi double precision, p_n_lo double precision, p_n_hi double precision, p_min_w double precision, p_min_d double precision, p_step double precision DEFAULT 10)
RETURNS double precision[]
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  reg geometry; a0 double precision; a1 double precision; n0 double precision; n1 double precision; lo double precision; hi double precision; mid double precision;
  best double precision[] := NULL; best_area double precision := 0; k int; it int; ok boolean;
BEGIN
  IF p_region IS NULL OR ST_IsEmpty(p_region) THEN RETURN NULL; END IF;
  reg := ST_Buffer(p_region, 0.3, 'join=mitre');
  a0 := p_a_lo;
  WHILE a0 + p_min_w <= p_a_hi LOOP
    a1 := p_a_hi;
    WHILE a1 - a0 >= p_min_w LOOP
      EXIT WHEN (a1 - a0) * (p_n_hi - p_n_lo) <= best_area; -- no narrower rectangle on this a0 can win
      FOR k IN 0..2 LOOP
        n0 := p_n_lo + k * 10;
        CONTINUE WHEN n0 + p_min_d > p_n_hi;
        CONTINUE WHEN NOT ST_Covers(reg, public.fn_axis_rect(ox,oy,dx,dy,nx,ny, a0, a1, n0, n0 + p_min_d));
        lo := n0 + p_min_d; hi := p_n_hi;
        IF ST_Covers(reg, public.fn_axis_rect(ox,oy,dx,dy,nx,ny, a0, a1, n0, hi)) THEN n1 := hi;
        ELSE
          FOR it IN 1..9 LOOP
            mid := (lo + hi) / 2;
            IF ST_Covers(reg, public.fn_axis_rect(ox,oy,dx,dy,nx,ny, a0, a1, n0, mid)) THEN lo := mid; ELSE hi := mid; END IF;
          END LOOP;
          n1 := lo;
        END IF;
        IF (a1 - a0) * (n1 - n0) > best_area THEN best_area := (a1 - a0) * (n1 - n0); best := ARRAY[a0, a1, n0, n1]; END IF;
        EXIT; -- the first front position that fits is the one nearest the street
      END LOOP;
      a1 := a1 - p_step;
    END LOOP;
    a0 := a0 + p_step;
  END LOOP;
  RETURN best;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_generate_wrap_site_plan(p_ogc_fid integer, p_typology text DEFAULT 'multifamily', p_seed integer DEFAULT 1, p_context_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  g geometry; env geometry; envj jsonb; ctx jsonb; std jsonb; up jsonb; mb jsonb; fr jsonb; pat jsonb;
  v_front numeric; v_side numeric; v_rear numeric; lane numeric; court_min numeric; bar_d numeric; gap numeric := 2;
  fline geometry; landlocked boolean := true; az double precision; ox double precision; oy double precision;
  dx double precision; dy double precision; nx double precision; ny double precision; cen geometry;
  span double precision[]; a_lo double precision; a_hi double precision; n_lo double precision; n_hi double precision;
  pa_lo double precision; pa_hi double precision; pn_lo double precision; pn_hi double precision;
  obb geometry; ring geometry; p geometry[]; L12 double precision; L23 double precision;
  az_c double precision[]; fi int; d1 double precision; d2 double precision; best_az double precision; score double precision; best_score double precision := 0;
  bnd geometry; left_line geometry; right_line geometry; rear_line geometry; side_line geometry; excl geometry;
  s int; side_sign int := 1; best_side int := 0; best_rect double precision[]; best_stalls boolean := false; rect double precision[];
  variant int; best_variant int := 1; other_drive geometry; max_block_len numeric := 520; sa_lo double precision; sa_hi double precision; fseg geometry; cline geometry; hitpts geometry;
  try_stalls boolean; sd_a0 double precision; sd_a1 double precision; st_a0 double precision; st_a1 double precision;
  side_drive geometry; rear_drive geometry; region geometry; inset geometry;
  blk_a0 double precision; blk_a1 double precision; blk_n0 double precision; blk_n1 double precision; blk_w double precision; blk_d double precision;
  block geometry; court geometry; court_w double precision; court_d double precision; court_area double precision; block_area double precision; ring_area double precision;
  bar_front geometry; bar_rear geometry; bar_left geometry; bar_right geometry; front_area double precision;
  garage geometry; garage_area double precision; sf_per_stall numeric := 370; stalls_per_level int;
  stories_max numeric; total_stories int; garage_levels int := 2; res_levels int; unit_gsf numeric; pkr numeric; max_gsf numeric;
  gsf numeric; units int; stalls_req int; stalls_ext int := 0; stalls_prov int; du_ac numeric; acres numeric; it int; parking_limited boolean := false;
  needed_levels int; cap numeric; mix jsonb; basis text; flags jsonb := '[]'::jsonb;
  bays jsonb := '[]'::jsonb; stall_rect geometry; n_stall int; i int; stall_len numeric := 22; stall_w numeric := 8;
  pool geometry; green geometry; entry_pt geometry; garage_entry geometry; garage_entry_rear geometry; drives jsonb := '[]'::jsonb;
  blds jsonb := '[]'::jsonb; bar geometry; bar_name text; bar_gsf numeric; bar_id int := 0;
  coverage numeric; far numeric; pct_placed numeric;
BEGIN
  SELECT (ST_Dump(geom_2274)).geom INTO g FROM public.parcels WHERE ogc_fid = p_ogc_fid ORDER BY ST_Area((ST_Dump(geom_2274)).geom) DESC LIMIT 1;
  IF g IS NULL THEN RETURN jsonb_build_object('error','parcel not found','parcel_ogc_fid',p_ogc_fid); END IF;
  acres := ST_Area(g) / 43560.0;
  ctx := public.fn_resolve_design_context(p_ogc_fid, p_typology);
  IF ctx ? 'error' THEN RETURN jsonb_build_object('error','context_unavailable','parcel_ogc_fid',p_ogc_fid,'detail',ctx->'error'); END IF;
  std := public.fn_site_standards(p_typology);
  up := public.fn_unit_program(p_typology);
  mb := public.fn_max_buildout(p_ogc_fid, p_typology);
  IF mb ? 'error' THEN RETURN jsonb_build_object('error','frontier_unavailable','parcel_ogc_fid',p_ogc_fid); END IF;
  pat := public.fn_plan_pattern(p_ogc_fid, p_typology);
  v_front := coalesce((ctx#>>'{setbacks,front,value}')::numeric, 20);
  v_side := coalesce((ctx#>>'{setbacks,side,value}')::numeric, 5);
  v_rear := coalesce((ctx#>>'{setbacks,rear,value}')::numeric, 20);
  lane := coalesce((std#>>'{fire_access,lane_width_ft}')::numeric, 26);
  court_min := coalesce((std#>>'{court,min_width_ft}')::numeric, 40);
  bar_d := coalesce((up->>'implied_bar_depth_ft')::numeric, 67.3);
  du_ac := nullif(ctx#>>'{density_max_du_acre,value}','')::numeric;
  stories_max := coalesce(nullif(ctx#>>'{max_height_stories,value}','')::numeric,
                          CASE WHEN jsonb_typeof(ctx->'max_height_stories') = 'number' THEN (ctx->>'max_height_stories')::numeric END,
                          nullif(ctx#>>'{height_max_ft,value}','')::numeric / 11.0, 5);
  total_stories := LEAST(8, GREATEST(3, floor(stories_max)))::int;
  unit_gsf := coalesce((mb#>>'{program_frontier,gsf_max_option,unit_gsf}')::numeric, 1200);
  pkr := coalesce(public.fn_parking_ratio_for_unit_gsf(p_typology, unit_gsf), 1.5);
  max_gsf := (mb->>'max_gsf')::numeric;

  envj := public.fn_directional_envelope(p_ogc_fid, v_front, v_side, v_rear);
  BEGIN env := ST_SetSRID(ST_GeomFromGeoJSON((envj->'geom_2274')::text), 2274); EXCEPTION WHEN others THEN env := NULL; END;
  IF env IS NULL OR ST_IsEmpty(env) THEN RETURN jsonb_build_object('error','envelope_unavailable','parcel_ogc_fid',p_ogc_fid); END IF;
  env := (SELECT d.geom FROM ST_Dump(env) AS d ORDER BY ST_Area(d.geom) DESC LIMIT 1);

  -- 0. The frame: a along the primary frontage, n inward; a landlocked lot uses its long axis.
  fr := public.fn_parcel_frontage(p_ogc_fid);
  landlocked := coalesce((fr->>'landlocked')::boolean, true);
  IF NOT landlocked THEN
    BEGIN
      fline := ST_LineMerge(ST_SetSRID(ST_GeomFromGeoJSON((fr#>'{primary,geom_2274}')::text), 2274));
      IF ST_GeometryType(fline) <> 'ST_LineString' THEN
        SELECT d.geom INTO fline FROM (SELECT (ST_Dump(fline)).geom) d ORDER BY ST_Length(d.geom) DESC LIMIT 1;
      END IF;
      -- the frame follows the longest straight run of the frontage: a corner lot's merged frontage bends, and its chord is no street
      SELECT d.geom INTO fseg FROM (SELECT (ST_DumpSegments(ST_Simplify(fline, 2))).geom) d ORDER BY ST_Length(d.geom) DESC LIMIT 1;
      IF fseg IS NULL THEN fseg := fline; END IF;
      az := ST_Azimuth(ST_StartPoint(fseg), ST_EndPoint(fseg));
      ox := ST_X(ST_LineInterpolatePoint(fseg, 0.5)); oy := ST_Y(ST_LineInterpolatePoint(fseg, 0.5));
    EXCEPTION WHEN others THEN landlocked := true; END;
  END IF;
  IF landlocked THEN
    obb := ST_OrientedEnvelope(env); ring := ST_ExteriorRing(obb);
    p := ARRAY[ST_PointN(ring,1), ST_PointN(ring,2), ST_PointN(ring,3)];
    L12 := ST_Distance(p[1],p[2]); L23 := ST_Distance(p[2],p[3]);
    IF L12 >= L23 THEN az := ST_Azimuth(p[1],p[2]); ELSE az := ST_Azimuth(p[2],p[3]); END IF;
    ox := ST_X(ST_Centroid(env)); oy := ST_Y(ST_Centroid(env));
  END IF;
  -- Two frames when the lot is skewed: the street's, and the lot's own axis when it sits more than 8° off the street — a
  -- parallelogram lot wants its block square to its lot lines, with the drive meeting the curb at the lot's angle.
  az_c := ARRAY[az];
  IF NOT landlocked THEN
    obb := ST_OrientedEnvelope(env); ring := ST_ExteriorRing(obb);
    p := ARRAY[ST_PointN(ring,1), ST_PointN(ring,2), ST_PointN(ring,3)];
    d1 := ST_Azimuth(p[1],p[2]) - az; d1 := abs(d1 - pi()*round(d1/pi()));
    d2 := ST_Azimuth(p[2],p[3]) - az; d2 := abs(d2 - pi()*round(d2/pi()));
    IF LEAST(d1, d2) > radians(8) THEN az_c := az_c || (CASE WHEN d1 <= d2 THEN ST_Azimuth(p[1],p[2]) ELSE ST_Azimuth(p[2],p[3]) END); END IF;
  END IF;
  cen := ST_Centroid(g);
  inset := ST_Buffer(g, -3, 'join=mitre');
  -- the lot lines less the primary frontage's straight run: a block lot with streets all round keeps its side and rear edges
  bnd := CASE WHEN landlocked OR fseg IS NULL THEN ST_ExteriorRing(g) ELSE ST_Difference(ST_ExteriorRing(g), ST_Buffer(fseg, 2)) END;

  FOR fi IN 1..array_length(az_c, 1) LOOP
    az := az_c[fi];
    dx := sin(az); dy := cos(az); nx := sin(az + pi()/2); ny := cos(az + pi()/2);
    IF (ST_X(cen)-ox)*nx + (ST_Y(cen)-oy)*ny < 0 THEN nx := -nx; ny := -ny; END IF; -- n points into the lot
    span := public.fn_axis_span(env, ox, oy, dx, dy); a_lo := span[1]; a_hi := span[2];
    span := public.fn_axis_span(env, ox, oy, nx, ny); n_lo := span[1]; n_hi := span[2];
    span := public.fn_axis_span(g, ox, oy, dx, dy); pa_lo := span[1]; pa_hi := span[2];
    span := public.fn_axis_span(g, ox, oy, nx, ny); pn_lo := span[1]; pn_hi := span[2];

    -- The lot lines, read in the frame: a segment that runs with n is a side line (left or right by where it sits), one that
    -- runs with a in the back 40% of the lot is the rear line. The drives are reserved along these lines, so a slanted or bent
    -- lot line gets a block that clears a full lane beside it everywhere — not a lane that thins to a sliver.
    SELECT ST_Collect(q.geom) FILTER (WHERE q.cls = 'left'), ST_Collect(q.geom) FILTER (WHERE q.cls = 'right'), ST_Collect(q.geom) FILTER (WHERE q.cls = 'rear')
      INTO left_line, right_line, rear_line
    FROM (
      SELECT d.geom,
        CASE WHEN abs(d.ea*dx + d.en*dy) >= abs(d.ea*nx + d.en*ny)
             THEN CASE WHEN ((d.cx-ox)*nx + (d.cy-oy)*ny - pn_lo) / GREATEST(pn_hi - pn_lo, 1) > 0.6 THEN 'rear' ELSE 'front' END
             ELSE CASE WHEN ((d.cx-ox)*dx + (d.cy-oy)*dy - pa_lo) / GREATEST(pa_hi - pa_lo, 1) > 0.6 THEN 'right'
                       WHEN ((d.cx-ox)*dx + (d.cy-oy)*dy - pa_lo) / GREATEST(pa_hi - pa_lo, 1) < 0.4 THEN 'left' ELSE 'mid' END END AS cls
      FROM (
        SELECT sg.geom, ST_X(ST_EndPoint(sg.geom)) - ST_X(ST_StartPoint(sg.geom)) AS ea, ST_Y(ST_EndPoint(sg.geom)) - ST_Y(ST_StartPoint(sg.geom)) AS en,
               ST_X(ST_Centroid(sg.geom)) AS cx, ST_Y(ST_Centroid(sg.geom)) AS cy
        FROM (SELECT (ST_DumpSegments(ST_Simplify(bnd, 1))).geom) sg
        WHERE ST_Length(sg.geom) > 1
      ) d
    ) q;

    -- 1. The L of drives, on whichever side leaves the bigger ring; visitor stalls where the block can spare 8 ft.
    -- variants: 1 = side + rear drives (the fire lane round two sides, the Caroline); 2 = drives down both sides, no rear (a shallow lot);
    -- 3 = one side drive, allowed only when the block is shallow enough for its rear wall to stay within 150 ft of the street
    FOR s IN 1..12 LOOP
      variant := ((s - 1) / 4) + 1;
      side_sign := CASE WHEN ((s - 1) % 4) IN (0,1) THEN 1 ELSE -1 END; try_stalls := (((s - 1) % 4) IN (0,2));
      side_line := CASE WHEN side_sign = 1 THEN right_line ELSE left_line END;
      CONTINUE WHEN side_line IS NULL OR ST_IsEmpty(side_line);
      CONTINUE WHEN variant = 1 AND (rear_line IS NULL OR ST_IsEmpty(rear_line));
      CONTINUE WHEN variant = 2 AND (left_line IS NULL OR right_line IS NULL);
      -- the land the drives take: a lane 3 ft in from the lot line, the visitor strip beyond the lane on the entry side
      excl := ST_Buffer(side_line, lane + 3 + gap + CASE WHEN try_stalls THEN stall_w ELSE 0 END);
      IF variant = 1 THEN excl := ST_Union(excl, ST_Buffer(rear_line, lane + 3 + gap)); END IF;
      IF variant = 2 THEN excl := ST_Union(excl, ST_Buffer(CASE WHEN side_sign = 1 THEN left_line ELSE right_line END, lane + 3 + gap)); END IF;
      region := ST_Difference(env, excl);
      SELECT d.geom INTO region FROM (SELECT (ST_Dump(region)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      CONTINUE WHEN region IS NULL OR ST_IsEmpty(region);
      -- the block runs no further than max_block_len from the entry drive
      sa_lo := CASE WHEN side_sign = 1 THEN GREATEST(a_lo, a_hi - max_block_len) ELSE a_lo END;
      sa_hi := CASE WHEN side_sign = 1 THEN a_hi ELSE LEAST(a_hi, a_lo + max_block_len) END;
      -- a 70-ft court between the bars where the lot allows it, the standard's minimum where it does not
      rect := public.fn_frame_inscribed_rect(region, ox,oy,dx,dy,nx,ny, sa_lo, sa_hi, n_lo, n_hi, 2*bar_d + 70, 2*bar_d + 70, 10);
      IF rect IS NULL THEN rect := public.fn_frame_inscribed_rect(region, ox,oy,dx,dy,nx,ny, sa_lo, sa_hi, n_lo, n_hi, 2*bar_d + court_min, 2*bar_d + court_min, 10); END IF;
      CONTINUE WHEN rect IS NULL;
      -- a block that needs the stall strip's 8 ft to clear two bars and a 70-ft court keeps the land; otherwise the stalls stay
      IF try_stalls AND (rect[2]-rect[1]) < 2*bar_d + 70 THEN CONTINUE; END IF;
      -- a lone side drive serves only a block whose rear wall is within 150 ft of the street
      IF variant = 3 AND rect[4] - pn_lo > 150 THEN CONTINUE; END IF;
      -- the ring is what gets built: block less court. A later variant must beat the earlier one by a quarter to give up a drive.
      score := (rect[2]-rect[1]) * (rect[4]-rect[3]) - GREATEST(0, rect[2]-rect[1] - 2*bar_d) * GREATEST(0, rect[4]-rect[3] - 2*bar_d);
      IF score > best_score * (CASE WHEN variant > best_variant THEN 1.25 ELSE 1 END) THEN
        best_score := score; best_rect := rect; best_side := side_sign; best_stalls := try_stalls; best_variant := variant; best_az := az;
      END IF;
    END LOOP;
  END LOOP;
  IF best_rect IS NULL THEN
    RETURN jsonb_build_object('error','wrap_block_too_small','parcel_ogc_fid',p_ogc_fid,
      'detail', format('no block of %s × %s ft square to the frontage fits inside the setbacks beside a 26-ft drive', round(2*bar_d + court_min), round(2*bar_d + court_min)));
  END IF;
  -- the winning frame
  az := best_az;
  dx := sin(az); dy := cos(az); nx := sin(az + pi()/2); ny := cos(az + pi()/2);
  IF (ST_X(cen)-ox)*nx + (ST_Y(cen)-oy)*ny < 0 THEN nx := -nx; ny := -ny; END IF;
  span := public.fn_axis_span(env, ox, oy, dx, dy); a_lo := span[1]; a_hi := span[2];
  span := public.fn_axis_span(env, ox, oy, nx, ny); n_lo := span[1]; n_hi := span[2];
  span := public.fn_axis_span(g, ox, oy, dx, dy); pa_lo := span[1]; pa_hi := span[2];
  span := public.fn_axis_span(g, ox, oy, nx, ny); pn_lo := span[1]; pn_hi := span[2];
  side_sign := best_side;
  blk_a0 := best_rect[1]; blk_a1 := best_rect[2]; blk_n0 := best_rect[3]; blk_n1 := best_rect[4];
  blk_w := blk_a1 - blk_a0; blk_d := blk_n1 - blk_n0;
  -- the drives hug the block (the lot-line reservation guarantees they fit): the side drive from the curb to just past the block's
  -- rear, the rear drive along the rear wall out to the side drive's edge (the L meets, never overlaps); the visitor strip lies
  -- outside the side drive
  IF side_sign = 1 THEN
    sd_a0 := blk_a1 + gap; sd_a1 := sd_a0 + lane; st_a0 := sd_a1; st_a1 := st_a0 + (CASE WHEN best_stalls THEN stall_w ELSE 0 END);
  ELSE
    sd_a1 := blk_a0 - gap; sd_a0 := sd_a1 - lane; st_a1 := sd_a0; st_a0 := st_a1 - (CASE WHEN best_stalls THEN stall_w ELSE 0 END);
  END IF;
  side_drive := ST_Intersection(public.fn_axis_rect(ox,oy,dx,dy,nx,ny, sd_a0, sd_a1, pn_lo, LEAST(pn_hi - 3, blk_n1 + gap + lane)), inset);
  rear_drive := CASE WHEN best_variant = 1 THEN ST_Intersection(public.fn_axis_rect(ox,oy,dx,dy,nx,ny,
      CASE WHEN side_sign = 1 THEN blk_a0 - gap - lane ELSE sd_a1 END, CASE WHEN side_sign = 1 THEN sd_a0 ELSE blk_a1 + gap + lane END,
      blk_n1 + gap, blk_n1 + gap + lane), inset) ELSE ST_GeomFromText('POLYGON EMPTY', 2274) END;
  other_drive := CASE WHEN best_variant = 2 THEN ST_Intersection(public.fn_axis_rect(ox,oy,dx,dy,nx,ny,
      CASE WHEN side_sign = 1 THEN blk_a0 - gap - lane ELSE blk_a1 + gap END, CASE WHEN side_sign = 1 THEN blk_a0 - gap ELSE blk_a1 + gap + lane END,
      pn_lo, LEAST(pn_hi - 3, blk_n1 + gap + lane)), inset) ELSE ST_GeomFromText('POLYGON EMPTY', 2274) END;
  -- each drive is one piece: the inset can shave a corner off into a crumb
  SELECT d.geom INTO side_drive FROM (SELECT (ST_Dump(side_drive)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
  SELECT d.geom INTO rear_drive FROM (SELECT (ST_Dump(rear_drive)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
  SELECT d.geom INTO other_drive FROM (SELECT (ST_Dump(other_drive)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;

  -- 2–3. The block, the ring, the court
  block := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, blk_a0, blk_a1, blk_n0, blk_n1);
  court := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, blk_a0 + bar_d, blk_a1 - bar_d, blk_n0 + bar_d, blk_n1 - bar_d);
  court_w := blk_w - 2*bar_d; court_d := blk_d - 2*bar_d;
  IF court_w < 70 OR court_d < 70 THEN flags := flags || jsonb_build_array(format('court_%s_x_%s_ft_under_70', round(court_w), round(court_d))); END IF;
  block_area := ST_Area(block); court_area := ST_Area(court); ring_area := block_area - court_area;
  bar_front := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, blk_a0, blk_a1, blk_n0, blk_n0 + bar_d);
  bar_rear  := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, blk_a0, blk_a1, blk_n1 - bar_d, blk_n1);
  bar_left  := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, blk_a0, blk_a0 + bar_d, blk_n0 + bar_d, blk_n1 - bar_d);
  bar_right := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, blk_a1 - bar_d, blk_a1, blk_n0 + bar_d, blk_n1 - bar_d);
  front_area := ST_Area(bar_front);

  -- 4. The garage under everything but the frontage bar; levels to the need
  garage := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, blk_a0, blk_a1, blk_n0 + bar_d, blk_n1);
  garage_area := ST_Area(garage);
  stalls_per_level := floor(garage_area / sf_per_stall)::int;
  -- visitor stalls along the side drive, outside it, parallel, the length of the block
  IF best_stalls THEN
    n_stall := LEAST(20, GREATEST(0, floor((blk_n1 - blk_n0) / stall_len)))::int;
    IF n_stall >= 2 THEN
      stall_rect := ST_Intersection(public.fn_axis_rect(ox,oy,dx,dy,nx,ny, st_a0, st_a1, blk_n0, blk_n0 + n_stall*stall_len), inset);
      IF NOT ST_IsEmpty(stall_rect) THEN
        stalls_ext := n_stall;
        bays := bays || jsonb_build_object('geom_2274', ST_AsGeoJSON(stall_rect)::jsonb, 'area_sqft', round(ST_Area(stall_rect)), 'stalls', n_stall, 'rows', 1, 'along', 'drive', 'parallel', true);
      END IF;
    END IF;
  END IF;
  garage_levels := 1; res_levels := total_stories - garage_levels;
  FOR it IN 1..4 LOOP
    res_levels := GREATEST(2, total_stories - garage_levels);
    gsf := ring_area * res_levels + front_area * garage_levels;
    units := floor(gsf * 0.88 / unit_gsf)::int;
    IF du_ac IS NOT NULL AND du_ac > 0 AND units > floor(du_ac * acres) THEN
      units := floor(du_ac * acres)::int;
      res_levels := GREATEST(2, LEAST(res_levels, ceil((units * unit_gsf / 0.88 - front_area * garage_levels) / ring_area)::int));
      gsf := ring_area * res_levels + front_area * garage_levels;
      units := LEAST(units, floor(gsf * 0.88 / unit_gsf)::int);
      flags := flags || jsonb_build_array(format('units_capped_by_density_%s_du_ac', du_ac));
    END IF;
    stalls_req := ceil(units * pkr)::int;
    needed_levels := GREATEST(1, ceil((stalls_req - stalls_ext)::numeric / GREATEST(stalls_per_level, 1)))::int;
    EXIT WHEN needed_levels <= garage_levels OR garage_levels >= 3 OR total_stories - garage_levels - 1 < 2;
    garage_levels := garage_levels + 1;
  END LOOP;
  stalls_prov := garage_levels * stalls_per_level + stalls_ext;
  IF stalls_prov > ceil(stalls_req * 1.05) AND garage_levels > 1 THEN
    -- the top level is partial: the garage is built to the need, not to the deck
    flags := flags || jsonb_build_array(format('garage_top_level_partial_%s_of_%s_stalls', ceil(stalls_req * 1.05) - (garage_levels - 1) * stalls_per_level - stalls_ext, stalls_per_level));
    stalls_prov := ceil(stalls_req * 1.05)::int;
  END IF;
  IF stalls_prov < stalls_req THEN
    parking_limited := true;
    units := LEAST(units, floor(stalls_prov / pkr)::int);
    stalls_req := ceil(units * pkr)::int;
    flags := flags || jsonb_build_array('parking_limited_garage_levels_capped_at_3');
  END IF;
  total_stories := garage_levels + res_levels;
  -- capture is measured against the structured-parking ceiling (FAR / height / density, no parking land) when the frontier carries one — the surface frontier is the wrong yardstick for a garage plan
  cap := CASE WHEN coalesce((mb#>>'{structured_parking_ceiling,gsf}')::numeric, 0) > 0 THEN round(100.0 * gsf / (mb#>>'{structured_parking_ceiling,gsf}')::numeric, 1)
              WHEN max_gsf > 0 THEN round(100.0 * gsf / max_gsf, 1) ELSE NULL END;
  IF cap IS NOT NULL AND cap < 50 THEN flags := flags || jsonb_build_array(format('wrap_capture_%s_pct_of_structured_ceiling', cap)); END IF;
  coverage := round((100.0 * block_area / ST_Area(g))::numeric, 1);
  far := round((gsf / ST_Area(g))::numeric, 2);
  pct_placed := round(100.0 * stalls_prov / GREATEST(stalls_req, 1), 1);
  mix := (SELECT jsonb_agg(jsonb_build_object('type', unit_type, 'pct', default_mix_pct, 'units', floor(units * default_mix_pct / 100.0)) ORDER BY u.gsf)
          FROM public.unit_spec u WHERE typology = p_typology);

  -- 5. The court: pool and deck on the street side beside the entry drive, the rest open
  pool := public.fn_axis_rect(ox,oy,dx,dy,nx,ny,
            CASE WHEN side_sign = 1 THEN blk_a1 - bar_d - 12 - LEAST(60, court_w - 24) ELSE blk_a0 + bar_d + 12 END,
            CASE WHEN side_sign = 1 THEN blk_a1 - bar_d - 12 ELSE blk_a0 + bar_d + 12 + LEAST(60, court_w - 24) END,
            blk_n0 + bar_d + 12, blk_n0 + bar_d + 12 + LEAST(30, court_d - 24));
  green := ST_Difference(court, pool);

  -- 6. Entries: the curb cut where the side drive meets the frontage; the garage off the side drive near the rear corner and off the rear drive
  cline := ST_MakeLine(ST_SetSRID(ST_MakePoint(ox + dx*((sd_a0 + sd_a1)/2) + nx*(pn_lo - 10), oy + dy*((sd_a0 + sd_a1)/2) + ny*(pn_lo - 10)), 2274),
                       ST_SetSRID(ST_MakePoint(ox + dx*((sd_a0 + sd_a1)/2) + nx*(blk_n1 + gap + lane/2), oy + dy*((sd_a0 + sd_a1)/2) + ny*(blk_n1 + gap + lane/2)), 2274));
  hitpts := ST_Intersection(cline, ST_Boundary(g));
  entry_pt := CASE WHEN hitpts IS NULL OR ST_IsEmpty(hitpts) THEN ST_ClosestPoint(ST_Boundary(g), ST_StartPoint(cline)) ELSE ST_ClosestPoint(hitpts, ST_StartPoint(cline)) END;
  garage_entry := ST_SetSRID(ST_MakePoint(ox + dx*(CASE WHEN side_sign = 1 THEN blk_a1 ELSE blk_a0 END) + nx*(blk_n1 - bar_d/2), oy + dy*(CASE WHEN side_sign = 1 THEN blk_a1 ELSE blk_a0 END) + ny*(blk_n1 - bar_d/2)), 2274);
  garage_entry_rear := ST_SetSRID(ST_MakePoint(ox + dx*((blk_a0 + blk_a1)/2) + nx*blk_n1, oy + dy*((blk_a0 + blk_a1)/2) + ny*blk_n1), 2274);
  drives := drives || jsonb_build_object('kind','access','name','Side drive','geom_2274', ST_AsGeoJSON(side_drive)::jsonb,'area_sqft', round(ST_Area(side_drive)),'lane_ft', lane,
                                         'entry_2274', ST_AsGeoJSON(entry_pt)::jsonb, 'spine_2274', ST_AsGeoJSON(ST_MakeLine(entry_pt, ST_EndPoint(cline)))::jsonb);
  IF rear_drive IS NOT NULL AND NOT ST_IsEmpty(rear_drive) THEN
    drives := drives || jsonb_build_object('kind','fire_lane','name','Rear drive','geom_2274', ST_AsGeoJSON(rear_drive)::jsonb,'area_sqft', round(ST_Area(rear_drive)),'lane_ft', lane);
  END IF;
  IF other_drive IS NOT NULL AND NOT ST_IsEmpty(other_drive) THEN
    drives := drives || jsonb_build_object('kind','fire_lane','name','Second side drive','geom_2274', ST_AsGeoJSON(other_drive)::jsonb,'area_sqft', round(ST_Area(other_drive)),'lane_ft', lane);
  END IF;

  -- the four bars
  FOR i IN 1..4 LOOP
    bar := CASE i WHEN 1 THEN bar_front WHEN 2 THEN bar_rear WHEN 3 THEN bar_left ELSE bar_right END;
    bar_name := CASE i WHEN 1 THEN 'frontage bar' WHEN 2 THEN 'rear bar' WHEN 3 THEN 'side bar' ELSE 'side bar' END;
    bar_gsf := ST_Area(bar) * res_levels + CASE WHEN i = 1 THEN ST_Area(bar) * garage_levels ELSE 0 END;
    bar_id := bar_id + 1;
    blds := blds || jsonb_build_object('structure_id', bar_id, 'kind', 'wrap_bar', 'name', bar_name,
      'geom_2274', ST_AsGeoJSON(bar)::jsonb, 'footprint_sqft', round(ST_Area(bar)), 'stories', total_stories, 'gsf', round(bar_gsf),
      'residential_levels', res_levels + CASE WHEN i = 1 THEN garage_levels ELSE 0 END, 'over_garage', (i <> 1),
      'is_single_polygon', true, 'envelope_retention_pct', 100);
  END LOOP;

  basis := format('%s GSF wrap plan @ %s st (%s garage + %s residential) · %s%% of %s %s · block %s × %s ft (%s%% of the site) · court %s × %s · %s units @ ~%s GSF%s · %s/%s stalls (%s garage levels × %s + %s outside) · access: %s · generator: wrap_v1 · exemplar: The Caroline, 101 Cool Springs Blvd%s',
    round(gsf), total_stories, garage_levels, res_levels, coalesce(cap::text, '?'),
    coalesce(round(coalesce(nullif((mb#>>'{structured_parking_ceiling,gsf}')::numeric, 0), max_gsf))::text, '?'),
    CASE WHEN coalesce((mb#>>'{structured_parking_ceiling,gsf}')::numeric, 0) > 0 THEN 'structured ceiling' ELSE 'max' END,
    round(blk_w), round(blk_d), coverage, round(court_w), round(court_d), units, round(unit_gsf),
    CASE WHEN du_ac IS NOT NULL THEN format(' (density cap %s du/ac)', du_ac) ELSE '' END,
    stalls_prov, stalls_req, garage_levels, stalls_per_level, stalls_ext,
    CASE best_variant WHEN 1 THEN 'side drive + rear drive' WHEN 2 THEN 'drives down both sides' ELSE 'one side drive' END,
    CASE WHEN parking_limited THEN ' · clamp: parking_limited' ELSE '' END);

  RETURN jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'typology', p_typology, 'seed', p_seed, 'context_id', p_context_id,
    'generator_version', 'wrap_v1', 'buildings', blds,
    'parking', jsonb_build_object('strategy', 'wrap_garage', 'stalls', stalls_prov, 'stalls_required', stalls_req,
      'stalls_required_at_placed', stalls_req, 'stalls_target_at_max', coalesce((mb->>'stalls_required_at_max')::int, stalls_req),
      'pct_of_placed_need', pct_placed, 'pct_of_max_need', round(100.0 * stalls_prov / GREATEST(coalesce((mb->>'stalls_required_at_max')::int, stalls_req), 1), 1),
      'bays', bays,
      'garage', jsonb_build_object('geom_2274', ST_AsGeoJSON(garage)::jsonb, 'area_sqft', round(garage_area), 'levels', garage_levels,
        'stalls_per_level', stalls_per_level, 'capacity_stalls', garage_levels * stalls_per_level, 'stalls', stalls_prov - stalls_ext, 'sf_per_stall', sf_per_stall,
        'entry_2274', ST_AsGeoJSON(garage_entry)::jsonb, 'entry_rear_2274', ST_AsGeoJSON(garage_entry_rear)::jsonb)),
    'drives', drives,
    'access', jsonb_build_object('side', CASE WHEN side_sign = 1 THEN 'right' ELSE 'left' END, 'lane_ft', lane, 'entry_2274', ST_AsGeoJSON(entry_pt)::jsonb,
      'variant', CASE best_variant WHEN 1 THEN 'side_and_rear' WHEN 2 THEN 'both_sides' ELSE 'side_only' END,
      'frame', CASE WHEN array_length(az_c, 1) > 1 AND best_az = az_c[2] THEN 'lot_axis' ELSE 'street' END, 'frame_skew_deg', round(degrees(LEAST(coalesce(d1, 0), coalesce(d2, 0)))::numeric, 1),
      'garage_entry_2274', ST_AsGeoJSON(garage_entry)::jsonb, 'basis', 'the curb cut is the side drive; the garage is entered off it near the rear corner and off the rear drive, never from the frontage'),
    'greens', jsonb_build_array(jsonb_build_object('name', 'Courtyard on the garage deck', 'geom_2274', ST_AsGeoJSON(green)::jsonb, 'area_sqft', round(ST_Area(green)))),
    'amenity', jsonb_build_array(jsonb_build_object('name', 'Pool deck', 'geom_2274', ST_AsGeoJSON(pool)::jsonb, 'area_sqft', round(ST_Area(pool)))),
    'metrics', jsonb_build_object('units', units, 'gsf', round(gsf), 'stories', total_stories, 'garage_levels', garage_levels, 'residential_levels', res_levels,
      'capture_pct', cap, 'capture_vs_surface_frontier_pct', CASE WHEN max_gsf > 0 THEN round(100.0 * gsf / max_gsf, 1) END,
      'stalls', stalls_prov, 'mix', mix, 'parking_limited', parking_limited, 'far', far, 'coverage_pct', coverage,
      'density_du_ac', round((units / acres)::numeric, 1), 'court_sqft', round(court_area), 'block_ft', jsonb_build_array(round(blk_w), round(blk_d)),
      'ring_sqft_per_level', round(ring_area), 'ceilings', jsonb_build_object('surface_frontier_gsf', max_gsf, 'structured_ceiling_gsf', (mb#>>'{structured_parking_ceiling,gsf}')::numeric, 'stories_allowed', stories_max)),
    'plan_basis', basis,
    'plan_pattern', pat, 'pattern_consumed', true,
    'flags', jsonb_build_array('wrap_v1_deterministic', 'pattern_wrap_garage_courtyard') || flags,
    'score_total', LEAST(0.99, coalesce(cap, 0) / 100.0),
    'persisted', false,
    'buildability', public.fn_parcel_buildability(p_ogc_fid, p_typology));
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_frame_inscribed_rect(geometry, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_wrap_site_plan(integer, text, integer, uuid) TO anon, authenticated, service_role;
