-- 2026-09-09 · The seed lays parking out for the building it placed.
--
-- fn_generate_mf_site_plan_v2 calls fn_seed_parking without a stall need, so
-- the seed laid out for fn_max_buildout's stalls_required_at_max (128 on
-- 1200 W H Davis) while the dispatcher then required ceil(units × ratio) for
-- the building actually placed (99): every plan carried a third more parking
-- than it needed. The seed now derives the placed need the same way the
-- dispatcher does (see 20260909110000_mf_seed_parking_aisle_first.sql) and
-- reports it as stalls_target, with the max-buildout figure as
-- stalls_target_at_max. The dispatcher reads that for its
-- stalls_target_at_max / pct_of_max_need lines; nothing else changes.

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
  -- 2026-09-09: the seed now lays its parking out for the PLACED need and
  -- reports the max-buildout need separately; read that for the max line.
  stalls_target_max := coalesce((sk#>>'{parking_seed,stalls_target_at_max}')::int, (sk#>>'{parking_seed,stalls_target}')::int, ceil(units*pkr));
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
