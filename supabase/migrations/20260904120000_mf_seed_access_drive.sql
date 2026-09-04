-- 2026-09-04 · MF seed: a road to the parking.
--
-- Eric, 2622 W Heiman (667574): "You have a random parking, with no road to
-- get to it." The seed placed an E-shaped bar across the whole frontage, a
-- 60-ft rear field behind it, and a 127-ft "spine" from the frontage midpoint
-- straight through the front bar that stopped inside the building — so the
-- client clipped the drive against the building and the field rendered with
-- no access at all.
--
-- fn_site_skeleton_v2_bars, fn_site_skeleton_v2, fn_connect_bars and
-- fn_seed_parking existed only in the database (no migration in the repo).
-- This file captures the two it changes; the other two stay as they are.
--
-- What changes
--  1. fn_site_skeleton_v2_bars reserves an ACCESS LANE along one side of the
--     parcel before the bars are sized: the fire-lane width from
--     fn_site_standards (26 ft) plus 2 ft clear of the building, from the
--     frontage to the far end, on whichever side the lane strip lies most
--     inside the parcel. The skeleton's entry moves to the lane's centre on
--     the frontage and the spine runs down the lane. Landlocked parcels keep
--     the axis entry (their access is an easement the fabric does not show).
--  2. fn_seed_parking keeps bays out of the lane and builds the DRIVE NETWORK:
--     the side lane from the curb, the aisle strip between the building and
--     the bays that serve off it, and a straight connector for any bay whose
--     head is still off the network. Emitted as drives[] with real polygons
--     (the first carries the entry point and the lane centreline).
--  3. fn_generate_mf_site_plan_v2 serves sk->'drives' (the skeleton stays the
--     fallback for a seed without one).
--
-- Capture drops by the bar length the lane takes (~7% on a bar that filled
-- the frontage). A plan whose parking can be reached beats one that captured
-- 100% on paper; the battery floors are re-based with this note.

-- An axis-aligned rectangle in the (d, n) frame of a frontage: origin (ox,oy),
-- d along the frontage (dx,dy), n inward (nx,ny). Used by the placer and the
-- parking seed for lanes and strips.
CREATE OR REPLACE FUNCTION public.fn_axis_rect(
  ox double precision, oy double precision,
  dx double precision, dy double precision,
  nx double precision, ny double precision,
  d0 double precision, d1 double precision,
  n0 double precision, n1 double precision)
RETURNS geometry
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ST_MakePolygon(ST_MakeLine(ARRAY[
    ST_SetSRID(ST_MakePoint(ox+dx*d0+nx*n0, oy+dy*d0+ny*n0),2274),
    ST_SetSRID(ST_MakePoint(ox+dx*d1+nx*n0, oy+dy*d1+ny*n0),2274),
    ST_SetSRID(ST_MakePoint(ox+dx*d1+nx*n1, oy+dy*d1+ny*n1),2274),
    ST_SetSRID(ST_MakePoint(ox+dx*d0+nx*n1, oy+dy*d0+ny*n1),2274),
    ST_SetSRID(ST_MakePoint(ox+dx*d0+nx*n0, oy+dy*d0+ny*n0),2274)]));
$$;

CREATE OR REPLACE FUNCTION public.fn_site_skeleton_v2_bars(p_ogc_fid integer, p_typology text DEFAULT 'multifamily', p_need_ft numeric DEFAULT NULL, p_stories integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  ctx jsonb; envj jsonb; env geometry; up jsonb; mb jsonb; fr jsonb;
  fline geometry; g geometry; cen geometry;
  v_front numeric; v_side numeric; bar_depth numeric; court numeric;
  az double precision; dx double precision; dy double precision; nx double precision; ny double precision;
  ox double precision; oy double precision; need_ft numeric; placed_ft numeric := 0; stories int;
  k int; off double precision; structures jsonb := '[]'::jsonb;
  bl double precision; this_len double precision; remaining double precision;
  lo double precision; hi double precision; landlocked boolean;
  obb geometry; ring geometry; p geometry[]; L12 double precision; L23 double precision;
  entry geometry; spine geometry;
  residual double precision; last_off double precision; last_d0 double precision; last_d1 double precision;
  wtry int; wd0 double precision; wd1 double precision; wn0 double precision; wn1 double precision;
  nsign double precision; wing geometry; wingc geometry; wing_len double precision;
  si int; s0 double precision; span double precision; cand geometry; candc geometry;
  best_a double precision; best_s double precision; best_g geometry;
  shortfall double precision; ext_len double precision; pass int;
  -- access lane (2026-09-04)
  std jsonb; lane numeric := 26; plo double precision; phi double precision; n_far double precision;
  strip geometry; fit_l double precision := 0; fit_r double precision := 0;
  access_side text := 'none'; dc_lane double precision; spine_len double precision;
BEGIN
  ctx := public.fn_resolve_design_context(p_ogc_fid,p_typology);
  IF ctx ? 'error' THEN RETURN ctx; END IF;
  v_front := coalesce((ctx#>>'{setbacks,front,value}')::numeric,20);
  v_side := coalesce((ctx#>>'{setbacks,side,value}')::numeric,5);
  up := public.fn_unit_program(p_typology);
  bar_depth := coalesce((up->>'implied_bar_depth_ft')::numeric,67.3);
  court := 40;
  mb := public.fn_max_buildout(p_ogc_fid,p_typology);
  IF mb ? 'error' THEN RETURN mb; END IF;
  stories := coalesce(p_stories, (mb#>>'{program_frontier,gsf_max_option,stories}')::int, 4);
  need_ft := coalesce(p_need_ft, (mb->>'max_gsf')::numeric/stories/bar_depth);
  envj := public.fn_directional_envelope(p_ogc_fid,v_front,v_side,
          coalesce((ctx#>>'{setbacks,rear,value}')::numeric,20));
  BEGIN env := ST_SetSRID(ST_GeomFromGeoJSON((envj->'geom_2274')::text),2274);
  EXCEPTION WHEN others THEN env := NULL; END;
  IF env IS NULL OR ST_IsEmpty(env) THEN
    RETURN jsonb_build_object('error','envelope_unavailable','parcel_ogc_fid',p_ogc_fid); END IF;
  fr := public.fn_parcel_frontage(p_ogc_fid);
  landlocked := coalesce((fr->>'landlocked')::boolean,true);
  IF NOT landlocked THEN
    BEGIN
      fline := ST_SetSRID(ST_LineMerge(ST_GeomFromGeoJSON((fr#>'{primary,geom_2274}')::text)),2274);
      az := ST_Azimuth(ST_StartPoint(fline),ST_EndPoint(fline));
      ox := ST_X(ST_LineInterpolatePoint(fline,0.5)); oy := ST_Y(ST_LineInterpolatePoint(fline,0.5));
    EXCEPTION WHEN others THEN landlocked := true; END; END IF;
  IF landlocked THEN
    obb := ST_OrientedEnvelope(env); ring := ST_ExteriorRing(obb);
    p := ARRAY[ST_PointN(ring,1),ST_PointN(ring,2),ST_PointN(ring,3)];
    L12 := ST_Distance(p[1],p[2]); L23 := ST_Distance(p[2],p[3]);
    IF L12>=L23 THEN az:=ST_Azimuth(p[1],p[2]); ELSE az:=ST_Azimuth(p[2],p[3]); END IF;
    ox := ST_X(ST_Centroid(env)); oy := ST_Y(ST_Centroid(env)); END IF;
  dx:=sin(az); dy:=cos(az); nx:=sin(az+pi()/2); ny:=cos(az+pi()/2);
  SELECT (ST_Dump(geom_2274)).geom INTO g FROM public.parcels WHERE ogc_fid=p_ogc_fid LIMIT 1;
  cen := ST_Centroid(g);
  IF NOT landlocked THEN
    IF ST_Distance(ST_SetSRID(ST_MakePoint(ox+nx*10,oy+ny*10),2274),cen)
     > ST_Distance(ST_SetSRID(ST_MakePoint(ox-nx*10,oy-ny*10),2274),cen)
    THEN nx:=-nx; ny:=-ny; END IF; END IF;
  SELECT min((ST_X(q.geom)-ox)*dx+(ST_Y(q.geom)-oy)*dy),
         max((ST_X(q.geom)-ox)*dx+(ST_Y(q.geom)-oy)*dy) INTO lo,hi FROM ST_DumpPoints(env) q;

  -- Access lane (2026-09-04): reserve the fire-lane width along the side of
  -- the parcel whose strip lies most inside it, from the frontage to the far
  -- end; the bars stop lane + 2 ft short of it. Pavement may sit in the side
  -- setback, so the lane is measured from the parcel line, not the envelope.
  IF NOT landlocked THEN
    BEGIN
      std := public.fn_site_standards(p_typology);
      lane := coalesce((std#>>'{fire_access,lane_width_ft}')::numeric, 26);
      SELECT min((ST_X(q.geom)-ox)*dx+(ST_Y(q.geom)-oy)*dy), max((ST_X(q.geom)-ox)*dx+(ST_Y(q.geom)-oy)*dy),
             max((ST_X(q.geom)-ox)*nx+(ST_Y(q.geom)-oy)*ny)
        INTO plo, phi, n_far FROM ST_DumpPoints(g) q;
      IF n_far > lane THEN
        -- strips start 5 ft before the frontage line so a bulging curb never
        -- leaves the lane short of the parcel edge (clipped to the parcel later)
        strip := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, plo, plo+lane, -5, n_far);
        fit_l := ST_Area(ST_Intersection(strip, g)) / NULLIF(ST_Area(strip),0);
        strip := public.fn_axis_rect(ox,oy,dx,dy,nx,ny, phi-lane, phi, -5, n_far);
        fit_r := ST_Area(ST_Intersection(strip, g)) / NULLIF(ST_Area(strip),0);
      END IF;
      IF GREATEST(coalesce(fit_l,0), coalesce(fit_r,0)) >= 0.5 AND (hi - lo) > lane + 2 + 80 THEN
        IF coalesce(fit_l,0) >= coalesce(fit_r,0) THEN
          access_side := 'left'; dc_lane := plo + lane/2; lo := GREATEST(lo, plo + lane + 2);
        ELSE
          access_side := 'right'; dc_lane := phi - lane/2; hi := LEAST(hi, phi - lane - 2);
        END IF;
      END IF;
    EXCEPTION WHEN others THEN access_side := 'none'; END;
  END IF;

  bl := LEAST(hi-lo-10, 420);
  FOR k IN 0..9 LOOP
    remaining := need_ft - placed_ft;
    IF k >= 1 THEN remaining := remaining - court; END IF;
    EXIT WHEN remaining < 80;
    this_len := LEAST(bl, remaining);
    off := CASE WHEN landlocked THEN (k-1)*(bar_depth+court)
                ELSE v_front + bar_depth/2 + k*(bar_depth+court) END;
    span := GREATEST((hi-lo) - this_len - 10, 0);
    best_a := 0; best_s := lo+5; best_g := NULL;
    FOR si IN 0..8 LOOP
      s0 := lo + 5 + span * si / 8.0;
      cand := ST_MakePolygon(ST_MakeLine(ARRAY[
        ST_SetSRID(ST_MakePoint(ox+dx*s0+nx*(off-bar_depth/2),oy+dy*s0+ny*(off-bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*(s0+this_len)+nx*(off-bar_depth/2),oy+dy*(s0+this_len)+ny*(off-bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*(s0+this_len)+nx*(off+bar_depth/2),oy+dy*(s0+this_len)+ny*(off+bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*s0+nx*(off+bar_depth/2),oy+dy*s0+ny*(off+bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*s0+nx*(off-bar_depth/2),oy+dy*s0+ny*(off-bar_depth/2)),2274)]));
      candc := ST_Intersection(cand, env);
      SELECT d.geom INTO candc FROM (SELECT (ST_Dump(candc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      IF candc IS NOT NULL AND ST_Area(candc) > best_a THEN
        best_a := ST_Area(candc); best_s := s0; best_g := candc; END IF;
      EXIT WHEN span = 0 OR best_a >= this_len*bar_depth*0.995;
    END LOOP;
    shortfall := this_len - best_a/bar_depth; pass := 0;
    WHILE shortfall > 3 AND pass < 2 LOOP
      pass := pass + 1;
      ext_len := LEAST(this_len + shortfall*1.3, (hi-5) - best_s, bl*1.15);
      EXIT WHEN ext_len <= this_len + 1;
      cand := ST_MakePolygon(ST_MakeLine(ARRAY[
        ST_SetSRID(ST_MakePoint(ox+dx*best_s+nx*(off-bar_depth/2),oy+dy*best_s+ny*(off-bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*(best_s+ext_len)+nx*(off-bar_depth/2),oy+dy*(best_s+ext_len)+ny*(off-bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*(best_s+ext_len)+nx*(off+bar_depth/2),oy+dy*(best_s+ext_len)+ny*(off+bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*best_s+nx*(off+bar_depth/2),oy+dy*best_s+ny*(off+bar_depth/2)),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*best_s+nx*(off-bar_depth/2),oy+dy*best_s+ny*(off-bar_depth/2)),2274)]));
      candc := ST_Intersection(cand, env);
      SELECT d.geom INTO candc FROM (SELECT (ST_Dump(candc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      IF candc IS NOT NULL AND ST_Area(candc) > best_a THEN
        best_g := candc; best_a := LEAST(ST_Area(candc), this_len*bar_depth); END IF;
      shortfall := this_len - best_a/bar_depth;
    END LOOP;
    IF best_g IS NOT NULL AND best_a > bar_depth*60 THEN
      structures := structures || jsonb_build_object('structure_id',jsonb_array_length(structures)+1,
        'geom_2274',ST_AsGeoJSON(best_g)::jsonb,'footprint_sqft',round(ST_Area(best_g)),'is_single_polygon',true,
        'bar_len_ft', round(this_len));
      placed_ft := placed_ft + best_a/bar_depth;
      last_off := off; last_d0 := best_s; last_d1 := best_s + this_len;
    END IF;
  END LOOP;
  IF jsonb_array_length(structures)=0 THEN
    RETURN jsonb_build_object('error','seed_unplaceable','parcel_ogc_fid',p_ogc_fid); END IF;
  residual := need_ft - placed_ft - GREATEST(jsonb_array_length(structures)-1,0)*court;
  IF residual >= 30 AND last_off IS NOT NULL THEN
    wing_len := LEAST(residual, 160);
    FOR wtry IN 1..4 LOOP
      EXIT WHEN wtry > 2 AND NOT landlocked;
      nsign := CASE WHEN wtry <= 2 THEN 1 ELSE -1 END;
      IF (wtry % 2) = 1 THEN wd0 := last_d1 - bar_depth; wd1 := last_d1;
      ELSE wd0 := last_d0; wd1 := last_d0 + bar_depth; END IF;
      wn0 := last_off + nsign*(bar_depth/2 - 1); wn1 := wn0 + nsign*wing_len;
      wing := ST_MakePolygon(ST_MakeLine(ARRAY[
        ST_SetSRID(ST_MakePoint(ox+dx*wd0+nx*wn0, oy+dy*wd0+ny*wn0),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*wd1+nx*wn0, oy+dy*wd1+ny*wn0),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*wd1+nx*wn1, oy+dy*wd1+ny*wn1),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*wd0+nx*wn1, oy+dy*wd0+ny*wn1),2274),
        ST_SetSRID(ST_MakePoint(ox+dx*wd0+nx*wn0, oy+dy*wd0+ny*wn0),2274)]));
      wingc := ST_Intersection(wing, env);
      SELECT d.geom INTO wingc FROM (SELECT (ST_Dump(wingc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      IF wingc IS NOT NULL AND NOT ST_IsEmpty(wingc)
         AND ST_Area(wingc) >= GREATEST(0.5*ST_Area(wing), bar_depth*25) THEN
        structures := structures || jsonb_build_object('structure_id',jsonb_array_length(structures)+1,
          'geom_2274',ST_AsGeoJSON(wingc)::jsonb,'footprint_sqft',round(ST_Area(wingc)),
          'is_single_polygon',true,'role','wing','bar_len_ft',round(wing_len));
        placed_ft := placed_ft + ST_Area(wingc)/bar_depth; EXIT;
      END IF;
    END LOOP;
  END IF;
  -- The entry sits on the lane when there is one, and the spine runs down it
  -- to the far end (less the rear setback); otherwise the axis entry as before.
  entry := CASE WHEN landlocked THEN ST_SetSRID(ST_MakePoint(ox+dx*lo,oy+dy*lo),2274)
                WHEN access_side <> 'none' THEN ST_SetSRID(ST_MakePoint(ox+dx*dc_lane,oy+dy*dc_lane),2274)
                ELSE ST_SetSRID(ST_MakePoint(ox,oy),2274) END;
  spine_len := CASE WHEN access_side <> 'none' THEN GREATEST(n_far - 20, v_front + bar_depth + court)
                    ELSE v_front + bar_depth + court END;
  spine := ST_MakeLine(entry, ST_SetSRID(ST_MakePoint(ST_X(entry)+nx*spine_len, ST_Y(entry)+ny*spine_len),2274));
  RETURN jsonb_build_object('parcel_ogc_fid',p_ogc_fid,'typology',p_typology,
    'structures',structures,'stories',stories,'need_bar_ft',round(need_ft),'placed_bar_ft',round(placed_ft),
    'composition',CASE WHEN jsonb_array_length(structures)=1 THEN 'single_bar' ELSE jsonb_array_length(structures)||'_bars' END,
    'skeleton',jsonb_build_object('entry_2274',ST_AsGeoJSON(entry)::jsonb,'spine_2274',ST_AsGeoJSON(spine)::jsonb),
    'access',jsonb_build_object('side',access_side,'lane_ft',lane,'lane_center_d',dc_lane,
      'lane_fit_left',round(coalesce(fit_l,0)::numeric,2),'lane_fit_right',round(coalesce(fit_r,0)::numeric,2),
      'frame',jsonb_build_object('ox',ox,'oy',oy,'dx',dx,'dy',dy,'nx',nx,'ny',ny,'n_far',n_far)),
    'frontage',jsonb_build_object('landlocked',landlocked,'bearing_deg',round(degrees(az)::numeric,1)),
    'construction_type',(SELECT jsonb_build_object('type',const_type) FROM public.ibc_construction_types
      WHERE max_stories>=stories ORDER BY cost_rank LIMIT 1),
    'note_v2','bars placer w/ overrides (need_ft, stories); dynamic rows; slide/extend; link-aware wing; access lane reserved (2026-09-04)');
END $function$;

CREATE OR REPLACE FUNCTION public.fn_seed_parking(p_ogc_fid integer, p_typology text DEFAULT 'multifamily', p_need_ft numeric DEFAULT NULL, p_stories integer DEFAULT NULL, p_stalls_needed integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  sk jsonb; mb jsonb; std jsonb; ctx jsonb; envj jsonb;
  env geometry; structure geometry; free geometry;
  obb geometry; ring geometry; p geometry[]; L12 double precision; L23 double precision;
  ax double precision; dx double precision; dy double precision; nx double precision; ny double precision;
  cx double precision; cy double precision; half_d double precision; slen double precision;
  lane numeric; module numeric := 60; pitch numeric := 9;
  need int; k int; side int; off double precision; row geometry; rowc geometry;
  best_n int := 0; best_b jsonb := '[]'::jsonb; best_s text := 'none';
  cur_n int; cur_b jsonb; row_len double precision;
  n_lo double precision; n_hi double precision; a_lo double precision; a_hi double precision;
  sgn double precision; far double precision; dc double precision;
  all_b jsonb; e jsonb; cand geometry; ok boolean; acc geometry[] := '{}'; i int;
  -- drive network (2026-09-04)
  g geometry; access_side text; fox double precision; foy double precision; fdx double precision; fdy double precision;
  fnx double precision; fny double precision; n_far double precision; dc_lane double precision;
  lane_strip geometry; bays_u geometry; n_end double precision; net geometry; ring_aisle geometry;
  bobb geometry; bring geometry; q geometry[]; head1 geometry; head2 geometry; head geometry; conn geometry;
  drives jsonb := NULL; piece geometry; pi_ int := 0;
BEGIN
  sk := public.fn_site_skeleton_v2(p_ogc_fid, p_typology, p_need_ft, p_stories);
  IF sk ? 'error' OR NOT (sk ? 'structures') THEN RETURN sk; END IF;
  mb := public.fn_max_buildout(p_ogc_fid, p_typology);
  std := public.fn_site_standards(p_typology);
  lane := coalesce((std#>>'{fire_access,lane_width_ft}')::numeric,26);
  need := coalesce(p_stalls_needed, (mb->>'stalls_required_at_max')::int, 100);
  IF need <= 0 THEN
    RETURN sk || jsonb_build_object('parking_seed', jsonb_build_object('stalls_target',0,'stalls_achieved_est',0,
      'coverage_of_target_pct',100,'strategy','none_needed','bays','[]'::jsonb)); END IF;
  ctx := public.fn_resolve_design_context(p_ogc_fid, p_typology);
  envj := public.fn_directional_envelope(p_ogc_fid,
    coalesce((ctx#>>'{setbacks,front,value}')::numeric,20),
    coalesce((ctx#>>'{setbacks,side,value}')::numeric,5),
    coalesce((ctx#>>'{setbacks,rear,value}')::numeric,20));
  env := ST_SetSRID(ST_GeomFromGeoJSON((envj->'geom_2274')::text),2274);
  structure := ST_SetSRID(ST_GeomFromGeoJSON((sk#>'{structures,0,geom_2274}')::text),2274);
  free := ST_Difference(env, ST_Buffer(structure, lane));

  -- The reserved access lane (from the placer's frame): bays never sit in it.
  SELECT (ST_Dump(geom_2274)).geom INTO g FROM public.parcels WHERE ogc_fid=p_ogc_fid LIMIT 1;
  access_side := coalesce(sk#>>'{access,side}','none');
  IF access_side <> 'none' THEN
    BEGIN
      fox := (sk#>>'{access,frame,ox}')::double precision; foy := (sk#>>'{access,frame,oy}')::double precision;
      fdx := (sk#>>'{access,frame,dx}')::double precision; fdy := (sk#>>'{access,frame,dy}')::double precision;
      fnx := (sk#>>'{access,frame,nx}')::double precision; fny := (sk#>>'{access,frame,ny}')::double precision;
      n_far := (sk#>>'{access,frame,n_far}')::double precision;
      dc_lane := (sk#>>'{access,lane_center_d}')::double precision;
      lane_strip := ST_Intersection(public.fn_axis_rect(fox,foy,fdx,fdy,fnx,fny, dc_lane-lane/2, dc_lane+lane/2, -5, n_far), g);
      free := ST_Difference(free, ST_Buffer(lane_strip, 2));
    EXCEPTION WHEN others THEN access_side := 'none'; lane_strip := NULL; END;
  END IF;

  obb := ST_OrientedEnvelope(structure); ring := ST_ExteriorRing(obb);
  p := ARRAY[ST_PointN(ring,1),ST_PointN(ring,2),ST_PointN(ring,3)];
  L12 := ST_Distance(p[1],p[2]); L23 := ST_Distance(p[2],p[3]);
  IF L12>=L23 THEN ax:=ST_Azimuth(p[1],p[2]); slen:=L12; half_d:=L23/2;
  ELSE ax:=ST_Azimuth(p[2],p[3]); slen:=L23; half_d:=L12/2; END IF;
  dx:=sin(ax); dy:=cos(ax); nx:=sin(ax+pi()/2); ny:=cos(ax+pi()/2);
  cx:=ST_X(ST_Centroid(structure)); cy:=ST_Y(ST_Centroid(structure));
  cur_n:=0; cur_b:='[]'::jsonb; row_len := GREATEST(slen,120);
  FOR side IN 1..2 LOOP FOR k IN 0..4 LOOP
    off := (half_d + lane + module/2) + k*(module+4); IF side=2 THEN off:=-off; END IF;
    row := ST_MakePolygon(ST_MakeLine(ARRAY[
      ST_SetSRID(ST_MakePoint(cx-dx*row_len/2+nx*(off-module/2), cy-dy*row_len/2+ny*(off-module/2)),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*row_len/2+nx*(off-module/2), cy+dy*row_len/2+ny*(off-module/2)),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*row_len/2+nx*(off+module/2), cy+dy*row_len/2+ny*(off+module/2)),2274),
      ST_SetSRID(ST_MakePoint(cx-dx*row_len/2+nx*(off+module/2), cy-dy*row_len/2+ny*(off+module/2)),2274),
      ST_SetSRID(ST_MakePoint(cx-dx*row_len/2+nx*(off-module/2), cy-dy*row_len/2+ny*(off-module/2)),2274)]));
    rowc := ST_Intersection(row, free);
    SELECT d.geom INTO rowc FROM (SELECT (ST_Dump(rowc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
    IF rowc IS NOT NULL AND NOT ST_IsEmpty(rowc) AND ST_Area(rowc)>2000 THEN
      cur_n := cur_n + floor(2*(ST_Area(rowc)/module)/pitch)::int;
      cur_b := cur_b || jsonb_build_object('geom_2274',ST_AsGeoJSON(rowc)::jsonb,'area_sqft',round(ST_Area(rowc)));
    END IF; EXIT WHEN cur_n>=need;
  END LOOP; EXIT WHEN cur_n>=need; END LOOP;
  IF cur_n>best_n THEN best_n:=cur_n; best_b:=cur_b; best_s:='side_rows'; END IF;
  all_b := cur_b;
  cur_n:=0; cur_b:='[]'::jsonb; row_len := GREATEST(2*half_d+60, 100);
  FOR side IN 1..2 LOOP FOR k IN 0..4 LOOP
    off := (slen/2 + lane + module/2) + k*(module+4); IF side=2 THEN off:=-off; END IF;
    row := ST_MakePolygon(ST_MakeLine(ARRAY[
      ST_SetSRID(ST_MakePoint(cx+dx*(off-module/2)-nx*row_len/2, cy+dy*(off-module/2)-ny*row_len/2),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*(off-module/2)+nx*row_len/2, cy+dy*(off-module/2)+ny*row_len/2),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*(off+module/2)+nx*row_len/2, cy+dy*(off+module/2)+ny*row_len/2),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*(off+module/2)-nx*row_len/2, cy+dy*(off+module/2)-ny*row_len/2),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*(off-module/2)-nx*row_len/2, cy+dy*(off-module/2)-ny*row_len/2),2274)]));
    rowc := ST_Intersection(row, free);
    SELECT d.geom INTO rowc FROM (SELECT (ST_Dump(rowc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
    IF rowc IS NOT NULL AND NOT ST_IsEmpty(rowc) AND ST_Area(rowc)>1500 THEN
      cur_n := cur_n + floor(2*(ST_Area(rowc)/module)/pitch)::int;
      cur_b := cur_b || jsonb_build_object('geom_2274',ST_AsGeoJSON(rowc)::jsonb,'area_sqft',round(ST_Area(rowc)));
    END IF; EXIT WHEN cur_n>=need;
  END LOOP; EXIT WHEN cur_n>=need; END LOOP;
  IF cur_n>best_n THEN best_n:=cur_n; best_b:=cur_b; best_s:='end_rows'; END IF;
  all_b := all_b || cur_b;
  cur_n:=0; cur_b:='[]'::jsonb;
  SELECT min((ST_X(q.geom)-cx)*nx+(ST_Y(q.geom)-cy)*ny), max((ST_X(q.geom)-cx)*nx+(ST_Y(q.geom)-cy)*ny),
         min((ST_X(q.geom)-cx)*dx+(ST_Y(q.geom)-cy)*dy), max((ST_X(q.geom)-cx)*dx+(ST_Y(q.geom)-cy)*dy)
    INTO n_lo, n_hi, a_lo, a_hi FROM ST_DumpPoints(env) q;
  IF (n_hi - half_d) >= (-n_lo - half_d) THEN sgn := 1; far := n_hi; ELSE sgn := -1; far := -n_lo; END IF;
  IF far - half_d - lane >= 70 THEN
    FOR k IN 0..9 LOOP
      dc := a_lo + module/2 + k*(module+4); EXIT WHEN dc + module/2 > a_hi;
      row := ST_MakePolygon(ST_MakeLine(ARRAY[
        ST_SetSRID(ST_MakePoint(cx+dx*(dc-module/2)+nx*sgn*(half_d+lane), cy+dy*(dc-module/2)+ny*sgn*(half_d+lane)),2274),
        ST_SetSRID(ST_MakePoint(cx+dx*(dc+module/2)+nx*sgn*(half_d+lane), cy+dy*(dc+module/2)+ny*sgn*(half_d+lane)),2274),
        ST_SetSRID(ST_MakePoint(cx+dx*(dc+module/2)+nx*sgn*far, cy+dy*(dc+module/2)+ny*sgn*far),2274),
        ST_SetSRID(ST_MakePoint(cx+dx*(dc-module/2)+nx*sgn*far, cy+dy*(dc-module/2)+ny*sgn*far),2274),
        ST_SetSRID(ST_MakePoint(cx+dx*(dc-module/2)+nx*sgn*(half_d+lane), cy+dy*(dc-module/2)+ny*sgn*(half_d+lane)),2274)]));
      rowc := ST_Intersection(row, free);
      SELECT d.geom INTO rowc FROM (SELECT (ST_Dump(rowc)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
      IF rowc IS NOT NULL AND NOT ST_IsEmpty(rowc) AND ST_Area(rowc)>1500 THEN
        cur_n := cur_n + floor(2*(ST_Area(rowc)/module)/pitch)::int;
        cur_b := cur_b || jsonb_build_object('geom_2274',ST_AsGeoJSON(rowc)::jsonb,'area_sqft',round(ST_Area(rowc)));
      END IF; EXIT WHEN cur_n>=need;
    END LOOP;
    IF cur_n>best_n THEN best_n:=cur_n; best_b:=cur_b; best_s:='rear_field_perp'; END IF;
    all_b := all_b || cur_b;
  END IF;
  cur_n:=0; cur_b:='[]'::jsonb; acc := '{}';
  FOR e IN SELECT b FROM jsonb_array_elements(all_b) b ORDER BY (b->>'area_sqft')::numeric DESC LOOP
    cand := ST_SetSRID(ST_GeomFromGeoJSON((e->'geom_2274')::text),2274); ok := true;
    FOR i IN 1..coalesce(array_length(acc,1),0) LOOP
      IF ST_Area(ST_Intersection(cand, acc[i])) > 50 THEN ok := false; EXIT; END IF; END LOOP;
    IF ok THEN acc := acc || cand; cur_n := cur_n + floor(2*(ST_Area(cand)/module)/pitch)::int; cur_b := cur_b || e; END IF;
    EXIT WHEN cur_n >= need;
  END LOOP;
  IF cur_n>best_n THEN best_n:=cur_n; best_b:=cur_b; best_s:='combined'; END IF;

  -- Drive network (2026-09-04): the side lane from the curb to just past the
  -- last bay's head, the aisle strip between the building and the bays that
  -- serve off it, and a straight connector for any bay whose head (the open
  -- end of its internal aisle) is still off the network. Never under the
  -- building, never over a stall; pavement may sit in the setbacks.
  IF access_side <> 'none' AND lane_strip IS NOT NULL THEN
    BEGIN
      SELECT ST_UnaryUnion(ST_Collect(ST_SetSRID(ST_GeomFromGeoJSON((b->'geom_2274')::text),2274)))
        INTO bays_u FROM jsonb_array_elements(best_b) b;
      SELECT max((ST_X(q.geom)-fox)*fnx+(ST_Y(q.geom)-foy)*fny) INTO n_end
        FROM ST_DumpPoints(coalesce(bays_u, structure)) q;
      n_end := LEAST(n_far, n_end + lane);
      net := ST_Intersection(public.fn_axis_rect(fox,foy,fdx,fdy,fnx,fny, dc_lane-lane/2, dc_lane+lane/2, -5, n_end), g);
      ring_aisle := ST_Intersection(ST_Difference(ST_Buffer(structure, lane), ST_Buffer(structure, 2)), g);
      IF bays_u IS NOT NULL AND NOT ST_IsEmpty(bays_u) THEN
        ring_aisle := ST_Intersection(ring_aisle, ST_Buffer(bays_u, lane + 3));
        IF NOT ST_IsEmpty(ring_aisle) THEN net := ST_Union(net, ring_aisle); END IF;
        FOR e IN SELECT b FROM jsonb_array_elements(best_b) b LOOP
          cand := ST_SetSRID(ST_GeomFromGeoJSON((e->'geom_2274')::text),2274);
          bobb := ST_OrientedEnvelope(cand); bring := ST_ExteriorRing(bobb);
          q := ARRAY[ST_PointN(bring,1),ST_PointN(bring,2),ST_PointN(bring,3),ST_PointN(bring,4)];
          -- heads = midpoints of the two SHORT edges of the module
          IF ST_Distance(q[1],q[2]) <= ST_Distance(q[2],q[3]) THEN
            head1 := ST_LineInterpolatePoint(ST_MakeLine(q[1],q[2]),0.5); head2 := ST_LineInterpolatePoint(ST_MakeLine(q[3],q[4]),0.5);
          ELSE
            head1 := ST_LineInterpolatePoint(ST_MakeLine(q[2],q[3]),0.5); head2 := ST_LineInterpolatePoint(ST_MakeLine(q[4],q[1]),0.5);
          END IF;
          IF ST_DWithin(head1, net, lane/2 + 3) OR ST_DWithin(head2, net, lane/2 + 3) THEN CONTINUE; END IF;
          head := CASE WHEN ST_Distance(head1, net) <= ST_Distance(head2, net) THEN head1 ELSE head2 END;
          conn := ST_Buffer(ST_ShortestLine(head, net), lane/2, 'endcap=flat');
          conn := ST_Difference(ST_Intersection(conn, g), ST_Buffer(structure, 2));
          IF conn IS NOT NULL AND NOT ST_IsEmpty(conn) THEN net := ST_Union(net, conn); END IF;
        END LOOP;
        net := ST_Difference(net, bays_u);
      END IF;
      net := ST_Difference(net, ST_Buffer(structure, 1));
      drives := '[]'::jsonb; pi_ := 0;
      FOR piece IN SELECT d.geom FROM (SELECT (ST_Dump(net)).geom) d ORDER BY ST_Area(d.geom) DESC LOOP
        CONTINUE WHEN ST_Area(piece) < 200;
        pi_ := pi_ + 1;
        drives := drives || (jsonb_build_object('kind','access','geom_2274',ST_AsGeoJSON(piece)::jsonb,
          'area_sqft',round(ST_Area(piece)),'lane_ft',lane)
          || CASE WHEN pi_ = 1 THEN jsonb_build_object('entry_2274',sk#>'{skeleton,entry_2274}','spine_2274',sk#>'{skeleton,spine_2274}') ELSE '{}'::jsonb END);
      END LOOP;
      IF jsonb_array_length(drives) = 0 THEN drives := NULL; END IF;
    EXCEPTION WHEN others THEN drives := NULL; END;
  END IF;

  RETURN sk || jsonb_build_object('parking_seed', jsonb_build_object(
    'stalls_target',need,'stalls_achieved_est',best_n,'coverage_of_target_pct',round(100.0*best_n/GREATEST(need,1)),
    'strategy',best_s,'bays',best_b,'basis','best-of-four; fire-lane-separated; overrides honored; lane kept clear (2026-09-04)'))
    || CASE WHEN drives IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('drives', drives) END;
END $function$;

-- The dispatcher serves the network when the seed carries one; a seed without
-- one (landlocked, or no lane fit) keeps the skeleton as before. Otherwise
-- byte-identical to 20260804033000.
CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  sk jsonb; mb jsonb; gsf numeric := 0; stories int; units int; unit_gsf numeric;
  pkr numeric; stalls_req int; stalls_req_initial int; stalls_target_max int;
  stalls_prov int; cap numeric; max_gsf numeric;
  basis text; mix jsonb; parking_limited boolean := false; s jsonb; blds jsonb := '[]'::jsonb;
  pk_vs_max numeric; pk_vs_placed numeric;
  ctx jsonb; v_session uuid; v_cand uuid; persisted boolean := false; perr text;
  g_b geometry; g_p geometry; g_d geometry; payload jsonb;
BEGIN
  sk := public.fn_seed_parking(p_ogc_fid, p_typology);
  IF sk ? 'error' OR NOT (sk ? 'structures') THEN
    RETURN public.fn_generate_mf_site_plan_v2_search(p_ogc_fid,p_typology,p_seed,p_pins,p_parent,p_persist,p_context_id); END IF;
  mb := public.fn_max_buildout(p_ogc_fid, p_typology);
  stories := coalesce((sk->>'stories')::int,4);
  FOR s IN SELECT * FROM jsonb_array_elements(sk->'structures') LOOP
    gsf := gsf + (s->>'footprint_sqft')::numeric * stories;
    blds := blds || (s || jsonb_build_object('stories',stories,'gsf',(s->>'footprint_sqft')::numeric*stories));
  END LOOP;
  max_gsf := (mb->>'max_gsf')::numeric;
  unit_gsf := coalesce((mb#>>'{program_frontier,gsf_max_option,unit_gsf}')::numeric,1200);
  units := floor(gsf*0.88/unit_gsf);
  pkr := public.fn_parking_ratio_for_unit_gsf(p_typology,unit_gsf);
  stalls_prov := coalesce((sk#>>'{parking_seed,stalls_achieved_est}')::int,0);
  stalls_target_max := coalesce((sk#>>'{parking_seed,stalls_target}')::int, ceil(units*pkr));
  stalls_req_initial := ceil(units*pkr);
  stalls_req := stalls_req_initial;
  -- Order-7 fix 1: no parking AT ALL against a real requirement is not a
  -- plan — the search core places real parking or refuses honestly.
  IF stalls_prov = 0 AND stalls_req_initial > 0 THEN
    RETURN public.fn_generate_mf_site_plan_v2_search(p_ogc_fid,p_typology,p_seed,p_pins,p_parent,p_persist,p_context_id); END IF;
  IF stalls_prov < stalls_req THEN
    -- Order-7 fix 2: parking-limited keeps the MASS (capture is the metric)
    -- and reads loud, but units never leave the hard average-unit band.
    parking_limited := true;
    units := GREATEST(
      floor(stalls_prov/pkr),
      ceil(gsf*0.88/coalesce((mb->>'unit_gsf_max')::numeric,1550)));
    unit_gsf := round(gsf*0.88/GREATEST(units,1)); stalls_req := ceil(units*pkr); END IF;
  cap := round(100.0*gsf/NULLIF(max_gsf,0),1);
  IF cap < 55 THEN
    -- Order-7 fix 3: serve the better of the two, never the worse.
    payload := public.fn_generate_mf_site_plan_v2_search(p_ogc_fid,p_typology,p_seed,p_pins,p_parent,p_persist,p_context_id);
    IF coalesce((payload#>>'{metrics,gfa_sqft}')::numeric, 0) >= gsf THEN
      RETURN payload;
    END IF;
    payload := NULL; -- the seed beats the search core here: fall through
  END IF;
  pk_vs_max := round(100.0*stalls_prov/GREATEST(stalls_target_max,1),1);
  pk_vs_placed := round(100.0*stalls_prov/GREATEST(stalls_req_initial,1),1);
  mix := (SELECT jsonb_agg(jsonb_build_object('type',unit_type,'pct',default_mix_pct,'units',floor(units*default_mix_pct/100.0)) ORDER BY u.gsf)
          FROM public.unit_spec u WHERE typology=p_typology);
  basis := format('%s GSF seed plan @ %s st · %s%% of %s max · %s structure(s) · %s units @ ~%s GSF · %s/%s stalls (%s%% of placed need, %s%% of max) · %s · access: %s · generator: seed_v2 · relaxed: none%s',
    gsf, stories, cap, max_gsf, jsonb_array_length(sk->'structures'), units, round(unit_gsf),
    stalls_prov, stalls_req, pk_vs_placed, pk_vs_max,
    coalesce(sk#>>'{parking_seed,strategy}','n/a'),
    CASE WHEN sk ? 'drives' THEN coalesce(sk#>>'{access,side}','lane') || ' lane' ELSE 'skeleton only' END,
    CASE WHEN parking_limited THEN ' · clamp: parking_limited' ELSE '' END);

  IF p_persist THEN
    BEGIN
      ctx := public.fn_resolve_design_context(p_ogc_fid, p_typology);
      SELECT ST_Transform(ST_UnaryUnion(ST_Collect(
               ST_SetSRID(ST_GeomFromGeoJSON((b->'geom_2274')::text),2274))),3857)
        INTO g_b FROM jsonb_array_elements(sk->'structures') b;
      BEGIN
        SELECT ST_Transform(ST_UnaryUnion(ST_Collect(
                 ST_SetSRID(ST_GeomFromGeoJSON((b->'geom_2274')::text),2274))),3857)
          INTO g_p FROM jsonb_array_elements(coalesce(sk#>'{parking_seed,bays}','[]'::jsonb)) b;
      EXCEPTION WHEN others THEN g_p := NULL; END;
      BEGIN
        g_d := ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON((sk#>'{skeleton,spine_2274}')::text),2274),3857);
      EXCEPTION WHEN others THEN g_d := NULL; END;
      INSERT INTO public.siteplanner_session
        (parcel_id, zoning_base, setbacks, context_id, generator_version)
      VALUES (p_ogc_fid::text, NULL,
        jsonb_build_object('front',(ctx#>>'{setbacks,front,value}'),'side',(ctx#>>'{setbacks,side,value}'),
                           'rear',(ctx#>>'{setbacks,rear,value}'),'mode','seed_v2'),
        p_context_id, 'seed_v2')
      RETURNING id INTO v_session;
      INSERT INTO public.siteplanner_candidate
        (session_id, typology, geometry_buildings, geometry_parking, geometry_drives,
         metrics, parent_candidate_id, generator_version, score_total, context_id)
      VALUES (v_session, p_typology,
        ST_Multi(ST_CollectionExtract(g_b,3)),
        CASE WHEN g_p IS NULL THEN NULL ELSE ST_Multi(ST_CollectionExtract(g_p,3)) END,
        CASE WHEN g_d IS NULL THEN NULL ELSE ST_Multi(g_d) END,
        jsonb_build_object('units',units,'gsf',gsf,'stories',stories,'capture_pct',cap,
          'stalls',stalls_prov,'mix',mix,'parking_limited',parking_limited,'plan_basis',basis),
        p_parent, 'seed_v2', LEAST(0.99,cap/100.0), p_context_id)
      RETURNING id INTO v_cand;
      persisted := true;
    EXCEPTION WHEN others THEN perr := SQLERRM; persisted := false; END;
  END IF;

  payload := jsonb_build_object('parcel_ogc_fid',p_ogc_fid,'typology',p_typology,'seed',p_seed,
    'context_id',p_context_id,'generator_version','seed_v2','buildings',blds,
    'parking', jsonb_build_object('bays',coalesce(sk#>'{parking_seed,bays}','[]'::jsonb),
      'stalls',stalls_prov,'stalls_required',stalls_req,
      'stalls_required_at_placed',stalls_req_initial,'stalls_target_at_max',stalls_target_max,
      'pct_of_placed_need',pk_vs_placed,'pct_of_max_need',pk_vs_max,
      'strategy',sk#>>'{parking_seed,strategy}'),
    'drives', coalesce(sk->'drives', jsonb_build_array(sk->'skeleton')),
    'access', sk->'access',
    'metrics', jsonb_build_object('units',units,'gsf',gsf,'stories',stories,'capture_pct',cap,
      'stalls',stalls_prov,'mix',mix,'parking_limited',parking_limited),
    'plan_basis',basis,'flags',jsonb_build_array('seed_v2_deterministic'),
    'score_total',LEAST(0.99,cap/100.0),
    'persisted',persisted,'session_id',v_session,'candidate_id',v_cand,
    'buildability',public.fn_parcel_buildability(p_ogc_fid,p_typology));
  IF perr IS NOT NULL THEN payload := payload || jsonb_build_object('persist_error',perr); END IF;
  RETURN payload;
END $function$;
