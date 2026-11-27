-- Snapshot of live functions (g55 drive buffers, g56 AI default, podium drafter v1), 2026-11-27.
-- Source of truth is the database; this file is for review and history.

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
    'buildings', jsonb_build_array(
       jsonb_build_object('id', 1, 'role', 'residential_over_podium', 'stories', stories, 'residential_levels', res_lv, 'podium_levels', pod_lv,
         'footprint_sqft', round(aR), 'gsf', round(gsf), 'units', units,
         'geom_2274', st_asgeojson(R)::jsonb, 'geom', st_asgeojson(st_transform(R, 4326))::jsonb))
     || case when court is not null then jsonb_build_array(jsonb_build_object('id', 2, 'role', 'podium_garage_under_deck', 'stories', pod_lv,
         'footprint_sqft', round(aC), 'geom_2274', st_asgeojson(court)::jsonb, 'geom', st_asgeojson(st_transform(court, 4326))::jsonb)) else '[]'::jsonb end,
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
    and c.picked = 'model' and c.engine_md5 = public.fn_mf_engine_md5()
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
  dplan jsonb; dchk jsonb; pr jsonb; d jsonb; rr jsonb; cands jsonb := '[]'::jsonb; umax numeric; win jsonb; plan jsonb; mv text; p2 jsonb; summ jsonb;
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
  if pr ? 'error' then
    return dplan || jsonb_build_object('ai_pick', jsonb_build_object('picked', 'engine', 'reason', pr->>'error', 'message', pr->>'message', 'candidates', cands));
  end if;
  for d in select value from jsonb_array_elements(pr->'designs') loop
    begin rr := fn_mf_ai_realize(p_ogc_fid, ctx, d->'massing'); exception when others then rr := jsonb_build_object('error', sqlerrm); end;
    if rr ? 'plan' then
      cands := cands || jsonb_build_object('k', (d->>'k')::int, 'source', 'model', 'regime', rr#>>'{plan,regime}',
        'units', coalesce((rr#>>'{plan,metrics,units_est}')::numeric, (rr#>>'{plan,metrics,units}')::numeric, 0),
        'n_fail', coalesce((rr#>>'{checks,n_fail}')::int, 99), 'fails', rr#>'{checks,fails}', 'massing', d->'massing');
    end if;
  end loop;
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
  else
    plan := dplan;
  end if;
  summ := jsonb_build_object('picked', win->>'source', 'model_version', mv, 'rule', 'within ' || tol || ' of most homes, then fewest failed checks; ties to engine',
            'rule_source', 'training.ai_config mf_ai_default',
            'engine', jsonb_build_object('units', cands->0->'units', 'n_fail', cands->0->'n_fail', 'fails', cands->0->'fails'),
            'winner', jsonb_build_object('units', win->'units', 'n_fail', win->'n_fail', 'fails', win->'fails', 'regime', win->'regime'),
            'n_model_designs', jsonb_array_length(cands) - 1,
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
  where n.nspname = 'public' and p.proname in ('fn_mf_solve_core', 'fn_generate_mf_site_plan_v2_search', 'fn_mf_design_checks', 'fn_mf_ai_realize')
$function$
;
