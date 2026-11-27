-- Snapshot of live multifamily functions after releases g55-g57 and podium_v1 wiring, 2026-11-27.
-- Source of truth is the database (training.fn_engine_drift() empty at export); this file is for review and history.

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
  v_pat jsonb; v_pattern text; v_prefer_court boolean := false;
  v_ctx_res jsonb; v_context_id uuid := p_context_id;
  v_search_gsf numeric; v_seed_gsf numeric;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  -- g56 (2026-11-27): the default apartment plan is the design-model pick when one is on file for this parcel,
  -- context, model and engine version (fn_mf_ai_design; rule in training.ai_config 'mf_ai_default').
  -- Only for a fresh default request (no pins, parent or other seed). 'mf.ai_default_bypass' = 'on' skips it.
  IF coalesce(current_setting('mf.ai_default_bypass', true), '') <> 'on' AND p_pins IS NULL AND p_parent IS NULL
     AND coalesce(p_seed, 1) = 1 AND p_context_id IS NOT NULL AND coalesce(p_typology, 'multifamily') = 'multifamily' THEN
    BEGIN
      payload := public.fn_mf_ai_default_cached(p_ogc_fid, p_context_id);
    EXCEPTION WHEN OTHERS THEN payload := NULL; END;
    IF payload IS NOT NULL THEN RETURN payload; END IF;
    payload := NULL;
  END IF;
  -- access guard (app reply 2026-11-10 §6.4): the same typed access the by-right engines read. No frontage on a street or right-of-way (type none, or only a private lane over
  -- neighbouring parcels) means no multifamily plan by right; pins {"assume_access": true} draws it as a what-if. A failure of the access read never blocks the plan.
  BEGIN
    payload := public.fn_parcel_access(p_ogc_fid);
    IF payload->>'type' IN ('none', 'private_lane') AND jsonb_typeof(p_pins) = 'object' AND coalesce((p_pins->>'require_access')::boolean, false) THEN
      RETURN jsonb_build_object('error', 'no_street_access', 'ogc_fid', p_ogc_fid, 'units', 0, 'access', payload - 'unmapped_row_wkt',
        'reason', 'no multifamily plan by right: ' || (payload->>'message'), 'message', 'no multifamily plan by right: ' || (payload->>'message'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  payload := NULL;
  -- Prefer search-core court/L when plan_pattern asks for a court scheme.
  v_pat := public.fn_plan_pattern(p_ogc_fid, coalesce(p_typology, 'multifamily'));
  IF NOT (v_pat ? 'error') THEN
    v_pattern := coalesce(v_pat->>'pattern', '');
    v_prefer_court := v_pattern IN (
      'court_scheme_perpendicular_bars',
      'court_scheme_easement_access'
    )
    OR (
      coalesce((v_pat#>>'{generator_alignment,aligned}')::boolean, true) = false
      AND position('court' in lower(v_pattern)) > 0
    );
  END IF;

  -- 2026-10-07: a wrap parcel (The Caroline pattern) is drawn by the wrap
  -- generator; if it refuses (the block too small for two bars and a court)
  -- the plan falls through to the court search / seed below.
  IF v_pattern = 'wrap_garage_courtyard' THEN
    payload := public.fn_generate_wrap_site_plan(p_ogc_fid, coalesce(p_typology, 'multifamily'), p_seed, p_context_id);
    IF payload IS NOT NULL AND NOT (payload ? 'error') THEN
      RETURN payload;
    END IF;
    payload := NULL;
  END IF;

  IF v_prefer_court THEN
    IF v_context_id IS NULL THEN
      v_ctx_res := public.fn_compile_planner_context(p_ogc_fid, p_typology, '{}'::jsonb);
      IF v_ctx_res ? 'context_id' THEN
        v_context_id := (v_ctx_res->>'context_id')::uuid;
      END IF;
    END IF;
    IF v_context_id IS NOT NULL THEN
      payload := public.fn_generate_mf_site_plan_v2_search(
        p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, v_context_id
      );
      IF payload IS NOT NULL AND NOT (payload ? 'error') THEN
        -- Tag that court pattern drove search-first (Eric-visible prior).
        payload := payload || jsonb_build_object(
          'plan_pattern', v_pat,
          'pattern_consumed', true,
          'flags', coalesce(payload->'flags', '[]'::jsonb)
            || jsonb_build_array('plan_pattern_court_preferred_over_seed_v2')
        );
        IF payload ? 'buildings' THEN
          payload := jsonb_set(
            payload,
            '{buildings}',
            public.fn_normalize_tip_buildings(payload->'buildings')
          );
        END IF;
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_normalize_tip_site_layers(payload);
        payload := public.fn_honest_plan_pattern_for_tip(payload);
        RETURN payload;
      END IF;
      -- Search failed: fall through to aisle-first seed as relaxation fallback.
    END IF;
  END IF;

  sk := public.fn_seed_parking(p_ogc_fid, p_typology);
  IF sk ? 'error' OR NOT (sk ? 'structures') THEN
    RETURN public.fn_normalize_tip_site_layers(public.fn_generate_mf_site_plan_v2_search(p_ogc_fid,p_typology,p_seed,p_pins,p_parent,p_persist,coalesce(v_context_id,p_context_id))); END IF;
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
  stalls_target_max := coalesce((sk#>>'{parking_seed,stalls_target_at_max}')::int, (sk#>>'{parking_seed,stalls_target}')::int, ceil(units*pkr));
  stalls_req_initial := ceil(units*pkr);
  stalls_req := stalls_req_initial;
  IF stalls_prov = 0 AND stalls_req_initial > 0 THEN
    RETURN public.fn_normalize_tip_site_layers(public.fn_generate_mf_site_plan_v2_search(p_ogc_fid,p_typology,p_seed,p_pins,p_parent,p_persist,coalesce(v_context_id,p_context_id))); END IF;
  IF stalls_prov < stalls_req THEN
    parking_limited := true;
    units := GREATEST(
      floor(stalls_prov/pkr),
      ceil(gsf*0.88/coalesce((mb->>'unit_gsf_max')::numeric,1550)));
    unit_gsf := round(gsf*0.88/GREATEST(units,1)); stalls_req := ceil(units*pkr); END IF;
  cap := round(100.0*gsf/NULLIF(max_gsf,0),1);
  IF cap < 55 THEN
    payload := public.fn_generate_mf_site_plan_v2_search(p_ogc_fid,p_typology,p_seed,p_pins,p_parent,p_persist,coalesce(v_context_id,p_context_id));
    IF coalesce((payload#>>'{metrics,gfa_sqft}')::numeric, 0) >= gsf THEN
      RETURN payload;
    END IF;
    payload := NULL;
  END IF;
  pk_vs_max := round(100.0*stalls_prov/GREATEST(stalls_target_max,1),1);
  pk_vs_placed := round(100.0*stalls_prov/GREATEST(stalls_req_initial,1),1);
  mix := (SELECT jsonb_agg(jsonb_build_object('type',unit_type,'pct',default_mix_pct,'units',floor(units*default_mix_pct/100.0)) ORDER BY u.gsf)
          FROM public.unit_spec u WHERE typology=p_typology);
  basis := format('%s GSF seed plan @ %s st · %s%% of %s max · %s structure(s) · %s units @ ~%s GSF · %s/%s stalls (%s%% of placed need, %s%% of max) · %s · access: %s · generator: seed_v2 · relaxed: none%s%s',
    gsf, stories, cap, max_gsf, jsonb_array_length(sk->'structures'), units, round(unit_gsf),
    stalls_prov, stalls_req, pk_vs_placed, pk_vs_max,
    coalesce(sk#>>'{parking_seed,strategy}','n/a'),
    CASE WHEN sk ? 'drives' THEN coalesce(sk#>>'{access,side}','lane') || ' lane' ELSE 'skeleton only' END,
    CASE WHEN parking_limited THEN ' · clamp: parking_limited' ELSE '' END,
    CASE WHEN v_prefer_court THEN ' · court_pattern_seed_fallback' ELSE '' END);

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
        coalesce(v_context_id, p_context_id), 'seed_v2')
      RETURNING id INTO v_session;
      INSERT INTO public.siteplanner_candidate
        (session_id, typology, geometry_buildings, geometry_parking, geometry_drives,
         metrics, parent_candidate_id, generator_version, score_total, context_id)
      VALUES (v_session, p_typology,
        ST_Multi(ST_CollectionExtract(g_b,3)),
        CASE WHEN g_p IS NULL THEN NULL ELSE ST_Multi(ST_CollectionExtract(g_p,3)) END,
        CASE WHEN g_d IS NULL THEN NULL ELSE ST_Multi(g_d) END,
        jsonb_build_object('units',units,'gsf',gsf,'stories',stories,'capture_pct',cap,
          'stalls',stalls_prov,'mix',mix,'parking_limited',parking_limited,'plan_basis',basis,
          'plan_pattern', v_pat, 'pattern_consumed', false,
          'seed_fallback_after_court_prefer', v_prefer_court),
        p_parent, 'seed_v2', LEAST(0.99,cap/100.0), coalesce(v_context_id, p_context_id))
      RETURNING id INTO v_cand;
      persisted := true;
    EXCEPTION WHEN others THEN perr := SQLERRM; persisted := false; END;
  END IF;

  payload := jsonb_build_object('parcel_ogc_fid',p_ogc_fid,'typology',p_typology,'seed',p_seed,
    'context_id',coalesce(v_context_id,p_context_id),'generator_version','seed_v2','buildings',blds,
    'parking', jsonb_build_object('bays',coalesce(sk#>'{parking_seed,bays}','[]'::jsonb),
      'stalls',stalls_prov,'stalls_required',stalls_req,
      'stalls_required_at_placed',stalls_req_initial,'stalls_target_at_max',stalls_target_max,
      'pct_of_placed_need',pk_vs_placed,'pct_of_max_need',pk_vs_max,
      'strategy',sk#>>'{parking_seed,strategy}'),
    'drives', coalesce(sk->'drives', jsonb_build_array(sk->'skeleton')),
    'access', sk->'access',
    'metrics', jsonb_build_object('units',units,'gsf',gsf,'stories',stories,'capture_pct',cap,
      'stalls',stalls_prov,'mix',mix,'parking_limited',parking_limited),
    'plan_basis',basis,
    'plan_pattern', v_pat,
    'pattern_consumed', false,
    'flags',jsonb_build_array('seed_v2_deterministic')
      || CASE WHEN v_prefer_court THEN jsonb_build_array('court_pattern_seed_fallback_after_search') ELSE '[]'::jsonb END,
    'score_total',LEAST(0.99,cap/100.0),
    'persisted',persisted,'session_id',v_session,'candidate_id',v_cand,
    'buildability',public.fn_parcel_buildability(p_ogc_fid,p_typology));
  IF perr IS NOT NULL THEN payload := payload || jsonb_build_object('persist_error',perr); END IF;
  IF payload ? 'buildings' THEN
    payload := jsonb_set(
      payload,
      '{buildings}',
      public.fn_normalize_tip_buildings(payload->'buildings')
    );
  END IF;
  payload := public.fn_honest_plan_pattern_for_tip(payload);
        payload := public.fn_normalize_tip_site_layers(payload);
  RETURN payload;
END $function$
;

CREATE OR REPLACE FUNCTION public.fn_generate_podium_site_plan(p_ogc_fid integer, p_typology text DEFAULT 'multifamily'::text, p_seed integer DEFAULT 1, p_context_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
-- 2026-11-27 podium drafter v1 (not wired to the default yet): residential bars over a one-level concrete podium
-- that holds the garage, with a courtyard on the podium deck. Form, caps, unit size and market parking ratio from the
-- planner solver brief; drafter parameters from training.ai_config 'mf_podium' (sources there). Inside the Urban
-- Zoning Overlay there is no legal parking minimum, so parking is provided toward the market ratio but does not cap homes.
declare cfg jsonb := (select value from training.ai_config where key = 'mf_podium');
  ctx uuid := p_context_id; b jsonb; hc jsonb; mp jsonb; up jsonb; site jsonb; g geometry; env geometry; sts geometry; P geometry; R geometry;
  court geometry; inr geometry; apron geometry; lot numeric; covcap numeric; lo numeric; hi numeric; mid numeric; i int;
  D numeric; cmin numeric; ctype text; mm text[]; res_lv int; pod_lv int; stories int; gsf numeric; maxgfa numeric; ugsf numeric; ntg numeric;
  units int; dcap numeric; ratio numeric; per_lv int; ground int; below int; stalls int; target int; legal int; uzo boolean; flags jsonb := '[]'::jsonb;
  out jsonb; fr jsonb; parking_limited boolean := false; aP numeric; aR numeric; aC numeric;
begin
  if ctx is null then ctx := (fn_compile_planner_context(p_ogc_fid, p_typology, '{}'::jsonb)->>'context_id')::uuid; end if;
  b := fn_get_planner_solver_brief(ctx, p_ogc_fid)->'solver_brief';
  if b is null then return jsonb_build_object('error', 'no solver brief'); end if;
  hc := b->'hard_constraints'; mp := b->'massing_program'; up := b->'unit_program';
  select (select dd.geom from st_dump(geom_2274) dd order by st_area(dd.geom) desc limit 1) into g from parcels where ogc_fid = p_ogc_fid;
  lot := st_area(g)::numeric;
  site := training.fn_mfgen_site(p_ogc_fid, p_typology, ctx);
  env := st_setsrid(st_geomfromtext(site->>'envelope_wkt'), 2274);
  if env is null or st_isempty(env) then return jsonb_build_object('error', 'no buildable envelope'); end if;
  env := (select dd.geom from st_dump(st_collectionextract(st_makevalid(env), 3)) dd order by st_area(dd.geom) desc limit 1);
  fr := fn_parcel_frontage(p_ogc_fid);
  if jsonb_typeof(fr->'streets_geom_2274') = 'object' then sts := st_setsrid(st_geomfromgeojson((fr->'streets_geom_2274')::text), 2274); end if;
  uzo := exists(select 1 from jurisdiction_overlay o where o.overlay_type = 'Urban Zoning Overlay' and st_intersects(st_transform(o.geom, 2274), st_pointonsurface(g)));

  -- front setback from the brief, measured from the street line (the envelope alone left 16 ft on 408219)
  if sts is not null and nullif(hc->>'front_setback_ft','') is not null then
    env := (select dd.geom from st_dump(st_collectionextract(st_makevalid(st_difference(env, st_buffer(sts, (hc->>'front_setback_ft')::numeric))), 3)) dd order by st_area(dd.geom) desc limit 1);
  end if;
  covcap := lot * coalesce((hc->>'max_building_coverage_pct')::numeric, (hc->>'max_coverage_pct')::numeric, 100) / 100.0;
  P := env;
  if st_area(env) > covcap then
    if sts is not null then
      lo := 0; hi := 2000;
      for i in 1..30 loop mid := (lo + hi) / 2;
        if st_area(st_intersection(env, st_buffer(sts, mid, 'endcap=flat join=mitre'))) > covcap then hi := mid; else lo := mid; end if; end loop;
      P := st_intersection(env, st_buffer(sts, lo, 'endcap=flat join=mitre'));
      flags := flags || '"podium_cut_to_building_coverage_from_rear"'::jsonb;
    else
      lo := 0; hi := 500;
      for i in 1..30 loop mid := (lo + hi) / 2; if st_area(st_buffer(env, -mid, 'join=mitre')) > covcap then lo := mid; else hi := mid; end if; end loop;
      P := st_buffer(env, -hi, 'join=mitre');
      flags := flags || '"podium_inset_to_building_coverage_no_street_line"'::jsonb;
    end if;
    P := (select dd.geom from st_dump(st_collectionextract(st_makevalid(P), 3)) dd order by st_area(dd.geom) desc limit 1);
  end if;
  if P is null or st_area(P) < 4000 then return jsonb_build_object('error', 'podium_site_too_small', 'podium_sf', round(coalesce(st_area(P),0)::numeric)); end if;

  D := coalesce((mp->>'per_leg_depth_ft')::numeric, (up->>'implied_bar_depth_ft')::numeric);
  cmin := (cfg->>'court_min_ft')::numeric;
  -- every residential point within half a bar depth of a lit edge (outside wall or deck courtyard);
  -- what is left of the podium is open deck. Courtyards narrower than court_min are not counted as lit edges.
  inr := st_buffer(P, -D, 'join=mitre');
  court := null;
  if inr is not null and not st_isempty(inr) then
    court := st_buffer(st_buffer(inr, -cmin/2, 'join=mitre'), cmin/2, 'join=mitre');
    if court is not null and (st_isempty(court) or st_area(court) < cmin*cmin) then court := null; end if;
  end if;
  R := st_collectionextract(st_makevalid(st_intersection(P, st_buffer(st_collect(array_remove(array[st_boundary(P), st_boundary(court)], null)), D/2, 'join=mitre'))), 3);
  R := st_collectionextract(st_makevalid(st_difference(R, coalesce(court, st_setsrid('POLYGON EMPTY'::geometry, 2274)))), 3);
  court := st_collectionextract(st_makevalid(st_difference(P, R)), 3);
  if court is not null and st_isempty(court) then court := null; end if;
  -- deck pieces narrower than court_min (slits between back-to-back bars) are widened to court_min;
  -- the residential area gives up that space, so every bar keeps a real lit courtyard edge.
  if court is not null then
    select st_collectionextract(st_makevalid(st_intersection(P, st_unaryunion(st_collect(
             case when st_isempty(st_buffer(q.geom, -cmin/2, 'join=mitre'))
                  then st_buffer(q.geom, greatest(0, cmin/2 - st_area(q.geom) / greatest(st_perimeter(q.geom), 1)), 'join=mitre')
                  else q.geom end)))), 3)
      into court from st_dump(court) q where st_area(q.geom) / greatest(st_perimeter(q.geom), 1) >= 0.5;  -- hairline slivers (under ~1 ft wide) stay residential
    R := st_collectionextract(st_makevalid(st_difference(P, court)), 3);
    R := (select st_unaryunion(st_collect(q.geom)) from st_dump(R) q where st_area(q.geom) >= D * D);
    if court is not null and st_area(court) < cmin*cmin then flags := flags || '"podium_deck_smaller_than_court_min"'::jsonb; end if;
  end if;
  aP := st_area(P)::numeric;
  aP := st_area(P)::numeric; aR := st_area(R)::numeric; aC := coalesce(st_area(court), 0)::numeric;

  ctype := mp#>>'{construction_type,type}';
  mm := regexp_match(coalesce(ctype, ''), '(\d+)_over_(\d+)');
  stories := coalesce((mp->>'stories')::int, 1);
  pod_lv := coalesce(mm[2]::int, 1);
  res_lv := greatest(1, stories - pod_lv);
  gsf := aR * res_lv;
  maxgfa := nullif(b#>>'{entitlement_capacity,max_gfa_sqft}', '')::numeric;
  if maxgfa is null then maxgfa := nullif(mp#>>'{max_buildout,entitlement_capacity,max_gfa_sqft}', '')::numeric; end if;
  if maxgfa is not null and gsf > maxgfa then gsf := maxgfa; flags := flags || '"residential_gfa_capped_at_far"'::jsonb; end if;
  ugsf := coalesce((up->>'weighted_unit_gsf')::numeric, 1000);
  ntg := (cfg->>'net_to_gross')::numeric;
  units := floor(gsf * ntg / ugsf);
  if nullif(hc->>'max_density_du_acre','') is not null then
    dcap := floor((hc->>'max_density_du_acre')::numeric * lot / 43560.0);
    if units > dcap then units := dcap; flags := flags || '"units_capped_at_density"'::jsonb; end if;
  end if;

  ratio := coalesce((up->>'weighted_parking_ratio')::numeric, (b#>>'{parking,ratio}')::numeric);
  per_lv := floor(aP / (cfg->>'garage_sf_per_stall')::numeric);
  ground := floor(per_lv * (cfg->>'ground_garage_share')::numeric);
  target := ceil(units * ratio);
  below := least((cfg->>'below_grade_levels_max')::int, greatest(0, ceil((target - ground)::numeric / greatest(per_lv, 1)))::int);
  stalls := least(target, ground + below * per_lv);
  legal := case when uzo then ceil(units * (cfg->>'uzo_parking_min_per_unit')::numeric) else target end;
  if stalls < legal then
    units := floor(stalls / ratio); parking_limited := true; gsf := least(gsf, units * ugsf / ntg); legal := ceil(units * ratio); target := legal;
    flags := flags || '"units_limited_by_structured_parking_outside_uzo"'::jsonb;
  elsif stalls < target then flags := flags || '"parking_below_market_ratio_no_legal_minimum_uzo"'::jsonb;
  end if;

  if sts is not null then
    apron := st_buffer(st_shortestline(st_boundary(P), sts), (cfg->>'drive_width_ft')::numeric / 2, 'endcap=flat');
    apron := st_collectionextract(st_intersection(st_difference(apron, P), st_buffer(g, 1)), 3);
  end if;

  out := jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'typology', p_typology, 'seed', p_seed, 'context_id', ctx,
    'generator_version', 'podium_v1', 'design_source', 'podium drafter v1 (structured parking in the building)',
    -- one record per building piece, each standing over the garage (the app draws the podium levels as parking);
    -- the garage under the deck courtyard is part of the podium and shows through the deck green
    'buildings', (select coalesce(jsonb_agg(jsonb_build_object('structure_id', coalesce(q.path[1], 1), 'role', 'residential_over_podium', 'stories', stories,
         'residential_levels', res_lv, 'podium_levels', pod_lv, 'over_garage', true,
         'footprint_sqft', round(st_area(q.geom)::numeric), 'gsf', round(gsf * st_area(q.geom)::numeric / aR),
         'geom_2274', st_asgeojson(q.geom)::jsonb, 'geom', st_asgeojson(st_transform(q.geom, 4326))::jsonb) order by q.path[1]), '[]'::jsonb)
       from st_dump(R) q),
    'parking', jsonb_build_object('bays', '[]'::jsonb, 'structured', true, 'stalls', stalls, 'stalls_required', legal, 'market_target', target,
       'ground_level_stalls', ground, 'levels_below_grade', below, 'stalls_per_level', per_lv, 'strategy', 'podium_garage',
       'legal_basis', case when uzo then 'Urban Zoning Overlay: no minimum (Metro 2022); stalls toward market ratio ' || ratio else 'Table 17.20.030 minimum at ratio ' || ratio end),
    'drives', case when apron is not null and not st_isempty(apron) then jsonb_build_array(jsonb_build_object('role', 'garage_entry',
       'geom_2274', st_asgeojson(apron)::jsonb, 'geom', st_asgeojson(st_transform(apron, 4326))::jsonb)) else '[]'::jsonb end,
    'greens', case when court is not null then jsonb_build_array(jsonb_build_object('role', 'podium_deck_courtyard', 'area_sqft', round(aC),
       'geom_2274', st_asgeojson(court)::jsonb, 'geom', st_asgeojson(st_transform(court, 4326))::jsonb)) else '[]'::jsonb end,
    'metrics', jsonb_build_object('units', units, 'gsf', round(gsf), 'stories', stories, 'stalls', stalls, 'stalls_required', legal,
       'far', round(gsf / lot, 2), 'building_coverage_pct', round(100 * aP / lot, 1), 'unit_gsf', ugsf, 'parking_limited', parking_limited, 'uzo', uzo),
    'plan_basis', format('%s GSF podium plan @ %s st (%s over %s podium) · %s units @ ~%s GSF · %s/%s stalls (market target %s; %s below-grade level%s) · coverage %s%% · FAR %s · generator: podium_v1',
       round(gsf), stories, res_lv, pod_lv, units, round(ugsf), stalls, legal, target, below, case when below = 1 then '' else 's' end, round(100 * aP / lot), round(gsf / lot, 2)),
    'flags', flags, 'rules', jsonb_build_object('front_setback_ft', hc->'front_setback_ft'));
  return out;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_mf_ai_default_cached(p_ogc_fid integer, p_context_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.plan || jsonb_build_object('ai_pick', c.summary || jsonb_build_object('cached', true))
  from training.mf_ai_design_cache c, training.ai_config a
  where a.key = 'mf_ai_default' and coalesce((a.value->>'enabled')::boolean, false)
    and c.fid = p_ogc_fid and c.context_id = p_context_id and c.model_version = a.value->>'model_version'
    and c.picked in ('model', 'podium') and c.engine_md5 = public.fn_mf_engine_md5()
  order by c.created_at desc limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mf_ai_design(p_ogc_fid integer, p_n integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- 2026-11-27: the apartment default is the better of the engine's own plan and the design model's plans.
-- Rule and n from training.ai_config 'mf_ai_default' (the review-set test rule). Result cached per
-- parcel, planner context, model version and engine version in training.mf_ai_design_cache.
declare cfg jsonb := coalesce((select value from training.ai_config where key = 'mf_ai_default'), '{}'::jsonb);
  n int := coalesce(p_n, (cfg->>'n_designs')::int, 6); tol numeric := coalesce((cfg->>'units_within')::numeric, 0.98);
  cx jsonb; ctx uuid; em text; c record; t0 timestamptz := clock_timestamp();
  dplan jsonb; dchk jsonb; pod jsonb; pr jsonb; d jsonb; rr jsonb; cands jsonb := '[]'::jsonb; umax numeric; win jsonb; plan jsonb; mv text; p2 jsonb; summ jsonb;
begin
  perform set_config('statement_timeout', '140s', true);
  if not coalesce((cfg->>'enabled')::boolean, false) then return jsonb_build_object('error', 'ai default disabled'); end if;
  cx := fn_compile_planner_context(p_ogc_fid, 'multifamily', '{}'::jsonb);
  if cx->>'context_id' is null then return jsonb_build_object('error', coalesce(cx->>'error', 'no planner context')); end if;
  ctx := (cx->>'context_id')::uuid; em := fn_mf_engine_md5();
  select * into c from training.mf_ai_design_cache
   where fid = p_ogc_fid and context_id = ctx and engine_md5 = em and model_version = cfg->>'model_version'
   order by created_at desc limit 1;
  if found then return c.plan || jsonb_build_object('ai_pick', c.summary || jsonb_build_object('cached', true)); end if;

  -- engine default (bypass the cache hook so this is the engine's own plan)
  perform set_config('mf.ai_default_bypass', 'on', true);
  begin dplan := fn_generate_mf_site_plan_v2(p_ogc_fid, 'multifamily', 1, null, null, false, ctx);
  exception when others then dplan := jsonb_build_object('error', sqlerrm); end;
  perform set_config('mf.ai_default_bypass', '', true);
  dchk := fn_mf_design_checks(p_ogc_fid, dplan);
  cands := jsonb_build_array(jsonb_build_object('k', 0, 'source', 'engine', 'units', coalesce((dplan#>>'{metrics,units_est}')::numeric, (dplan#>>'{metrics,units}')::numeric, 0),
             'n_fail', coalesce((dchk->>'n_fail')::int, 99), 'fails', dchk->'fails'));

  pr := fn_mf_ai_propose(p_ogc_fid, n);
  mv := pr->>'model_version';
  for d in select value from jsonb_array_elements(case when pr ? 'error' then '[]'::jsonb else coalesce(pr->'designs', '[]'::jsonb) end) loop
    begin rr := fn_mf_ai_realize(p_ogc_fid, ctx, d->'massing'); exception when others then rr := jsonb_build_object('error', sqlerrm); end;
    if rr ? 'plan' then
      cands := cands || jsonb_build_object('k', (d->>'k')::int, 'source', 'model', 'regime', rr#>>'{plan,regime}',
        'units', coalesce((rr#>>'{plan,metrics,units_est}')::numeric, (rr#>>'{plan,metrics,units}')::numeric, 0),
        'n_fail', coalesce((rr#>>'{checks,n_fail}')::int, 99), 'fails', rr#>'{checks,fails}', 'massing', d->'massing');
    end if;
  end loop;
  -- podium drafter (owner go-ahead 2026-11-27): competes on Urban Zoning Overlay parcels whose solver brief
  -- calls for structured parking (training.ai_config mf_podium; brief parking.strategy).
  begin
    if (fn_get_planner_solver_brief(ctx, p_ogc_fid)#>>'{solver_brief,parking,strategy}') = 'structured' then
      pod := fn_generate_podium_site_plan(p_ogc_fid, 'multifamily', 1, ctx);
      if not (pod ? 'error') and coalesce((pod#>>'{metrics,uzo}')::boolean, false) then
        rr := fn_mf_design_checks(p_ogc_fid, pod);
        cands := cands || jsonb_build_object('k', 100, 'source', 'podium', 'regime', 'podium_v1',
          'units', coalesce((pod#>>'{metrics,units}')::numeric, 0), 'n_fail', coalesce((rr->>'n_fail')::int, 99), 'fails', rr->'fails');
      end if;
    end if;
  exception when others then pod := null; end;
  select max((x->>'units')::numeric) into umax from jsonb_array_elements(cands) x;
  select x into win from jsonb_array_elements(cands) x
   where (x->>'units')::numeric >= tol * umax
   order by (x->>'n_fail')::int, (x->>'source') <> 'engine', (x->>'units')::numeric desc limit 1;

  if win->>'source' = 'model' then
    -- re-solve the winner with persistence so pins and edits work on it
    perform set_config('mf.massing_override', (win->'massing')::text, true);
    begin p2 := fn_mf_solve_core(p_ogc_fid, 'multifamily', 1, null, null, true, ctx, win->>'regime');
    exception when others then p2 := jsonb_build_object('error', sqlerrm); end;
    perform set_config('mf.massing_override', '', true);
    if p2 ? 'error' then
      rr := fn_mf_ai_realize(p_ogc_fid, ctx, win->'massing'); plan := rr->'plan';
    else
      plan := fn_normalize_tip_site_layers(p2 || jsonb_build_object('regime', win->>'regime', 'model_massing', win->'massing'));
    end if;
    plan := plan || jsonb_build_object('design_source', 'design model ' || mv || ', picked over the engine default',
              'flags', coalesce(plan->'flags', '[]'::jsonb) || jsonb_build_array('ai_default_model_pick'));
  elsif win->>'source' = 'podium' then
    plan := pod || fn_mf_persist_plan(p_ogc_fid, ctx, pod, 'podium_v1');
    plan := plan || jsonb_build_object('design_source', 'podium drafter v1 (structured parking), picked over the engine default',
              'flags', coalesce(plan->'flags', '[]'::jsonb) || jsonb_build_array('ai_default_podium_pick'));
  else
    plan := dplan;
  end if;
  summ := jsonb_build_object('picked', win->>'source', 'model_version', mv, 'rule', 'within ' || tol || ' of most homes, then fewest failed checks; ties to engine',
            'rule_source', 'training.ai_config mf_ai_default',
            'engine', jsonb_build_object('units', cands->0->'units', 'n_fail', cands->0->'n_fail', 'fails', cands->0->'fails'),
            'winner', jsonb_build_object('units', win->'units', 'n_fail', win->'n_fail', 'fails', win->'fails', 'regime', win->'regime'),
            'n_model_designs', (select count(*) from jsonb_array_elements(cands) x where x->>'source' = 'model'),
            'model_error', pr->>'error',
            'candidates', (select jsonb_agg(x - 'massing') from jsonb_array_elements(cands) x),
            'seconds', round(extract(epoch from clock_timestamp() - t0)::numeric, 1));
  if mv is not null then
    update training.ai_config set value = value || jsonb_build_object('model_version', mv) where key = 'mf_ai_default' and value->>'model_version' is distinct from mv;
    insert into training.mf_ai_design_cache(fid, context_id, model_version, engine_md5, picked, plan, summary, seconds)
      values (p_ogc_fid, ctx, mv, em, win->>'source', plan, summ, (summ->>'seconds')::numeric)
      on conflict (fid, context_id, model_version, engine_md5) do update set picked = excluded.picked, plan = excluded.plan, summary = excluded.summary, seconds = excluded.seconds, created_at = now();
  end if;
  return plan || jsonb_build_object('ai_pick', summ);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_mf_design_checks(p_fid integer, p_plan jsonb, p_cap integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare t jsonb := (select value from training.ai_config where key = 'mf_design_check_thresholds');
  parcel geometry; A numeric; sts geometry; fr jsonb; B geometry; pave geometry; park geometry; green geometry; net geometry;
  res jsonb := '{}'::jsonb; front numeric; units numeric; cap numeric; d numeric; tot numeric := 0; faced numeric := 0;
  core geometry; U geometry; empty geometry; big numeric; far geometry; sh numeric; pa numeric := 0; fa numeric := 0;
  st int; rq int; m jsonb; worst numeric; acc geometry; p geometry; ln geometry; n int; i int; mm text[];
begin
  select (select dd.geom from st_dump(geom_2274) dd order by st_area(dd.geom) desc limit 1) into parcel from parcels where ogc_fid = p_fid;
  if parcel is null then return jsonb_build_object('error','no parcel'); end if;
  A := st_area(parcel);
  if p_plan is null or p_plan ? 'error' or jsonb_array_length(coalesce(p_plan->'buildings','[]'::jsonb)) = 0 then
    return jsonb_build_object('checks', jsonb_build_object('plan_produced', jsonb_build_object('ok', false, 'val', coalesce(p_plan->>'error','no buildings'))),
                              'fails', jsonb_build_array('plan_produced'), 'n_fail', 1);
  end if;
  res := res || jsonb_build_object('plan_produced', jsonb_build_object('ok', true, 'val', 'ok'));
  fr := fn_parcel_frontage(p_fid);
  if jsonb_typeof(fr->'streets_geom_2274') = 'object' then sts := st_setsrid(st_geomfromgeojson((fr->'streets_geom_2274')::text), 2274); end if;
  B := fn_plan_layer_2274(p_plan->'buildings'); pave := fn_plan_layer_2274(p_plan->'drives'); park := fn_plan_layer_2274(p_plan#>'{parking,bays}');
  green := st_unaryunion(st_collect(array_remove(array[fn_plan_layer_2274(p_plan->'greens'), fn_plan_layer_2274(p_plan->'amenity')], null)));
  net := st_unaryunion(st_collect(array_remove(array[pave, park], null)));
  m := coalesce(p_plan->'metrics','{}'::jsonb);
  front := coalesce(nullif(p_plan#>>'{rules,front_setback_ft}','')::numeric, (t->>'default_front_setback_ft')::numeric);
  -- 1 units against the by-right maximum
  units := coalesce(nullif(m->>'units_est','')::numeric, nullif(m->>'units','')::numeric);
  cap := coalesce(p_cap, (select greatest(nullif(mb->>'units_at_max','')::numeric, nullif(mb#>>'{program_frontier,units_max_option,units}','')::numeric) from (select fn_max_buildout(p_fid) mb) x));
  res := res || jsonb_build_object('units_vs_by_right', case when cap > 0 and units is not null
           then jsonb_build_object('ok', units / cap >= (t->>'units_share')::numeric, 'val', format('%s of %s', units, cap))
           else jsonb_build_object('ok', null, 'val', 'no by-right figure') end);
  -- 2 drive reaches a street (parking counts for apartments)
  if sts is null then res := res || jsonb_build_object('drive_reaches_street', jsonb_build_object('ok', null, 'val', 'no street edge on record'));
  elsif net is null then res := res || jsonb_build_object('drive_reaches_street', jsonb_build_object('ok', false, 'val', 'no drives drawn'));
  else d := st_distance(net, sts); res := res || jsonb_build_object('drive_reaches_street', jsonb_build_object('ok', d <= (t->>'street_touch_ft')::numeric, 'val', round(d)||' ft')); end if;
  -- 3 buildings face the streets
  if sts is not null and B is not null then
    for ln in select (st_dump(st_linemerge(st_collectionextract(sts,2)))).geom loop
      n := greatest(2, floor(st_length(ln) / 10)::int);
      for i in 0..n-1 loop
        p := st_lineinterpolatepoint(ln, (i + 0.5) / n); tot := tot + st_length(ln) / n;
        if st_distance(B, p) <= front + (t->>'front_zone_ft')::numeric then faced := faced + st_length(ln) / n; end if;
      end loop;
    end loop;
    sh := case when tot > 0 then faced / tot else 0 end;
    res := res || jsonb_build_object('buildings_face_streets', jsonb_build_object('ok', sh >= (t->>'street_wall_share')::numeric, 'val', round(100*sh)||'% of '||round(tot)||' ft'));
  else res := res || jsonb_build_object('buildings_face_streets', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
  -- 4 parking not between the street and the buildings
  if park is not null and B is not null and sts is not null then
    for p in select (st_dump(park)).geom loop
      pa := pa + st_area(p);
      if st_distance(st_pointonsurface(p), sts) < (select st_distance(b.geom, sts) from st_dump(B) b order by st_distance(b.geom, st_pointonsurface(p)) limit 1)
         and st_distance(st_pointonsurface(p), sts) <= front + (t->>'front_zone_ft')::numeric then fa := fa + st_area(p); end if;
    end loop;
    sh := case when pa > 0 then fa / pa else 0 end;
    res := res || jsonb_build_object('parking_not_in_front', jsonb_build_object('ok', sh <= (t->>'parking_front_share')::numeric, 'val', round(100*sh)||'% of parking in front'));
  else res := res || jsonb_build_object('parking_not_in_front', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
  -- 5 unexplained empty land
  core := st_unaryunion(st_collect(array_remove(array[B, park], null)));
  if core is not null then
    U := st_buffer(core, (t->>'clear_ft')::numeric);
    if green is not null then
      U := st_union(U, st_buffer(coalesce((select st_unaryunion(st_collect(g.geom)) from st_dump(green) g where st_distance(g.geom, B) <= (t->>'green_link_ft')::numeric), ST_SetSRID('GEOMETRYCOLLECTION EMPTY'::geometry, 2274)), (t->>'clear_ft')::numeric));
    end if;
    if sts is not null then U := st_union(U, st_buffer(sts, front)); end if;
    empty := st_difference(st_buffer(parcel, -5), U);
    select coalesce(max(st_area(e.geom)), 0) into big from st_dump(empty) e;
    res := res || jsonb_build_object('no_empty_land', jsonb_build_object('ok', not (big > (t->>'empty_share')::numeric * A and big > (t->>'empty_min_sf')::numeric),
             'val', format('largest %s%% of site (%s ac)', round(100*big/A), round(big/43560, 1))));
  else res := res || jsonb_build_object('no_empty_land', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
  -- 5b pavement that serves nothing
  if pave is not null and core is not null then
    far := st_difference(pave, st_buffer(core, (t->>'orphan_ft')::numeric));
    if sts is not null then far := st_difference(far, st_buffer(sts, (t->>'orphan_ft')::numeric)); end if;
    sh := case when st_area(pave) > 0 then st_area(far) / st_area(pave) else 0 end;
    res := res || jsonb_build_object('no_orphan_pavement', jsonb_build_object('ok', sh <= (t->>'orphan_share')::numeric, 'val', round(100*sh)||'% of pavement serves nothing'));
  else res := res || jsonb_build_object('no_orphan_pavement', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
  -- 6 parking quantity (the drawn count in the plan basis wins when metrics disagree)
  mm := regexp_match(coalesce(p_plan->>'plan_basis',''), '(\d+)/(\d+) stalls');
  st := coalesce(mm[1]::int, nullif(m->>'stalls','')::int, nullif(p_plan#>>'{parking,stalls}','')::int); rq := nullif(m->>'stalls_required','')::int;
  res := res || jsonb_build_object('parking_meets_need', case when st is not null and rq > 0 then jsonb_build_object('ok', st >= rq, 'val', st||' of '||rq) else jsonb_build_object('ok', null, 'val', 'n/a') end);
  -- 7 programmed green
  if A >= (t->>'green_min_ac')::numeric * 43560 then
    res := res || jsonb_build_object('usable_green', jsonb_build_object('ok', coalesce(st_area(green),0) >= (t->>'green_share')::numeric * A, 'val', round((100*coalesce(st_area(green),0)/A)::numeric, 1)||'% of site'));
  else res := res || jsonb_build_object('usable_green', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
  -- 8 front setback
  if B is not null and sts is not null then
    d := (select min(st_distance(b.geom, sts)) from st_dump(B) b);
    res := res || jsonb_build_object('front_setback', jsonb_build_object('ok', d >= front - 1, 'val', format('%s ft (need %s)', round(d), round(front))));
  else res := res || jsonb_build_object('front_setback', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
  -- 9 fire reach
  acc := st_unaryunion(st_collect(array_remove(array[net, sts], null)));
  if B is not null and acc is not null then
    select max(st_distance((dp).geom, acc)) into worst from (select st_dumppoints(st_exteriorring(b.geom)) dp from st_dump(B) b) q;
    res := res || jsonb_build_object('fire_reach', jsonb_build_object('ok', worst <= (t->>'fire_reach_ft')::numeric, 'val', round(worst)||' ft'));
  else res := res || jsonb_build_object('fire_reach', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
  return jsonb_build_object('checks', res,
    'fails', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_each(res) e(k,v) where v->>'ok' = 'false'),
    'n_fail', (select count(*) from jsonb_each(res) e(k,v) where v->>'ok' = 'false'),
    'units', units, 'thresholds_source', 'training.ai_config mf_design_check_thresholds');
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_mf_drive_buf_style()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(nullif(current_setting('mf.drive_buffer_style', true), ''), 'join=mitre')
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mf_engine_md5()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('fn_mf_solve_core', 'fn_generate_mf_site_plan_v2_search', 'fn_mf_design_checks', 'fn_mf_ai_realize', 'fn_generate_podium_site_plan')
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mf_persist_plan(p_ogc_fid integer, p_context_id uuid, p_plan jsonb, p_generator text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- persistence for plans drawn outside fn_mf_solve_core (podium_v1): same tables and shape as the seed generator's save
declare s uuid; c uuid; gb geometry; gp geometry; gd geometry;
begin
  gb := st_transform(fn_plan_layer_2274(p_plan->'buildings'), 3857);
  gp := st_transform(fn_plan_layer_2274(p_plan#>'{parking,bays}'), 3857);
  -- the saved drives column holds centerlines
  gd := st_transform((select st_collect(fn_poly_centerline(q.geom)) from st_dump(fn_plan_layer_2274(p_plan->'drives')) q), 3857);
  insert into siteplanner_session (parcel_id, zoning_base, setbacks, context_id, generator_version)
    values (p_ogc_fid::text, null, jsonb_build_object('front', p_plan#>>'{rules,front_setback_ft}', 'mode', p_generator), p_context_id, p_generator)
    returning id into s;
  insert into siteplanner_candidate (session_id, typology, geometry_buildings, geometry_parking, geometry_drives, metrics, parent_candidate_id, generator_version, score_total, context_id)
    values (s, coalesce(p_plan->>'typology', 'multifamily'), st_multi(st_collectionextract(gb, 3)),
            case when gp is null then null else st_multi(st_collectionextract(gp, 3)) end,
            case when gd is null then null else st_multi(st_collectionextract(gd, 2)) end,
            coalesce(p_plan->'metrics', '{}'::jsonb) || jsonb_build_object('plan_basis', p_plan->>'plan_basis', 'parking', p_plan->'parking'),
            null, p_generator, null, p_context_id)
    returning id into c;
  return jsonb_build_object('session_id', s, 'candidate_id', c, 'persisted', true);
exception when others then
  return jsonb_build_object('persisted', false, 'persist_error', sqlerrm);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_mf_solve_core(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid, p_regime text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; unit_program jsonb; massing_program jsonb; obj jsonb; w jsonb; mb jsonb; ent jsonb;
  site_skeleton_v2 jsonb; structure_seed_item jsonb; overlap_report jsonb;
  curb_line geometry; curb_core geometry; curb_sl geometry; curb_thr geometry; curb_bars geometry; curb_parcel geometry; curb_removed numeric; curb_dx numeric; curb_dy numeric; curb_len numeric;
  ctx_version text; ctx_hash text; prog_version text;
  target_gsf numeric; target_fp numeric; target_stories integer; target_unit_gsf numeric; target_units integer;
  min_unit_gsf numeric; max_unit_gsf numeric; program_max_units integer;
  legal_floor_cap integer; required_floors_for_coverage integer;
  directive_count integer; directive_bar_len numeric; directive_bar_depth numeric;
  directive_stories integer; directive_parti text; directive_rationale text;
  directive_active boolean := false; directive_count_met boolean := false;
  directive_original_count integer; directive_original_bar_len numeric; directive_original_parti text;
  directive_relaxation text := 'exact'; requested_regime text; directive_target_linear_ft numeric;
  density_units integer; density_recovery_target_gsf numeric; density_desired_fp numeric;
  directive_limit integer;
  structure_seed_active boolean:=false;
  structure_seed_landlocked boolean:=false;
  structure_seed_count integer:=0;
  v_front numeric; v_side numeric; v_rear numeric;
  max_far numeric; max_h numeric; max_den numeric; max_cov numeric; min_open numeric;
  max_impervious_pct numeric; max_impervious_sqft numeric; actual_impervious numeric;
  g2274 geometry; buildable geometry; ox numeric; oy numeric;
  obb geometry; theta numeric; anchor geometry; rot geometry; parcel_rot geometry; parking_rot geometry;
  bxmin numeric; bymin numeric; bxmax numeric; bymax numeric;
  avail_h numeric; lead_street boolean := true;
  bar_depth numeric; typology_max_depth numeric; aisle numeric; stall_w numeric; stall_d numeric; ratio numeric; program_parking_ratio numeric; frontier_parking_ratio numeric;
  bar_min numeric := 90; bar_max numeric; bar_gap numeric := 25;
  floors integer; f2f numeric;
  p50s numeric; p75s numeric; p90fp numeric; p75fp numeric; n_prec integer; prec_conf text;
  p50depth numeric; p75length numeric; p75coverage numeric;
  avg_unit numeric; actual_unit_gsf numeric; boundary geometry; seg_a geometry; seg_b geometry;
  max_gsf_by_parking numeric; excess_area numeric; last_area numeric; shrink_len numeric; last_bar geometry;
  desired_fp numeric; bar_scale numeric; new_len numeric;
  best_len numeric := 0; seg_len numeric;
  entry_pt geometry; entry_rot geometry; spine_x numeric;
  spine geometry; avoid geometry;
  npts integer; i integer; k integer;
  y numeric; use_court boolean; gap numeric; mid numeric;
  band geometry; comp record;
  x numeric; try_len numeric; bar geometry; placed boolean;
  a0 numeric; a1 numeric; drive_gap numeric; court_gap numeric := 44;
  park_floors integer := 0;
  frontage jsonb;
  frontage_bearing_deg numeric;
  fire_max_ft numeric := 0; ada_req integer := 0; ev_req integer := 0;
  court_used boolean := false; protected_court geometry := NULL;
  amen_gsf numeric := 0; pool_rect geometry := NULL; px numeric;
  bars_arr geometry[] := '{}';
  bars_capacity_arr geometry[] := '{}';
  filtered_bars geometry[] := '{}';
  pin_geoms geometry[] := '{}'; pin_floors int[] := '{}'; pin record; pg geometry; pf integer;
  pins_rot geometry := NULL;
  parks geometry := NULL; drives geometry := NULL; greens geometry := NULL;
  drives_cl geometry := NULL; cl geometry;
  amen geometry := NULL; amen_idx integer := 0; amen_dist numeric; d numeric;
  drive_band geometry; park_band geometry; court_band geometry; lead_park geometry;
  supplemental_parking geometry; target_stalls integer;
  relief_module geometry; relief_drive geometry; relief_parking geometry; relief_connector geometry;
  relief_len numeric; relief_x0 numeric; relief_y numeric; relief_side integer; relief_found boolean := false; missing_stalls integer;
  bars_j jsonb := '[]'::jsonb; parks_j jsonb := '[]'::jsonb;
  drives_j jsonb := '[]'::jsonb; greens_j jsonb := '[]'::jsonb; amen_j jsonb := '[]'::jsonb;
  bars_l jsonb := '[]'::jsonb; parks_l jsonb := '[]'::jsonb;
  drives_l jsonb := '[]'::jsonb; greens_l jsonb := '[]'::jsonb; amen_l jsonb := '[]'::jsonb;
  bars_u geometry; ub geometry;
  n_bars integer := 0; tot_fp numeric := 0; capacity_fp numeric := 0; gfa numeric := 0;
  tot_park numeric := 0; tot_drive numeric := 0; tot_green numeric := 0; n_stalls integer := 0;
  units integer; req_stalls integer; units_max integer;
  parking_units_cap integer; program_min_units integer; drive_components integer; stranded_count integer := 0; remote_parking_count integer := 0;
  far_floor_cap integer; cov_cap_sqft numeric;
  parcel_area numeric; flags jsonb := '[]'::jsonb;
  yield_clamp_reason text; gsf_capture numeric;
  growth_pass integer; prev_gfa numeric;
  resid_stall_headroom integer; resid_impervious numeric; resid_coverage numeric; resid_stories integer;
  gap_gsf numeric; addl_units integer; addl_stalls integer; min_land_needed numeric;
  opt_status text; opt_proof jsonb;
  residual geometry; rpiece record; cand geometry; allowed_add_fp numeric;
  added_this_pass integer; pminx numeric; pmaxx numeric; pminy numeric; pmaxy numeric;
  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;
  open_after numeric; fp_eligible numeric;
  micc_center geometry; micc_radius numeric; core_g geometry; blen numeric; bdep numeric;
  passes integer; plex_connectors geometry := NULL;
  heal_i integer; drop_piece geometry; main_comp geometry; sub_comp geometry; bridge geometry; units2 integer;
  v_session uuid; v_candidate uuid; persisted boolean := false;
  basis text; money jsonb; margin numeric;
  sc_fin numeric; sc_yield numeric; sc_park numeric; sc_zone numeric;
  sc_prec numeric; sc_prog numeric; sc_circ numeric; sc_open numeric;
  score_components jsonb; score_total numeric;
  avg_bar_fp numeric; drive_pct numeric; open_pct numeric; far_achieved numeric;
BEGIN
  requested_regime := coalesce(nullif(btrim(p_regime),''),'surface');
  if position(':' in requested_regime)>0 then
    directive_relaxation := lower(split_part(requested_regime,':',2));
    p_regime := split_part(requested_regime,':',1);
  else
    directive_relaxation := 'exact';
    p_regime := requested_regime;
  end if;
  if directive_relaxation not in ('exact','split_one','plus_one','free_pack') then
    return jsonb_build_object(
      'error','planner_massing_relaxation_mode_invalid',
      'mode',directive_relaxation
    );
  end if;
  IF p_context_id IS NULL THEN
    RETURN jsonb_build_object('error', 'planner_context_required');
  END IF;
  bres := public.fn_get_planner_solver_brief(p_context_id, p_ogc_fid);
  IF bres ? 'error' THEN
    RETURN jsonb_build_object('error', bres->>'error');
  END IF;
  brief := bres->'solver_brief';
  IF lower(btrim(COALESCE(p_typology, ''))) <> 'multifamily'
     OR lower(btrim(COALESCE(brief->>'typology', ''))) <> 'multifamily'
     OR lower(btrim(COALESCE(brief->>'selected_use', ''))) NOT IN ('multifamily', 'multi_family', 'mf') THEN
    RETURN jsonb_build_object(
      'error', 'planner_context_use_mismatch',
      'expected_typology', 'multifamily',
      'requested_typology', lower(btrim(COALESCE(p_typology, ''))),
      'context_typology', brief->>'typology',
      'context_selected_use', brief->>'selected_use'
    );
  END IF;
  IF NOT COALESCE((bres->>'generation_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('error', 'planner_generation_not_allowed',
      'flags', COALESCE(bres#>'{solver_brief,flags}', '[]'::jsonb));
  END IF;
  ctx_version := bres->>'context_version';
  ctx_hash := bres->>'context_hash';
  hc := brief->'hard_constraints';
  pk := brief->'parking';
  pri := brief->'precedent_priors';
  prog := brief->'program_prior';
  unit_program := coalesce(brief->'unit_program', '{}'::jsonb);
  massing_program := coalesce(brief->'massing_program', '{}'::jsonb);
  if nullif(current_setting('mf.massing_override',true),'') is not null then
    massing_program := massing_program || (current_setting('mf.massing_override',true))::jsonb;
  end if;
  obj := brief->'objective_profile';
  w := obj->'weights';
  prog_version := brief->>'program_prior_version';
  flags := COALESCE(brief->'flags', '[]'::jsonb);
  if nullif(current_setting('mf.massing_override',true),'') is not null then
    flags := flags || to_jsonb('massing_program_from_model_proposal_v1'::text);
  end if;
  mb := brief->'max_buildout';
  ent := brief->'entitlement_capacity';
  IF mb IS NULL OR mb ? 'error' OR nullif(mb->>'max_gsf','') IS NULL THEN
    RETURN jsonb_build_object('error','planner_max_buildout_required');
  END IF;

  target_gsf := nullif(mb->>'max_gsf','')::numeric;
  target_stories := coalesce(
    nullif(mb->>'at_stories','')::integer,
    nullif(mb#>>'{program_frontier,gsf_max_option,stories}','')::integer,
    (
      select nullif(r->>'stories','')::integer
      from jsonb_array_elements(coalesce(mb->'stories_ladder','[]'::jsonb)) as x(r)
      where nullif(r->>'max_gsf','') is not null
        and nullif(r->>'stories','') is not null
      order by (r->>'max_gsf')::numeric desc, (r->>'stories')::integer desc
      limit 1
    )
  );
  min_unit_gsf := coalesce(
    nullif(mb->>'unit_gsf_min','')::numeric,
    nullif(mb#>>'{program_frontier,unit_gsf_band,min}','')::numeric,
    750
  );
  max_unit_gsf := coalesce(
    nullif(mb->>'unit_gsf_max','')::numeric,
    nullif(mb#>>'{program_frontier,unit_gsf_band,max}','')::numeric,
    1550
  );
  target_unit_gsf := coalesce(
    nullif(mb->>'at_unit_gsf','')::numeric,
    nullif(mb#>>'{program_frontier,gsf_max_option,unit_gsf}','')::numeric,
    max_unit_gsf
  );
  target_units := coalesce(
    nullif(mb->>'units_at_max','')::integer,
    nullif(mb#>>'{program_frontier,gsf_max_option,units}','')::integer
  );

  IF target_gsf IS NULL OR target_gsf <= 0
     OR target_stories IS NULL OR target_stories <= 0
     OR target_unit_gsf IS NULL OR target_unit_gsf <= 0
     OR min_unit_gsf IS NULL OR min_unit_gsf <= 0
     OR max_unit_gsf IS NULL OR max_unit_gsf < min_unit_gsf THEN
    RETURN jsonb_build_object(
      'error','planner_max_buildout_contract_invalid',
      'contract_version',mb->>'contract_version',
      'has_program_frontier',mb ? 'program_frontier',
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf
    );
  END IF;

  target_stories := GREATEST(1,target_stories);
  target_unit_gsf := LEAST(max_unit_gsf,GREATEST(min_unit_gsf,target_unit_gsf));
  target_units := GREATEST(
    1,
    COALESCE(target_units,ceil(target_gsf/target_unit_gsf)::integer)
  );
  flags := flags || to_jsonb('unit_gsf_band_from_max_buildout'::text);
  IF mb#>'{program_frontier,gsf_max_option}' IS NOT NULL THEN
    flags := flags || to_jsonb('max_buildout_program_frontier_consumed'::text);
  END IF;
  flags := flags || to_jsonb('max_gsf_target_from_context'::text);

  -- Preferred composition PRIOR. User pins remain sovereign. An exact
  -- program is attempted first, but geometry/access may relax it through the
  -- dispatcher ladder. Local precedents never control count or quantity.
  if jsonb_typeof(massing_program)='object'
     and not (massing_program ? 'error')
     and coalesce(nullif(massing_program#>>'{solver_seed,bar_count}',''),nullif(massing_program->>'solver_bar_count',''),nullif(massing_program->>'building_count','')) is not null
     and coalesce(nullif(massing_program#>>'{solver_seed,bar_length_ft}',''),nullif(massing_program#>>'{per_building,bar_length_ft}','')) is not null
     and coalesce(nullif(massing_program#>>'{solver_seed,bar_depth_ft}',''),nullif(massing_program#>>'{per_building,bar_depth_ft}',''),nullif(massing_program->>'per_leg_depth_ft','')) is not null then
    directive_original_count := greatest(1,coalesce(nullif(massing_program#>>'{solver_seed,bar_count}','')::integer,nullif(massing_program->>'solver_bar_count','')::integer,nullif(massing_program->>'building_count','')::integer));
    directive_original_bar_len := greatest(40,coalesce(nullif(massing_program#>>'{solver_seed,bar_length_ft}','')::numeric,nullif(massing_program#>>'{per_building,bar_length_ft}','')::numeric));
    directive_original_parti := coalesce(nullif(massing_program#>>'{solver_seed,parti}',''),nullif(massing_program->>'parti',''),case massing_program->>'composition' when 'single_bar_on_frontage' then 'street_bar_parking_behind' when 'single_L_frontage_plus_wing' then 'L_scheme_bar_on_frontage_wing_deep' when 'courtyard_consolidated_easement_access' then 'court_scheme_easement_access' else 'perpendicular_bars_court_to_street' end);
    directive_target_linear_ft := directive_original_count*directive_original_bar_len;
    directive_count := directive_original_count;
    directive_bar_len := directive_original_bar_len;
    directive_bar_depth := greatest(28,coalesce(nullif(massing_program#>>'{solver_seed,bar_depth_ft}','')::numeric,nullif(massing_program#>>'{per_building,bar_depth_ft}','')::numeric,nullif(massing_program->>'per_leg_depth_ft','')::numeric));
    directive_stories := greatest(1,coalesce(nullif(massing_program->>'stories','')::integer,target_stories));
    directive_parti := directive_original_parti;
    directive_rationale := massing_program->>'rationale';
    if abs(coalesce(nullif(massing_program->>'target_gsf','')::numeric,target_gsf)-target_gsf)>1 then
      return jsonb_build_object(
        'error','planner_massing_program_contract_mismatch',
        'max_buildout_gsf',round(target_gsf),
        'massing_program_gsf',massing_program->>'target_gsf'
      );
    end if;
    directive_active := coalesce(
      jsonb_array_length(case when jsonb_typeof(p_pins)='array' then p_pins else '[]'::jsonb end),
      0
    )=0;

    if directive_active then
      case directive_relaxation
        when 'split_one' then
          directive_count := directive_original_count+1;
          directive_bar_len := greatest(40,directive_target_linear_ft/directive_count);
          flags := flags || to_jsonb('massing_program_relaxed_split_one_bar_v1'::text);
        when 'plus_one' then
          directive_count := directive_original_count+2;
          directive_bar_len := greatest(40,directive_target_linear_ft/directive_count);
          flags := flags || to_jsonb('massing_program_relaxed_plus_one_count_v1'::text);
        when 'free_pack' then
          directive_active := false;
          flags := flags || to_jsonb('massing_program_relaxed_free_pack_v1'::text);
        else
          flags := flags || to_jsonb('massing_program_exact_prior_attempt_v1'::text);
      end case;

      if directive_active then
        target_stories := directive_stories;
        flags := flags
          || to_jsonb('massing_program_consumed_v1'::text)
          || to_jsonb('massing_program_preferred_prior_v1'::text)
          || to_jsonb('massing_program_building_count_prior'::text)
          || to_jsonb(('massing_program_parti_'||
              regexp_replace(lower(directive_parti),'[^a-z0-9]+','_','g'))::text)
          || to_jsonb('precedent_count_ignored_for_composition'::text);
      end if;
    else
      flags := flags || to_jsonb('massing_program_suspended_for_user_pins'::text);
    end if;
  else
    directive_active := false;
    directive_relaxation := 'free_pack';
    flags := flags
      || to_jsonb('massing_program_unavailable_free_pack_v1'::text)
      || to_jsonb('massing_program_relaxed_free_pack_v1'::text);
  end if;

  directive_limit := case
    when p_regime='compact' then 1
    when directive_active then directive_count
    else null
  end;

  -- Hard constraints (nullable → typology_spec fallback, flagged)
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
  max_cov := COALESCE((hc->>'max_building_coverage_pct')::numeric,(hc->>'max_coverage_pct')::numeric);
  max_impervious_pct := (hc->>'max_impervious_pct')::numeric;
  max_impervious_sqft := (hc->>'max_impervious_sqft')::numeric;
  min_open := (hc->>'min_open_space_pct')::numeric;

  -- Parking from the brief. The per-type unit program may require a
  -- higher weighted ratio, but it can never weaken the legal/typology ratio.
  stall_w := COALESCE((pk->>'stall_width_ft')::numeric, 9);
  stall_d := COALESCE((pk->>'stall_depth_ft')::numeric, 18);
  aisle   := COALESCE((pk->>'aisle_width_ft')::numeric, 24);
  ratio   := COALESCE((pk->>'ratio')::numeric, 1.5);
  program_parking_ratio := nullif(unit_program->>'weighted_parking_ratio', '')::numeric;
  frontier_parking_ratio := coalesce(
    nullif(mb->>'parking_ratio_at_max','')::numeric,
    nullif(mb#>>'{program_frontier,gsf_max_option,parking_ratio}','')::numeric
  );
  ratio := greatest(ratio,coalesce(program_parking_ratio,ratio),coalesce(frontier_parking_ratio,ratio));
  if frontier_parking_ratio is not null then
    flags := flags || to_jsonb('parking_ratio_consistent_with_max_buildout_frontier_v1'::text);
  end if;
  drive_gap := stall_d + aisle + stall_d;
  avg_unit := coalesce(nullif(unit_program->>'weighted_unit_gsf','')::numeric,
    (prog#>>'{average_unit_sqft,value}')::numeric,950);
  if jsonb_typeof(unit_program->'units')='array' then
    flags := flags || to_jsonb('unit_program_consumed_v1'::text);
  elsif coalesce(prog#>>'{average_unit_sqft,confidence}','low')='low' then
    flags := flags || to_jsonb('program_prior_low_confidence'::text);
  end if;

  -- Precedent priors → bar form (priors with constructability clamps)
  n_prec := COALESCE((pri->>'sample_size')::int, 0);
  prec_conf := COALESCE(pri->>'confidence', 'unknown');
  p50s := (pri#>>'{stories,p50}')::numeric;
  p75s := (pri#>>'{stories,p75}')::numeric;
  p75fp := (pri#>>'{footprint_sqft,p75}')::numeric;
  p90fp := COALESCE((pri#>>'{underwrite_target,footprint_sqft_p90}')::numeric,
                    (pri#>>'{footprint_sqft,p90}')::numeric);
  p50depth := (pri#>>'{depth_ft,p50}')::numeric;
  p75length := COALESCE((pri#>>'{underwrite_target,length_ft_p75}')::numeric,(pri#>>'{length_ft,p75}')::numeric);
  p75coverage := COALESCE((pri#>>'{underwrite_target,coverage_pct_p75}')::numeric,(pri#>>'{coverage_pct,p75}')::numeric);

  -- Whole-building Regrid OBB depth is corroboration only. Apartment-bar
  -- depth comes from unit dimensions + clear corridor, bounded by the typology maximum.
  select coalesce(max_floorplate_depth_ft,72),coalesce(floor_height_ft,floor_to_floor_ft,11)
    into typology_max_depth,f2f from public.typology_spec where typology=p_typology;
  if not found then return jsonb_build_object('error','no typology_spec row for '||p_typology); end if;
  if directive_active and directive_bar_depth is not null then
    bar_depth := least(greatest(directive_bar_depth,28),typology_max_depth);
    flags := flags || to_jsonb('bar_depth_from_massing_program_v1'::text);
  else
    bar_depth := nullif(unit_program->>'implied_bar_depth_ft','')::numeric;
    if bar_depth is not null then
      bar_depth := least(greatest(bar_depth,45),typology_max_depth);
      flags := flags || to_jsonb('bar_depth_from_unit_program_v1'::text);
    else
      bar_depth := least(greatest(coalesce(typology_max_depth,65),45),65);
      flags := flags || to_jsonb('bar_depth_from_typology_program_spec'::text);
    end if;
  end if;
  IF p75length IS NOT NULL AND n_prec >= 5 THEN
    p90fp := p75length*bar_depth;
    flags := flags || to_jsonb('bar_length_target_from_regrid_geometry_p75'::text);
  END IF;

  -- Max-buildout stories drive quantity. Precedent stories remain form evidence.
  floors := target_stories;
  IF max_h IS NOT NULL THEN
    floors := LEAST(floors,GREATEST(1,floor(max_h/f2f)::integer));
  END IF;
  flags := flags || to_jsonb('stories_from_max_gsf_frontier'::text);

  -- Regrid length remains form corroboration only. The massing directive
  -- sets composition and the hard 280-ft consolidation limit.
  IF p90fp IS NOT NULL AND n_prec >= 5 THEN
    flags := flags || to_jsonb('bar_length_preference_from_regrid'::text);
  ELSE
    flags := flags || to_jsonb('bar_length_preference_fallback_default'::text);
  END IF;
  if directive_active and directive_bar_len is not null then
    bar_max := least(280,directive_bar_len);
    bar_min := least(bar_min,greatest(40,bar_max*0.70));
    flags := flags || to_jsonb('bar_length_from_massing_program_v1'::text);
  else
    bar_max := 300;
  end if;
  flags := flags || to_jsonb('precedent_bar_length_soft_target_not_quantity_cap'::text);

  SELECT geom_2274 INTO g2274 FROM public.parcels WHERE ogc_fid = p_ogc_fid;
  IF g2274 IS NULL THEN RETURN jsonb_build_object('error', 'parcel has no geom_2274'); END IF;
  g2274 := (ST_Dump(g2274)).geom;
  parcel_area := ST_Area(g2274);
  ox := ST_XMin(g2274); oy := ST_YMin(g2274);
  legal_floor_cap := CASE
    WHEN max_h IS NOT NULL AND f2f > 0 THEN GREATEST(1,floor(max_h/f2f)::integer)
    ELSE GREATEST(1,target_stories)
  END;
  floors := LEAST(GREATEST(1,floors),legal_floor_cap);
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
  target_fp := target_gsf/GREATEST(floors - park_floors,1);
  cov_cap_sqft := CASE WHEN max_cov IS NOT NULL THEN parcel_area*max_cov/100.0 ELSE NULL END;
  IF cov_cap_sqft IS NULL THEN
    cov_cap_sqft := target_fp;
  ELSE
    IF cov_cap_sqft < target_fp AND legal_floor_cap > floors THEN
      required_floors_for_coverage := GREATEST(1,ceil(target_gsf/cov_cap_sqft)::integer) + park_floors;
      floors := LEAST(legal_floor_cap,GREATEST(floors,required_floors_for_coverage));
      target_fp := target_gsf/GREATEST(floors - park_floors,1);
      flags := flags || to_jsonb('coverage_response_lifted_stories_before_clamping_gsf'::text);
    END IF;
    IF cov_cap_sqft<target_fp THEN
      yield_clamp_reason := 'building_coverage';
      flags := flags || to_jsonb('gsf_target_clamped_by_building_coverage'::text);
    END IF;
    cov_cap_sqft := LEAST(cov_cap_sqft,target_fp);
  END IF;
  max_impervious_sqft := COALESCE(max_impervious_sqft,
    CASE WHEN max_impervious_pct IS NOT NULL THEN parcel_area*max_impervious_pct/100.0 END);
  units_max := CASE WHEN max_den IS NOT NULL THEN floor(max_den*parcel_area/43560.0)::integer ELSE NULL END;

  -- Entry heuristic: longest frontage. The brief's front_edge is a PLACEHOLDER
  -- (front_edge_is_placeholder) and must not be routed from.
  IF COALESCE((brief#>>'{geometry,front_edge_is_placeholder}')::boolean, true) THEN
    NULL; -- keep heuristic; placeholder flag already carried in brief flags
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

  -- Use the immutable context's verified frontage. No runtime parcel lookup
  -- may silently disagree with the snapshot that explains this candidate.
  frontage := coalesce(brief->'geometry','{}'::jsonb);
  if not coalesce((frontage->>'front_edge_is_placeholder')::boolean,true)
     and jsonb_typeof(frontage->'frontage_midpoint_2274')='array' then
    entry_pt := st_setsrid(st_makepoint(
      (frontage#>>'{frontage_midpoint_2274,0}')::numeric,
      (frontage#>>'{frontage_midpoint_2274,1}')::numeric),2274);
    frontage_bearing_deg := nullif(frontage->>'frontage_bearing_deg','')::numeric;
    flags := flags || to_jsonb('entry_from_context_frontage_v1'::text);
  elsif coalesce((frontage->>'landlocked')::boolean,false) then
    flags := flags || to_jsonb('landlocked_access_via_easement_assumed'::text);
  else
    flags := flags || to_jsonb('entry_heuristic_no_verified_frontage'::text);
  end if;

  -- Oriented frame + DIRECTIONAL setbacks: minimum-setback ring buffer for
  -- jagged-edge clearance, intersected with the directional inset box in the
  -- oriented frame (front on the entry side, rear opposite, sides lateral).
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
  if frontage_bearing_deg is not null then
    theta := pi()/2 - radians(frontage_bearing_deg);
    flags := flags || to_jsonb('bar_orientation_from_context_frontage_v1'::text);
  end if;
  if directive_active and directive_parti='perpendicular_bars_court_to_street' then
    theta := theta + pi()/2;
    flags := flags || to_jsonb('massing_parti_perpendicular_orientation_v1'::text);
  elsif directive_active and directive_parti='L_scheme_bar_on_frontage_wing_deep' then
    flags := flags || to_jsonb('massing_parti_l_scheme_side_spine_v1'::text);
  elsif directive_active and directive_parti='street_bar_parking_behind' then
    flags := flags || to_jsonb('massing_parti_street_bar_parking_behind_v1'::text);
  elsif directive_active and directive_parti='court_scheme_easement_access' then
    flags := flags || to_jsonb('massing_parti_court_easement_v1'::text);
  end if;

  parcel_rot := ST_Rotate(ST_Buffer(g2274, -LEAST(v_front, v_side, v_rear)), -theta, anchor);
  parcel_rot := (SELECT geom FROM (SELECT (ST_Dump(parcel_rot)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);
  parking_rot := parcel_rot;
  entry_rot := ST_Rotate(entry_pt, -theta, anchor);
  bxmin := ST_XMin(parcel_rot); bymin := ST_YMin(parcel_rot);
  bxmax := ST_XMax(parcel_rot); bymax := ST_YMax(parcel_rot);
  if directive_active and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
     and abs(ST_Y(entry_rot)-bymax) < abs(ST_Y(entry_rot)-bymin) then
    theta := theta + pi();
    parcel_rot := ST_Rotate(ST_Buffer(g2274, -LEAST(v_front, v_side, v_rear)), -theta, anchor);
    parcel_rot := (SELECT geom FROM (SELECT (ST_Dump(parcel_rot)).geom) q ORDER BY ST_Area(geom) DESC LIMIT 1);
    parking_rot := parcel_rot;
    entry_rot := ST_Rotate(entry_pt, -theta, anchor);
    bxmin := ST_XMin(parcel_rot); bymin := ST_YMin(parcel_rot);
    bxmax := ST_XMax(parcel_rot); bymax := ST_YMax(parcel_rot);
    flags := flags || to_jsonb('massing_frontage_frame_normalized_v1'::text);
  end if;
  -- Directional box: front inset on the entry side of the oriented frame
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

  IF avail_h >= drive_gap + 45 + 1
     AND avail_h < (stall_d + aisle) + bar_depth + 6 THEN
    -- On a parking-bound shallow site, prefer a constructable bar plus two
    -- stall rows over a deeper bar plus one row. This preserves more GSF after
    -- the hard parking solve even though the individual floorplate is shallower.
    bar_depth := 45;
    flags := flags || to_jsonb('bar_depth_reduced_for_double_loaded_parking'::text);
  ELSIF avail_h < (stall_d + aisle) + bar_depth + 6 THEN
    bar_depth := GREATEST(45, avail_h - (stall_d + aisle) - 6);
    IF bar_depth + stall_d + aisle + 6 > avail_h THEN
      lead_street := false;
      bar_depth := GREATEST(40, LEAST(bar_depth, avail_h - 4));
    END IF;
    flags := flags || to_jsonb('bar_depth_clamped_shallow_site'::text);
  END IF;
  IF bar_depth > avail_h - 4 THEN
    IF avail_h >= 34 THEN
      -- COMPACT PLEX (P0 ledger, generalization sweep): a shallow envelope
      -- hosts a shallow building, not a refusal. Plex depth 28+ ft, short
      -- runs; downstream parking/convergence machinery runs unchanged.
      bar_depth := GREATEST(28, avail_h - 6);
      bar_min := LEAST(bar_min, 40);
      lead_street := false;
      flags := flags || to_jsonb('compact_plex_shallow_envelope'::text);
    ELSE
      RETURN jsonb_build_object('error', 'planner_envelope_unbuildable_depth',
        'envelope_depth_ft', round(avail_h),
        'minimum_building_depth_ft', 28,
        'flags', flags);
    END IF;
  END IF;

  if directive_active
     and directive_relaxation='exact'
     and coalesce(jsonb_array_length(
       case when jsonb_typeof(p_pins)='array' then p_pins else '[]'::jsonb end
     ),0)=0 then
    site_skeleton_v2:=public.fn_site_skeleton_v2(p_ogc_fid,p_typology);
    if not (site_skeleton_v2 ? 'error')
       and jsonb_typeof(site_skeleton_v2->'structures')='array'
       and jsonb_array_length(site_skeleton_v2->'structures')>0 then
      bars_arr:='{}'::geometry[]; n_bars:=0; tot_fp:=0;
      for structure_seed_item in
        select value from jsonb_array_elements(site_skeleton_v2->'structures')
      loop
        begin
          bar:=ST_SetSRID(ST_GeomFromGeoJSON((structure_seed_item->'geom_2274')::text),2274);
          bar:=ST_CollectionExtract(ST_Intersection(ST_Rotate(bar,-theta,anchor),rot),3);
          if bar is not null and not ST_IsEmpty(bar)
             and ST_NumGeometries(bar)=1 and ST_Area(bar)>1000 then
            bar:=(select q.geom from (select (ST_Dump(bar)).geom) q
                  order by ST_Area(q.geom) desc limit 1);
            bars_arr:=bars_arr||bar; n_bars:=n_bars+1; tot_fp:=tot_fp+ST_Area(bar);
          end if;
        exception when others then
          flags:=flags||to_jsonb('site_skeleton_v2_structure_parse_failed_v1'::text);
        end;
      end loop;
      structure_seed_count:=jsonb_array_length(site_skeleton_v2->'structures');
      if n_bars=structure_seed_count then
        structure_seed_active:=true;
        structure_seed_landlocked:=coalesce(
          (site_skeleton_v2#>>'{skeleton_v2,easement_assumed}')::boolean,false
        ) or site_skeleton_v2->>'skeleton'='landlocked_court_scheme';
        directive_original_count:=structure_seed_count;
        directive_count:=structure_seed_count;
        directive_limit:=structure_seed_count;

        if not structure_seed_landlocked and structure_seed_count=1 then
          last_bar:=bars_arr[1];
          last_area:=ST_Area(last_bar);
          yoff:=greatest(0,ST_YMin(parking_rot)+aisle+0.20-ST_YMin(last_bar));
          if yoff>0 and ST_Covers(rot,ST_Translate(last_bar,0,yoff)) then
            last_bar:=ST_Translate(last_bar,0,yoff);
            flags:=flags||to_jsonb('structure_seed_shifted_for_front_apron_v1'::text);
          end if;

          cand:=ST_CollectionExtract(ST_Intersection(
            last_bar,
            ST_MakeEnvelope(
              ST_XMin(parking_rot)+aisle+0.20,
              ST_YMin(parking_rot)+aisle+0.20,
              ST_XMax(parking_rot),ST_YMax(parking_rot),2274
            )
          ),3);
          drop_piece:=ST_CollectionExtract(ST_Intersection(
            last_bar,
            ST_MakeEnvelope(
              ST_XMin(parking_rot),
              ST_YMin(parking_rot)+aisle+0.20,
              ST_XMax(parking_rot)-aisle-0.20,
              ST_YMax(parking_rot),2274
            )
          ),3);

          if drop_piece is not null and not ST_IsEmpty(drop_piece)
             and ST_NumGeometries(drop_piece)=1
             and ST_Area(drop_piece)>=greatest(1000,last_area*0.90)
             and (cand is null or ST_IsEmpty(cand)
                  or ST_NumGeometries(cand)<>1
                  or ST_Area(drop_piece)>=ST_Area(cand)) then
            bars_arr[1]:=drop_piece;
            spine_x:=ST_XMax(parking_rot)-aisle/2;
            flags:=flags||to_jsonb('structure_seed_right_side_spine_clearance_v1'::text);
          elsif cand is not null and not ST_IsEmpty(cand)
                and ST_NumGeometries(cand)=1
                and ST_Area(cand)>=greatest(1000,last_area*0.90) then
            bars_arr[1]:=cand;
            spine_x:=ST_XMin(parking_rot)+aisle/2;
            flags:=flags||to_jsonb('structure_seed_left_side_spine_clearance_v1'::text);
          else
            bars_arr[1]:=last_bar;
            spine_x:=case
              when ST_XMin(last_bar)-ST_XMin(parking_rot)
                   >=ST_XMax(parking_rot)-ST_XMax(last_bar)
                then ST_XMin(parking_rot)+aisle/2
              else ST_XMax(parking_rot)-aisle/2
            end;
            flags:=flags||to_jsonb('structure_seed_side_clearance_retention_floor_v1'::text);
          end if;

          tot_fp:=ST_Area(bars_arr[1]);
          flags:=flags||to_jsonb('structure_seed_circulation_clearance_v1'::text);
        end if;

        bars_capacity_arr:=bars_arr; capacity_fp:=tot_fp;
        flags:=flags||coalesce(site_skeleton_v2->'flags','[]'::jsonb)
          ||to_jsonb('site_skeleton_v2_structures_consumed_v1'::text)
          ||case when structure_seed_landlocked
              then to_jsonb('site_skeleton_v2_landlocked_structure_consumed_v1'::text)
              else to_jsonb('site_skeleton_v2_frontage_structure_consumed_v1'::text) end;
      else
        bars_arr:='{}'::geometry[]; n_bars:=0; tot_fp:=0; structure_seed_count:=0;
        flags:=flags||to_jsonb('site_skeleton_v2_structure_set_rejected_v1'::text);
      end if;
    end if;
  end if;

  IF structure_seed_active and structure_seed_landlocked THEN
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    spine_x:=case
      when ST_XMin(bars_u)-bxmin >= bxmax-ST_XMax(bars_u)
        then greatest(bxmin+aisle/2,ST_XMin(bars_u)-aisle/2-2)
      else least(bxmax-aisle/2,ST_XMax(bars_u)+aisle/2+2) end;
    spine:=ST_Intersection(rot,ST_MakeEnvelope(
      spine_x-aisle/2,bymin,spine_x+aisle/2,bymax,2274));
    lead_street:=false;
    flags:=flags||to_jsonb('landlocked_access_via_easement_assumed'::text)
      ||to_jsonb('site_skeleton_v2_easement_side_spine_v1'::text);
  ELSIF structure_seed_active THEN
    spine:=ST_CollectionExtract(ST_Intersection(
      parking_rot,
      ST_UnaryUnion(ST_Collect(array[
        ST_MakeEnvelope(
          spine_x-aisle/2,ST_YMin(parking_rot),
          spine_x+aisle/2,ST_YMax(parking_rot),2274
        ),
        ST_Buffer(ST_SetSRID(ST_MakeLine(array[
          entry_rot,
          ST_SetSRID(ST_MakePoint(
            ST_X(entry_rot),ST_YMin(parking_rot)+aisle/2
          ),2274),
          ST_SetSRID(ST_MakePoint(
            spine_x,ST_YMin(parking_rot)+aisle/2
          ),2274)
        ]),2274),aisle/2,'endcap=flat join=mitre')
      ]))
    ),3);
    lead_street:=false;
    flags:=flags
      ||to_jsonb('structure_seed_parking_envelope_side_spine_v1'::text)
      ||to_jsonb('structure_seed_front_apron_v1'::text);
  ELSIF directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') THEN
    spine_x := case when ST_X(entry_rot) <= (bxmin+bxmax)/2
                    then bxmin+aisle/2 else bxmax-aisle/2 end;
    spine := ST_UnaryUnion(ST_Union(
      ST_Intersection(rot, ST_MakeEnvelope(
        spine_x-aisle/2,bymin,spine_x+aisle/2,bymax,2274)),
      ST_Intersection(rot,ST_Buffer(ST_SetSRID(ST_MakeLine(
        ST_MakePoint(ST_X(entry_rot),bymin),
        ST_MakePoint(spine_x,bymin+aisle/2)
      ),2274),aisle/2,'endcap=flat join=mitre'))
    ));
    lead_street := false;
    flags := flags
      || to_jsonb('massing_side_spine_preserves_consolidated_bar_v1'::text)
      || to_jsonb('massing_frontage_entry_throat_v1'::text);
  ELSIF p_regime='compact' OR (bxmax - bxmin) < 95 OR ST_Area(rot) < 12000 THEN
    IF abs(ST_Y(entry_rot) - bymin) <= abs(ST_Y(entry_rot) - bymax) THEN
      spine := ST_Intersection(rot, ST_MakeEnvelope(bxmin, bymin, bxmax, bymin + aisle, 2274));
    ELSE
      spine := ST_Intersection(rot, ST_MakeEnvelope(bxmin, bymax - aisle, bxmax, bymax, 2274));
    END IF;
    spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 25), bxmax - 25);
    bar_min := LEAST(bar_min,40);
    flags := flags || to_jsonb('compact_plex_street_loaded_access'::text);
    if p_regime='compact' then
      flags := flags || to_jsonb('compact_small_lot_regime_v1'::text);
    end if;
  ELSE
    spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 50), bxmax - 50);
    spine := ST_Intersection(rot, ST_MakeEnvelope(spine_x - aisle/2, bymin, spine_x + aisle/2, bymax, 2274));
  END IF;
  avoid := case
    when directive_active
         and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
      then ST_Buffer(spine,0.10)
    else ST_Buffer(spine,4)
  end;
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
  -- Rotated-frame union of every pinned footprint: pins are OBSTACLES to all
  -- later parking/drive passes exactly like generated bars (their absence
  -- here was how a resized pin ended up beneath parking and drives).
  IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
    SELECT ST_UnaryUnion(ST_Collect(ST_Rotate(pgeom, -theta, anchor)))
      INTO pins_rot
    FROM unnest(pin_geoms) AS pgeom;
  END IF;
  IF flags ? 'pin_outside_parcel' THEN
    RETURN jsonb_build_object(
      'error','planner_pin_outside_parcel',
      'flags',flags
    );
  END IF;

  if structure_seed_active then
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    avoid:=ST_UnaryUnion(ST_Collect(array[avoid,ST_Buffer(bars_u,5)]));
    flags:=flags||to_jsonb('site_skeleton_v2_structures_reserved_from_infrastructure_v1'::text);
  end if;

  if structure_seed_active and not structure_seed_landlocked then
    drives_cl:=ST_Intersection(parking_rot,ST_SetSRID(ST_MakeLine(
      ST_MakePoint(spine_x,ST_YMin(parking_rot)),
      ST_MakePoint(spine_x,ST_YMax(parking_rot))
    ),2274));
    cl:=ST_Intersection(parking_rot,ST_SetSRID(ST_MakeLine(array[
      entry_rot,
      ST_SetSRID(ST_MakePoint(
        ST_X(entry_rot),ST_YMin(parking_rot)+aisle/2
      ),2274),
      ST_SetSRID(ST_MakePoint(
        spine_x,ST_YMin(parking_rot)+aisle/2
      ),2274)
    ]),2274));
    if cl is not null and not ST_IsEmpty(cl) then
      drives_cl:=case when drives_cl is null then cl else ST_Union(drives_cl,cl) end;
    end if;
  elsif directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') then
    drives_cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(
      ST_MakePoint(spine_x,bymin),ST_MakePoint(spine_x,bymax)),2274));
    cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(
      ST_MakePoint(ST_X(entry_rot),ST_Y(entry_rot)),
      ST_MakePoint(spine_x,ST_Y(entry_rot))),2274));
    if cl is not null and not ST_IsEmpty(cl) then
      drives_cl := case when drives_cl is null then cl else ST_Union(drives_cl,cl) end;
    end if;
  elsif p_regime='compact' or (bxmax-bxmin)<95 or ST_Area(rot)<12000 then
    mid := case when abs(ST_Y(entry_rot)-bymin)<=abs(ST_Y(entry_rot)-bymax)
                then bymin+aisle/2 else bymax-aisle/2 end;
    drives_cl := ST_Intersection(rot,ST_SetSRID(ST_MakeLine(
      ST_MakePoint(bxmin,mid),ST_MakePoint(bxmax,mid)),2274));
  else
    cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(spine_x, bymin), ST_MakePoint(spine_x, bymax)), 2274));
    IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN drives_cl := cl; END IF;
  end if;

  -- Build the frozen composition directly before generic search. A street-
  -- first-priority prior attempt: seed one preferred bar per row, leave one
  -- side aisle, and keep all parking behind the consolidated frontage mass.
  if directive_active
     and not structure_seed_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
     and p_regime in ('street_bar','surface','l_scheme') then
    bars_arr := '{}'::geometry[];
    n_bars := 0;
    tot_fp := 0;
    try_len := least(280,directive_bar_len,bxmax-bxmin-aisle-0.5);
    y := bymin+0.25;
    for k in 1..directive_count loop
      -- Parallel consolidated bars reserve a complete 18+24+18
      -- parking street between rows, rather than a narrow unusable gap.
      relief_y := y+(k-1)*(bar_depth+drive_gap+4);
      placed := false;
      while relief_y+bar_depth<=bymax-0.25 and not placed loop
        band := ST_Intersection(rot,ST_MakeEnvelope(
          bxmin,relief_y,bxmax,relief_y+bar_depth,2274));
        select q.geom into band
        from (select (ST_Dump(band)).geom) q
        order by ST_Area(q.geom) desc
        limit 1;
        if band is not null and not ST_IsEmpty(band)
           and ST_XMax(band)-ST_XMin(band)>=try_len+0.2 then
          x := case when spine_x <= (bxmin+bxmax)/2
                    then ST_XMax(band)-0.10-try_len
                    else ST_XMin(band)+0.10 end;
          while x+try_len<=ST_XMax(band)-0.05 and not placed loop
            -- Real parcel edges are rarely perfect rectangles. Clip the long
            -- program bar to the directional envelope instead of shortening it
            -- into a different composition; accept only near-complete bars.
            bar := ST_CollectionExtract(ST_Difference(
              ST_Intersection(rot,ST_MakeEnvelope(
                x,relief_y,x+try_len,relief_y+bar_depth,2274)),avoid),3);
            if bar is not null and not ST_IsEmpty(bar) then
              bar := (select q.geom from (select (ST_Dump(bar)).geom) q
                      order by ST_Area(q.geom) desc limit 1);
            end if;
            if bar is not null and not ST_IsEmpty(bar)
               and ST_Area(bar)>=try_len*bar_depth*0.95
               and ST_XMax(bar)-ST_XMin(bar)>=try_len*0.90 then
              bars_arr := bars_arr || bar;
              n_bars := n_bars+1;
              tot_fp := tot_fp+ST_Area(bar);
              placed := true;
              if ST_Area(bar)<try_len*bar_depth*0.999 then
                flags := flags || to_jsonb('massing_program_bar_clipped_to_directional_envelope_v1'::text);
              end if;
            else
              x := x+2;
            end if;
          end loop;
        end if;
        if not placed then relief_y := relief_y+5; end if;
      end loop;
      exit when not placed;
    end loop;
    if n_bars=directive_count then
      flags := flags || to_jsonb('massing_program_exact_bars_seeded_v1'::text);
    elsif n_bars>0 then
      flags := flags || to_jsonb('massing_program_exact_seed_partially_placeable'::text);
    end if;
  end if;

  IF directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') THEN
    y := bymin + 0.25;
  ELSIF avail_h > bar_depth * 2 + drive_gap + 20 THEN
    y := bymin + 2 + (p_seed % 3) * 4;
  ELSIF avail_h >= drive_gap + bar_depth + 1 THEN
    y := bymin + 0.5;
  ELSE
    y := bymin + 1;
  END IF;

  IF lead_street THEN
    lead_park := ST_Difference(
      ST_Intersection(rot,ST_MakeEnvelope(bxmin,y,bxmax,y+stall_d,2274)),
      avoid
    );
    drive_band := ST_Difference(
      ST_Intersection(rot,ST_MakeEnvelope(bxmin,y+stall_d,bxmax,y+stall_d+aisle,2274)),
      ST_Difference(avoid,ST_Buffer(spine,4))
    );

    IF y+drive_gap+bar_depth<=bymax-0.5 AND avail_h<2*bar_depth+drive_gap+20 THEN
      park_band := ST_Difference(
        ST_Intersection(rot,ST_MakeEnvelope(
          bxmin,y+stall_d+aisle,bxmax,y+drive_gap,2274
        )),
        avoid
      );
      IF park_band IS NOT NULL AND NOT ST_IsEmpty(park_band) THEN
        lead_park := CASE WHEN lead_park IS NULL OR ST_IsEmpty(lead_park)
          THEN park_band ELSE ST_UnaryUnion(ST_Union(lead_park,park_band)) END;
      END IF;
      y := y+drive_gap;
      flags := flags || to_jsonb('double_loaded_leading_parking'::text);
    ELSE
      y := y+stall_d+aisle;
      flags := flags || to_jsonb('single_loaded_leading_parking_shallow_site'::text);
    END IF;

    IF lead_park IS NOT NULL AND NOT ST_IsEmpty(lead_park) THEN
      parks := lead_park;
    END IF;
    IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
      drives := drive_band;
      mid := ST_YMin(drive_band)+aisle/2.0;
      cl := ST_Intersection(rot,ST_SetSRID(ST_MakeLine(
        ST_MakePoint(bxmin,mid),ST_MakePoint(bxmax,mid)
      ),2274));
      IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
        drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl,cl) END;
      END IF;
    END IF;
  END IF;

  use_court := false; -- every inter-bar gap is a connected parking street
  WHILE y + bar_depth <= bymax - 0.5
        AND (directive_limit IS NULL OR n_bars < directive_limit) LOOP
    band := ST_Intersection(rot, ST_MakeEnvelope(bxmin, y, bxmax, y + bar_depth, 2274));
    IF band IS NOT NULL AND NOT ST_IsEmpty(band) THEN
      FOR comp IN
        SELECT geom
        FROM (SELECT (ST_Dump(band)).geom AS geom) q
        ORDER BY ST_Area(geom) DESC
        LIMIT CASE WHEN directive_active THEN 1 ELSE 2147483647 END
      LOOP
        EXIT WHEN directive_limit IS NOT NULL AND n_bars >= directive_limit;
        IF ST_Area(comp.geom) < bar_min * bar_depth * 0.85 THEN CONTINUE; END IF;
        x := ST_XMin(comp.geom) + case when directive_active then 0.25 else 2 end;
        WHILE x + bar_min <= ST_XMax(comp.geom) - case when directive_active then 0.25 else 2 end
              AND (directive_limit IS NULL OR n_bars < directive_limit) LOOP
          -- Coverage cap is a hard constraint applied during placement
          IF cov_cap_sqft IS NOT NULL AND tot_fp + bar_min * bar_depth > cov_cap_sqft THEN
            flags := flags || to_jsonb('coverage_cap_reached'::text);
            EXIT;
          END IF;
          placed := false;
          try_len := LEAST(
            bar_max,
            ST_XMax(comp.geom) - case when directive_active then 0.25 else 2 end - x
          );
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
            try_len := try_len - case when directive_active then 10 else 30 end;
          END LOOP;
          -- The current prior step assigns one consolidated bar to
          -- each row. Do not spend the remaining count on fragments in the
          -- same band; the next iteration advances to the next parking street.
          IF directive_active AND placed THEN EXIT; END IF;
          IF NOT placed THEN x := x + 20; END IF;
        END LOOP;
      END LOOP;
    END IF;

    -- DESIGN GRAMMAR v2: ONE central court is program, not residue — the
    -- first inter-bar gap on a site with room for it becomes a designed
    -- green court (the pool/amenity address) and parking consolidates in
    -- the remaining gaps. Sites too tight for a court keep every gap as a
    -- parking street; the court's capture cost is honest and named.
    use_court := p_regime = 'courtyard' AND (NOT court_used) AND n_bars > 0
                 AND avail_h >= 2*bar_depth + 2*drive_gap + 6
                 AND (bxmax - bxmin) >= 300;
    gap := drive_gap;
    IF y + bar_depth + gap + bar_depth <= bymax THEN
      IF use_court THEN
        -- BOUNDED courtyard at the band end away from the arrival spine —
        -- wrapped by buildings, never a full-width greenbelt severing the
        -- site. The rest of this band keeps working as a parking street.
        px := LEAST(180, GREATEST(120, (bxmax - bxmin) * 0.25));
        IF spine_x - bxmin <= bxmax - spine_x THEN
          court_band := ST_Difference(ST_Intersection(rot,
            ST_MakeEnvelope(bxmax - px, y + bar_depth + 4, bxmax, y + bar_depth + gap - 4, 2274)), avoid);
          a0 := bxmin; a1 := bxmax - px - 4;
        ELSE
          court_band := ST_Difference(ST_Intersection(rot,
            ST_MakeEnvelope(bxmin, y + bar_depth + 4, bxmin + px, y + bar_depth + gap - 4, 2274)), avoid);
          a0 := bxmin + px + 4; a1 := bxmax;
        END IF;
        IF court_band IS NOT NULL AND NOT ST_IsEmpty(court_band) THEN
          greens := CASE WHEN greens IS NULL THEN court_band ELSE ST_Union(greens, court_band) END;
          protected_court := court_band;
          flags := flags || to_jsonb('designed_central_court_v1'::text);
        END IF;
        court_used := true;
        drive_band := ST_Difference(ST_Intersection(rot,
          ST_MakeEnvelope(a0, y + bar_depth + stall_d, a1, y + bar_depth + stall_d + aisle, 2274)),
          ST_Difference(avoid, ST_Buffer(spine, 4)));
        IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
          drives := CASE WHEN drives IS NULL THEN drive_band ELSE ST_Union(drives, drive_band) END;
          mid := y + bar_depth + stall_d + aisle / 2;
          cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(a0, mid), ST_MakePoint(a1, mid)), 2274));
          IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
            drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl, cl) END;
          END IF;
        END IF;
        park_band := ST_Difference(ST_Intersection(rot,
          ST_MakeEnvelope(a0, y + bar_depth, a1, y + bar_depth + stall_d, 2274)), avoid);
        park_band := ST_Union(park_band, ST_Difference(ST_Intersection(rot,
          ST_MakeEnvelope(a0, y + bar_depth + stall_d + aisle, a1, y + bar_depth + drive_gap, 2274)), avoid));
        IF park_band IS NOT NULL AND NOT ST_IsEmpty(park_band) THEN
          parks := CASE WHEN parks IS NULL THEN park_band ELSE ST_Union(parks, park_band) END;
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
    use_court := false;
  END LOOP;

  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- SLAB-FALLBACK PLACEMENT (generalization sweep 2026-07-20): the band
    -- grid demands OBB-aligned rectangles the true polygon must COVER, so
    -- irregular envelopes placed ZERO bars — the dominant class in a random
    -- 12-parcel sample (6 of 9 failures). Scan bar-depth slabs across the
    -- envelope, keep near-rectangular pieces hugging the spine corridor
    -- (access contract), relax the minimum run to 45 ft. Downstream parking
    -- machinery operates on these bars normally.
    residual := ST_CollectionExtract(ST_Difference(rot,
      ST_UnaryUnion(ST_Collect(ARRAY[
        ST_Buffer(avoid, 0.1),
        CASE WHEN parks IS NULL THEN NULL ELSE ST_Buffer(parks, 1) END,
        CASE WHEN drives IS NULL THEN NULL ELSE ST_Buffer(drives, 2) END
      ]))), 3);
    IF residual IS NOT NULL AND NOT ST_IsEmpty(residual) THEN
      yoff := bymin + 2;
      WHILE yoff + bar_depth*0.6 <= bymax
            AND n_bars < coalesce(directive_limit,6) LOOP
        slab := ST_Intersection(residual,
                  ST_MakeEnvelope(bxmin, yoff, bxmax, LEAST(yoff+bar_depth, bymax-1), 2274));
        IF slab IS NOT NULL AND NOT ST_IsEmpty(slab) THEN
          FOR spiece IN
            SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(slab,3))).geom AS g) q
            ORDER BY ST_Area(g) DESC, ST_XMin(g)
          LOOP
            EXIT WHEN n_bars >= coalesce(directive_limit,6);
            pminx := ST_XMin(spiece.g); pmaxx := ST_XMax(spiece.g);
            pminy := ST_YMin(spiece.g); pmaxy := ST_YMax(spiece.g);
            CONTINUE WHEN (pmaxx-pminx) < 45 OR (pmaxy-pminy) < bar_depth*0.6;
            CONTINUE WHEN (pmaxx-pminx)*(pmaxy-pminy) > ST_Area(spiece.g)*1.08;
            cand := ST_MakeEnvelope(pminx+0.5, pminy+0.5, pmaxx-0.5, pmaxy-0.5, 2274);
            CONTINUE WHEN cand IS NULL OR ST_Area(cand) < 45*bar_depth*0.6;
            CONTINUE WHEN NOT ST_Covers(ST_Buffer(spiece.g,0.3), cand);
            CONTINUE WHEN NOT ST_DWithin(cand, spine, GREATEST(40,stall_d+aisle/2));
            bars_arr := bars_arr || cand;
            bars_capacity_arr := bars_capacity_arr || cand;
            tot_fp := tot_fp + ST_Area(cand);
            n_bars := n_bars + 1;
            avoid := ST_Union(avoid, ST_Buffer(cand, 10));
            residual := ST_CollectionExtract(ST_Difference(residual, ST_Buffer(cand, 10)), 3);
            flags := flags || to_jsonb('bar_placement_slab_fallback_irregular_envelope'::text);
          END LOOP;
        END IF;
        yoff := yoff + bar_depth + bar_gap;
      END LOOP;
    END IF;
  END IF;

  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- MICC BLOCK PACKER (P0-1/P0-2): when the band grid and slab scan both
    -- place nothing — tiny lots AND large irregular/bent envelopes (their
    -- inscribed radii measured 42-100 ft while every rectangle test
    -- failed) — pack up to four blocks anchored on the maximum inscribed
    -- circle (street-adjacent first), shrinking through a size ladder
    -- until the true polygon covers each. A flush connector strip runs
    -- from each block toward the spine so the access contract can hold;
    -- the final hard gates still decide honesty.
    core_g := ST_Difference(rot, ST_Buffer(spine, 3));
    FOR passes IN 1..coalesce(directive_limit,4) LOOP
      EXIT WHEN core_g IS NULL OR ST_IsEmpty(core_g);
      core_g := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(core_g,3))).geom AS g) q
                 ORDER BY ST_Area(g) DESC LIMIT 1);
      EXIT WHEN core_g IS NULL OR ST_IsEmpty(core_g) OR ST_Area(core_g) < 1500;
      SELECT (mic).center, (mic).radius INTO micc_center, micc_radius
      FROM (SELECT ST_MaximumInscribedCircle(core_g) AS mic) m;
      EXIT WHEN micc_radius IS NULL OR micc_radius < 14;
      placed := false;
      <<plex_search>>
      FOREACH blen IN ARRAY (
        case when directive_active and directive_bar_len is not null
          then ARRAY[least(280,directive_bar_len),240,200,160,120,100,80,60,40]::numeric[]
          else ARRAY[200,160,120,100,80,70,60,50,40]::numeric[] end
      ) LOOP
        FOREACH bdep IN ARRAY ARRAY[bar_depth, 45, 34, 28] LOOP
          FOR tries IN 0..1 LOOP
            IF tries = 0 AND passes = 1 THEN
              IF abs(ST_Y(entry_rot) - bymin) <= abs(ST_Y(entry_rot) - bymax) THEN
                yoff := bymin + aisle + 8 + bdep/2;
              ELSE
                yoff := bymax - aisle - 8 - bdep/2;
              END IF;
            ELSE
              yoff := ST_Y(micc_center);
            END IF;
            bar := ST_MakeEnvelope(
              ST_X(micc_center)-blen/2, yoff-bdep/2,
              ST_X(micc_center)+blen/2, yoff+bdep/2, 2274);
            CONTINUE WHEN bar IS NULL OR ST_Area(bar) < 1120;
            CONTINUE WHEN NOT ST_Covers(ST_Buffer(core_g,0.3), bar);
            bars_arr := bars_arr || bar;
            bars_capacity_arr := bars_capacity_arr || bar;
            tot_fp := tot_fp + ST_Area(bar);
            n_bars := n_bars + 1;
            flags := flags || to_jsonb('compact_plex_inscribed_block'::text);
            -- Corridor to the actual spine geometry (not merely spine_x). Deep
            -- MICC blocks on irregular lots were losing connectors at the
            -- prune-to-spine step because a horizontal strip at block Y never
            -- intersected the front entry spine polygon.
            IF spine IS NOT NULL AND NOT ST_IsEmpty(spine) THEN
              cand := ST_Intersection(
                rot,
                ST_Buffer(
                  ST_ShortestLine(ST_Centroid(bar), spine),
                  aisle/2.0,
                  'endcap=flat join=mitre'
                )
              );
              IF cand IS NOT NULL AND NOT ST_IsEmpty(cand) THEN
                cand := ST_CollectionExtract(ST_Difference(cand, ST_Buffer(bar, 0.75)), 3);
              END IF;
            ELSE
              cand := NULL;
            END IF;
            IF cand IS NOT NULL AND NOT ST_IsEmpty(cand) THEN
              plex_connectors := CASE WHEN plex_connectors IS NULL THEN cand
                                      ELSE ST_Union(plex_connectors, cand) END;
              core_g := ST_Difference(core_g, ST_Buffer(cand, 2));
              flags := flags || to_jsonb('compact_plex_connector_to_spine_geom_v1'::text);
            END IF;
            core_g := ST_Difference(core_g, ST_Buffer(bar, 12));
            placed := true;
            EXIT plex_search;
          END LOOP;
        END LOOP;
      END LOOP;
      EXIT WHEN NOT placed;
    END LOOP;
  END IF;

  IF n_bars = 0 AND COALESCE(array_length(pin_geoms, 1), 0) = 0 THEN
    -- Structured refusal: dimensions, not a dead string. Examples identify
    -- failure classes; the payload lets the class be measured.
    RETURN jsonb_build_object('error', 'planner_envelope_unplaceable',
      'reason', 'no bar placement satisfies the grammar in this envelope, including the slab fallback',
      'envelope_width_ft', round(bxmax-bxmin),
      'envelope_depth_ft', round(bymax-bymin),
      'min_bar_ft', jsonb_build_object('length', 45, 'depth', round(bar_depth*0.6)),
      'flags', flags);
  END IF;

  drives := CASE WHEN drives IS NULL THEN spine ELSE ST_Union(drives,spine) END;
  IF plex_connectors IS NOT NULL THEN
    drives := ST_Union(drives, plex_connectors);
  END IF;

  -- Courtyard regime + compact_plex bypasses the band use_court loop. Place an
  -- honest designed court in open buildable area so plan_pattern court tips are
  -- not surface-only with court_placed=false.
  IF p_regime = 'courtyard'
     AND NOT court_used
     AND COALESCE(array_length(bars_arr,1),0) > 0
     AND (flags ? 'compact_plex_inscribed_block') THEN
    protected_court := ST_CollectionExtract(
      ST_Intersection(
        rot,
        ST_Difference(
          ST_Buffer(ST_Centroid(ST_Collect(bars_arr)), 55),
          ST_Buffer(ST_Collect(bars_arr), 12)
        )
      ),
      3
    );
    IF protected_court IS NOT NULL AND NOT ST_IsEmpty(protected_court)
       AND ST_Area(protected_court) >= 2000 THEN
      greens := CASE WHEN greens IS NULL THEN protected_court
                     ELSE ST_Union(greens, protected_court) END;
      court_used := true;
      flags := flags || to_jsonb('designed_central_court_v1'::text);
      flags := flags || to_jsonb('compact_plex_courtyard_amenity_v1'::text);
    ELSE
      protected_court := NULL;
    END IF;
  END IF;
  -- Resolve the generated building union before adding bridge pavement. A
  -- connector may not cross a residential footprint merely to make the drive
  -- graph appear connected.
  SELECT ST_UnaryUnion(ST_Collect(bg))
    INTO bars_u
  FROM unnest(bars_arr) AS bg;
  -- The centerline graph is the connectivity source of truth. Buffer it back
  -- to aisle width and union it into the pavement so clipped bands cannot leave
  -- visually adjacent but topologically disconnected drive components.
  IF drives_cl IS NOT NULL AND NOT ST_IsEmpty(drives_cl) THEN
    drives := ST_UnaryUnion(ST_Union(
      drives,
      ST_Intersection(rot,ST_Buffer(drives_cl,aisle/2.0))
    ));
    flags := flags || to_jsonb('drive_connectors_from_centerline_graph'::text);
  END IF;

  -- Clipped irregular parcels can leave a transverse aisle segment on the far
  -- side of a notch. Explicitly bridge each such component to the primary
  -- spine, then let the hard graph validator prove the resulting union.
  FOR comp IN
    SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom AS geom
  LOOP
    IF NOT ST_Intersects(comp.geom,spine) THEN
      drive_band := ST_Intersection(
        rot,
        ST_Buffer(ST_ShortestLine(comp.geom,spine),aisle/2.0,'endcap=flat join=mitre')
      );
      IF drive_band IS NOT NULL
         AND NOT ST_IsEmpty(drive_band)
         AND (
           bars_u IS NULL
           OR COALESCE(ST_Area(ST_Intersection(drive_band,ST_Buffer(bars_u,1))),0)<1
         ) THEN
        drives := ST_UnaryUnion(ST_Union(drives,drive_band));
      ELSIF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
        -- Route around residential footprints instead of abandoning the lobe.
        -- Irregular MICC multi-block packs (garden/court on RM6-scale lots) were
        -- collapsing to a single 3600-sf block when the shortest bridge clipped a bar.
        drive_band := ST_CollectionExtract(
          ST_Intersection(
            rot,
            ST_Difference(drive_band, ST_Buffer(bars_u, 1.0))
          ),
          3
        );
        IF drive_band IS NOT NULL
           AND NOT ST_IsEmpty(drive_band)
           AND ST_Intersects(drive_band, spine)
           AND ST_Intersects(drive_band, comp.geom) THEN
          drives := ST_UnaryUnion(ST_Union(drives, drive_band));
          flags := flags || to_jsonb('drive_bridge_routed_around_building_v1'::text);
        ELSE
          flags := flags || to_jsonb('drive_bridge_blocked_by_building'::text);
        END IF;
      END IF;
    END IF;
  END LOOP;
  flags := flags || to_jsonb('drive_components_bridged_to_spine'::text);

  -- If the parcel itself prevents a legal connector, retain only pavement that
  -- is connected to the primary entry spine. Generated bars and parking in
  -- isolated lobes are removed and the yield is recomputed; user pins are not
  -- silently removed and will fail the final access gate instead.
  SELECT ST_UnaryUnion(ST_Collect(x.geom))
    INTO drives
  FROM (
    SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom
  ) x
  WHERE ST_Intersects(x.geom,spine);

  IF drives IS NULL OR ST_IsEmpty(drives) THEN
    RETURN jsonb_build_object('error','planner_drive_network_missing','flags',flags);
  END IF;

  IF parks IS NOT NULL AND NOT ST_IsEmpty(parks) THEN
    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO parks
    FROM (SELECT (ST_Dump(parks)).geom) x
    WHERE ST_DWithin(x.geom,drives,stall_d+5);
  END IF;

  filtered_bars := '{}'::geometry[];
  tot_fp := 0;
  n_bars := 0;
  FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
    IF (ST_DWithin(bars_arr[k],drives,GREATEST(40,stall_d+aisle/2))
        AND (parks IS NULL OR ST_IsEmpty(parks)
             OR ST_DWithin(ST_Centroid(bars_arr[k]),parks,250)))
       OR directive_active THEN
      filtered_bars := filtered_bars || bars_arr[k];
      tot_fp := tot_fp+ST_Area(bars_arr[k]);
      n_bars := n_bars+1;
      IF directive_active
         AND NOT (ST_DWithin(bars_arr[k],drives,GREATEST(40,stall_d+aisle/2))
                  AND (parks IS NULL OR ST_IsEmpty(parks)
                       OR ST_DWithin(ST_Centroid(bars_arr[k]),parks,250))) THEN
        flags := flags || to_jsonb('massing_bar_preserved_for_final_access_gate'::text);
      END IF;
    ELSE
      yield_clamp_reason := 'circulation_connectivity';
      flags := flags || to_jsonb('disconnected_site_lobe_excluded'::text);
    END IF;
  END LOOP;
  bars_arr := filtered_bars;
  -- Preserve the maximum connected building geometry before the hard parking
  -- solve trims it. A second parking pass can later regrow toward this capacity
  -- without inventing a new placement or crossing the building envelope.
  bars_capacity_arr := bars_arr;
  capacity_fp := tot_fp;
  drives_cl := ST_Intersection(drives_cl,drives);

  -- AMENITY PROGRAM (design grammar v2): at scale, a clubhouse is the
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

  gfa := tot_fp*(floors - park_floors) - amen_gsf;
  IF max_far IS NOT NULL AND tot_fp>0 THEN
    far_floor_cap := GREATEST(1,floor(max_far*parcel_area/tot_fp)::integer);
    IF floors>far_floor_cap THEN
      floors := far_floor_cap;
      yield_clamp_reason := COALESCE(yield_clamp_reason,'far');
      flags := flags || to_jsonb('gsf_target_clamped_by_far'::text);
    END IF;
  END IF;
  gfa := tot_fp*(floors - park_floors) - amen_gsf;

  -- Parking and drives are now geometrically fixed. Adapt only the final bar,
  -- then final bars, so the result approaches the GSF target while satisfying
  -- parking-land and impervious-land hard limits.
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  tot_park := COALESCE(ST_Area(parks),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
  target_stalls := ceil(target_units*ratio)::integer;

  -- Before sacrificing GSF, use remaining land next to the connected drive
  -- network for one-row-deep surface parking. The 18-foot buffer is the stall
  -- module; buildings, drives and existing stalls are subtracted explicitly.
  IF n_stalls<target_stalls THEN
    SELECT ST_UnaryUnion(ST_Collect(bg))
      INTO bars_u
    FROM unnest(bars_arr) AS bg;

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    supplemental_parking := ST_CollectionExtract(
      ST_Difference(
        ST_Intersection(parking_rot,ST_Buffer(drives,stall_d)),
        avoid
      ),
      3
    );

    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO supplemental_parking
    FROM (SELECT (ST_Dump(supplemental_parking)).geom) x
    WHERE ST_Area(x.geom)>300;

    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
      IF COALESCE(ST_Area(ST_Difference(supplemental_parking,rot)),0)>1 THEN
        flags := flags || to_jsonb('parking_envelope_side_setback_inset_pending_specific_parking_setbacks'::text);
      END IF;
      parks := CASE WHEN parks IS NULL THEN supplemental_parking
                    ELSE ST_UnaryUnion(ST_Union(parks,supplemental_parking)) END;
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
      flags := flags || to_jsonb('supplemental_parking_along_connected_drives'::text);
    END IF;
  END IF;

  -- If edge parking is still short, search for one compact double-loaded field
  -- connected to the primary spine. Module depth is stall+aisle+stall; module
  -- length is sized only for the missing stalls.
  IF n_stalls<target_stalls THEN
    missing_stalls := target_stalls-n_stalls;
    relief_len := GREATEST(54,ceil(missing_stalls/2.0)*stall_w);

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    FOREACH relief_side IN ARRAY ARRAY[-1,1] LOOP
      relief_x0 := CASE WHEN relief_side<0
        THEN spine_x-aisle/2.0-4-drive_gap
        ELSE spine_x+aisle/2.0+4
      END;
      relief_y := bymin+5;

      WHILE relief_y+relief_len<=bymax-5 AND NOT relief_found LOOP
        relief_module := ST_MakeEnvelope(
          relief_x0,relief_y,
          relief_x0+drive_gap,relief_y+relief_len,
          2274
        );

        IF ST_Covers(rot,relief_module)
           AND COALESCE(ST_Area(ST_Intersection(relief_module,avoid)),0)<1 THEN
          relief_drive := ST_MakeEnvelope(
            relief_x0+stall_d,relief_y,
            relief_x0+stall_d+aisle,relief_y+relief_len,
            2274
          );
          relief_parking := ST_Union(
            ST_MakeEnvelope(relief_x0,relief_y,relief_x0+stall_d,relief_y+relief_len,2274),
            ST_MakeEnvelope(relief_x0+stall_d+aisle,relief_y,relief_x0+drive_gap,relief_y+relief_len,2274)
          );
          relief_connector := ST_Intersection(
            rot,
            ST_Buffer(
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(spine_x,relief_y+relief_len/2.0),2274),
                ST_SetSRID(ST_MakePoint(relief_x0+stall_d+aisle/2.0,relief_y+relief_len/2.0),2274)
              ),
              aisle/2.0,
              'endcap=flat join=mitre'
            )
          );

          IF relief_connector IS NOT NULL
             AND NOT ST_IsEmpty(relief_connector)
             AND COALESCE(ST_Area(ST_Intersection(relief_connector,CASE WHEN bars_u IS NULL THEN relief_connector ELSE ST_Buffer(bars_u,5) END)),0)<1 THEN
            drives := ST_UnaryUnion(ST_Union(drives,ST_Union(relief_drive,relief_connector)));
            parks := ST_UnaryUnion(ST_Union(parks,relief_parking));
            drives_cl := ST_Union(
              drives_cl,
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(spine_x,relief_y+relief_len/2.0),2274),
                ST_SetSRID(ST_MakePoint(relief_x0+stall_d+aisle/2.0,relief_y+relief_len/2.0),2274)
              )
            );
            relief_found := true;
            flags := flags || to_jsonb('double_loaded_relief_parking_connected_to_spine'::text);
          END IF;
        END IF;
        relief_y := relief_y+10;
      END LOOP;
      EXIT WHEN relief_found;
    END LOOP;

    IF NOT relief_found THEN
      -- Long, shallow infill parcels need the same module rotated 90 degrees:
      -- parking rows and the aisle run along the long parcel axis.
      SELECT ST_UnaryUnion(ST_Collect(g))
        INTO avoid
      FROM (
        VALUES
          (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
          (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
          (parks)
      ) obstacle(g)
      WHERE g IS NOT NULL;

      relief_y := bymin+5;
      WHILE relief_y+drive_gap<=bymax-5 AND NOT relief_found LOOP
        relief_x0 := bxmin+5;
        WHILE relief_x0+relief_len<=bxmax-5 AND NOT relief_found LOOP
          relief_module := ST_MakeEnvelope(
            relief_x0,relief_y,
            relief_x0+relief_len,relief_y+drive_gap,
            2274
          );
          relief_drive := ST_MakeEnvelope(
            relief_x0,relief_y+stall_d,
            relief_x0+relief_len,relief_y+stall_d+aisle,
            2274
          );
          relief_parking := ST_Union(
            ST_MakeEnvelope(
              relief_x0,relief_y,
              relief_x0+relief_len,relief_y+stall_d,
              2274
            ),
            ST_MakeEnvelope(
              relief_x0,relief_y+stall_d+aisle,
              relief_x0+relief_len,relief_y+drive_gap,
              2274
            )
          );
          mid := relief_y+stall_d+aisle/2.0;

          IF relief_x0+relief_len<spine_x THEN
            relief_connector := ST_Intersection(
              rot,
              ST_Buffer(
                ST_MakeLine(
                  ST_SetSRID(ST_MakePoint(relief_x0+relief_len,mid),2274),
                  ST_SetSRID(ST_MakePoint(spine_x,mid),2274)
                ),
                aisle/2.0,
                'endcap=flat join=mitre'
              )
            );
          ELSIF relief_x0>spine_x THEN
            relief_connector := ST_Intersection(
              rot,
              ST_Buffer(
                ST_MakeLine(
                  ST_SetSRID(ST_MakePoint(spine_x,mid),2274),
                  ST_SetSRID(ST_MakePoint(relief_x0,mid),2274)
                ),
                aisle/2.0,
                'endcap=flat join=mitre'
              )
            );
          ELSE
            relief_connector := NULL;
          END IF;

          IF ST_Covers(rot,relief_module)
             AND COALESCE(ST_Area(ST_Intersection(
                   relief_parking,
                   CASE WHEN avoid IS NULL THEN drives ELSE ST_UnaryUnion(ST_Union(avoid,drives)) END
                 )),0)<1
             AND COALESCE(ST_Area(ST_Intersection(relief_drive,avoid)),0)<1
             AND (
               ST_Intersects(relief_drive,spine)
               OR (
                 relief_connector IS NOT NULL
                 AND NOT ST_IsEmpty(relief_connector)
                 AND COALESCE(ST_Area(ST_Intersection(relief_connector,avoid)),0)<1
               )
             ) THEN
            drives := ST_UnaryUnion(ST_Union(
              drives,
              CASE WHEN relief_connector IS NULL THEN relief_drive
                   ELSE ST_Union(relief_drive,relief_connector) END
            ));
            parks := ST_UnaryUnion(ST_Union(parks,relief_parking));
            drives_cl := ST_Union(
              drives_cl,
              ST_SetSRID(ST_MakeLine(
                ST_MakePoint(relief_x0,mid),
                ST_MakePoint(relief_x0+relief_len,mid)
              ),2274)
            );
            IF relief_connector IS NOT NULL THEN
              drives_cl := ST_Union(
                drives_cl,
                ST_SetSRID(ST_MakeLine(
                  ST_MakePoint(spine_x,mid),
                  ST_MakePoint(
                    CASE WHEN relief_x0>spine_x THEN relief_x0 ELSE relief_x0+relief_len END,
                    mid
                  )
                ),2274)
              );
            END IF;
            relief_found := true;
            flags := flags || to_jsonb('horizontal_double_loaded_relief_parking'::text);
          END IF;

          relief_x0 := relief_x0+10;
        END LOOP;
        relief_y := relief_y+10;
      END LOOP;
    END IF;

    IF relief_found THEN
      tot_drive := ST_Area(drives);
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
    END IF;
  END IF;

  -- Deep or irregular infill parcels often have a narrow residual lobe
  -- behind the consolidated bars. Search that REAL residual in the orthogonal
  -- direction for one double-loaded parking module. Its stalls remain within
  -- 250 ft of a building and its aisle is connected to the frontage spine.
  if directive_active and n_stalls<target_stalls
     and bars_u is not null and drives is not null and not ST_IsEmpty(drives) then
    for heal_i in 1..4 loop
      exit when n_stalls>=target_stalls;
    residual := ST_CollectionExtract(ST_Difference(
      ST_Intersection(parking_rot,ST_Buffer(bars_u,245)),
      ST_UnaryUnion(ST_Collect(ARRAY[
        ST_Buffer(bars_u,5),
        ST_Buffer(drives,0.25),
        case when parks is null then null else parks end,
        case when protected_court is null then null else protected_court end
      ]))),3);
    best_len := 0;
    last_bar := NULL;
    drop_piece := NULL;
    sub_comp := NULL;

    for rpiece in
      select q.geom from (select (ST_Dump(residual)).geom) q
      where ST_Area(q.geom)>1000
      order by ST_Area(q.geom) desc
    loop
      pminx := ST_XMin(rpiece.geom); pmaxx := ST_XMax(rpiece.geom);
      pminy := ST_YMin(rpiece.geom); pmaxy := ST_YMax(rpiece.geom);
      if pmaxx-pminx>=drive_gap*0.90 and pmaxy-pminy>=54 then
        relief_x0 := pminx;
        while relief_x0+drive_gap<=pmaxx+0.01 loop
          relief_module := ST_CollectionExtract(ST_Intersection(
            rpiece.geom,ST_MakeEnvelope(
              relief_x0,pminy,relief_x0+drive_gap,pmaxy,2274)),3);
          relief_drive := ST_CollectionExtract(ST_Intersection(
            relief_module,ST_MakeEnvelope(
              relief_x0+stall_d,pminy,
              relief_x0+stall_d+aisle,pmaxy,2274)),3);
          relief_parking := ST_CollectionExtract(ST_Difference(
            relief_module,
            ST_UnaryUnion(ST_Collect(ARRAY[
              relief_drive,
              case when parks is null then null else parks end,
              case when drives is null then null else drives end,
              ST_Buffer(bars_u,5)
            ]))),3);
          relief_connector := case
            when relief_drive is null or ST_IsEmpty(relief_drive) then null
            when ST_DWithin(relief_drive,drives,0.5) then null
            else ST_CollectionExtract(ST_Difference(
              ST_Intersection(
                ST_Buffer(ST_ShortestLine(relief_drive,drives),aisle/2,
                  'endcap=flat join=mitre'),parking_rot),
              ST_Buffer(bars_u,0.25)),3)
          end;
          last_area := coalesce(ST_Area(relief_parking),0);
          if last_area>best_len
             and relief_drive is not null and not ST_IsEmpty(relief_drive)
             and (relief_connector is null or not ST_IsEmpty(relief_connector)) then
            best_len := last_area;
            last_bar := relief_parking;
            drop_piece := relief_drive;
            sub_comp := relief_connector;
          end if;
          relief_x0 := relief_x0+5;
        end loop;
      end if;
    end loop;

    if best_len>300 and last_bar is not null and not ST_IsEmpty(last_bar) then
      parks := case when parks is null or ST_IsEmpty(parks) then last_bar
                    else ST_UnaryUnion(ST_Union(parks,last_bar)) end;
      drives := ST_UnaryUnion(ST_Collect(ARRAY[
        drives,drop_piece,sub_comp
      ]));
      tot_drive := coalesce(ST_Area(drives),0);
      tot_park := coalesce(ST_Area(parks),0);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer
                  + floor(tot_fp*park_floors/380.0)::integer;
      flags := flags || to_jsonb('massing_vertical_residual_parking_relief_v1'::text);
    else
      exit;
    end if;
    end loop;
  end if;

  parking_units_cap := floor(GREATEST(n_stalls-GREATEST(1,ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer),0)/NULLIF(ratio,0))::integer;
  max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);

  actual_impervious := tot_fp+tot_park+tot_drive;
  IF max_impervious_sqft IS NOT NULL
     AND actual_impervious>max_impervious_sqft+1
     AND n_bars>0 THEN
    desired_fp := max_impervious_sqft-tot_park-tot_drive;
    IF desired_fp>=n_bars*bar_min*bar_depth AND desired_fp<tot_fp THEN
      bar_scale := desired_fp/tot_fp;
      FOR k IN 1..array_length(bars_arr,1) LOOP
        new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
        bars_arr[k] := ST_MakeEnvelope(
          ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
          ST_XMin(bars_arr[k])+new_len,ST_YMax(bars_arr[k]),2274);
      END LOOP;
      tot_fp := desired_fp;
      actual_impervious := tot_fp+tot_park+tot_drive;
      yield_clamp_reason := 'impervious_coverage';
      flags := flags || to_jsonb('bars_proportionally_trimmed_for_impervious'::text);
    END IF;
  END IF;
  WHILE max_impervious_sqft IS NOT NULL
        AND actual_impervious>max_impervious_sqft+1
        AND n_bars>0 LOOP
    excess_area := actual_impervious-max_impervious_sqft;
    last_bar := bars_arr[array_length(bars_arr,1)];
    last_area := ST_Area(last_bar);
    IF last_area-excess_area >= bar_min*bar_depth
       OR (array_length(bars_arr,1)=1 AND last_area-excess_area >= 1120) THEN
      shrink_len := excess_area/bar_depth;
      bars_arr[array_length(bars_arr,1)] := ST_MakeEnvelope(
        ST_XMin(last_bar),ST_YMin(last_bar),
        ST_XMax(last_bar)-shrink_len,ST_YMax(last_bar),2274);
      tot_fp := tot_fp-excess_area;
    ELSE
      IF array_length(bars_arr,1)>1 THEN
        tot_fp := tot_fp-last_area;
        bars_arr := bars_arr[1:array_length(bars_arr,1)-1];
        n_bars := n_bars-1;
      ELSIF last_area > 1140 THEN
        -- SELF-SIZING (P0-4): never destroy the last building for the
        -- arithmetic — shrink it toward the compact-plex minimum first.
        shrink_len := (last_area - GREATEST(1120, last_area - excess_area))
                      / GREATEST(ST_YMax(last_bar)-ST_YMin(last_bar), 1);
        bars_arr[1] := ST_MakeEnvelope(
          ST_XMin(last_bar),ST_YMin(last_bar),
          ST_XMax(last_bar)-shrink_len,ST_YMax(last_bar),2274);
        tot_fp := ST_Area(bars_arr[1]);
        flags := flags || to_jsonb('last_building_shrunk_for_self_sizing'::text);
      ELSIF floors > 1 + park_floors THEN
        -- ...then take floors down before conceding.
        floors := floors - 1;
        flags := flags || to_jsonb('floors_reduced_for_self_sizing'::text);
      ELSE
        tot_fp := tot_fp-last_area;
        bars_arr := '{}'::geometry[];
        n_bars := n_bars-1;
      END IF;
    END IF;
    actual_impervious := tot_fp+tot_park+tot_drive;
    yield_clamp_reason := 'impervious_coverage';
    flags := flags || to_jsonb('gsf_target_clamped_by_impervious_coverage'::text);
  END LOOP;

  gfa := tot_fp*(floors - park_floors) - amen_gsf;
  -- In directive mode, do not destroy the frozen composition based on the
  -- first parking pass. Complete the connected rear/interstitial parking
  -- system first; the final hard shortfall gate may still self-size the
  -- program, but fragmented early trimming is forbidden.
  IF NOT directive_active THEN
  IF gfa>max_gsf_by_parking+1 AND n_bars>0 THEN
    desired_fp := max_gsf_by_parking/GREATEST(floors,1);
    IF desired_fp>=n_bars*bar_min*bar_depth AND desired_fp<tot_fp THEN
      bar_scale := desired_fp/tot_fp;
      FOR k IN 1..array_length(bars_arr,1) LOOP
        new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
        bars_arr[k] := ST_MakeEnvelope(
          ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
          ST_XMin(bars_arr[k])+new_len,ST_YMax(bars_arr[k]),2274);
      END LOOP;
      tot_fp := desired_fp;
      gfa := tot_fp*(floors - park_floors) - amen_gsf;
      yield_clamp_reason := 'parking_land';
      flags := flags || to_jsonb('bars_proportionally_trimmed_for_parking'::text);
    END IF;
  END IF;
  WHILE gfa>max_gsf_by_parking+1 AND n_bars>0 LOOP
    excess_area := (gfa-max_gsf_by_parking)/GREATEST(floors,1);
    last_bar := bars_arr[array_length(bars_arr,1)];
    last_area := ST_Area(last_bar);
    IF last_area-excess_area >= bar_min*bar_depth
       OR (array_length(bars_arr,1)=1 AND last_area-excess_area >= 1120) THEN
      shrink_len := excess_area/bar_depth;
      bars_arr[array_length(bars_arr,1)] := ST_MakeEnvelope(
        ST_XMin(last_bar),ST_YMin(last_bar),
        ST_XMax(last_bar)-shrink_len,ST_YMax(last_bar),2274);
      tot_fp := tot_fp-excess_area;
    ELSE
      IF array_length(bars_arr,1)>1 THEN
        tot_fp := tot_fp-last_area;
        bars_arr := bars_arr[1:array_length(bars_arr,1)-1];
        n_bars := n_bars-1;
      ELSIF last_area > 1140 THEN
        -- SELF-SIZING (P0-4): never destroy the last building for the
        -- arithmetic — shrink it toward the compact-plex minimum first.
        shrink_len := (last_area - GREATEST(1120, last_area - excess_area))
                      / GREATEST(ST_YMax(last_bar)-ST_YMin(last_bar), 1);
        bars_arr[1] := ST_MakeEnvelope(
          ST_XMin(last_bar),ST_YMin(last_bar),
          ST_XMax(last_bar)-shrink_len,ST_YMax(last_bar),2274);
        tot_fp := ST_Area(bars_arr[1]);
        flags := flags || to_jsonb('last_building_shrunk_for_self_sizing'::text);
      ELSIF floors > 1 + park_floors THEN
        -- ...then take floors down before conceding.
        floors := floors - 1;
        flags := flags || to_jsonb('floors_reduced_for_self_sizing'::text);
      ELSE
        tot_fp := tot_fp-last_area;
        bars_arr := '{}'::geometry[];
        n_bars := n_bars-1;
      END IF;
    END IF;
    gfa := tot_fp*(floors - park_floors) - amen_gsf;
    yield_clamp_reason := 'parking_land';
    flags := flags || to_jsonb('gsf_target_clamped_by_parking'::text);
  END LOOP;
  ELSE
    flags := flags || to_jsonb('massing_program_parking_trim_deferred_to_final_gate_v1'::text);
  END IF;

  -- CONVERGENCE (docs/SOLVER_CONVERGENCE_SPEC.md section 2-3): the
  -- parking-search -> stall-recount -> bar-regrow pass repeats until no
  -- meaningful GSF improvement remains (bounded at 4 passes). A single pass
  -- was the old behavior; land freed beside re-grown bars is now used
  -- instead of being left on the table. Deterministic: no randomness, and
  -- each pass's regrow derives from the same capacity bars.
  FOR growth_pass IN 1..4 LOOP
    prev_gfa := gfa;
  -- The first parking solve can shorten bars and expose new land beside the
  -- connected drive network. Search that land once more, but only outside the
  -- directional building envelope, then regrow the preserved bars toward the
  -- legal GSF target supported by the new parking count.
  IF n_bars>0 AND parks IS NOT NULL AND drives IS NOT NULL THEN
    SELECT ST_UnaryUnion(ST_Collect(bg))
      INTO bars_u
    FROM unnest(bars_arr) AS bg;

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,1) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,1) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    supplemental_parking := ST_CollectionExtract(
      ST_Difference(
        ST_Intersection(
          ST_Difference(parking_rot,rot),
          ST_Buffer(drives,stall_d)
        ),
        avoid
      ),
      3
    );

    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO supplemental_parking
    FROM (SELECT (ST_Dump(supplemental_parking)).geom) x
    WHERE ST_Area(x.geom)>300;

    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
      parks := ST_UnaryUnion(ST_Union(parks,supplemental_parking));
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
      flags := flags || to_jsonb('second_pass_parking_outside_building_envelope'::text);

      parking_units_cap := floor(GREATEST(
        n_stalls-GREATEST(
          1,
          ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer
        ),
        0
      )/NULLIF(ratio,0))::integer;
      max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);

      desired_fp := LEAST(
        capacity_fp,
        target_gsf/GREATEST(floors,1),
        max_gsf_by_parking/GREATEST(floors,1),
        COALESCE(cov_cap_sqft,capacity_fp),
        COALESCE(max_impervious_sqft-tot_park-tot_drive,capacity_fp)
      );
      desired_fp := GREATEST(0,desired_fp);

      IF capacity_fp>0
         AND desired_fp>tot_fp+1
         AND desired_fp>=COALESCE(array_length(bars_capacity_arr,1),0)*bar_min*bar_depth THEN
        bar_scale := LEAST(1,desired_fp/capacity_fp);
        filtered_bars := '{}'::geometry[];
        tot_fp := 0;
        n_bars := 0;
        FOR k IN 1..COALESCE(array_length(bars_capacity_arr,1),0) LOOP
          new_len := (ST_XMax(bars_capacity_arr[k])-ST_XMin(bars_capacity_arr[k]))*bar_scale;
          bar := ST_MakeEnvelope(
            ST_XMin(bars_capacity_arr[k]),ST_YMin(bars_capacity_arr[k]),
            ST_XMin(bars_capacity_arr[k])+new_len,ST_YMax(bars_capacity_arr[k]),2274
          );
          filtered_bars := filtered_bars || bar;
          tot_fp := tot_fp+ST_Area(bar);
          n_bars := n_bars+1;
        END LOOP;
        bars_arr := filtered_bars;
        gfa := tot_fp*(floors - park_floors) - amen_gsf;
        IF gfa<target_gsf-1 THEN
          yield_clamp_reason := COALESCE(yield_clamp_reason,'parking_land');
        ELSIF yield_clamp_reason='parking_land' THEN
          yield_clamp_reason := NULL;
        END IF;
        flags := flags || to_jsonb('bars_regrown_after_second_parking_pass'::text);
      END IF;
    END IF;
  END IF;
    -- PHASE 2 (spec section 2): capacity bars are not the ceiling.
    -- (a) IN-ENVELOPE supplemental parking: stall land beside the drive
    --     network INSIDE the building envelope — the outside-only search
    --     missed exactly the land the residual proof points at.
    IF n_bars>0 AND parks IS NOT NULL AND drives IS NOT NULL THEN
      SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
      SELECT ST_UnaryUnion(ST_Collect(g)) INTO avoid
      FROM (VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
        (CASE WHEN greens IS NULL THEN NULL ELSE greens END),
        (drives),
        (parks)
      ) obstacle(g)
      WHERE g IS NOT NULL;
      supplemental_parking := ST_CollectionExtract(
        ST_Difference(ST_Intersection(rot, ST_Buffer(drives,stall_d)), avoid), 3);
      SELECT ST_UnaryUnion(ST_Collect(x.geom)) INTO supplemental_parking
      FROM (SELECT (ST_Dump(supplemental_parking)).geom) x WHERE ST_Area(x.geom)>300;
      IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN
        parks := ST_UnaryUnion(ST_Union(parks,supplemental_parking));
        tot_park := ST_Area(parks);
        n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
        -- Deep or irregular infill parcels often have a narrow residual lobe
  -- behind the consolidated bars. Search that REAL residual in the orthogonal
  -- direction for one double-loaded parking module. Its stalls remain within
  -- 250 ft of a building and its aisle is connected to the frontage spine.
  if directive_active and n_stalls<target_stalls
     and bars_u is not null and drives is not null and not ST_IsEmpty(drives) then
    for heal_i in 1..4 loop
      exit when n_stalls>=target_stalls;
    residual := ST_CollectionExtract(ST_Difference(
      ST_Intersection(parking_rot,ST_Buffer(bars_u,245)),
      ST_UnaryUnion(ST_Collect(ARRAY[
        ST_Buffer(bars_u,5),
        ST_Buffer(drives,0.25),
        case when parks is null then null else parks end,
        case when protected_court is null then null else protected_court end
      ]))),3);
    best_len := 0;
    last_bar := NULL;
    drop_piece := NULL;
    sub_comp := NULL;

    for rpiece in
      select q.geom from (select (ST_Dump(residual)).geom) q
      where ST_Area(q.geom)>1000
      order by ST_Area(q.geom) desc
    loop
      pminx := ST_XMin(rpiece.geom); pmaxx := ST_XMax(rpiece.geom);
      pminy := ST_YMin(rpiece.geom); pmaxy := ST_YMax(rpiece.geom);
      if pmaxx-pminx>=drive_gap*0.90 and pmaxy-pminy>=54 then
        relief_x0 := pminx;
        while relief_x0+drive_gap<=pmaxx+0.01 loop
          relief_module := ST_CollectionExtract(ST_Intersection(
            rpiece.geom,ST_MakeEnvelope(
              relief_x0,pminy,relief_x0+drive_gap,pmaxy,2274)),3);
          relief_drive := ST_CollectionExtract(ST_Intersection(
            relief_module,ST_MakeEnvelope(
              relief_x0+stall_d,pminy,
              relief_x0+stall_d+aisle,pmaxy,2274)),3);
          relief_parking := ST_CollectionExtract(ST_Difference(
            relief_module,
            ST_UnaryUnion(ST_Collect(ARRAY[
              relief_drive,
              case when parks is null then null else parks end,
              case when drives is null then null else drives end,
              ST_Buffer(bars_u,5)
            ]))),3);
          relief_connector := case
            when relief_drive is null or ST_IsEmpty(relief_drive) then null
            when ST_DWithin(relief_drive,drives,0.5) then null
            else ST_CollectionExtract(ST_Difference(
              ST_Intersection(
                ST_Buffer(ST_ShortestLine(relief_drive,drives),aisle/2,
                  'endcap=flat join=mitre'),parking_rot),
              ST_Buffer(bars_u,0.25)),3)
          end;
          last_area := coalesce(ST_Area(relief_parking),0);
          if last_area>best_len
             and relief_drive is not null and not ST_IsEmpty(relief_drive)
             and (relief_connector is null or not ST_IsEmpty(relief_connector)) then
            best_len := last_area;
            last_bar := relief_parking;
            drop_piece := relief_drive;
            sub_comp := relief_connector;
          end if;
          relief_x0 := relief_x0+5;
        end loop;
      end if;
    end loop;

    if best_len>300 and last_bar is not null and not ST_IsEmpty(last_bar) then
      parks := case when parks is null or ST_IsEmpty(parks) then last_bar
                    else ST_UnaryUnion(ST_Union(parks,last_bar)) end;
      drives := ST_UnaryUnion(ST_Collect(ARRAY[
        drives,drop_piece,sub_comp
      ]));
      tot_drive := coalesce(ST_Area(drives),0);
      tot_park := coalesce(ST_Area(parks),0);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer
                  + floor(tot_fp*park_floors/380.0)::integer;
      flags := flags || to_jsonb('massing_vertical_residual_parking_relief_v1'::text);
    else
      exit;
    end if;
    end loop;
  end if;

  parking_units_cap := floor(GREATEST(n_stalls-GREATEST(1,ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer),0)/NULLIF(ratio,0))::integer;
        max_gsf_by_parking := GREATEST(0,parking_units_cap*max_unit_gsf);
        flags := flags || to_jsonb('in_envelope_supplemental_parking'::text);
      END IF;
    END IF;

    -- (b) INFILL BARS from residual envelope land, capped by LIVE parking /
    --     coverage / impervious headroom (no downstream gate can trip) and
    --     honoring the access contract: near a drive, near parking.
    allowed_add_fp := GREATEST(0, LEAST(
      COALESCE(cov_cap_sqft - tot_fp, capacity_fp),
      COALESCE(max_impervious_sqft - tot_park - tot_drive - tot_fp, capacity_fp),
      GREATEST(max_gsf_by_parking - gfa, 0)/GREATEST(floors,1),
      GREATEST(target_gsf - gfa, 0)/GREATEST(floors,1)
    ));
    IF n_bars>0 AND allowed_add_fp > 2000
       AND (directive_limit IS NULL OR n_bars < directive_limit)
       AND drives IS NOT NULL AND parks IS NOT NULL THEN
      SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
      -- COURT REALLOCATION (spec phase 2b): green courts are reclaimable
      -- for footprint as long as the open-space guard below holds — a lot
      -- at 40% open with no binding minimum is hoarding land the objective
      -- says to build on.
      residual := ST_CollectionExtract(ST_Difference(rot,
        ST_UnaryUnion(ST_Collect(ARRAY[
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,12) END,
          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
          CASE WHEN protected_court IS NULL THEN NULL ELSE ST_Buffer(protected_court,2) END,
          ST_Buffer(drives,2),
          ST_Buffer(parks,1)
        ]))), 3);
      added_this_pass := 0;
      IF residual IS NOT NULL AND NOT ST_IsEmpty(residual) THEN
        FOR rpiece IN
          SELECT g FROM (SELECT (ST_Dump(residual)).geom AS g) q
          ORDER BY ST_Area(g) DESC, ST_YMin(g), ST_XMin(g)
        LOOP
          EXIT WHEN added_this_pass >= 2 OR allowed_add_fp < 2000
                    OR (directive_limit IS NOT NULL AND n_bars >= directive_limit);
          pminy := ST_YMin(rpiece.g); pmaxy := ST_YMax(rpiece.g);
          CONTINUE WHEN (pmaxy-pminy) < bar_depth*0.85 OR ST_Area(rpiece.g) < 2000;
          depth_used := LEAST(bar_depth, (pmaxy-pminy)-1);
          -- Irregular residuals defeat a bbox candidate; scan a bar-depth
          -- slab at three vertical anchors and keep near-rectangular pieces.
          FOR tries IN 0..2 LOOP
            EXIT WHEN added_this_pass >= 2 OR allowed_add_fp < 2000
                      OR (directive_limit IS NOT NULL AND n_bars >= directive_limit);
            yoff := pminy + 0.5 + (((pmaxy-pminy) - depth_used - 1) / 2.0) * tries;
            slab := ST_Intersection(rpiece.g,
                     ST_MakeEnvelope(ST_XMin(rpiece.g), yoff, ST_XMax(rpiece.g), yoff+depth_used, 2274));
            CONTINUE WHEN slab IS NULL OR ST_IsEmpty(slab);
            FOR spiece IN
              SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(slab,3))).geom AS g) q2
              ORDER BY ST_Area(g) DESC, ST_XMin(g)
            LOOP
              EXIT WHEN added_this_pass >= 2 OR allowed_add_fp < 2000
                        OR (directive_limit IS NOT NULL AND n_bars >= directive_limit);
              pminx := ST_XMin(spiece.g); pmaxx := ST_XMax(spiece.g);
              CONTINUE WHEN (pmaxx-pminx) < 50 OR ST_Area(spiece.g) < 2000;
              CONTINUE WHEN (pmaxx-pminx)*depth_used > ST_Area(spiece.g)*1.05;
              cand := ST_MakeEnvelope(
                pminx+0.5, yoff+0.1,
                LEAST(pmaxx-0.5, pminx+0.5+allowed_add_fp/GREATEST(depth_used,1)),
                yoff+depth_used-0.1, 2274);
              CONTINUE WHEN cand IS NULL OR ST_Area(cand) < 2000;
              CONTINUE WHEN NOT ST_Covers(ST_Buffer(spiece.g,0.3), cand);
              CONTINUE WHEN NOT ST_DWithin(cand, drives, GREATEST(40,stall_d+aisle/2));
              CONTINUE WHEN NOT ST_DWithin(ST_Centroid(cand), parks, 250);
              -- Open-space guard: the addition must leave the lot at or
              -- above the binding minimum (15% floor when none binds).
              open_after := GREATEST(0, parcel_area - (tot_fp + ST_Area(cand)) - tot_park - tot_drive)
                            / NULLIF(parcel_area,0) * 100.0;
              CONTINUE WHEN open_after < GREATEST(COALESCE(min_open, 15), 15);
              IF greens IS NOT NULL AND ST_Intersects(cand, greens) THEN
                greens := ST_CollectionExtract(ST_Difference(greens, ST_Buffer(cand,2)), 3);
                tot_green := COALESCE(ST_Area(greens),0);
                flags := flags || to_jsonb('court_land_reallocated_to_infill_bar'::text);
              END IF;
              bars_arr := bars_arr || cand;
              bars_capacity_arr := bars_capacity_arr || cand;
              capacity_fp := capacity_fp + ST_Area(cand);
              tot_fp := tot_fp + ST_Area(cand);
              n_bars := n_bars + 1;
              gfa := tot_fp*(floors - park_floors) - amen_gsf;
              allowed_add_fp := allowed_add_fp - ST_Area(cand);
              added_this_pass := added_this_pass + 1;
              flags := flags || to_jsonb('infill_bar_added_from_residual_envelope'::text);
            END LOOP;
          END LOOP;
        END LOOP;
      END IF;
      IF added_this_pass > 0 AND gfa >= target_gsf-1 AND yield_clamp_reason = 'parking_land' THEN
        yield_clamp_reason := NULL;
      END IF;
    END IF;

    EXIT WHEN gfa <= prev_gfa + GREATEST(50, prev_gfa*0.005);
  END LOOP;

  IF n_bars=0 AND COALESCE(array_length(pin_geoms,1),0)=0 THEN
    RETURN jsonb_build_object(
      'error','planner_parking_infeasible',
      'reason','no residential bar remains after hard parking and impervious solve',
      'flags',flags
    );
  END IF;
  gfa := tot_fp*(floors - park_floors) - amen_gsf;

  -- Serialize generated bars (with final floors), then pins (own floors)
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
  -- Unit count is a program variable inside the achieved GSF frontier.
  -- If edge parking is still short, search for one compact double-loaded field
  -- connected to the primary spine. Module depth is stall+aisle+stall; module
  -- length is sized only for the missing stalls.
  IF n_stalls<target_stalls THEN
    missing_stalls := target_stalls-n_stalls;
    relief_len := GREATEST(54,ceil(missing_stalls/2.0)*stall_w);

    SELECT ST_UnaryUnion(ST_Collect(g))
      INTO avoid
    FROM (
      VALUES
        (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
        (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
        (drives),
        (parks)
    ) obstacle(g)
    WHERE g IS NOT NULL;

    FOREACH relief_side IN ARRAY ARRAY[-1,1] LOOP
      relief_x0 := CASE WHEN relief_side<0
        THEN spine_x-aisle/2.0-4-drive_gap
        ELSE spine_x+aisle/2.0+4
      END;
      relief_y := bymin+5;

      WHILE relief_y+relief_len<=bymax-5 AND NOT relief_found LOOP
        relief_module := ST_MakeEnvelope(
          relief_x0,relief_y,
          relief_x0+drive_gap,relief_y+relief_len,
          2274
        );

        IF ST_Covers(rot,relief_module)
           AND COALESCE(ST_Area(ST_Intersection(relief_module,avoid)),0)<1 THEN
          relief_drive := ST_MakeEnvelope(
            relief_x0+stall_d,relief_y,
            relief_x0+stall_d+aisle,relief_y+relief_len,
            2274
          );
          relief_parking := ST_Union(
            ST_MakeEnvelope(relief_x0,relief_y,relief_x0+stall_d,relief_y+relief_len,2274),
            ST_MakeEnvelope(relief_x0+stall_d+aisle,relief_y,relief_x0+drive_gap,relief_y+relief_len,2274)
          );
          relief_connector := ST_Intersection(
            rot,
            ST_Buffer(
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(spine_x,relief_y+relief_len/2.0),2274),
                ST_SetSRID(ST_MakePoint(relief_x0+stall_d+aisle/2.0,relief_y+relief_len/2.0),2274)
              ),
              aisle/2.0,
              'endcap=flat join=mitre'
            )
          );

          IF relief_connector IS NOT NULL
             AND NOT ST_IsEmpty(relief_connector)
             AND COALESCE(ST_Area(ST_Intersection(relief_connector,CASE WHEN bars_u IS NULL THEN relief_connector ELSE ST_Buffer(bars_u,5) END)),0)<1 THEN
            drives := ST_UnaryUnion(ST_Union(drives,ST_Union(relief_drive,relief_connector)));
            parks := ST_UnaryUnion(ST_Union(parks,relief_parking));
            drives_cl := ST_Union(
              drives_cl,
              ST_MakeLine(
                ST_SetSRID(ST_MakePoint(spine_x,relief_y+relief_len/2.0),2274),
                ST_SetSRID(ST_MakePoint(relief_x0+stall_d+aisle/2.0,relief_y+relief_len/2.0),2274)
              )
            );
            relief_found := true;
            flags := flags || to_jsonb('double_loaded_relief_parking_connected_to_spine'::text);
          END IF;
        END IF;
        relief_y := relief_y+10;
      END LOOP;
      EXIT WHEN relief_found;
    END LOOP;

    IF NOT relief_found THEN
      -- Long, shallow infill parcels need the same module rotated 90 degrees:
      -- parking rows and the aisle run along the long parcel axis.
      SELECT ST_UnaryUnion(ST_Collect(g))
        INTO avoid
      FROM (
        VALUES
          (CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,5) END),
          (CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,5) END),
          (parks)
      ) obstacle(g)
      WHERE g IS NOT NULL;

      relief_y := bymin+5;
      WHILE relief_y+drive_gap<=bymax-5 AND NOT relief_found LOOP
        relief_x0 := bxmin+5;
        WHILE relief_x0+relief_len<=bxmax-5 AND NOT relief_found LOOP
          relief_module := ST_MakeEnvelope(
            relief_x0,relief_y,
            relief_x0+relief_len,relief_y+drive_gap,
            2274
          );
          relief_drive := ST_MakeEnvelope(
            relief_x0,relief_y+stall_d,
            relief_x0+relief_len,relief_y+stall_d+aisle,
            2274
          );
          relief_parking := ST_Union(
            ST_MakeEnvelope(
              relief_x0,relief_y,
              relief_x0+relief_len,relief_y+stall_d,
              2274
            ),
            ST_MakeEnvelope(
              relief_x0,relief_y+stall_d+aisle,
              relief_x0+relief_len,relief_y+drive_gap,
              2274
            )
          );
          mid := relief_y+stall_d+aisle/2.0;

          IF relief_x0+relief_len<spine_x THEN
            relief_connector := ST_Intersection(
              rot,
              ST_Buffer(
                ST_MakeLine(
                  ST_SetSRID(ST_MakePoint(relief_x0+relief_len,mid),2274),
                  ST_SetSRID(ST_MakePoint(spine_x,mid),2274)
                ),
                aisle/2.0,
                'endcap=flat join=mitre'
              )
            );
          ELSIF relief_x0>spine_x THEN
            relief_connector := ST_Intersection(
              rot,
              ST_Buffer(
                ST_MakeLine(
                  ST_SetSRID(ST_MakePoint(spine_x,mid),2274),
                  ST_SetSRID(ST_MakePoint(relief_x0,mid),2274)
                ),
                aisle/2.0,
                'endcap=flat join=mitre'
              )
            );
          ELSE
            relief_connector := NULL;
          END IF;

          IF ST_Covers(rot,relief_module)
             AND COALESCE(ST_Area(ST_Intersection(
                   relief_parking,
                   CASE WHEN avoid IS NULL THEN drives ELSE ST_UnaryUnion(ST_Union(avoid,drives)) END
                 )),0)<1
             AND COALESCE(ST_Area(ST_Intersection(relief_drive,avoid)),0)<1
             AND (
               ST_Intersects(relief_drive,spine)
               OR (
                 relief_connector IS NOT NULL
                 AND NOT ST_IsEmpty(relief_connector)
                 AND COALESCE(ST_Area(ST_Intersection(relief_connector,avoid)),0)<1
               )
             ) THEN
            drives := ST_UnaryUnion(ST_Union(
              drives,
              CASE WHEN relief_connector IS NULL THEN relief_drive
                   ELSE ST_Union(relief_drive,relief_connector) END
            ));
            parks := ST_UnaryUnion(ST_Union(parks,relief_parking));
            drives_cl := ST_Union(
              drives_cl,
              ST_SetSRID(ST_MakeLine(
                ST_MakePoint(relief_x0,mid),
                ST_MakePoint(relief_x0+relief_len,mid)
              ),2274)
            );
            IF relief_connector IS NOT NULL THEN
              drives_cl := ST_Union(
                drives_cl,
                ST_SetSRID(ST_MakeLine(
                  ST_MakePoint(spine_x,mid),
                  ST_MakePoint(
                    CASE WHEN relief_x0>spine_x THEN relief_x0 ELSE relief_x0+relief_len END,
                    mid
                  )
                ),2274)
              );
            END IF;
            relief_found := true;
            flags := flags || to_jsonb('horizontal_double_loaded_relief_parking'::text);
          END IF;

          relief_x0 := relief_x0+10;
        END LOOP;
        relief_y := relief_y+10;
      END LOOP;
    END IF;

    IF relief_found THEN
      tot_drive := ST_Area(drives);
      tot_park := ST_Area(parks);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
    END IF;
  END IF;

  -- Program feasibility must see the complete street-bar parking system,
  -- not only the first generic packing pass. Add the rear double-loaded field
  -- before computing the parking-supported unit interval.
  if directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
     and coalesce(array_length(bars_arr,1),0)>0 then
    select ST_UnaryUnion(ST_Collect(bg)),max(ST_YMax(bg))
      into bars_u,yoff from unnest(bars_arr) bg;
    for passes in 1..8 loop
      exit when bymax-yoff < drive_gap+4;
      exit when n_stalls >= ceil(target_units*ratio*1.05);
      yoff := yoff+2;
      drive_band := ST_CollectionExtract(ST_Difference(
        ST_Intersection(parking_rot,ST_MakeEnvelope(
          bxmin,yoff+stall_d,bxmax,yoff+stall_d+aisle,2274)),
        ST_Buffer(bars_u,0.05)),3);
      park_band := ST_CollectionExtract(ST_Difference(
        ST_Intersection(parking_rot,ST_UnaryUnion(ST_Collect(ARRAY[
          ST_MakeEnvelope(bxmin,yoff,bxmax,yoff+stall_d,2274),
          ST_MakeEnvelope(bxmin,yoff+stall_d+aisle,bxmax,yoff+drive_gap,2274)
        ]))),
        ST_UnaryUnion(ST_Collect(ARRAY[
          ST_Buffer(bars_u,0.05),
          case when drives is null then null else ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()) end,
          case when parks is null then null else parks end,
          case when protected_court is null then null else protected_court end
        ]))),3);
      if drive_band is not null and not ST_IsEmpty(drive_band) then
        drives := case when drives is null or ST_IsEmpty(drives) then drive_band
                       else ST_UnaryUnion(ST_Union(drives,drive_band)) end;
      end if;
      if park_band is not null and not ST_IsEmpty(park_band) then
        parks := case when parks is null or ST_IsEmpty(parks) then park_band
                      else ST_UnaryUnion(ST_Union(parks,park_band)) end;
      end if;
      if (drive_band is not null and not ST_IsEmpty(drive_band))
         or (park_band is not null and not ST_IsEmpty(park_band)) then
        tot_drive := coalesce(ST_Area(drives),0);
        tot_park := coalesce(ST_Area(parks),0);
        n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer
                    + floor(tot_fp*park_floors/380.0)::integer;
        flags := flags || to_jsonb('massing_rear_parking_counted_before_program_v1'::text);
      end if;
      yoff := yoff+drive_gap+2;
    end loop;
  end if;

  -- Deterministic street-bar parking field. The massing directive and the
  -- parking system are solved as one composition: consolidated bars at the
  -- frontage, then only the stall rows and aisles needed behind them. This
  -- replaces fragmented generic parking before the hard program interval is
  -- evaluated. The final impervious/access gates below still have authority.
  if directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
     and coalesce(array_length(bars_arr,1),0)=directive_count
     and coalesce(array_length(bars_arr,1),0)>0 then
    select ST_UnaryUnion(ST_Collect(bg)),max(ST_YMax(bg))
      into bars_u,yoff from unnest(bars_arr) bg;

    -- Horizontal aisles overlap the side spine by a tenth of a foot so
    -- unary-union yields one drive component; parking rows are clipped back
    -- out of the pavement below.
    a0 := case when spine_x <= (bxmin+bxmax)/2 then bxmin+aisle-0.10 else bxmin+0.25 end;
    a1 := case when spine_x <= (bxmin+bxmax)/2 then bxmax-0.25 else bxmax-aisle+0.10 end;
    relief_len := greatest(0,a1-a0);
    target_stalls := ceil(target_units*ratio*1.08)::integer;
    excess_area := target_stalls*stall_w*stall_d/0.90;
    tries := case when relief_len>0 then ceil(excess_area/(relief_len*stall_d))::integer else 0 end;
    heal_i := ceil(tries/2.0)::integer;
    relief_y := yoff+6+heal_i*drive_gap;

    if relief_len>=54 and tries>0 and relief_y<=bymax-2 then
      -- Authoritative circulation root: a shortened side spine and one entry
      -- throat, not a full-depth pavement strip. Horizontal aisles terminate
      -- at that spine, so the entire field is one connected graph.
      spine := ST_CollectionExtract(ST_Intersection(
        parking_rot,
        ST_UnaryUnion(ST_Collect(ARRAY[
          ST_MakeEnvelope(spine_x-aisle/2,bymin,spine_x+aisle/2,relief_y,2274),
          ST_Buffer(ST_SetSRID(ST_MakeLine(
            ST_MakePoint(ST_X(entry_rot),bymin),
            ST_MakePoint(spine_x,bymin+aisle/2)
          ),2274),aisle/2,'endcap=flat join=mitre')
        ]))
      ),3);
      drives := spine;
      parks := NULL;
      tot_park := 0;
      added_this_pass := 0;
      yoff := yoff+6;

      for passes in 1..heal_i loop
        -- One aisle serves the row below and the row above.
        drive_band := ST_CollectionExtract(ST_Intersection(
          parking_rot,ST_MakeEnvelope(
            a0,yoff+(passes-1)*drive_gap+stall_d,
            a1,yoff+(passes-1)*drive_gap+stall_d+aisle,2274)
        ),3);
        if drive_band is not null and not ST_IsEmpty(drive_band) then
          drives := ST_UnaryUnion(ST_Union(ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),ST_Buffer(drive_band,0.05, public.fn_mf_drive_buf_style())));
        end if;

        if added_this_pass<tries and tot_park<excess_area-1 then
          last_area := least(relief_len*stall_d,excess_area-tot_park);
          new_len := last_area/stall_d;
          park_band := case when spine_x <= (bxmin+bxmax)/2 then
            ST_MakeEnvelope(a0,yoff+(passes-1)*drive_gap,a0+new_len,yoff+(passes-1)*drive_gap+stall_d,2274)
          else
            ST_MakeEnvelope(a1-new_len,yoff+(passes-1)*drive_gap,a1,yoff+(passes-1)*drive_gap+stall_d,2274)
          end;
          park_band := ST_CollectionExtract(ST_Difference(
            ST_Intersection(parking_rot,park_band),
            ST_UnaryUnion(ST_Collect(ARRAY[
              ST_Buffer(bars_u,0.05),ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),
              case when protected_court is null then null else protected_court end
            ]))),3);
          if park_band is not null and not ST_IsEmpty(park_band) then
            parks := case when parks is null or ST_IsEmpty(parks) then park_band
                          else ST_UnaryUnion(ST_Union(parks,park_band)) end;
            tot_park := coalesce(ST_Area(parks),0);
          end if;
          added_this_pass := added_this_pass+1;
        end if;

        if added_this_pass<tries and tot_park<excess_area-1 then
          last_area := least(relief_len*stall_d,excess_area-tot_park);
          new_len := last_area/stall_d;
          park_band := case when spine_x <= (bxmin+bxmax)/2 then
            ST_MakeEnvelope(
              a0,yoff+(passes-1)*drive_gap+stall_d+aisle,
              a0+new_len,yoff+(passes-1)*drive_gap+drive_gap,2274)
          else
            ST_MakeEnvelope(
              a1-new_len,yoff+(passes-1)*drive_gap+stall_d+aisle,
              a1,yoff+(passes-1)*drive_gap+drive_gap,2274)
          end;
          park_band := ST_CollectionExtract(ST_Difference(
            ST_Intersection(parking_rot,park_band),
            ST_UnaryUnion(ST_Collect(ARRAY[
              ST_Buffer(bars_u,0.05),ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),
              case when protected_court is null then null else protected_court end
            ]))),3);
          if park_band is not null and not ST_IsEmpty(park_band) then
            parks := case when parks is null or ST_IsEmpty(parks) then park_band
                          else ST_UnaryUnion(ST_Union(parks,park_band)) end;
            tot_park := coalesce(ST_Area(parks),0);
          end if;
          added_this_pass := added_this_pass+1;
        end if;
      end loop;

      tot_drive := coalesce(ST_Area(drives),0);
      tot_park := coalesce(ST_Area(parks),0);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer
                  + floor(tot_fp*park_floors/380.0)::integer;
      flags := flags
        || to_jsonb('massing_program_parking_field_rebuilt_v1'::text)
        || to_jsonb('massing_program_parking_behind_v1'::text);
    else
      flags := flags || to_jsonb('massing_program_parking_field_space_insufficient'::text);
    end if;
  end if;

  -- Deep or irregular infill parcels often have a narrow residual lobe
  -- behind the consolidated bars. Search that REAL residual in the orthogonal
  -- direction for one double-loaded parking module. Its stalls remain within
  -- 250 ft of a building and its aisle is connected to the frontage spine.
  if directive_active and n_stalls<target_stalls
     and bars_u is not null and drives is not null and not ST_IsEmpty(drives) then
    for heal_i in 1..4 loop
      exit when n_stalls>=target_stalls;
    residual := ST_CollectionExtract(ST_Difference(
      ST_Intersection(parking_rot,ST_Buffer(bars_u,245)),
      ST_UnaryUnion(ST_Collect(ARRAY[
        ST_Buffer(bars_u,5),
        ST_Buffer(drives,0.25),
        case when parks is null then null else parks end,
        case when protected_court is null then null else protected_court end
      ]))),3);
    best_len := 0;
    last_bar := NULL;
    drop_piece := NULL;
    sub_comp := NULL;

    for rpiece in
      select q.geom from (select (ST_Dump(residual)).geom) q
      where ST_Area(q.geom)>1000
      order by ST_Area(q.geom) desc
    loop
      pminx := ST_XMin(rpiece.geom); pmaxx := ST_XMax(rpiece.geom);
      pminy := ST_YMin(rpiece.geom); pmaxy := ST_YMax(rpiece.geom);
      if pmaxx-pminx>=drive_gap*0.90 and pmaxy-pminy>=54 then
        relief_x0 := pminx;
        while relief_x0+drive_gap<=pmaxx+0.01 loop
          relief_module := ST_CollectionExtract(ST_Intersection(
            rpiece.geom,ST_MakeEnvelope(
              relief_x0,pminy,relief_x0+drive_gap,pmaxy,2274)),3);
          relief_drive := ST_CollectionExtract(ST_Intersection(
            relief_module,ST_MakeEnvelope(
              relief_x0+stall_d,pminy,
              relief_x0+stall_d+aisle,pmaxy,2274)),3);
          relief_parking := ST_CollectionExtract(ST_Difference(
            relief_module,
            ST_UnaryUnion(ST_Collect(ARRAY[
              relief_drive,
              case when parks is null then null else parks end,
              case when drives is null then null else drives end,
              ST_Buffer(bars_u,5)
            ]))),3);
          relief_connector := case
            when relief_drive is null or ST_IsEmpty(relief_drive) then null
            when ST_DWithin(relief_drive,drives,0.5) then null
            else ST_CollectionExtract(ST_Difference(
              ST_Intersection(
                ST_Buffer(ST_ShortestLine(relief_drive,drives),aisle/2,
                  'endcap=flat join=mitre'),parking_rot),
              ST_Buffer(bars_u,0.25)),3)
          end;
          last_area := coalesce(ST_Area(relief_parking),0);
          if last_area>best_len
             and relief_drive is not null and not ST_IsEmpty(relief_drive)
             and (relief_connector is null or not ST_IsEmpty(relief_connector)) then
            best_len := last_area;
            last_bar := relief_parking;
            drop_piece := relief_drive;
            sub_comp := relief_connector;
          end if;
          relief_x0 := relief_x0+5;
        end loop;
      end if;
    end loop;

    if best_len>300 and last_bar is not null and not ST_IsEmpty(last_bar) then
      parks := case when parks is null or ST_IsEmpty(parks) then last_bar
                    else ST_UnaryUnion(ST_Union(parks,last_bar)) end;
      drives := ST_UnaryUnion(ST_Collect(ARRAY[
        drives,drop_piece,sub_comp
      ]));
      tot_drive := coalesce(ST_Area(drives),0);
      tot_park := coalesce(ST_Area(parks),0);
      n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer
                  + floor(tot_fp*park_floors/380.0)::integer;
      flags := flags || to_jsonb('massing_vertical_residual_parking_relief_v1'::text);
    else
      exit;
    end if;
    end loop;
  end if;

  parking_units_cap := floor(GREATEST(n_stalls-GREATEST(1,ceil(n_stalls*CASE WHEN flags ? 'bar_depth_reduced_for_double_loaded_parking' THEN 0.10 ELSE 0.05 END)::integer),0)/NULLIF(ratio,0))::integer;

  -- Density limits unit count, not floor area. Recover GSF by moving the
  -- fixed unit program toward the top of the hard size band and regrowing the
  -- same consolidated building geometry before accepting a low capture.
  if coalesce(mb->>'binding_constraint','') like 'density%' then
    density_units := greatest(1,least(coalesce(units_max,target_units),target_units,parking_units_cap));
    density_recovery_target_gsf := least(target_gsf,density_units*max_unit_gsf);
    if density_recovery_target_gsf>gfa+1 and tot_fp>0 then
      required_floors_for_coverage := ceil((density_recovery_target_gsf+amen_gsf)/tot_fp)::integer + park_floors;
      if required_floors_for_coverage>floors and required_floors_for_coverage<=legal_floor_cap then
        floors := required_floors_for_coverage;
        gfa := tot_fp*(floors-park_floors)-amen_gsf;
        flags := flags || to_jsonb('density_bound_story_ladder_recovery_v1'::text);
      end if;
      density_desired_fp := least(
        coalesce(capacity_fp,tot_fp),
        (density_recovery_target_gsf+amen_gsf)/greatest(floors-park_floors,1),
        coalesce(cov_cap_sqft,capacity_fp,tot_fp),
        coalesce(max_impervious_sqft-tot_park-tot_drive,capacity_fp,tot_fp)
      );
      if capacity_fp>0 and density_desired_fp>tot_fp+1 then
        bar_scale := least(1,density_desired_fp/capacity_fp);
        filtered_bars := '{}'::geometry[];
        tot_fp := 0;
        n_bars := 0;
        for k in 1..coalesce(array_length(bars_capacity_arr,1),0) loop
          new_len := (ST_XMax(bars_capacity_arr[k])-ST_XMin(bars_capacity_arr[k]))*bar_scale;
          bar := ST_MakeEnvelope(
            ST_XMin(bars_capacity_arr[k]),ST_YMin(bars_capacity_arr[k]),
            ST_XMin(bars_capacity_arr[k])+new_len,ST_YMax(bars_capacity_arr[k]),2274);
          filtered_bars := filtered_bars || bar;
          tot_fp := tot_fp+ST_Area(bar);
          n_bars := n_bars+1;
        end loop;
        bars_arr := filtered_bars;
        gfa := tot_fp*(floors-park_floors)-amen_gsf;
        flags := flags || to_jsonb('density_bound_bars_regrown_to_unit_size_band_v1'::text);
      end if;
    end if;
    target_units := density_units;
    target_unit_gsf := max_unit_gsf;
    flags := flags || to_jsonb('density_bound_unit_size_walk_up_v1'::text);
  end if;

  program_min_units := ceil(gfa/NULLIF(max_unit_gsf,0))::integer;
  program_max_units := floor(gfa/NULLIF(min_unit_gsf,0))::integer;
  flags := flags || to_jsonb('parking_geometry_tolerance_reserve_adaptive'::text);

  IF program_max_units < 1 OR program_max_units < program_min_units THEN
    RETURN jsonb_build_object(
      'error','planner_unit_gsf_band_infeasible',
      'gsf',round(gfa),
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'minimum_program_units',program_min_units,
      'maximum_program_units',program_max_units,
      'flags',flags
    );
  END IF;

  units := LEAST(
    COALESCE(units_max,target_units),
    target_units,
    parking_units_cap,
    program_max_units
  );
  IF units<program_min_units THEN
    -- PINNED BEST-EFFORT: a user-pinned footprint outranks the program band.
    -- The edit loop must never dead-end on a refusal — deliver the parking-
    -- and density-capped unit count (fewer, larger units) and say so in
    -- flags. Unpinned auto-generation keeps the hard refusal: the generator
    -- sized those bars itself, so infeasibility there is a real bug signal.
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      units := GREATEST(units, 1);
      flags := flags || to_jsonb('parking_caps_units_below_program_min'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_parking_infeasible',
      'reason','parking or density cannot support achieved GSF within the hard unit-size band',
      'gsf',round(gfa),
      'parking_units_cap',parking_units_cap,
      'minimum_program_units',program_min_units,
      'maximum_program_units',program_max_units,
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'stalls',n_stalls,
      'parking_sqft',round(tot_park),
      'drives_sqft',round(tot_drive),
      'footprint_sqft',round(tot_fp),
      'impervious_sqft',round(tot_fp+tot_park+tot_drive),
      'max_impervious_sqft',round(max_impervious_sqft),
      'parking_field_target_stalls',target_stalls,
      'parking_field_rows_needed',tries,
      'parking_field_rows_added',added_this_pass,
      'parking_field_length_ft',round(relief_len::numeric,1),
      'parking_components',case when parks is null or ST_IsEmpty(parks) then '[]'::jsonb else (
        select jsonb_agg(jsonb_build_object(
          'area_sqft',round(ST_Area(q.geom)),
          'stalls',floor(ST_Area(q.geom)/(stall_w*stall_d)*0.90)::integer,
          'ymin',round(ST_YMin(q.geom)::numeric,1),'ymax',round(ST_YMax(q.geom)::numeric,1)
        ) order by ST_YMin(q.geom))
        from (select (ST_Dump(parks)).geom) q
      ) end,
      'flags',flags
    );
    END IF;
  ELSE
    units := GREATEST(program_min_units,units);
  END IF;
  actual_unit_gsf := gfa/NULLIF(units,0);
  IF actual_unit_gsf < min_unit_gsf - 0.01 OR actual_unit_gsf > max_unit_gsf + 0.01 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('unit_gsf_out_of_band_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_unit_gsf_out_of_band',
      'gsf',round(gfa),
      'units',units,
      'actual_unit_gsf',round(actual_unit_gsf,2),
      'unit_gsf_min',min_unit_gsf,
      'unit_gsf_max',max_unit_gsf,
      'stalls',n_stalls,
      'parking_sqft',round(tot_park),
      'drives_sqft',round(tot_drive),
      'footprint_sqft',round(tot_fp),
      'impervious_sqft',round(tot_fp+tot_park+tot_drive),
      'max_impervious_sqft',round(max_impervious_sqft),
      'parking_field_target_stalls',target_stalls,
      'parking_field_rows_needed',tries,
      'parking_field_rows_added',added_this_pass,
      'parking_field_length_ft',round(relief_len::numeric,1),
      'parking_components',case when parks is null or ST_IsEmpty(parks) then '[]'::jsonb else (
        select jsonb_agg(jsonb_build_object(
          'area_sqft',round(ST_Area(q.geom)),
          'stalls',floor(ST_Area(q.geom)/(stall_w*stall_d)*0.90)::integer,
          'ymin',round(ST_YMin(q.geom)::numeric,1),'ymax',round(ST_YMax(q.geom)::numeric,1)
        ) order by ST_YMin(q.geom))
        from (select (ST_Dump(parks)).geom) q
      ) end,
      'flags',flags
    );
    END IF;
  ELSE
    flags := flags || to_jsonb('unit_gsf_band_hard_pass'::text);
  END IF;
  IF amen IS NOT NULL THEN
    ub := ST_Rotate(amen, theta, anchor);
    amen_j := jsonb_build_array(jsonb_build_object('name', 'Clubhouse',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb,
      'geom_2274', ST_AsGeoJSON(ST_SetSRID(ub, 2274))::jsonb));
    amen_l := jsonb_build_array(jsonb_build_object('name', 'Clubhouse',
      'area_sqft', round(ST_Area(amen)),
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb));
  END IF;
  IF pool_rect IS NOT NULL THEN
    ub := ST_Rotate(pool_rect, theta, anchor);
    amen_j := amen_j || jsonb_build_object('name', 'Pool court',
      'area_sqft', round(ST_Area(pool_rect)),
      'geom', ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub, 2274), 4326))::jsonb,
      'geom_2274', ST_AsGeoJSON(ST_SetSRID(ub, 2274))::jsonb);
    amen_l := amen_l || jsonb_build_object('name', 'Pool court',
      'area_sqft', round(ST_Area(pool_rect)),
      'geom', ST_AsGeoJSON(ST_Translate(ub, -ox, -oy))::jsonb);
  END IF;

  -- Final directive regrow: after all parking/convergence passes, use any
  -- remaining capacity in the SAME consolidated bars. The topology cleanup
  -- below clips conflicting parking and every hard parking/impervious gate then
  -- re-runs. This closes the common surplus-parking / short-bar residual.
  if directive_active and capacity_fp>0 and coalesce(array_length(bars_capacity_arr,1),0)>0 then
    density_recovery_target_gsf := least(target_gsf,coalesce(units,target_units)*max_unit_gsf);
    density_desired_fp := least(
      capacity_fp,
      (density_recovery_target_gsf+amen_gsf)/greatest(floors-park_floors,1),
      coalesce(cov_cap_sqft,capacity_fp),
      coalesce(max_impervious_sqft-tot_park-tot_drive,capacity_fp)
    );
    if density_desired_fp>tot_fp+1 then
      bar_scale := least(1,density_desired_fp/capacity_fp);
      filtered_bars := '{}'::geometry[];
      tot_fp := 0;
      n_bars := 0;
      for k in 1..coalesce(array_length(bars_capacity_arr,1),0) loop
        new_len := (ST_XMax(bars_capacity_arr[k])-ST_XMin(bars_capacity_arr[k]))*bar_scale;
        bar := ST_MakeEnvelope(
          ST_XMin(bars_capacity_arr[k]),ST_YMin(bars_capacity_arr[k]),
          ST_XMin(bars_capacity_arr[k])+new_len,ST_YMax(bars_capacity_arr[k]),2274);
        filtered_bars := filtered_bars || bar;
        tot_fp := tot_fp+ST_Area(bar);
        n_bars := n_bars+1;
      end loop;
      bars_arr := filtered_bars;
      gfa := tot_fp*(floors-park_floors)-amen_gsf;
      actual_unit_gsf := gfa/nullif(units,0);
      flags := flags || to_jsonb('massing_bars_regrown_to_directive_footprint_v1'::text);
    end if;
  end if;

  -- Before final topology cleanup, preserve the frozen composition by
  -- connecting any directive bar that is not yet within the vehicle-access
  -- threshold. The connector is clipped to the envelope and may not cross a
  -- different building; every downstream impervious/access gate still runs.
  SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
  if directive_active and bars_u is not null and drives is not null and not ST_IsEmpty(drives) then
    for k in 1..coalesce(array_length(bars_arr,1),0) loop
      if not ST_DWithin(bars_arr[k],drives,greatest(40,stall_d+aisle/2)) then
        if directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') then
          -- Each consolidated bar receives a short lateral throat to the side
          -- spine at its own midpoint. Unlike a global shortest path, this
          -- cannot be blocked by the other parallel bar.
          mid := (ST_YMin(bars_arr[k])+ST_YMax(bars_arr[k]))/2;
          bridge := ST_Buffer(ST_SetSRID(ST_MakeLine(
            ST_MakePoint(
              case when spine_x < ST_X(ST_Centroid(bars_arr[k]))
                   then ST_XMin(bars_arr[k]) else ST_XMax(bars_arr[k]) end,
              mid),
            ST_MakePoint(spine_x,mid)
          ),2274),aisle*0.35);
        else
          bridge := ST_Buffer(ST_ShortestLine(bars_arr[k],drives),aisle*0.35);
        end if;
        avoid := ST_CollectionExtract(ST_Difference(bars_u,ST_Buffer(bars_arr[k],0.10)),3);
        bridge := ST_CollectionExtract(ST_Difference(
          ST_Difference(ST_Intersection(bridge,rot),ST_Buffer(bars_arr[k],0.05)),
          case when avoid is null then ST_GeomFromText('POLYGON EMPTY',2274)
               else ST_Buffer(avoid,0.10) end),3);
        if bridge is not null and not ST_IsEmpty(bridge) then
          -- A tiny overlap buffer removes floating-point seams at the spine.
          drives := ST_UnaryUnion(ST_Union(ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),ST_Buffer(bridge,0.05, public.fn_mf_drive_buf_style())));
          flags := flags || to_jsonb('massing_bar_access_connector_added_v1'::text);
        end if;
      end if;
    end loop;
    -- Consolidated parallel bars are served by a real interstitial drive
    -- street. Connect that street to the frontage lane around BOTH parcel
    -- edges; building subtraction leaves whichever side is geometrically open.
    if directive_active
       and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
       and coalesce(array_length(bars_arr,1),0)>=2 then
      for k in 1..coalesce(array_length(bars_arr,1),0)-1 loop
        a0 := ST_YMax(bars_arr[k]);
        a1 := ST_YMin(bars_arr[k+1]);
        if a1<a0 then
          a0 := ST_YMax(bars_arr[k+1]);
          a1 := ST_YMin(bars_arr[k]);
        end if;
        mid := (a0+a1)/2;
        drive_band := ST_CollectionExtract(ST_Difference(
          ST_Intersection(rot,ST_MakeEnvelope(
            bxmin,mid-aisle/2,bxmax,mid+aisle/2,2274)),
          ST_Buffer(bars_u,0.05)),3);
        bridge := ST_CollectionExtract(ST_Difference(
          ST_Intersection(rot,ST_UnaryUnion(ST_Collect(ARRAY[
            ST_MakeEnvelope(bxmin,bymin,bxmin+aisle,mid+aisle/2,2274),
            ST_MakeEnvelope(bxmax-aisle,bymin,bxmax,mid+aisle/2,2274)
          ]))),
          ST_Buffer(bars_u,0.05)),3);
        if drive_band is not null and not ST_IsEmpty(drive_band) then
          drives := ST_UnaryUnion(ST_Union(ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),ST_Buffer(drive_band,0.05, public.fn_mf_drive_buf_style())));
        end if;
        if bridge is not null and not ST_IsEmpty(bridge) then
          drives := ST_UnaryUnion(ST_Union(ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),ST_Buffer(bridge,0.05, public.fn_mf_drive_buf_style())));
        end if;
        -- The interstitial street carries a legal stall row on each side when
        -- the bar spacing supplies the full 18+24+18 module. This is the
        -- primary surface-parking supply for a consolidated two-bar scheme.
        if a1-a0 >= 2*stall_d+aisle-2 then
          park_band := ST_CollectionExtract(ST_Difference(
            ST_Intersection(parking_rot,ST_UnaryUnion(ST_Collect(ARRAY[
              ST_MakeEnvelope(bxmin,a0,bxmax,a0+stall_d,2274),
              ST_MakeEnvelope(bxmin,a1-stall_d,bxmax,a1,2274)
            ]))),
            ST_UnaryUnion(ST_Collect(ARRAY[
              ST_Buffer(bars_u,0.05),
              ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),
              case when parks is null then null else parks end,
              case when protected_court is null then null else protected_court end
            ]))),3);
          if park_band is not null and not ST_IsEmpty(park_band) then
            parks := case when parks is null or ST_IsEmpty(parks) then park_band
                          else ST_UnaryUnion(ST_Union(parks,park_band)) end;
            flags := flags || to_jsonb('massing_interstitial_double_loaded_parking_v1'::text);
          end if;
        end if;
      end loop;
      flags := flags || to_jsonb('massing_interstitial_drive_streets_v1'::text);
    end if;

    -- Street-bar parti reserves parking behind the last consolidated bar. Add
    -- a complete double-loaded rear field whenever the directional envelope
    -- has one parking module of depth. The field connects to the same side
    -- spine, so it is both visible in the plan and counted only after the hard
    -- access/impervious gates.
    if directive_active
       and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep')
       and coalesce(array_length(bars_arr,1),0)>0 then
      select max(ST_YMax(bg)) into yoff from unnest(bars_arr) bg;
      if bymax-yoff >= drive_gap+4 then
        yoff := yoff+2;
        drive_band := ST_CollectionExtract(ST_Difference(
          ST_Intersection(parking_rot,ST_MakeEnvelope(
            bxmin,yoff+stall_d,bxmax,yoff+stall_d+aisle,2274)),
          ST_Buffer(bars_u,0.05)),3);
        park_band := ST_CollectionExtract(ST_Difference(
          ST_Intersection(parking_rot,ST_UnaryUnion(ST_Collect(ARRAY[
            ST_MakeEnvelope(bxmin,yoff,bxmax,yoff+stall_d,2274),
            ST_MakeEnvelope(bxmin,yoff+stall_d+aisle,bxmax,yoff+drive_gap,2274)
          ]))),
          ST_UnaryUnion(ST_Collect(ARRAY[
            ST_Buffer(bars_u,0.05),
            case when drives is null then null else ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()) end,
            case when parks is null then null else parks end,
            case when protected_court is null then null else protected_court end
          ]))),3);
        if drive_band is not null and not ST_IsEmpty(drive_band) then
          drives := case when drives is null or ST_IsEmpty(drives) then drive_band
                         else ST_UnaryUnion(ST_Union(drives,drive_band)) end;
        end if;
        if park_band is not null and not ST_IsEmpty(park_band) then
          parks := case when parks is null or ST_IsEmpty(parks) then park_band
                        else ST_UnaryUnion(ST_Union(parks,park_band)) end;
        end if;
        if (drive_band is not null and not ST_IsEmpty(drive_band))
           or (park_band is not null and not ST_IsEmpty(park_band)) then
          flags := flags || to_jsonb('massing_rear_double_loaded_parking_field_v1'::text);
        end if;
      end if;
    end if;

    -- New connected drive streets create new legal parking frontage. Re-run a
    -- final accessible parking fill before topology clipping; the downstream
    -- impervious self-heal removes excess pieces if the statutory budget binds.
    if directive_active and drives is not null and not ST_IsEmpty(drives) then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      supplemental_parking := ST_CollectionExtract(ST_Difference(
        ST_Intersection(parking_rot,ST_Buffer(drives,stall_d+2)),
        ST_UnaryUnion(ST_Collect(ARRAY[
          ST_Buffer(drives,0.10),
          case when bars_u is null then null else ST_Buffer(bars_u,5) end,
          case when pins_rot is null then null else ST_Buffer(pins_rot,5) end,
          case when parks is null then null else parks end,
          case when protected_court is null then null else protected_court end
        ]))),3);
      select ST_UnaryUnion(ST_Collect(x.geom)) into supplemental_parking
      from (select (ST_Dump(supplemental_parking)).geom) x
      where ST_Area(x.geom)>300
        and (bars_u is null or ST_DWithin(x.geom,bars_u,250));
      if supplemental_parking is not null and not ST_IsEmpty(supplemental_parking) then
        parks := case when parks is null or ST_IsEmpty(parks) then supplemental_parking
                      else ST_UnaryUnion(ST_Union(parks,supplemental_parking)) end;
        tot_park := coalesce(ST_Area(parks),0);
        flags := flags || to_jsonb('massing_parking_refilled_after_drive_topology_v1'::text);
      end if;
    end if;
    if spine is not null and not ST_IsEmpty(spine) then
      drives := ST_UnaryUnion(ST_Union(ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),ST_Buffer(spine,0.05, public.fn_mf_drive_buf_style())));
      flags := flags || to_jsonb('context_frontage_spine_reasserted_before_final_gate'::text);
    end if;
    tot_drive := coalesce(ST_Area(drives),0);
  end if;

  -- Supplemental search can create isolated pavement islands. The frozen
  -- frontage spine is the authoritative circulation root: retain only drive
  -- components connected to it, then retain only parking served by that
  -- connected network. Nothing inaccessible can inflate stall supply.
  if not directive_active and drives is not null and not ST_IsEmpty(drives) then
    select ST_UnaryUnion(ST_Collect(x.geom)) into main_comp
    from (select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom) x
    where spine is not null and ST_Intersects(x.geom,ST_Buffer(spine,0.5));
    if main_comp is null or ST_IsEmpty(main_comp) then
      main_comp := (select g from (
        select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom g
      ) q order by ST_Area(g) desc limit 1);
    end if;
    if main_comp is not null and not ST_IsEmpty(main_comp) then
      drives := main_comp;
      flags := flags || to_jsonb('drive_network_pruned_to_context_frontage_spine_v1'::text);
      if parks is not null and not ST_IsEmpty(parks) then
        select ST_UnaryUnion(ST_Collect(x.geom)) into parks
        from (select (ST_Dump(ST_CollectionExtract(parks,3))).geom) x
        where ST_DWithin(x.geom,drives,stall_d+5);
      end if;
    end if;
    tot_drive := coalesce(ST_Area(drives),0);
    tot_park := coalesce(ST_Area(parks),0);
  end if;

  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives) then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_drive_routing_ladder_v1'::text);
    end if;
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      for heal_i in 1..4 loop
        exit when drive_components<=1;
        bridge:=public.fn_mf_connect_drive_components_collector(
          drives,bars_u,parking_rot,aisle,
          case when max_impervious_sqft is null then null
               else greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0) end
        );
        exit when bridge is null or ST_IsEmpty(bridge)
          or ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(bridge),3))>=drive_components;
        drives:=bridge;
        tot_drive:=coalesce(ST_Area(drives),0);
        drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
        flags:=flags || to_jsonb('drive_components_connected_by_side_collector_v1'::text);
      end loop;
      flags:=flags || to_jsonb('drive_side_collector_iterated_v2'::text);
    end if;
  end if;

  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives) then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_drive_routing_ladder_v1'::text);
    end if;
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_dogleg(
        drives,bars_u,parking_rot,aisle,
        case when max_impervious_sqft is null then null
             else greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0) end
      );
      if bridge is not null and not ST_IsEmpty(bridge)
         and ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(bridge),3))<drive_components then
        drives:=bridge;
        tot_drive:=coalesce(ST_Area(drives),0);
        drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
        flags:=flags || to_jsonb('drive_components_connected_by_obstacle_dogleg_v1'::text);
      end if;
    end if;
  end if;

  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives) then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_drive_routing_ladder_v1'::text);
    end if;
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
      bridge:=public.fn_mf_connect_drive_components_shared_axis(
        drives,bars_u,parking_rot,aisle,
        case when max_impervious_sqft is null then null
             else greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0) end
      );
      if bridge is not null and not ST_IsEmpty(bridge)
         and ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(bridge),3))<drive_components then
        drives:=bridge;
        tot_drive:=coalesce(ST_Area(drives),0);
        drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
        flags:=flags || to_jsonb('drive_components_connected_by_shared_axis_v1'::text);
      end if;
    end if;
  end if;

  if (not directive_active or structure_seed_active)
     and drives is not null and not ST_IsEmpty(drives)
     and coalesce(array_length(bars_arr,1),0)>0 then
    if structure_seed_active then
      flags:=flags||to_jsonb('structure_seed_remote_drive_islands_prunable_v1'::text);
    end if;
    drive_components:=ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    if drive_components>1 then
      select c.g into main_comp
      from (
        select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom g
      ) c
      where not exists (
        select 1
        from generate_subscripts(bars_arr,1) s(k)
        where not ST_DWithin(
          bars_arr[s.k],c.g,greatest(40,stall_d+aisle/2)
        )
      )
      order by (
        select coalesce(sum(ST_Area(p.g)),0)
        from (select (ST_Dump(ST_CollectionExtract(parks,3))).geom g) p
        where parks is not null and ST_DWithin(p.g,c.g,stall_d+5)
      ) desc,ST_Area(c.g) desc
      limit 1;

      if main_comp is not null and not ST_IsEmpty(main_comp) then
        drives:=main_comp;
        if parks is not null and not ST_IsEmpty(parks) then
          select ST_UnaryUnion(ST_Collect(p.g)) into parks
          from (select (ST_Dump(ST_CollectionExtract(parks,3))).geom g) p
          where ST_DWithin(p.g,drives,stall_d+5);
        end if;
        tot_drive:=coalesce(ST_Area(drives),0);
        tot_park:=coalesce(ST_Area(parks),0);
        drive_components:=1;
        flags:=flags || to_jsonb('drive_islands_pruned_to_all_building_serving_component_v1'::text);
      end if;
    end if;
  end if;

  if structure_seed_active and drives is not null and not ST_IsEmpty(drives) then
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    target_stalls:=ceil(target_units*ratio)::integer;
    flags:=flags
      ||to_jsonb('structure_seed_refill_receipt_v1'::text)
      ||to_jsonb(('structure_seed_refill_input_fp_'||round(tot_fp))::text)
      ||to_jsonb(('structure_seed_refill_input_rear_depth_'||round(
          ST_YMax(parking_rot)-ST_YMax(bars_u)
        ))::text)
      ||to_jsonb(('structure_seed_refill_input_spine_x_'||round(spine_x))::text)
      ||to_jsonb(('structure_seed_refill_target_stalls_'||target_stalls)::text);
    select x.out_drives,x.out_parking,x.out_stalls,x.out_modules_added
      into drives,parks,n_stalls,added_this_pass
    from public.fn_mf_refill_structure_seed_parking(
      parking_rot,bars_u,drives,parks,spine_x,target_stalls,
      stall_w,stall_d,aisle,tot_fp,max_impervious_sqft
    ) x;
    tot_drive:=coalesce(ST_Area(drives),0);
    tot_park:=coalesce(ST_Area(parks),0);
    flags:=flags
      ||to_jsonb(('structure_seed_refill_returned_modules_'||coalesce(added_this_pass,0))::text)
      ||to_jsonb(('structure_seed_refill_returned_stalls_'||coalesce(n_stalls,0))::text)
      ||to_jsonb(('structure_seed_refill_returned_drive_components_'||case
          when drives is null or ST_IsEmpty(drives) then 0
          else ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3)) end
        )::text);
    if added_this_pass>0 then
      flags:=flags
        ||to_jsonb('structure_seed_connected_parking_refill_v1'::text)
        ||to_jsonb(('structure_seed_connected_parking_modules_'||added_this_pass)::text);
    end if;
  end if;

  if directive_active then
    flags := flags || to_jsonb('drive_component_prune_deferred_to_hard_graph_gate_v1'::text);
  end if;

  -- Final topology cleanup: parking and drives are disjoint systems. Rebuild
  -- the current bar union after any proportional trimming, then clip parking
  -- against both buildings and the connected drive pavement before counting.
  SELECT ST_UnaryUnion(ST_Collect(bg))
    INTO bars_u
  FROM unnest(bars_arr) AS bg;

  IF parks IS NOT NULL AND NOT ST_IsEmpty(parks) THEN
    parks := ST_CollectionExtract(
      ST_Difference(
        parks,
        ST_UnaryUnion(ST_Collect(ARRAY[
          ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),
          CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,0.05) END,
          CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,0.05) END
        ]))
      ),
      3
    );
    SELECT ST_UnaryUnion(ST_Collect(x.geom))
      INTO parks
    FROM (SELECT (ST_Dump(parks)).geom) x
    WHERE ST_Area(x.geom)>50;
  END IF;

  -- Pinned buildings claim their ground: pavement never runs beneath a
  -- user-placed footprint. If clipping severs the drive network, that is
  -- reported below as a pinned-best-effort flag, not a refusal.
  IF pins_rot IS NOT NULL AND drives IS NOT NULL AND NOT ST_IsEmpty(drives) THEN
    drives := ST_CollectionExtract(ST_Difference(drives, ST_Buffer(pins_rot, 0.05)), 3);
  END IF;

  tot_park := COALESCE(ST_Area(parks),0);
  tot_drive := COALESCE(ST_Area(drives),0);
  tot_green := COALESCE(ST_Area(greens),0);
  n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
  req_stalls := ceil(units*ratio)::integer;
  actual_impervious := tot_fp+tot_park+tot_drive;

  IF flags ? 'pin_outside_parcel' THEN
    RETURN jsonb_build_object('error','planner_pin_outside_parcel','flags',flags);
  END IF;
  IF max_cov IS NOT NULL AND tot_fp>parcel_area*max_cov/100.0+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('building_coverage_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_building_coverage_exceeded',
      'building_footprint_sqft',round(tot_fp),
      'max_building_footprint_sqft',round(parcel_area*max_cov/100.0),
      'flags',flags
    );
    END IF;
  END IF;
  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1
     AND COALESCE(array_length(pin_geoms,1),0) = 0
     AND parks IS NOT NULL AND NOT ST_IsEmpty(parks) THEN
    -- IMPERVIOUS SELF-HEAL (P0-3): the pavement, not the buildings, busts
    -- the budget on big parcels (supplemental passes add stalls without an
    -- impervious cap). Shave parking pieces FARTHEST from the buildings
    -- until the budget holds; the shortfall gate below then self-sizes the
    -- program to the stalls that remain.
    SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
    FOR heal_i IN 1..40 LOOP
      EXIT WHEN actual_impervious <= max_impervious_sqft + 1;
      drop_piece := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(parks,3))).geom AS g) q
                     ORDER BY CASE WHEN bars_u IS NULL THEN 0 ELSE ST_Distance(g, bars_u) END DESC,
                              ST_Area(g) ASC LIMIT 1);
      EXIT WHEN drop_piece IS NULL;
      parks := ST_CollectionExtract(ST_Difference(parks, ST_Buffer(drop_piece, 0.05, public.fn_mf_drive_buf_style())), 3);
      tot_park := COALESCE(ST_Area(parks), 0);
      actual_impervious := tot_fp + tot_park + tot_drive;
      flags := flags || to_jsonb('parking_piece_shed_for_impervious_budget'::text);
      EXIT WHEN parks IS NULL OR ST_IsEmpty(parks);
    END LOOP;
    n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp * park_floors / 380.0)::integer;
  END IF;
  IF max_impervious_sqft IS NOT NULL AND actual_impervious>max_impervious_sqft+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('impervious_coverage_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_impervious_coverage_exceeded',
      'impervious_sqft',round(actual_impervious),
      'max_impervious_sqft',round(max_impervious_sqft),
      'parking_field_target_stalls',target_stalls,
      'parking_field_rows_needed',tries,
      'parking_field_rows_added',added_this_pass,
      'parking_field_length_ft',round(relief_len::numeric,1),
      'parking_components',case when parks is null or ST_IsEmpty(parks) then '[]'::jsonb else (
        select jsonb_agg(jsonb_build_object(
          'area_sqft',round(ST_Area(q.geom)),
          'stalls',floor(ST_Area(q.geom)/(stall_w*stall_d)*0.90)::integer,
          'ymin',round(ST_YMin(q.geom)::numeric,1),'ymax',round(ST_YMax(q.geom)::numeric,1)
        ) order by ST_YMin(q.geom))
        from (select (ST_Dump(parks)).geom) q
      ) end,
      'flags',flags
    );
    END IF;
  END IF;
  IF max_far IS NOT NULL AND gfa>max_far*parcel_area+1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('far_exceeded_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_far_exceeded',
      'gfa_sqft',round(gfa),
      'max_gfa_sqft',round(max_far*parcel_area),
      'flags',flags
    );
    END IF;
  END IF;
  IF units_max IS NOT NULL AND units>units_max THEN
    RETURN jsonb_build_object(
      'error','planner_density_exceeded',
      'units',units,
      'max_units',units_max,
      'flags',flags
    );
  END IF;
  IF n_stalls<req_stalls AND COALESCE(array_length(pin_geoms,1),0) = 0 THEN
    -- FINAL-SHORTFALL SELF-SIZING (P0-4b): the cleanup clip can eat stalls
    -- after every upstream pass agreed. Resize the program to the stalls
    -- that actually survived — fewer units at the top of the size band,
    -- bars shrunk proportionally so the band holds — and only refuse when
    -- even one unit cannot be parked.
    units2 := floor(GREATEST(n_stalls - GREATEST(1, ceil(n_stalls*0.05)::integer), 0)/NULLIF(ratio,0))::integer;
    IF units2 >= 1 AND units2 < units THEN
      IF gfa > units2 * max_unit_gsf AND tot_fp > 0 THEN
        bar_scale := (units2 * max_unit_gsf / GREATEST(floors,1)) / tot_fp;
        IF structure_seed_active THEN
          bar_scale:=least(1,greatest(0.05,bar_scale));
          FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
            bars_arr[k]:=ST_Translate(
              ST_Scale(
                ST_Translate(
                  bars_arr[k],
                  -ST_X(ST_Centroid(bars_arr[k])),
                  -ST_Y(ST_Centroid(bars_arr[k]))
                ),
                sqrt(bar_scale),sqrt(bar_scale)
              ),
              ST_X(ST_Centroid(bars_arr[k])),
              ST_Y(ST_Centroid(bars_arr[k]))
            );
          END LOOP;
          flags:=flags||to_jsonb('structure_seed_shape_preserved_during_self_size_v1'::text);
        ELSE
          FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
            new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
            bars_arr[k] := ST_MakeEnvelope(
              ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
              ST_XMin(bars_arr[k])+GREATEST(new_len, 20),ST_YMax(bars_arr[k]),2274);
          END LOOP;
        END IF;
        SELECT COALESCE(SUM(ST_Area(bg)),0) INTO tot_fp FROM unnest(bars_arr) AS bg;
        gfa := tot_fp*(floors - park_floors) - amen_gsf;
      END IF;
      units := LEAST(units2, GREATEST(floor(gfa/NULLIF(min_unit_gsf,0))::integer, 1));
      req_stalls := ceil(units*ratio)::integer;
      actual_unit_gsf := gfa/NULLIF(units,0);
      actual_impervious := tot_fp + tot_park + tot_drive;
      yield_clamp_reason := COALESCE(yield_clamp_reason,'parking_land');
      flags := flags || to_jsonb('program_self_sized_to_final_parking'::text);
    END IF;
  END IF;
  IF n_stalls<req_stalls THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('parking_below_ratio'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'flags',flags
    );
    END IF;
  END IF;
  IF drives IS NULL OR ST_IsEmpty(drives) THEN
    RETURN jsonb_build_object('error','planner_drive_network_missing','flags',flags);
  END IF;

  drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));

  -- Directive layouts have a frozen circulation root. Connect every remaining
  -- drive component to that side spine before falling back to component-to-
  -- component bridges; this avoids choosing a shortest path through a bar.
  if drive_components>1 and directive_active
     and spine is not null and not ST_IsEmpty(spine) then
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    for rpiece in
      select q.geom from (
        select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom
      ) q
      where not ST_Intersects(q.geom,ST_Buffer(spine,0.5))
      order by ST_Area(q.geom) desc
    loop
      bridge := ST_CollectionExtract(ST_Difference(
        ST_Intersection(
          ST_Buffer(ST_ShortestLine(rpiece.geom,spine),aisle*0.35,
            'endcap=flat join=mitre'),parking_rot),
        case when bars_u is null then ST_GeomFromText('POLYGON EMPTY',2274)
             else ST_Buffer(bars_u,0.25) end
      ),3);
      if bridge is not null and not ST_IsEmpty(bridge)
         and ST_DWithin(bridge,rpiece.geom,0.5)
         and ST_DWithin(bridge,spine,0.5) then
        drives := ST_UnaryUnion(ST_Union(ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()),ST_Buffer(bridge,0.05, public.fn_mf_drive_buf_style())));
        flags := flags || to_jsonb('drive_component_connected_to_context_spine_v1'::text);
      end if;
    end loop;
    drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
  end if;

  IF drive_components > 1 THEN
    -- SHORTEST-PATH BRIDGING (P0-5): connect satellite drive components to
    -- the main network with straight pavement strips that never run under
    -- a building; give up after three attempts and let the gate decide.
    SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
    FOR heal_i IN 1..3 LOOP
      EXIT WHEN drive_components <= 1;
      main_comp := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom AS g) q
                    ORDER BY ST_Area(g) DESC LIMIT 1);
      sub_comp := (SELECT g FROM (SELECT (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom AS g) q
                   ORDER BY ST_Area(g) DESC OFFSET 1 LIMIT 1);
      EXIT WHEN main_comp IS NULL OR sub_comp IS NULL;
      bridge := ST_Buffer(ST_ShortestLine(main_comp, sub_comp), aisle*0.35);
      bridge := ST_Intersection(bridge, parcel_rot);
      IF bridge IS NOT NULL AND NOT ST_IsEmpty(bridge)
         AND (bars_u IS NULL OR NOT ST_Intersects(bridge, ST_Buffer(bars_u, 0.5))) THEN
        drives := ST_UnaryUnion(ST_Union(drives, bridge));
        tot_drive := COALESCE(ST_Area(drives),0);
        flags := flags || to_jsonb('drive_component_bridged_shortest_path'::text);
      ELSE
        EXIT;
      END IF;
      drive_components := ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3));
    END LOOP;
  END IF;
  IF drive_components<>1 THEN
    IF COALESCE(array_length(pin_geoms,1),0) > 0 THEN
      flags := flags || to_jsonb('drive_network_disconnected_pinned'::text);
      flags := flags || to_jsonb('pinned_best_effort_v1'::text);
    ELSE
    RETURN jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'drive_component_summary',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'i',q.i,
          'area_sqft',round(ST_Area(q.geom)),
          'xmin',round(ST_XMin(q.geom)::numeric,1),
          'xmax',round(ST_XMax(q.geom)::numeric,1),
          'ymin',round(ST_YMin(q.geom)::numeric,1),
          'ymax',round(ST_YMax(q.geom)::numeric,1),
          'distance_to_spine_ft',case when spine is null then null
            else round(ST_Distance(q.geom,spine)::numeric,1) end,
          'distance_to_main_ft',case when main_comp is null then null
            else round(ST_Distance(q.geom,main_comp)::numeric,1) end
        ) order by q.i),'[]'::jsonb)
        from (
          select row_number() over(order by ST_Area(x.geom) desc)::integer i,x.geom
          from (select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom) x
        ) q
      ),
      'building_summary',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'i',s.k,
          'area_sqft',round(ST_Area(bars_arr[s.k])),
          'xmin',round(ST_XMin(bars_arr[s.k])::numeric,1),
          'xmax',round(ST_XMax(bars_arr[s.k])::numeric,1),
          'ymin',round(ST_YMin(bars_arr[s.k])::numeric,1),
          'ymax',round(ST_YMax(bars_arr[s.k])::numeric,1),
          'distance_to_drive_ft',round(ST_Distance(bars_arr[s.k],drives)::numeric,1)
        ) order by s.k),'[]'::jsonb)
        from generate_subscripts(bars_arr,1) s(k)
      ),
      'impervious_headroom_sqft',case when max_impervious_sqft is null then null
        else round(greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0)) end,
      'flags',flags
    );
    END IF;
  END IF;

  
  -- 2026-11-12: a building that overlaps an earlier one (seen: the same small building placed twice) used to fail the whole plan at the final I-1 check
  -- (planner_element_overlap). The later building of the pair is dropped and floor area and units are recounted, so the plan loses one building, not all of them.
  -- Tolerance is the I-1 validator's (1 sq ft).
  if coalesce(array_length(bars_arr,1),0) > 1 then
    declare kept geometry[] := '{}'::geometry[]; q integer; x integer; ok boolean; new_amen integer := null;
    begin
      for q in 1..array_length(bars_arr,1) loop
        ok := true;
        for x in 1..coalesce(array_length(kept,1),0) loop
          if ST_Intersects(bars_arr[q], kept[x]) and ST_Area(ST_Intersection(bars_arr[q], kept[x])) > 1 then ok := false; exit; end if;
        end loop;
        if ok then
          kept := kept || bars_arr[q];
          if q = amen_idx then new_amen := array_length(kept,1); end if;
        end if;
      end loop;
      if array_length(kept,1) < array_length(bars_arr,1) then
        bars_arr := kept; n_bars := array_length(kept,1);
        select coalesce(sum(ST_Area(g)),0) into tot_fp from unnest(kept) g;
        if coalesce(amen_idx,0) > 0 then amen_idx := coalesce(new_amen,0); end if;
        gfa := tot_fp*(floors - park_floors) - amen_gsf;
        units := LEAST(units, GREATEST(floor(gfa/NULLIF(min_unit_gsf,0))::integer, 1));
        flags := flags || to_jsonb('overlapping_building_dropped_v1'::text);
      end if;
    end;
  end if;
  filtered_bars:=bars_arr;
  for k in 1..coalesce(array_length(pin_geoms,1),0) loop
    filtered_bars:=filtered_bars||ST_Rotate(pin_geoms[k],-theta,anchor);
  end loop;

  select ST_UnaryUnion(ST_Collect(bg)) into bars_u
  from unnest(filtered_bars) bg;

  if bars_u is not null and not ST_IsEmpty(bars_u) then
    if drives is not null and not ST_IsEmpty(drives) then
      drives:=ST_CollectionExtract(
        ST_Difference(drives,ST_Buffer(bars_u,0.05)),3
      );
      select ST_UnaryUnion(ST_Collect(q.geom)) into drives
      from (select (ST_Dump(drives)).geom) q
      where ST_Area(q.geom)>10;
    end if;

    if parks is not null and not ST_IsEmpty(parks) then
      parks:=ST_CollectionExtract(
        ST_Difference(
          parks,
          ST_UnaryUnion(ST_Collect(array[
            ST_Buffer(bars_u,0.05),
            case when drives is null then null else ST_Buffer(drives,0.05, public.fn_mf_drive_buf_style()) end
          ]))
        ),3
      );
      select ST_UnaryUnion(ST_Collect(q.geom)) into parks
      from (select (ST_Dump(parks)).geom) q
      where ST_Area(q.geom)>50;
    end if;
  end if;

  tot_drive:=coalesce(ST_Area(drives),0);
  tot_park:=coalesce(ST_Area(parks),0);
  n_stalls:=floor(tot_park/(stall_w*stall_d)*0.90)::integer
    + floor(tot_fp*park_floors/380.0)::integer;
  req_stalls:=ceil(units*ratio)::integer;
  -- 2026-11-13: parking sized to the requirement. The solver filled spare land with stalls (2301 25th Ave N: 138 stalls for 65 required; civil-designed plans draw
  -- 1.6 to 2.0 per home). Parking pieces are kept nearest the buildings first until the requirement is met; the rest is released. Not applied if it would leave a
  -- building farther from parking than the solver's own distance check allows.
  if n_stalls > req_stalls and parks is not null and not ST_IsEmpty(parks) and bars_u is not null then
    declare keep geometry; acc numeric := 0; need_sf numeric; pc record; ok boolean := true; q integer; acc_st numeric := 0;
    begin
      need_sf := greatest(req_stalls - floor(tot_fp*park_floors/380.0), 0);  -- stalls still needed from surface parking, counted piece by piece as the plan payload counts them
      for pc in select d.geom g, ST_Area(d.geom) ar from ST_Dump(ST_CollectionExtract(parks,3)) d order by ST_Distance(d.geom, bars_u), ST_Area(d.geom) desc loop
        exit when acc_st >= need_sf;
        keep := case when keep is null then pc.g else ST_Collect(keep, pc.g) end; acc := acc + pc.ar; acc_st := acc_st + floor(pc.ar/(stall_w*stall_d)*0.90);
      end loop;
      if keep is not null and acc_st >= need_sf and acc < tot_park - 1 then
        keep := ST_CollectionExtract(ST_UnaryUnion(keep),3);
        for q in 1..coalesce(array_length(filtered_bars,1),0) loop
          if not ST_DWithin(ST_Centroid(filtered_bars[q]), keep, 250) then ok := false; exit; end if;
        end loop;
        if ok then
          parks := keep; tot_park := ST_Area(parks);
          n_stalls := floor(tot_park/(stall_w*stall_d)*0.90)::integer + floor(tot_fp*park_floors/380.0)::integer;
          flags := flags || to_jsonb('parking_sized_to_requirement_v1'::text);
        end if;
      end if;
    end;
  end if;
  

  -- g53 curb throat. Every pavement band above is clipped to the setback frame
  -- (rot / parcel_rot), so the network stopped at the front setback line, short
  -- of the street. A driveway crosses the front setback by right: extend one
  -- throat from the network to the context front edge
  -- (solver_brief.geometry.front_edge_2274), aisle wide (brief parking
  -- aisle_width_ft), clipped to the parcel, never through a building.
  -- Gate: GUC mf.curb_throat ('on' / 'off'); default set by release.
  if coalesce(nullif(current_setting('mf.curb_throat',true),''),'on') in ('on','on_any_boundary')
     and drives is not null and not ST_IsEmpty(drives)
     and not coalesce((frontage->>'landlocked')::boolean,false)
     and jsonb_typeof(frontage->'front_edge_2274')='object' then
    curb_line := ST_Rotate(ST_SetSRID(ST_GeomFromGeoJSON((frontage->'front_edge_2274')::text),2274),-theta,anchor);
    curb_parcel := ST_Rotate(g2274,-theta,anchor);
    if ST_Distance(drives,curb_line) > 1
       -- g57 (2026-11-27): "reaches the street" means within 2 ft of a street frontage (fn_parcel_frontage street edges),
       -- not of any property line. 1710 Dickerson Pike: the drive touched a side lot line, so no throat was drawn and the
       -- drive stopped 20 ft from US Hwy 41. mf.curb_throat = 'on_any_boundary' restores the old test for A/B runs.
       and ST_Distance(drives, case when current_setting('mf.curb_throat',true) = 'on_any_boundary' then ST_Boundary(curb_parcel)
             else coalesce(ST_Rotate(ST_SetSRID(ST_GeomFromGeoJSON((public.fn_parcel_frontage(p_ogc_fid)->'streets_geom_2274')::text),2274),-theta,anchor), curb_line) end) > 2 then
      curb_core := ST_Buffer(drives,-(aisle/2.0-1));
      if curb_core is null or ST_IsEmpty(curb_core) then curb_core := drives; end if;
      curb_sl := ST_ShortestLine(curb_core,curb_line);
      curb_len := greatest(ST_Length(curb_sl),0.01);
      curb_dx := (ST_X(ST_EndPoint(curb_sl))-ST_X(ST_StartPoint(curb_sl)))/curb_len;
      curb_dy := (ST_Y(ST_EndPoint(curb_sl))-ST_Y(ST_StartPoint(curb_sl)))/curb_len;
      curb_sl := ST_SetSRID(ST_MakeLine(ST_StartPoint(curb_sl),
                   ST_Translate(ST_EndPoint(curb_sl),2*curb_dx,2*curb_dy)),2274);
      curb_thr := ST_CollectionExtract(ST_Intersection(curb_parcel,
                   ST_Buffer(curb_sl,aisle/2.0,'endcap=flat join=mitre')),3);
      select ST_UnaryUnion(ST_Collect(bg)) into curb_bars
        from (select unnest(bars_arr) bg union all select unnest(filtered_bars)) q;
      if curb_thr is not null and not ST_IsEmpty(curb_thr)
         and (curb_bars is null
              or coalesce(ST_Area(ST_Intersection(curb_thr,ST_Buffer(curb_bars,0.5))),0) < 1) then
        if parks is not null and not ST_IsEmpty(parks) then
          curb_removed := coalesce(ST_Area(ST_Intersection(parks,curb_thr)),0);
          if curb_removed > 0.5 then
            parks := ST_CollectionExtract(ST_Difference(parks,ST_Buffer(curb_thr,0.05, public.fn_mf_drive_buf_style())),3);
            tot_park := coalesce(ST_Area(parks),0);
            n_stalls := n_stalls - ceil(curb_removed/(stall_w*stall_d))::integer;
            flags := flags||to_jsonb('drive_curb_throat_took_parking_v1'::text);
          end if;
        end if;
        drives := ST_UnaryUnion(ST_Union(drives,curb_thr));
        tot_drive := coalesce(ST_Area(drives),0);
        curb_sl := ST_CollectionExtract(ST_Intersection(curb_parcel,curb_sl),2);
        if curb_sl is not null and not ST_IsEmpty(curb_sl) then
          drives_cl := case when drives_cl is null then curb_sl else ST_Union(drives_cl,curb_sl) end;
        end if;
        flags := flags||to_jsonb('drive_curb_throat_to_front_edge_v1'::text);
      else
        -- g57: the straight throat runs into a building; try points along the frontage every 10 ft and keep the
        -- shortest throat that clears every building (660290 had no street access because of this).
        cl := null; d := null;
        for i in 0..greatest(1, floor(ST_Length(curb_line) / 10.0))::int loop
          seg_a := ST_ShortestLine(curb_core, ST_LineInterpolatePoint(curb_line, least(1.0, i::float8 / greatest(1, floor(ST_Length(curb_line) / 10.0)))));
          curb_len := greatest(ST_Length(seg_a), 0.01);
          curb_dx := (ST_X(ST_EndPoint(seg_a)) - ST_X(ST_StartPoint(seg_a))) / curb_len;
          curb_dy := (ST_Y(ST_EndPoint(seg_a)) - ST_Y(ST_StartPoint(seg_a))) / curb_len;
          seg_a := ST_SetSRID(ST_MakeLine(ST_StartPoint(seg_a), ST_Translate(ST_EndPoint(seg_a), 2*curb_dx, 2*curb_dy)), 2274);
          seg_b := ST_CollectionExtract(ST_Intersection(curb_parcel, ST_Buffer(seg_a, aisle/2.0, 'endcap=flat join=mitre')), 3);
          if seg_b is not null and not ST_IsEmpty(seg_b)
             and (curb_bars is null or coalesce(ST_Area(ST_Intersection(seg_b, ST_Buffer(curb_bars, 0.5))), 0) < 1)
             and (d is null or curb_len < d) then
            d := curb_len; cl := seg_a; curb_thr := seg_b;
          end if;
        end loop;
        if cl is not null then
          if parks is not null and not ST_IsEmpty(parks) then
            curb_removed := coalesce(ST_Area(ST_Intersection(parks, curb_thr)), 0);
            if curb_removed > 0.5 then
              parks := ST_CollectionExtract(ST_Difference(parks, ST_Buffer(curb_thr, 0.05, public.fn_mf_drive_buf_style())), 3);
              tot_park := coalesce(ST_Area(parks), 0);
              n_stalls := n_stalls - ceil(curb_removed / (stall_w*stall_d))::integer;
              flags := flags||to_jsonb('drive_curb_throat_took_parking_v1'::text);
            end if;
          end if;
          drives := ST_UnaryUnion(ST_Union(drives, curb_thr));
          tot_drive := coalesce(ST_Area(drives), 0);
          cl := ST_CollectionExtract(ST_Intersection(curb_parcel, cl), 2);
          if cl is not null and not ST_IsEmpty(cl) then
            drives_cl := case when drives_cl is null then cl else ST_Union(drives_cl, cl) end;
          end if;
          flags := flags||to_jsonb('drive_curb_throat_rerouted_around_building_v1'::text);
        else
          flags := flags||to_jsonb('drive_curb_throat_blocked_by_building_v1'::text);
        end if;
      end if;
    end if;
  end if;

  actual_impervious:=tot_fp+tot_park+tot_drive;
  drive_components:=case when drives is null or ST_IsEmpty(drives) then 0
    else ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(drives),3)) end;
  flags:=flags||to_jsonb('i1_final_constructive_clip_v1'::text);

  if drive_components<>1 then
    return jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'reason','final I-1 structure clip severed circulation',
      'flags',flags
    );
  end if;
  if parks is null or ST_IsEmpty(parks) then
    return jsonb_build_object(
      'error','planner_parking_missing',
      'reason','no parking remains after final I-1 structure/circulation clip',
      'flags',flags
    );
  end if;
  if n_stalls<req_stalls then
    return jsonb_build_object(
      'error','planner_parking_shortfall',
      'stalls',n_stalls,
      'stalls_required',req_stalls,
      'reason','parking fell below the placed-unit requirement after final I-1 clip',
      'flags',flags
    );
  end if;

  overlap_report:=public.fn_mf_validate_element_disjointness(filtered_bars,parks,drives,1);
  if not coalesce((overlap_report->>'ok')::boolean,false) then
    return jsonb_build_object(
      'error','planner_element_overlap','law','I-1',
      'reason','positive-area overlap between plan element classes',
      'overlap_report',overlap_report,'flags',flags);
  end if;
  flags:=flags||to_jsonb('i1_pairwise_element_disjointness_hard_pass'::text);

  IF parks IS NULL OR ST_IsEmpty(parks) THEN
    RETURN jsonb_build_object('error','planner_parking_missing','flags',flags);
  END IF;

  FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
    IF NOT ST_DWithin(bars_arr[k],drives,GREATEST(40,stall_d+aisle/2)) THEN
      stranded_count := stranded_count+1;
    END IF;
    IF NOT ST_DWithin(ST_Centroid(bars_arr[k]),parks,250) THEN
      remote_parking_count := remote_parking_count+1;
    END IF;
  END LOOP;
  FOR k IN 1..COALESCE(array_length(pin_geoms,1),0) LOOP
    pg := ST_Rotate(pin_geoms[k],-theta,anchor);
    IF NOT ST_DWithin(pg,drives,GREATEST(40,stall_d+aisle/2)) THEN
      stranded_count := stranded_count+1;
    END IF;
    IF NOT ST_DWithin(ST_Centroid(pg),parks,250) THEN
      remote_parking_count := remote_parking_count+1;
    END IF;
  END LOOP;
  IF stranded_count>0 THEN
    RETURN jsonb_build_object(
      'error','planner_building_without_vehicle_access',
      'building_count',stranded_count,
      'building_access',(
        select jsonb_agg(jsonb_build_object(
          'i',s.k,
          'drive_distance_ft',round(ST_Distance(bars_arr[s.k],drives)::numeric,1),
          'spine_distance_ft',round(ST_Distance(bars_arr[s.k],spine)::numeric,1),
          'parking_distance_ft',round(ST_Distance(ST_Centroid(bars_arr[s.k]),parks)::numeric,1)
        ) order by s.k)
        from generate_subscripts(bars_arr,1) s(k)
      ),
      'flags',flags
    );
  END IF;
  IF remote_parking_count>0 THEN
    RETURN jsonb_build_object(
      'error','planner_parking_distribution_failed',
      'building_count',remote_parking_count,
      'max_distance_ft',250,
      'entrance_proxy','building_centroid',
      'flags',flags
    );
  END IF;
  FOR comp IN SELECT (ST_Dump(parks)).geom AS geom LOOP
    IF NOT ST_DWithin(comp.geom,drives,stall_d+5) THEN
      RETURN jsonb_build_object(
        'error','planner_parking_without_drive_access',
        'flags',flags
      );
    END IF;
  END LOOP;

  flags := flags
    || to_jsonb('parking_ratio_hard_pass'::text)
    || to_jsonb('drive_network_connected_hard_pass'::text)
    || to_jsonb('parking_within_250ft_hard_pass'::text)
    || to_jsonb('entrance_proxy_building_centroid'::text);

  bars_j:='[]'::jsonb;
  bars_l:='[]'::jsonb;
  i:=0;
  FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
    IF k=amen_idx THEN CONTINUE; END IF;
    i:=i+1;
    ub:=ST_Rotate(bars_arr[k],theta,anchor);
    bars_j:=bars_j||jsonb_build_object(
      'i',i,'footprint_sqft',round(ST_Area(bars_arr[k])),'floors',floors,
      'structure_id',case when structure_seed_active then k else null end,
      'geom',ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub,2274),4326))::jsonb
    );
    bars_l:=bars_l||jsonb_build_object(
      'i',i,'footprint_sqft',round(ST_Area(bars_arr[k])),'floors',floors,
      'structure_id',case when structure_seed_active then k else null end,
      'geom',ST_AsGeoJSON(ST_Translate(ub,-ox,-oy))::jsonb
    );
  END LOOP;
  FOR k IN 1..COALESCE(array_length(pin_geoms,1),0) LOOP
    i:=i+1;
    bars_j:=bars_j||jsonb_build_object(
      'i',i,'pinned',true,'pin_index',k-1,
      'footprint_sqft',round(ST_Area(pin_geoms[k])),'floors',pin_floors[k],
      'geom',ST_AsGeoJSON(ST_Transform(ST_SetSRID(pin_geoms[k],2274),4326))::jsonb
    );
    bars_l:=bars_l||jsonb_build_object(
      'i',i,'pinned',true,'pin_index',k-1,
      'footprint_sqft',round(ST_Area(pin_geoms[k])),'floors',pin_floors[k],
      'geom',ST_AsGeoJSON(ST_Translate(pin_geoms[k],-ox,-oy))::jsonb
    );
  END LOOP;
  flags:=flags||to_jsonb('building_payload_rebuilt_from_final_validated_geometry_v1'::text);

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

  -- Serialize site-system polygons
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

  -- Contextual scoring (context_score_v1): explicit components, weighted by
  -- the brief's objective profile. Hard failures rejected above, not scored.
  money := public.fn_mf_money(p_ogc_fid, gfa, units);
  margin := (money->>'margin_on_cost')::numeric;
  IF margin IS NOT NULL THEN
    sc_fin := LEAST(1, GREATEST(0, (margin + 0.5)));
  ELSE
    sc_fin := 0.5;
    flags := flags || to_jsonb('financial_score_no_local_pricing'::text);
  END IF;
  gsf_capture := LEAST(1,gfa/NULLIF(target_gsf,0));
  -- Residual-capacity accounting (docs/SOLVER_CONVERGENCE_SPEC.md section
  -- 3-4): a clamp string is not proof. Quantify what remains and classify.
  gap_gsf := GREATEST(0, target_gsf - gfa);
  resid_stall_headroom := GREATEST(n_stalls - req_stalls, 0);
  resid_impervious := CASE WHEN max_impervious_sqft IS NULL THEN NULL
                           ELSE GREATEST(max_impervious_sqft - actual_impervious, 0) END;
  resid_coverage := CASE WHEN cov_cap_sqft IS NULL THEN NULL ELSE GREATEST(cov_cap_sqft - tot_fp, 0) END;
  resid_stories := GREATEST(COALESCE(legal_floor_cap, floors) - floors, 0);
  addl_units := CASE WHEN max_unit_gsf > 0 THEN ceil(gap_gsf / max_unit_gsf)::integer ELSE 0 END;
  addl_stalls := GREATEST(ceil(addl_units * ratio)::integer - resid_stall_headroom, 0);
  -- Optimistic land bill for the missing GSF: stall bays at packing
  -- efficiency, plus new footprint only when no story headroom remains.
  min_land_needed := addl_stalls * (stall_w*stall_d) / 0.90
                   + CASE WHEN resid_stories > 0 THEN 0 ELSE gap_gsf / GREATEST(floors,1) END;
  -- Footprint-eligible land: impervious budget alone overstates capacity —
  -- bars may only stand inside the directional envelope. Measure what is
  -- actually left there (upper bound: no shape filter, pieces >= 1000 sqft).
  SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
  fp_eligible := COALESCE((SELECT SUM(ST_Area(g)) FROM (
    SELECT (ST_Dump(ST_CollectionExtract(ST_Difference(rot,
      ST_UnaryUnion(ST_Collect(ARRAY[
        CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,12) END,
        CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
        CASE WHEN drives IS NULL THEN NULL ELSE ST_Buffer(drives,2) END,
        CASE WHEN parks IS NULL THEN NULL ELSE ST_Buffer(parks,1) END
      ]))),3))).geom AS g) q WHERE ST_Area(g) >= 1000), 0);
  IF gsf_capture >= 0.85 THEN
    opt_status := 'feasible';
  ELSIF resid_impervious IS NOT NULL AND min_land_needed > resid_impervious + 1 THEN
    -- Even the OPTIMISTIC bill for the missing GSF exceeds the remaining
    -- impervious budget: the shortfall is a property of the lot, not an
    -- unfinished search.
    opt_status := 'feasible_demonstrably_constrained';
  ELSIF resid_stories = 0 AND fp_eligible + 1 < gap_gsf/GREATEST(floors,1) THEN
    -- Stories are maxed and the remaining footprint-eligible envelope
    -- cannot host the missing floorplate even as an upper bound: proven
    -- constrained by the buildable envelope itself.
    opt_status := 'feasible_demonstrably_constrained';
  ELSE
    opt_status := 'feasible_optimization_incomplete';
  END IF;
  opt_proof := jsonb_build_object(
    'proof_basis', CASE
      WHEN gsf_capture >= 0.85 THEN 'capture_at_or_above_85'
      WHEN resid_impervious IS NOT NULL AND min_land_needed > resid_impervious + 1 THEN 'impervious_budget_exceeded'
      WHEN resid_stories = 0 AND fp_eligible + 1 < gap_gsf/GREATEST(floors,1) THEN 'buildable_envelope_exhausted'
      ELSE 'search_incomplete' END,
    'remaining_footprint_eligible_sqft', round(fp_eligible),
    'binding_constraint', COALESCE(yield_clamp_reason,'none'),
    'required_additional_gsf', round(gap_gsf),
    'additional_units_at_selected_program', addl_units,
    'additional_stalls_required', GREATEST(ceil(addl_units*ratio)::integer,0),
    'remaining_stall_capacity', resid_stall_headroom,
    'remaining_impervious_sqft', CASE WHEN resid_impervious IS NULL THEN NULL ELSE round(resid_impervious) END,
    'remaining_building_coverage_sqft', CASE WHEN resid_coverage IS NULL THEN NULL ELSE round(resid_coverage) END,
    'remaining_stories', resid_stories,
    'minimum_land_needed_sqft', round(min_land_needed),
    'constraint_proven', opt_status = 'feasible_demonstrably_constrained'
  );
  sc_yield := gsf_capture;
  sc_park := 1; -- parking is a hard rejection gate above
  far_achieved := gfa/NULLIF(parcel_area,0);
  IF gsf_capture<0.85 AND yield_clamp_reason IS NULL THEN
    sc_zone := power(gsf_capture/0.85,2)*0.35;
    flags := flags || to_jsonb('gsf_capture_below_85_without_clamp'::text);
  ELSIF gsf_capture<0.85 THEN
    sc_zone := power(gsf_capture/0.85,2)*0.60;
    flags := flags || to_jsonb(('gsf_capture_below_85_clamped_by_'||yield_clamp_reason)::text);
  ELSE
    sc_zone := gsf_capture;
  END IF;
  avg_bar_fp := CASE WHEN n_bars > 0 THEN tot_fp / n_bars ELSE NULL END;
  sc_prec := 0.5 * (CASE WHEN avg_bar_fp IS NOT NULL AND p75fp IS NOT NULL AND p75fp > 0
    THEN LEAST(avg_bar_fp, p75fp) / GREATEST(avg_bar_fp, p75fp) ELSE 0.5 END)
    + 0.25 * (CASE WHEN p75coverage IS NOT NULL AND p75coverage > 0
      THEN LEAST(100.0 * tot_fp / NULLIF(parcel_area,0), p75coverage) / GREATEST(100.0 * tot_fp / NULLIF(parcel_area,0), p75coverage) ELSE 0.5 END)
    + 0.25 * (CASE WHEN p75s IS NOT NULL AND p75s > 0
      THEN LEAST(floors::numeric, p75s) / GREATEST(floors::numeric, p75s) ELSE 0.5 END);
  sc_prog := 0.5;  -- internal program fit unmodeled in v1 scoring
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
    'gsf_capture', round(gsf_capture,3),
    'target_max_gsf', round(target_gsf),
    'achieved_gsf', round(gfa),
    'yield_clamp_reason', yield_clamp_reason,
    'precedent_fit', round(sc_prec, 3),
    'internal_program_fit', round(sc_prog, 3),
    'circulation_quality', round(sc_circ, 3),
    'open_space_quality', round(sc_open, 3)
  );
  score_total := round(
      sc_fin  * COALESCE((w->>'financial_return')::numeric, 0.15)
    + sc_yield* COALESCE((w->>'unit_or_program_yield')::numeric, 0.05)
    + sc_park * COALESCE((w->>'parking_compliance')::numeric, 0.05)
    + sc_zone * COALESCE((w->>'zoning_utilization')::numeric, 0.55)
    + sc_prec * COALESCE((w->>'precedent_fit')::numeric, 0.05)
    + sc_prog * COALESCE((w->>'internal_program_fit')::numeric, 0.05)
    + sc_circ * COALESCE((w->>'circulation_quality')::numeric, 0.07)
    + sc_open * COALESCE((w->>'open_space_quality')::numeric, 0.03), 3);

  IF gsf_capture<0.85 THEN
    score_total := LEAST(
      score_total,
      round(gsf_capture * CASE WHEN yield_clamp_reason IS NULL THEN 0.50 ELSE 0.65 END,3)
    );
    flags := flags || to_jsonb('overall_score_capped_below_85pct_gsf_capture'::text);
  END IF;

  directive_count_met := not directive_active or n_bars=directive_count;
  if directive_active then
    flags := flags || case when directive_count_met
      then to_jsonb('massing_program_count_prior_met'::text)
      else to_jsonb('massing_program_count_prior_relaxed_by_geometry'::text) end;
  end if;
  basis := case when directive_active and directive_rationale is not null then
    directive_rationale || format(
      ' Achieved %s GSF (%s%%) with %s building(s), %s stories, %s/%s stalls; clamp %s; access connected.',
      round(gfa),round(gsf_capture*100,1),n_bars,floors,n_stalls,req_stalls,
      coalesce(yield_clamp_reason,'none'))
  else
    format('Max GSF %s · achieved %s (%s%%) · %s bars × %s floors · %s units @ %s GSF/unit · %s/%s stalls · clamp: %s · binding: %s · access connected',
      round(target_gsf),round(gfa),round(gsf_capture*100,1),n_bars,floors,units,
      round(actual_unit_gsf),n_stalls,req_stalls,COALESCE(yield_clamp_reason,'none'),
      COALESCE(mb->>'binding_constraint','unknown'))
  end;

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
              p_context_id, ctx_version, obj, 'mf_max_gsf_v1')
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
                'units_est', units,
                'target_max_gsf', round(target_gsf),
                'gsf_capture_pct', round(gsf_capture*100,1),
                'optimization_status', opt_status,
                'optimization_proof', opt_proof,
                'avg_unit_gsf', round(actual_unit_gsf),
      'unit_gsf_min', min_unit_gsf,
      'unit_gsf_max', max_unit_gsf,
                'binding_constraint', mb->>'binding_constraint',
                'yield_clamp_reason', yield_clamp_reason,
                'stalls', n_stalls, 'stalls_required', req_stalls,
                'regime', p_regime, 'tuck_under_stalls', floor(tot_fp * park_floors / 380.0)::integer,
                'coverage_pct', round(tot_fp / parcel_area * 100, 1),
                'far', round(far_achieved, 2), 'seed', p_seed,
                'pins', COALESCE(p_pins, '[]'::jsonb), 'context_hash', ctx_hash, 'regrid_precedent_selection', pri->'selection',
                'designed_court_sf', CASE WHEN protected_court IS NULL THEN 0 ELSE round(ST_Area(protected_court)) END,
                'pool_court_sf', CASE WHEN pool_rect IS NULL THEN 0 ELSE round(ST_Area(pool_rect)) END,
                'amenity_gsf', round(amen_gsf),
                'parcel_sqft', round(parcel_area),
                'parking_sqft', round(tot_park), 'drives_sqft', round(tot_drive), 'greens_sqft', round(tot_green),
                'open_space_pct', round(open_pct, 1),
                'flags', flags,
                'amenity', amen_j,
                'designed_court', CASE WHEN protected_court IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'name', 'Designed central court',
                    'area_sqft', round(ST_Area(protected_court)),
                    'geom_2274', ST_AsGeoJSON(ST_SetSRID(ST_Rotate(protected_court, theta, anchor), 2274))::jsonb
                  ) END),
              p_parent,
              'mf_max_gsf_v1', 'context_score_gsf_v1', score_total, score_components, obj, COALESCE(pri->'precedent_parcel_ids','[]'::jsonb), prog_version)
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
    'generator_version', 'mf_max_gsf_v1',
    'score_version', 'context_score_gsf_v1',
    'score_total', score_total,
    'score_components', score_components,
    'plan_basis', basis,
    'massing_program', case when jsonb_typeof(massing_program)='object' then massing_program else null end,
    'massing_relaxation', directive_relaxation,
    'structure_seed',case when structure_seed_active then jsonb_build_object(
      'source','fn_site_skeleton_v2.structures','structure_count',structure_seed_count,
      'access_mode',site_skeleton_v2#>>'{skeleton_v2,access_mode}',
      'easement_assumed',coalesce((site_skeleton_v2#>>'{skeleton_v2,easement_assumed}')::boolean,false)
    ) else null end,
    'session_id', v_session,
    'candidate_id', v_candidate,
    'persisted', persisted,
    'buildings', public.fn_normalize_tip_buildings(bars_j),
    'parking', parks_j,
    'drives', drives_j,
    'greens', greens_j,
    'amenity', amen_j,
    'metrics', jsonb_build_object(
      'bars', n_bars, 'floors', floors,
      'structure_seed_consumed',structure_seed_active,
      'structure_seed_count',case when structure_seed_active then structure_seed_count else null end,
      'element_disjointness_law','I-1',
      'footprint_sqft', round(tot_fp), 'gfa_sqft', round(gfa),
      'units_est', units,
      'target_max_gsf', round(target_gsf),
      'gsf_capture_pct', round(gsf_capture*100,1),
                'optimization_status', opt_status,
                'optimization_proof', opt_proof,
      'avg_unit_gsf', round(actual_unit_gsf),
      'unit_gsf_min', min_unit_gsf,
      'unit_gsf_max', max_unit_gsf,
      'binding_constraint', mb->>'binding_constraint',
      'yield_clamp_reason', yield_clamp_reason,
      'massing_parti', directive_parti,
      'massing_program_building_count', directive_count,
      'massing_program_bar_length_ft', directive_bar_len,
      'massing_program_bar_depth_ft', directive_bar_depth,
      'massing_program_count_met', directive_count_met,
      'massing_program_relaxation', directive_relaxation,
      'massing_program_original_building_count', directive_original_count,
      'massing_program_original_bar_length_ft', directive_original_bar_len,
      'hard_constraints_passed', true,
      'drive_components', drive_components,
      'parking_max_distance_ft', 250,
      'fire_access_max_ft', round(fire_max_ft),
      'ada_stalls_required', ada_req,
      'ev_capable_stalls_required', ev_req,
      'validators_basis', 'I-1_pairwise_disjoint; ifc_503_150ft; ibc_1106_table_v1; ev_10pct_v1',
      'designed_court_sf', CASE WHEN protected_court IS NULL THEN 0 ELSE round(ST_Area(protected_court)) END,
      'amenity_gsf', round(amen_gsf),
      'pool_court_sf', CASE WHEN pool_rect IS NULL THEN 0 ELSE round(ST_Area(pool_rect)) END,
      'stalls', n_stalls, 'stalls_required', req_stalls,
                'regime', p_regime, 'tuck_under_stalls', floor(tot_fp * park_floors / 380.0)::integer,
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
END $function$
;

CREATE OR REPLACE FUNCTION public.fn_poly_centerline(p geometry)
 RETURNS geometry
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- the long midline of a polygon's oriented envelope: a drive band's centerline
  with e as (select st_exteriorring(st_orientedenvelope(p)) r),
  pt as (select st_pointn(r,1) a, st_pointn(r,2) b, st_pointn(r,3) c, st_pointn(r,4) d from e)
  select case when st_distance(a,b) <= st_distance(b,c)
    then st_makeline(st_lineinterpolatepoint(st_makeline(a,b),0.5), st_lineinterpolatepoint(st_makeline(c,d),0.5))
    else st_makeline(st_lineinterpolatepoint(st_makeline(b,c),0.5), st_lineinterpolatepoint(st_makeline(d,a),0.5)) end from pt
$function$
;
