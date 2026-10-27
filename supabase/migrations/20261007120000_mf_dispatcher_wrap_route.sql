-- 2026-10-07 · The dispatcher routes a wrap parcel to the wrap generator.
--
-- fn_generate_mf_site_plan_v2 asks fn_plan_pattern first; when the pattern
-- is wrap_garage_courtyard (20261007100000_mf_wrap_exemplar_and_pattern.sql)
-- it serves fn_generate_wrap_site_plan's plan, and only falls through to the
-- court search / aisle-first seed when the wrap generator refuses the lot.
--
-- Drift note. The body below is the dispatcher as it stood in the live
-- project on 2026-10-07: it was revised there on 2026-09-13 outside this
-- repository (court-pattern search-first with the seed as fallback,
-- fn_normalize_tip_* and fn_honest_plan_pattern_for_tip post-passes, a 120-s
-- statement timeout). Those helper functions exist only in the database.
-- This file carries that body into the repository for the first time, with
-- the wrap branch as its only change; the repeated post-pass lines are the
-- live text, kept verbatim so the repository and the database agree.

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
END $function$;
