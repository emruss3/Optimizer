-- Snapshot of live functions after release g58 (2026-11-27). Source of truth is the database.
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
  v_search_gsf numeric; v_seed_gsf numeric; v_rules text[]; v_chk jsonb; v_alt jsonb; v_alt_chk jsonb;
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

  -- g58 (2026-11-27, 1710 Meharry Blvd): the seed plan is checked against the layout rules (training.ai_config mf_seed_layout_rules:
  -- parking beside a building or an attached lot, no lane between the building and its street, pavement per stall). When it breaks one
  -- and the search plan keeps at least as many homes and breaks fewer, the search plan is the answer. mf.seed_rules = 'off' skips this.
  IF coalesce(nullif(current_setting('mf.seed_rules', true), ''), 'on') = 'on' THEN
    BEGIN
      v_rules := array(select jsonb_array_elements_text(value) from training.ai_config where key = 'mf_seed_layout_rules');
      v_chk := public.fn_mf_design_checks(p_ogc_fid, jsonb_build_object('buildings', blds,
        'parking', jsonb_build_object('bays', coalesce(sk#>'{parking_seed,bays}', '[]'::jsonb), 'stalls', stalls_prov),
        'drives', coalesce(sk->'drives', jsonb_build_array(sk->'skeleton')), 'plan_basis', basis,
        'metrics', jsonb_build_object('units', units, 'stalls', stalls_prov)));
      IF exists (select 1 from jsonb_array_elements_text(coalesce(v_chk->'fails', '[]'::jsonb)) f where f = any(v_rules)) THEN
        v_alt := public.fn_generate_mf_site_plan_v2_search(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, coalesce(v_context_id, p_context_id));
        IF v_alt IS NOT NULL AND NOT (v_alt ? 'error') THEN
          v_alt := public.fn_normalize_tip_site_layers(v_alt);
          v_alt_chk := public.fn_mf_design_checks(p_ogc_fid, v_alt);
          IF coalesce((v_alt#>>'{metrics,units_est}')::numeric, (v_alt#>>'{metrics,units}')::numeric, 0) >= units
             AND (select count(*) from jsonb_array_elements_text(coalesce(v_alt_chk->'fails', '[]'::jsonb)) f where f = any(v_rules))
               < (select count(*) from jsonb_array_elements_text(coalesce(v_chk->'fails', '[]'::jsonb)) f where f = any(v_rules)) THEN
            RETURN v_alt || jsonb_build_object('plan_pattern', v_pat,
              'flags', coalesce(v_alt->'flags', '[]'::jsonb) || jsonb_build_array('seed_plan_replaced_layout_rules_v1'),
              'seed_replaced', jsonb_build_object('seed_units', units, 'seed_fails', v_chk->'fails', 'plan_fails', v_alt_chk->'fails'));
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
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
  -- 2026-11-27, audit of 1710 Meharry Blvd (owner: "we shouldn't have random parking lots not touching the building or another lot")
  declare bay record; att geometry := B; todo jsonb := '[]'::jsonb; grew boolean := true; det_st numeric := 0; all_st numeric := 0; det_d numeric; gap numeric := (t->>'attach_gap_ft')::numeric;
          shadow geometry; dfront numeric; land numeric; one geometry; structured boolean := coalesce((p_plan#>>'{parking,structured}')::boolean, false);
  begin
    -- 10 every parking lot sits within one aisle of a building, or of a lot that does
    if B is not null and jsonb_typeof(p_plan#>'{parking,bays}') = 'array' and jsonb_array_length(p_plan#>'{parking,bays}') > 0 and gap is not null then
      select coalesce(jsonb_agg(jsonb_build_object('w', st_astext(g_), 's', s_)), '[]'::jsonb) into todo
        from (select fn_plan_layer_2274(jsonb_build_array(x)) g_, coalesce(nullif(x->>'stalls','')::numeric, nullif(x->>'n_stalls','')::numeric) s_ from jsonb_array_elements(p_plan#>'{parking,bays}') x) q where g_ is not null;
      select sum(coalesce((x->>'s')::numeric, st_area(st_geomfromtext(x->>'w', 2274)) / 170.0)) into all_st from jsonb_array_elements(todo) x;
      while grew loop
        grew := false;
        for bay in select o, st_geomfromtext(x->>'w', 2274) g_ from jsonb_array_elements(todo) with ordinality t_(x, o) where x is not null and jsonb_typeof(x) = 'object' loop
          if st_distance(bay.g_, att) <= gap then
            att := st_union(att, bay.g_); todo := jsonb_set(todo, array[(bay.o - 1)::text], 'null'::jsonb); grew := true;
          end if;
        end loop;
      end loop;
      select coalesce(sum(coalesce((x->>'s')::numeric, st_area(st_geomfromtext(x->>'w', 2274)) / 170.0)), 0), min(st_distance(st_geomfromtext(x->>'w', 2274), B))
        into det_st, det_d from jsonb_array_elements(todo) x where jsonb_typeof(x) = 'object';
      res := res || jsonb_build_object('parking_attached', jsonb_build_object('ok', det_st = 0,
        'val', case when det_st = 0 then 'every lot is beside a building or a lot that is' else format('%s of %s stalls in a lot %s ft from any building and not beside an attached lot', round(det_st), round(all_st), round(det_d)) end));
    else res := res || jsonb_build_object('parking_attached', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
    -- 11 no pavement between a building and its street beyond a driveway crossing
    if B is not null and sts is not null and pave is not null then
      dfront := (select min(st_distance(b_.geom, sts)) from st_dump(B) b_);
      if dfront <= front + (t->>'front_zone_ft')::numeric and dfront > 3 then
        select st_union(st_intersection(st_buffer(b_.geom, st_distance(b_.geom, sts) + 1), st_buffer(sts, st_distance(b_.geom, sts) + 1, 'endcap=flat'))) into shadow
          from st_dump(B) b_ where st_distance(b_.geom, sts) <= front + (t->>'front_zone_ft')::numeric;
        shadow := st_difference(st_intersection(shadow, parcel), B);
        sh := case when st_area(shadow) > 0 then st_area(st_intersection(net, shadow)) / st_area(shadow) else 0 end;
        res := res || jsonb_build_object('no_pavement_in_front', jsonb_build_object('ok', sh <= (t->>'front_pavement_share')::numeric, 'val', round(100 * sh) || '% of the ground between the building and the street is paved'));
      else res := res || jsonb_build_object('no_pavement_in_front', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
    else res := res || jsonb_build_object('no_pavement_in_front', jsonb_build_object('ok', null, 'val', 'n/a')); end if;
    -- 12 pavement per stall (surface parking only)
    if not structured and net is not null and coalesce(st, 0) > 0 then
      land := (select nullif(mb#>>'{assumptions,stall_land_sf}', '')::numeric from (select fn_max_buildout(p_fid) mb) x);
      if land is not null then
        res := res || jsonb_build_object('pavement_per_stall', jsonb_build_object('ok', st_area(net) / st <= land * (t->>'pavement_per_stall_factor')::numeric,
          'val', format('%s sf of drives and parking per stall (planning figure %s)', round(st_area(net) / st), round(land))));
      end if;
    end if;
  exception when others then res := res || jsonb_build_object('layout_rules_error', jsonb_build_object('ok', null, 'val', left(sqlerrm, 120)));
  end;
  return jsonb_build_object('checks', res,
    'fails', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_each(res) e(k,v) where v->>'ok' = 'false'),
    'n_fail', (select count(*) from jsonb_each(res) e(k,v) where v->>'ok' = 'false'),
    'units', units, 'thresholds_source', 'training.ai_config mf_design_check_thresholds');
end $function$

;
