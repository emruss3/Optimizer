-- Snapshot of live functions after release g59c (2026-11-27). Source of truth is the database.
-- fn_generate_mf_site_plan_v2_engine is the previous fn_generate_mf_site_plan_v2 (see g58 snapshot), renamed, with its rule list read through fn_mf_layout_rules().
CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
-- g59: engine plan, then the frontage drafter's plan when, counted on one basis (homes the plan's floor area and stalls carry at the code parking ratio),
-- it is at least as many homes, breaks no more layout rules, and is better on homes or on failed checks. mf.frontage_gate = 'off' returns the engine plan.
declare base jsonb; alt jsonb; rules text[]; bchk jsonb; achk jsonb; bu numeric; bur numeric; au numeric; br int; ar int; pers jsonb; fair jsonb; ctx uuid;
begin
  base := public.fn_generate_mf_site_plan_v2_engine(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id);
  if coalesce(nullif(current_setting('mf.frontage_gate', true), ''), 'on') <> 'on' or base is null or base ? 'error' or base ? 'ai_pick'
     or (p_pins is not null and jsonb_typeof(p_pins) = 'array' and jsonb_array_length(p_pins) > 0) or p_parent is not null or coalesce(p_seed, 1) <> 1
     or lower(coalesce(p_typology, 'multifamily')) <> 'multifamily' then return base; end if;
  begin
    ctx := coalesce(nullif(base->>'context_id', '')::uuid, p_context_id);
    alt := public.fn_generate_mf_frontage_plan(p_ogc_fid, 'multifamily', 1, ctx, false);
    if alt is null or alt ? 'error' then return base; end if;
    rules := public.fn_mf_layout_rules();
    bchk := public.fn_mf_design_checks(p_ogc_fid, base); achk := public.fn_mf_design_checks(p_ogc_fid, alt);
    bur := coalesce((base#>>'{metrics,units_est}')::numeric, (base#>>'{metrics,units}')::numeric, 0); au := (alt#>>'{metrics,units}')::numeric;
    fair := public.fn_mf_plan_parked_program(p_ogc_fid, ctx, coalesce((base#>>'{metrics,gfa_sqft}')::numeric, (base#>>'{metrics,gsf}')::numeric),
              coalesce((base#>>'{metrics,stalls}')::numeric, (base#>>'{parking,stalls}')::numeric)::int);
    bu := case when coalesce((fair->>'uzo')::boolean, false) then greatest(coalesce((fair->>'u')::numeric, bur), bur) else coalesce((fair->>'u')::numeric, bur) end;
    br := (select count(*) from jsonb_array_elements_text(coalesce(bchk->'fails', '[]'::jsonb)) f where f = any(rules));
    ar := (select count(*) from jsonb_array_elements_text(coalesce(achk->'fails', '[]'::jsonb)) f where f = any(rules));
    if au >= bu and ar <= br and (au > bu or (achk->>'n_fail')::int < (bchk->>'n_fail')::int) then
      if p_persist then pers := public.fn_mf_persist_plan(p_ogc_fid, (alt->>'context_id')::uuid, alt, 'mf_frontage_v2'); alt := alt || coalesce(pers, '{}'::jsonb); end if;
      return alt || jsonb_build_object('plan_pattern', base->'plan_pattern', 'buildability', base->'buildability',
        'flags', coalesce(alt->'flags', '[]'::jsonb) || jsonb_build_array('engine_default_replaced_by_frontage_plan_v1'),
        'default_replaced', jsonb_build_object('rule', 'homes counted as the plan''s floor area and stalls carry them at the code parking ratio: at least as many homes, no more layout-rule breaks, and more homes or fewer failed checks',
          'engine_generator', base->>'generator_version', 'engine_units_reported', bur, 'engine_units_parked', fair->'u', 'urban_zoning_overlay_no_parking_minimum', fair->'uzo', 'engine_fails', bchk->'fails', 'plan_fails', achk->'fails'));
    end if;
  exception when others then return base; end;
  return base;
end $function$

;

CREATE OR REPLACE FUNCTION public.fn_generate_mf_frontage_plan(p_ogc_fid integer, p_typology text DEFAULT 'multifamily'::text, p_seed integer DEFAULT 1, p_context_id uuid DEFAULT NULL::uuid, p_persist boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- 2026-11-27 frontage drafter v2. Draws to the layout rules instead of being checked against them afterwards:
--   a building bar on a street at the front setback; parking only behind the building line or beside the building,
--   in modules that sit against a building (parking_attached); one driveway, down a side lot line, so nothing is paved
--   between the building and its street (no_pavement_in_front); aisles double-loaded where depth allows (pavement_per_stall).
--   'behind': bar / parking / bar ... up the site.  'side': shallow lots, one parking module beside the bar, its aisle is the driveway.
--   Every street run is tried as the front. Per front the layout with the most homes wins; between fronts the design
--   checks decide (most homes, then fewest failed checks, then floor area). Program numbers come from the planner solver brief.
declare cfg jsonb := (select value from training.ai_config where key = 'mf_frontage_drafter');
  thr jsonb := (select value from training.ai_config where key = 'mf_design_check_thresholds');
  ctx uuid := p_context_id; b jsonb; hc jsonb; mp jsonb; up jsonb; pk jsonb; mbo jsonb; frj jsonb;
  g geometry; c geometry; fe geometry; sts geometry; env geometry; rot float8; lot numeric; frames geometry[] := '{}'; fi int;
  Gr geometry; Sr geometry; Fr geometry; So geometry; Eb geometry; Ep geometry; Gi geometry;
  Db numeric; sd numeric; sw numeric; ai numeric; walk numeric; edge numeric; bmin numeric; bmax numeric; front numeric; mdd numeric; mdh numeric;
  stories int; st_used int; tgt numeric; umin numeric; umax numeric; dcap int; covcap numeric; impcap numeric; kmax int; maxl int;
  xlo numeric; xhi numeric; yf numeric; ypmax numeric; ybmax numeric; y numeric; len numeric; bestlen numeric; yy numeric; i int; k int;
  stack jsonb[]; st jsonb; seqs jsonb[]; nx jsonb; sq jsonb; el jsonb; side text; capped boolean := false; pat text;
  a1 numeric; a2 numeric; r1 numeric; r2 numeric; xc numeric; ytop numeric; connr geometry; conn geometry; Ebc geometry; Epc geometry; Epu geometry; zone geometry;
  bars jsonb; mods jsonb; rws jsonb; ya numeric; aya numeric; ayb numeric; s1 numeric; s2 numeric; n int; ext numeric; rb numeric[];
  zx1 numeric; zx2 numeric; ax1 numeric; rx numeric[]; xx numeric; sgn int;
  fp numeric; gsf numeric; stl int; u int; a numeric; need int; pave numeric; aisle_area numeric; conn_area numeric; uj jsonb;
  best jsonb; cand jsonb; finals jsonb[] := '{}'; sdist numeric; bdist numeric; infront int; nseq int := 0; t0 timestamptz := clock_timestamp(); lasterr text := 'frontage_plan_no_layout';
  fpu numeric; exc numeric; cut numeric; j int; m jsonb; r jsonb; out jsonb; win jsonb; chk jsonb; wchk jsonb; flags jsonb;
  gB geometry; gD geometry; gK geometry; gGreen geometry; bays jsonb; blds jsonb; drv jsonb; q geometry; left_over geometry; dead numeric; pers jsonb; tpl text;
begin
  if ctx is null then ctx := (fn_compile_planner_context(p_ogc_fid, p_typology, '{}'::jsonb)->>'context_id')::uuid; end if;
  b := fn_get_planner_solver_brief(ctx, p_ogc_fid)->'solver_brief';
  if b is null then return jsonb_build_object('error', 'no solver brief'); end if;
  hc := b->'hard_constraints'; mp := b->'massing_program'; up := b->'unit_program'; pk := b->'parking'; mbo := coalesce(mp->'max_buildout', b->'max_buildout');
  select (select dd.geom from st_dump(geom_2274) dd order by st_area(dd.geom) desc limit 1) into g from parcels where ogc_fid = p_ogc_fid;
  if g is null then return jsonb_build_object('error', 'no parcel'); end if;
  lot := st_area(g)::numeric; c := st_centroid(g);
  walk := (cfg->>'walk_ft')::numeric; edge := (cfg->>'parking_edge_buffer_ft')::numeric; bmin := (cfg->>'bar_min_ft')::numeric; bmax := (cfg->>'bar_max_ft')::numeric;
  kmax := (cfg->>'modules_per_group_max')::int; maxl := (cfg->>'max_layouts')::int;
  -- fronts: the street runs on record (the same edges the design checks read), longest first
  frj := fn_parcel_frontage(p_ogc_fid);
  if jsonb_typeof(frj->'streets_geom_2274') = 'object' then sts := st_setsrid(st_geomfromgeojson((frj->'streets_geom_2274')::text), 2274); end if;
  if jsonb_typeof(frj->'segments') = 'array' then
    select coalesce(array_agg(gg order by st_length(gg) desc), '{}') into frames from (
      select (select d.geom from st_dump(st_linemerge(st_setsrid(st_geomfromgeojson((s->'geom_2274')::text), 2274))) d order by st_length(d.geom) desc limit 1) gg from jsonb_array_elements(frj->'segments') s where jsonb_typeof(s->'geom_2274') = 'object') z
      where st_length(gg) >= bmin;
  end if;
  frames := frames[1:(cfg->>'fronts_max')::int];
  -- the planner brief's front edge is tried too when it is not one of those runs
  if jsonb_typeof(b#>'{geometry,front_edge_2274}') = 'object' and not coalesce((b#>>'{geometry,front_edge_is_placeholder}')::boolean, false) then
    fe := (select d.geom from st_dump(st_linemerge(st_setsrid(st_geomfromgeojson((b#>'{geometry,front_edge_2274}')::text), 2274))) d order by st_length(d.geom) desc limit 1);
    if fe is not null and st_length(fe) >= bmin and not exists (select 1 from unnest(frames) f where st_hausdorffdistance(f, fe) < 10) then frames := array_append(frames, fe); end if;
  end if;
  if cardinality(frames) = 0 then return jsonb_build_object('error', 'frontage_plan_needs_a_street_edge'); end if;
  sts := coalesce(sts, st_collect(frames));
  if jsonb_typeof(b#>'{geometry,buildable_envelope}') = 'object' then
    env := st_transform(st_setsrid(st_geomfromgeojson((b#>'{geometry,buildable_envelope}')::text), 4326), 2274); end if;
  if env is null or st_isempty(env) then return jsonb_build_object('error', 'no buildable envelope'); end if;

  Db := coalesce(nullif(mp->>'per_leg_depth_ft','')::numeric, nullif(up->>'implied_bar_depth_ft','')::numeric);
  sd := (pk->>'stall_depth_ft')::numeric; sw := (pk->>'stall_width_ft')::numeric; ai := (pk->>'aisle_width_ft')::numeric;
  front := nullif(hc->>'front_setback_ft','')::numeric;
  stories := nullif(mp->>'stories','')::int; tgt := coalesce(nullif(mp->>'target_gsf','')::numeric, nullif(mbo->>'max_gsf','')::numeric);
  umin := nullif(mbo->>'unit_gsf_min','')::numeric; umax := nullif(mbo->>'unit_gsf_max','')::numeric;
  if Db is null or sd is null or sw is null or ai is null or front is null or stories is null or tgt is null or umin is null or umax is null then
    return jsonb_build_object('error', 'frontage_plan_brief_incomplete'); end if;
  dcap := coalesce(nullif(b#>>'{entitlement_capacity,max_units}','')::int, case when nullif(hc->>'max_density_du_acre','') is not null then floor((hc->>'max_density_du_acre')::numeric * lot / 43560.0)::int end);
  covcap := lot * coalesce(nullif(hc->>'max_building_coverage_pct','')::numeric, nullif(hc->>'max_coverage_pct','')::numeric, 100) / 100.0;
  impcap := coalesce(nullif(hc->>'max_impervious_sqft','')::numeric, lot);
  mdd := sd + ai + sd; mdh := ai + sd;

  for fi in 1..cardinality(frames) loop
    fe := frames[fi]; best := null;
    -- frame: this street runs along +x at the bottom, the site rises in +y
    rot := st_azimuth(st_startpoint(fe), st_endpoint(fe)) - pi()/2;
    if st_y(st_centroid(st_rotate(g, rot, c))) < st_y(st_centroid(st_rotate(fe, rot, c))) then rot := rot + pi(); end if;
    Gr := st_rotate(g, rot, c); Sr := st_rotate(sts, rot, c); Fr := st_rotate(fe, rot, c);
    So := st_difference(Sr, st_buffer(Fr, 5)); if So is null or st_isempty(So) or st_length(So) < bmin then So := null; end if;
    Eb := st_collectionextract(st_makevalid(st_difference(st_rotate(env, rot, c), st_buffer(Sr, front))), 3);
    Gi := st_buffer(Gr, -edge, 'join=mitre');
    Ep := st_collectionextract(st_makevalid(st_difference(Gi, st_buffer(Sr, front))), 3);
    if Eb is null or st_isempty(Eb) or Ep is null or st_isempty(Ep) then lasterr := 'frontage_plan_no_room'; continue; end if;
    xlo := st_xmin(Gr); xhi := st_xmax(Gr); ypmax := st_ymax(Ep); ybmax := st_ymax(Eb);
    -- the front building line: the first line on which a bar gets (nearly) its best length
    bestlen := 0; yf := null;
    for i in 0..floor((cfg->>'front_scan_ft')::numeric / 2)::int loop
      yy := st_ymin(Eb) + i * 2;
      select coalesce(max(st_length(d.geom)), 0) into len from st_dump(fn_xfree(Eb, yy, yy + Db, xlo, xhi)) d;
      if len > bestlen then bestlen := len; end if;
    end loop;
    if bestlen < bmin then lasterr := 'frontage_plan_no_bar_fits'; continue; end if;
    for i in 0..floor((cfg->>'front_scan_ft')::numeric / 2)::int loop
      yy := st_ymin(Eb) + i * 2;
      select coalesce(max(st_length(d.geom)), 0) into len from st_dump(fn_xfree(Eb, yy, yy + Db, xlo, xhi)) d;
      if len >= bestlen * (cfg->>'front_fit_share')::numeric then yf := yy; exit; end if;
    end loop;

    -- template 'behind': bar on the street, then alternating parking groups and bars up the site
    seqs := '{}';
    stack := array[jsonb_build_object('y', yf + Db, 'last', 'B', 'np', 0, 'seq', jsonb_build_array(jsonb_build_object('t', 'B', 'ya', yf)))];
    while cardinality(stack) > 0 loop
      if cardinality(seqs) >= maxl then capped := true; exit; end if;
      st := stack[cardinality(stack)]; stack := stack[1:cardinality(stack) - 1];
      if (st->>'np')::int > 0 then seqs := array_append(seqs, st->'seq'); end if;
      y := (st->>'y')::numeric;
      if st->>'last' = 'B' then
        if y + walk + mdh <= ypmax then
          stack := array_append(stack, jsonb_build_object('y', y + walk + mdh, 'last', 'P', 'np', (st->>'np')::int + 1, 'seq', (st->'seq') || jsonb_build_object('t', 'H', 'ya', y + walk)));
        end if;
        for k in 1..kmax loop
          exit when y + walk + k * mdd > ypmax;
          nx := st->'seq';
          for i in 0..k - 1 loop nx := nx || jsonb_build_object('t', 'M', 'ya', y + walk + i * mdd); end loop;
          stack := array_append(stack, jsonb_build_object('y', y + walk + k * mdd, 'last', 'P', 'np', (st->>'np')::int + 1, 'seq', nx));
        end loop;
      elsif y + walk + Db <= ybmax then
        stack := array_append(stack, jsonb_build_object('y', y + walk + Db, 'last', 'B', 'np', st->'np', 'seq', (st->'seq') || jsonb_build_object('t', 'B', 'ya', y + walk)));
      end if;
    end loop;

    foreach sq in array seqs loop
      select max((e->>'ya')::numeric + case e->>'t' when 'M' then sd + ai else ai end) into ytop from jsonb_array_elements(sq) e where e->>'t' in ('M', 'H');
      foreach side in array array['L', 'R'] loop
        nseq := nseq + 1;
        select st_xmin(d.geom), st_xmax(d.geom) into a1, a2 from st_dump(fn_xfree(Ep, yf, ytop, xlo, xhi)) d order by st_length(d.geom) desc limit 1;
        continue when a1 is null or a2 - a1 < ai + walk + bmin;
        xc := case side when 'L' then a1 else a2 - ai end;
        connr := st_setsrid(st_makeenvelope(xc, st_ymin(Gr) - 1, xc + ai, ytop), 2274);
        conn := (select d.geom from st_dump(st_collectionextract(st_intersection(connr, Gr), 3)) d order by st_area(d.geom) desc limit 1);
        continue when conn is null or st_distance(conn, Fr) > (thr->>'street_touch_ft')::numeric;
        Ebc := st_difference(Eb, st_buffer(connr, walk, 'join=mitre')); Epc := st_difference(Ep, connr); Epu := st_union(Ep, connr);
        bars := '[]'::jsonb; mods := '[]'::jsonb; fp := 0; stl := 0; aisle_area := 0;
        for el in select * from jsonb_array_elements(sq) loop
          ya := (el->>'ya')::numeric;
          if el->>'t' = 'B' then
            select st_xmin(d.geom), st_xmax(d.geom) into r1, r2 from st_dump(fn_xfree(Ebc, ya, ya + Db, xlo, xhi)) d order by st_length(d.geom) desc limit 1;
            len := least(coalesce(r2 - r1, 0), bmax);
            if len < bmin then
              if jsonb_array_length(bars) = 0 then bars := null; exit; end if;
              continue;
            end if;
            if side = 'L' then bars := bars || jsonb_build_array(jsonb_build_array(r1, ya, r1 + len, ya + Db));
            else bars := bars || jsonb_build_array(jsonb_build_array(r2 - len, ya, r2, ya + Db)); end if;
            fp := fp + len * Db;
          else
            if el->>'t' = 'M' then aya := ya + sd; rb := array[ya, ya + sd + ai]; else aya := ya; rb := array[ya + ai]; end if;
            ayb := aya + ai;
            select st_xmin(d.geom), st_xmax(d.geom) into a1, a2 from st_dump(fn_xfree(Epu, aya, ayb, xlo, xhi)) d
              where st_xmin(d.geom) <= xc + ai / 2 and st_xmax(d.geom) >= xc + ai / 2 limit 1;
            continue when a1 is null;
            if side = 'L' then s1 := xc + ai; s2 := a2; else s1 := a1; s2 := xc; end if;
            continue when s2 - s1 < sw;
            rws := '[]'::jsonb; ext := null;
            foreach yy in array rb loop
              select st_xmin(d.geom), st_xmax(d.geom) into r1, r2 from st_dump(fn_xfree(Epc, yy, yy + sd, s1, s2)) d order by st_length(d.geom) desc limit 1;
              n := floor(coalesce(r2 - r1, 0) / sw)::int;
              continue when n < 1;
              if side = 'L' then rws := rws || jsonb_build_array(jsonb_build_array(r1, yy, r1 + n * sw, yy + sd, n)); ext := greatest(coalesce(ext, r1 + n * sw), r1 + n * sw);
              else rws := rws || jsonb_build_array(jsonb_build_array(r2 - n * sw, yy, r2, yy + sd, n)); ext := least(coalesce(ext, r2 - n * sw), r2 - n * sw); end if;
              stl := stl + n;
            end loop;
            continue when jsonb_array_length(rws) = 0;
            if side = 'L' then mods := mods || jsonb_build_array(jsonb_build_object('a', jsonb_build_array(s1, aya, ext, ayb), 'rows', rws)); aisle_area := aisle_area + (ext - s1) * ai;
            else mods := mods || jsonb_build_array(jsonb_build_object('a', jsonb_build_array(ext, aya, s2, ayb), 'rows', rws)); aisle_area := aisle_area + (s2 - ext) * ai; end if;
          end if;
        end loop;
        continue when bars is null or jsonb_array_length(bars) = 0 or jsonb_array_length(mods) = 0 or stl = 0;
        conn_area := st_area(conn);
        gsf := least(least(fp, covcap) * stories, tgt);
        uj := fn_mf_units_for_program(p_typology, gsf, stl, umin, umax, dcap, stories, conn_area + aisle_area, sw * sd, impcap);
        continue when uj is null;
        u := (uj->>'u')::int; a := (uj->>'a')::numeric; need := (uj->>'need')::int; pave := conn_area + aisle_area + need * sw * sd;
        -- a driveway between the bar and another street is pavement in front of that street
        sdist := case when So is null then null else st_distance(connr, So) end;
        bdist := case when So is null then null else st_distance(st_setsrid(st_makeenvelope((bars->0->>0)::numeric, (bars->0->>1)::numeric, (bars->0->>2)::numeric, (bars->0->>3)::numeric), 2274), So) end;
        infront := case when sdist is not null and sdist < bdist and bdist <= front + (thr->>'front_zone_ft')::numeric + ai + walk then 1 else 0 end;
        cand := jsonb_build_object('tpl', 'behind', 'u', u, 'a', a, 'need', need, 'stl', stl, 'pave', round(pave), 'gsf', round(u * a), 'side', side, 'xc', xc, 'bars', bars, 'mods', mods, 'infront', infront, 'rot', rot);
        if best is null or u > (best->>'u')::int
           or (u = (best->>'u')::int and infront < (best->>'infront')::int)
           or (u = (best->>'u')::int and infront = (best->>'infront')::int and round(u * a) > (best->>'gsf')::numeric)
           or (u = (best->>'u')::int and infront = (best->>'infront')::int and round(u * a) = (best->>'gsf')::numeric and round(pave) < (best->>'pave')::numeric) then
          best := cand; end if;
      end loop;
    end loop;

    -- template 'side' (lots too shallow for parking behind, or where it carries more homes): one module beside the bar; its aisle is the driveway
    select st_xmin(d.geom), st_xmax(d.geom) into a1, a2 from st_dump(fn_xfree(Ep, yf, yf + sd, xlo, xhi)) d order by st_length(d.geom) desc limit 1;
    if a1 is not null then
      foreach pat in array array['H', 'M'] loop
        foreach side in array array['L', 'R'] loop
          nseq := nseq + 1; sgn := case side when 'L' then 1 else -1 end;
          continue when a2 - a1 < (case pat when 'M' then mdd else mdh end) + walk + bmin;
          -- strips from the lot line inward: stalls, aisle (and for a full module, stalls again)
          xx := case side when 'L' then a1 else a2 end;
          rx := case pat when 'M' then array[xx, xx + sgn * (sd + ai)] else array[xx] end;
          ax1 := xx + sgn * sd; zx2 := xx + sgn * (case pat when 'M' then mdd else mdh end);
          rws := '[]'::jsonb; stl := 0; ytop := null;
          foreach xx in array rx loop
            s1 := least(xx, xx + sgn * sd); s2 := greatest(xx, xx + sgn * sd);
            select st_xmin(d.geom), st_xmax(d.geom) into r1, r2 from st_dump(fn_xfree(st_flipcoordinates(Ep), s1, s2, yf, ypmax)) d
              where st_xmin(d.geom) <= yf + 1 order by st_length(d.geom) desc limit 1;
            n := floor(coalesce(r2 - r1, 0) / sw)::int;
            continue when n < 1;
            rws := rws || jsonb_build_array(jsonb_build_array(s1, r1, s2, r1 + n * sw, n)); stl := stl + n; ytop := greatest(coalesce(ytop, r1 + n * sw), r1 + n * sw);
          end loop;
          continue when stl = 0;
          s1 := least(ax1, ax1 + sgn * ai); s2 := greatest(ax1, ax1 + sgn * ai);
          connr := st_setsrid(st_makeenvelope(s1, st_ymin(Gr) - 1, s2, ytop), 2274);
          conn := (select d.geom from st_dump(st_collectionextract(st_intersection(connr, Gr), 3)) d order by st_area(d.geom) desc limit 1);
          continue when conn is null or st_distance(conn, Fr) > (thr->>'street_touch_ft')::numeric
                     or st_area(st_difference(st_setsrid(st_makeenvelope(s1, yf, s2, ytop), 2274), Gi)) > 1;
          zone := st_setsrid(st_makeenvelope(least(case side when 'L' then a1 else a2 end, zx2), st_ymin(Gr) - 1, greatest(case side when 'L' then a1 else a2 end, zx2), ypmax + 1), 2274);
          Ebc := st_difference(Eb, st_buffer(zone, walk, 'join=mitre'));
          select st_xmin(d.geom), st_xmax(d.geom) into r1, r2 from st_dump(fn_xfree(Ebc, yf, yf + Db, xlo, xhi)) d order by st_length(d.geom) desc limit 1;
          len := least(coalesce(r2 - r1, 0), bmax);
          continue when len < bmin;
          bars := case side when 'L' then jsonb_build_array(jsonb_build_array(r1, yf, r1 + len, yf + Db)) else jsonb_build_array(jsonb_build_array(r2 - len, yf, r2, yf + Db)) end;
          conn_area := st_area(conn);
          gsf := least(least(len * Db, covcap) * stories, tgt);
          uj := fn_mf_units_for_program(p_typology, gsf, stl, umin, umax, dcap, stories, conn_area, sw * sd, impcap);
          continue when uj is null;
          u := (uj->>'u')::int; a := (uj->>'a')::numeric; need := (uj->>'need')::int; pave := conn_area + need * sw * sd;
          sdist := case when So is null then null else st_distance(zone, So) end;
          bdist := case when So is null then null else st_distance(st_setsrid(st_makeenvelope((bars->0->>0)::numeric, yf, (bars->0->>2)::numeric, yf + Db), 2274), So) end;
          infront := case when sdist is not null and sdist < bdist and bdist <= front + (thr->>'front_zone_ft')::numeric + mdd + walk then 1 else 0 end;
          mods := jsonb_build_array(jsonb_build_object('a', jsonb_build_array(s1, st_ymin(Gr) - 1, s2, ytop), 'rows', rws));
          cand := jsonb_build_object('tpl', 'side', 'u', u, 'a', a, 'need', need, 'stl', stl, 'pave', round(pave), 'gsf', round(u * a), 'side', side, 'bars', bars, 'mods', mods, 'infront', infront, 'rot', rot);
          if best is null or u > (best->>'u')::int
             or (u = (best->>'u')::int and infront < (best->>'infront')::int)
             or (u = (best->>'u')::int and infront = (best->>'infront')::int and round(u * a) > (best->>'gsf')::numeric)
             or (u = (best->>'u')::int and infront = (best->>'infront')::int and round(u * a) = (best->>'gsf')::numeric and round(pave) < (best->>'pave')::numeric) then
            best := cand; end if;
        end loop;
      end loop;
    end if;
    if best is not null then finals := array_append(finals, best); end if;
  end loop;
  if cardinality(finals) = 0 then return jsonb_build_object('error', lasterr, 'layouts_tried', nseq); end if;

  foreach best in array finals loop
    -- trim to what the homes need: rear bars first, then the last stall rows
    u := (best->>'u')::int; a := (best->>'a')::numeric; need := (best->>'need')::int; side := best->>'side'; tpl := best->>'tpl'; rot := (best->>'rot')::float8;
    Gr := st_rotate(g, rot, c);
    bars := best->'bars'; mods := best->'mods'; st_used := stories;
    fp := (select sum(((x->>2)::numeric - (x->>0)::numeric) * Db) from jsonb_array_elements(bars) x);
    while st_used > 1 and (select sum(bmin * Db) from jsonb_array_elements(bars) x) * st_used > u * a and fp * (st_used - 1) >= u * a loop st_used := st_used - 1; end loop;
    fpu := u * a / st_used;
    while jsonb_array_length(bars) > 1 and fp - ((bars->-1->>2)::numeric - (bars->-1->>0)::numeric) * Db >= fpu loop
      fp := fp - ((bars->-1->>2)::numeric - (bars->-1->>0)::numeric) * Db; bars := bars - (jsonb_array_length(bars) - 1); end loop;
    exc := (fp - fpu) / Db;
    for j in reverse jsonb_array_length(bars) - 1..0 loop
      exit when exc <= 0.01;
      r1 := (bars->j->>0)::numeric; r2 := (bars->j->>2)::numeric; cut := least(exc, (r2 - r1) - bmin);
      continue when cut <= 0;
      if side = 'L' then bars := jsonb_set(bars, array[j::text, '2'], to_jsonb(r2 - cut)); else bars := jsonb_set(bars, array[j::text, '0'], to_jsonb(r1 + cut)); end if;
      exc := exc - cut;
    end loop;
    stl := (best->>'stl')::int; exc := stl - need;
    for j in reverse jsonb_array_length(mods) - 1..0 loop
      exit when exc <= 0;
      rws := mods->j->'rows';
      for k in reverse jsonb_array_length(rws) - 1..0 loop
        exit when exc <= 0;
        n := (rws->k->>4)::int; cut := least(exc, n);
        if cut >= n then rws := rws - k;
        elsif tpl = 'side' then rws := jsonb_set(jsonb_set(rws, array[k::text, '3'], to_jsonb((rws->k->>3)::numeric - cut * sw)), array[k::text, '4'], to_jsonb(n - cut::int));
        elsif side = 'L' then rws := jsonb_set(jsonb_set(rws, array[k::text, '2'], to_jsonb((rws->k->>2)::numeric - cut * sw)), array[k::text, '4'], to_jsonb(n - cut::int));
        else rws := jsonb_set(jsonb_set(rws, array[k::text, '0'], to_jsonb((rws->k->>0)::numeric + cut * sw)), array[k::text, '4'], to_jsonb(n - cut::int)); end if;
        exc := exc - cut;
      end loop;
      if jsonb_array_length(rws) = 0 then mods := mods - j;
      else
        if tpl = 'side' then mods := jsonb_set(mods, array[j::text, 'a', '3'], to_jsonb((select max((x->>3)::numeric) from jsonb_array_elements(rws) x)));
        elsif side = 'L' then mods := jsonb_set(mods, array[j::text, 'a', '2'], to_jsonb((select max((x->>2)::numeric) from jsonb_array_elements(rws) x)));
        else mods := jsonb_set(mods, array[j::text, 'a', '0'], to_jsonb((select min((x->>0)::numeric) from jsonb_array_elements(rws) x))); end if;
        mods := jsonb_set(mods, array[j::text, 'rows'], rws);
      end if;
    end loop;
    stl := (select sum((x->>4)::int) from jsonb_array_elements(mods) mm, jsonb_array_elements(mm->'rows') x);

    -- back to the ground
    gB := null; gD := null; gK := null; bays := '[]'::jsonb; blds := '[]'::jsonb; drv := '[]'::jsonb; dead := 0; flags := '["mf_frontage_v2","drawn_to_layout_rules_v1"]'::jsonb;
    for r in select * from jsonb_array_elements(bars) loop
      q := st_rotate(st_setsrid(st_makeenvelope((r->>0)::numeric, (r->>1)::numeric, (r->>2)::numeric, (r->>3)::numeric), 2274), -rot, c);
      gB := case when gB is null then q else st_collect(gB, q) end;
      blds := blds || jsonb_build_array(jsonb_build_object('structure_id', jsonb_array_length(blds) + 1, 'role', case when jsonb_array_length(blds) = 0 then 'street_bar' else 'rear_bar' end,
        'stories', st_used, 'footprint_sqft', round(st_area(q)::numeric), 'gsf', round(st_area(q)::numeric * st_used), 'is_single_polygon', true,
        'length_ft', round((r->>2)::numeric - (r->>0)::numeric), 'depth_ft', Db, 'geom_2274', st_asgeojson(q)::jsonb, 'geom', st_asgeojson(st_transform(q, 4326))::jsonb));
    end loop;
    if tpl = 'behind' then
      xc := (best->>'xc')::numeric; ytop := (select max((mm->'a'->>3)::numeric) from jsonb_array_elements(mods) mm);
      conn := (select d.geom from st_dump(st_collectionextract(st_intersection(st_setsrid(st_makeenvelope(xc, st_ymin(Gr) - 1, xc + ai, ytop), 2274), Gr), 3)) d order by st_area(d.geom) desc limit 1);
      q := st_rotate(conn, -rot, c); gD := q;
      drv := drv || jsonb_build_array(jsonb_build_object('kind', 'access', 'name', 'Driveway', 'lane_ft', ai, 'area_sqft', round(st_area(q)::numeric), 'geom_2274', st_asgeojson(q)::jsonb, 'geom', st_asgeojson(st_transform(q, 4326))::jsonb));
    end if;
    for m in select * from jsonb_array_elements(mods) loop
      r := m->'a';
      if tpl = 'behind' then dead := greatest(dead, (r->>2)::numeric - (r->>0)::numeric); end if;
      q := (select d.geom from st_dump(st_collectionextract(st_intersection(st_setsrid(st_makeenvelope((r->>0)::numeric, (r->>1)::numeric, (r->>2)::numeric, (r->>3)::numeric), 2274), Gr), 3)) d order by st_area(d.geom) desc limit 1);
      q := st_rotate(q, -rot, c); gD := case when gD is null then q else st_union(gD, q) end;
      drv := drv || jsonb_build_array(jsonb_build_object('kind', case tpl when 'side' then 'access' else 'aisle' end, 'name', case tpl when 'side' then 'Driveway and parking aisle' else 'Parking aisle' end,
        'lane_ft', ai, 'area_sqft', round(st_area(q)::numeric), 'geom_2274', st_asgeojson(q)::jsonb, 'geom', st_asgeojson(st_transform(q, 4326))::jsonb));
      for r in select * from jsonb_array_elements(m->'rows') loop
        q := st_rotate(st_setsrid(st_makeenvelope((r->>0)::numeric, (r->>1)::numeric, (r->>2)::numeric, (r->>3)::numeric), 2274), -rot, c);
        gK := case when gK is null then q else st_collect(gK, q) end;
        bays := bays || jsonb_build_array(jsonb_build_object('stalls', (r->>4)::int, 'rows', 1, 'area_sqft', round(st_area(q)::numeric), 'geom_2274', st_asgeojson(q)::jsonb, 'geom', st_asgeojson(st_transform(q, 4326))::jsonb));
      end loop;
    end loop;
    if dead > (thr->>'fire_reach_ft')::numeric then flags := flags || '"dead_end_aisle_over_150ft_turnaround_to_review"'::jsonb; end if;
    if capped then flags := flags || '"layout_enumeration_capped"'::jsonb; end if;
    flags := flags || to_jsonb('template_' || tpl);
    -- land the plan leaves over, behind the street setback, wide enough to use, becomes common green
    left_over := st_difference(st_buffer(g, -edge, 'join=mitre'), st_union(st_buffer(st_union(st_union(st_unaryunion(gB), gD), st_unaryunion(gK)), walk, 'join=mitre'), st_buffer(sts, front)));
    left_over := st_buffer(st_buffer(left_over, -(cfg->>'green_min_width_ft')::numeric / 2, 'join=mitre'), (cfg->>'green_min_width_ft')::numeric / 2, 'join=mitre');
    select st_union(d.geom) into gGreen from st_dump(st_collectionextract(st_makevalid(left_over), 3)) d where st_area(d.geom) >= (cfg->>'green_min_sf')::numeric;

    gsf := (select sum((x->>'gsf')::numeric) from jsonb_array_elements(blds) x);
    pave := st_area(gD) + st_area(st_unaryunion(gK));
    out := jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'typology', p_typology, 'seed', p_seed, 'context_id', ctx,
      'generator_version', 'mf_frontage_v2', 'design_source', 'frontage drafter v2 (drawn to the layout rules)',
      'buildings', blds, 'drives', drv, 'access', jsonb_build_object('side', case side when 'L' then 'left' else 'right' end, 'lane_ft', ai),
      'parking', jsonb_build_object('bays', bays, 'stalls', stl, 'stalls_provided', stl, 'stalls_required', need, 'strategy', case tpl when 'side' then 'surface_beside_building' else 'surface_behind_building' end),
      'greens', case when gGreen is null then '[]'::jsonb else (select jsonb_agg(jsonb_build_object('role', 'common_green', 'name', 'Common green', 'area_sqft', round(st_area(d.geom)::numeric),
          'geom_2274', st_asgeojson(d.geom)::jsonb, 'geom', st_asgeojson(st_transform(d.geom, 4326))::jsonb)) from st_dump(gGreen) d) end,
      'metrics', jsonb_build_object('units', u, 'units_est', u, 'gsf', round(gsf), 'gfa_sqft', round(gsf), 'stories', st_used, 'stalls', stl, 'stalls_required', need,
        'unit_gsf', round(gsf / u), 'far', round(gsf / lot, 2), 'coverage_pct', round(100 * gsf / st_used / lot, 1), 'impervious_sqft', round(gsf / st_used + pave),
        'capture_pct', round(100 * gsf / nullif(tgt, 0), 1), 'parking_limited', (best->>'stl')::int <= need and u < coalesce(dcap, 100000), 'pavement_sf_per_stall', round(pave / nullif(stl, 0))),
      'plan_basis', format('%s GSF frontage plan @ %s st · %s%% of %s max · %s structure(s) · %s units @ ~%s GSF · %s/%s stalls · surface parking %s the building · access: %s side driveway · generator: mf_frontage_v2',
        round(gsf), st_used, round(100 * gsf / nullif(tgt, 0), 1), round(tgt), jsonb_array_length(blds), u, round(gsf / u), stl, need, case tpl when 'side' then 'beside' else 'behind' end, case side when 'L' then 'left' else 'right' end),
      'flags', flags, 'rules', jsonb_build_object('front_setback_ft', front));
    chk := case when cardinality(finals) > 1 then fn_mf_design_checks(p_ogc_fid, out) else null end;
    if win is null or u > (win#>>'{metrics,units}')::int
       or (u = (win#>>'{metrics,units}')::int and coalesce((chk->>'n_fail')::int, 0) < coalesce((wchk->>'n_fail')::int, 0))
       or (u = (win#>>'{metrics,units}')::int and coalesce((chk->>'n_fail')::int, 0) = coalesce((wchk->>'n_fail')::int, 0) and round(gsf) > (win#>>'{metrics,gsf}')::numeric) then
      win := out; wchk := chk; end if;
  end loop;
  win := win || jsonb_build_object('receipts', jsonb_build_object('layouts_tried', nseq, 'fronts_tried', cardinality(frames), 'ms', round(extract(epoch from clock_timestamp() - t0) * 1000)));
  if p_persist then pers := fn_mf_persist_plan(p_ogc_fid, ctx, win, 'mf_frontage_v2'); win := win || coalesce(pers, '{}'::jsonb); end if;
  return win;
end $function$

;

CREATE OR REPLACE FUNCTION public.fn_mf_units_for_program(p_typology text, p_gsf numeric, p_stalls integer, p_umin numeric, p_umax numeric, p_dcap integer, p_stories integer, p_fixed_pave numeric, p_stall_sf numeric, p_impcap numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
-- most homes a floor area and a stall count carry: average unit size inside the hard band, parking at the ratio for that
-- size (fn_parking_ratio_for_unit_gsf), building plus pavement inside the impervious cap. Then the largest unit size the stalls allow.
declare u int; ulo int; uhi int; umid int; a numeric; alo numeric; ahi numeric; amid numeric; need int; i int;
begin
  uhi := least(coalesce(p_dcap, 100000), floor(p_gsf / p_umin)::int);
  loop
    if uhi < 1 then return null; end if;
    ulo := 0;
    while ulo < uhi loop umid := (ulo + uhi + 1) / 2;
      if ceil(umid * fn_parking_ratio_for_unit_gsf(p_typology, p_umin)) <= p_stalls then ulo := umid; else uhi := umid - 1; end if; end loop;
    u := ulo; if u < 1 then return null; end if;
    alo := p_umin; ahi := least(p_umax, p_gsf / u);
    if ceil(u * fn_parking_ratio_for_unit_gsf(p_typology, ahi)) <= p_stalls then a := ahi;
    else for i in 1..12 loop amid := (alo + ahi) / 2;
           if ceil(u * fn_parking_ratio_for_unit_gsf(p_typology, amid)) <= p_stalls then alo := amid; else ahi := amid; end if; end loop;
         a := floor(alo); end if;
    need := ceil(u * fn_parking_ratio_for_unit_gsf(p_typology, a))::int;
    if u * a / p_stories + p_fixed_pave + need * p_stall_sf <= p_impcap then return jsonb_build_object('u', u, 'a', a, 'need', need); end if;
    uhi := u - 1;
  end loop;
end $function$

;

CREATE OR REPLACE FUNCTION public.fn_mf_plan_parked_program(p_ogc_fid integer, p_context_id uuid, p_gsf numeric, p_stalls integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- the homes and floor area a plan's own floor area and stall count carry at the code parking ratio (same count the frontage drafter uses), so two plans are compared on one basis
declare b jsonb := fn_get_planner_solver_brief(p_context_id, p_ogc_fid)->'solver_brief'; mbo jsonb; r jsonb; uzo boolean;
begin
  if b is null or p_gsf is null or p_stalls is null then return null; end if;
  mbo := coalesce(b#>'{massing_program,max_buildout}', b->'max_buildout');
  uzo := exists(select 1 from jurisdiction_overlay o, parcels p where p.ogc_fid = p_ogc_fid and o.overlay_type = 'Urban Zoning Overlay' and st_intersects(st_transform(o.geom, 2274), st_pointonsurface(p.geom_2274)));
  r := fn_mf_units_for_program(coalesce(b->>'typology','multifamily'), p_gsf, p_stalls, (mbo->>'unit_gsf_min')::numeric, (mbo->>'unit_gsf_max')::numeric,
         nullif(b#>>'{entitlement_capacity,max_units}','')::int, 1, 0, 0, 1e12);
  return (case when r is null then jsonb_build_object('u', 0, 'gsf', 0) else r || jsonb_build_object('gsf', round((r->>'u')::numeric * (r->>'a')::numeric)) end) || jsonb_build_object('uzo', uzo);
end $function$

;

CREATE OR REPLACE FUNCTION public.fn_xfree(p_region geometry, p_ya numeric, p_yb numeric, p_xlo numeric, p_xhi numeric)
 RETURNS geometry
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  -- x-intervals (lines on y = 0) over which the full-height rectangle [x] x [ya, yb] lies inside the region
  with strip as (select st_setsrid(st_makeenvelope(p_xlo, p_ya, p_xhi, p_yb), st_srid(p_region)) s),
  bad as (select (st_dump(st_collectionextract(st_difference(s, p_region), 3))).geom g from strip),
  bl as (select st_union(st_makeline(st_makepoint(st_xmin(g) - 0.05, 0), st_makepoint(st_xmax(g) + 0.05, 0))) u from bad where st_area(g) > 0.5)
  select case when p_xhi - p_xlo <= 0 then null else
    st_difference(st_makeline(st_makepoint(p_xlo, 0), st_makepoint(p_xhi, 0)), coalesce((select u from bl), 'LINESTRING EMPTY'::geometry)) end
$function$

;

CREATE OR REPLACE FUNCTION public.fn_mf_layout_rules()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array(select jsonb_array_elements_text(value) from training.ai_config where key = 'mf_seed_layout_rules'), '{}') $function$

;

-- training.ai_config mf_frontage_drafter
-- {"source": "2026-11-27 frontage drafter v1 (owner: generators must design to the layout rules, not be checked afterwards). bar_min_ft/bar_max_ft: fn_mf_solve_core bar_min 40 / bar_max 300. walk_ft: 6-ft walk between a building and parking (same figure as mf_design_check_thresholds attach_gap). parking_edge_buffer_ft: Metro Code 17.24.150, side lines adjacent to parking areas 5 ft minimum (Metro Codes zoning review checklist). front_scan_ft/front_fit_share, modules_per_group_max, max_layouts, green_min_width_ft/green_min_sf: drafter settings. Stall, aisle, bar depth, stories, unit sizes, density, coverage and impervious caps come from the planner solver brief, not from here. fronts_max: every street run is tried as the front, at most this many (drafter setting).", "walk_ft": 6, "bar_max_ft": 300, "bar_min_ft": 40, "fronts_max": 3, "max_layouts": 120, "green_min_sf": 1000, "front_scan_ft": 40, "front_fit_share": 0.9, "green_min_width_ft": 20, "modules_per_group_max": 3, "parking_edge_buffer_ft": 5}
