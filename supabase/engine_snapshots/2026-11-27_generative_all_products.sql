-- Snapshot of live functions for the townhome generative path and its training data, 2026-11-27.
-- Source of truth is the database; this file is for review and history.

CREATE OR REPLACE FUNCTION training.fn_built_th_measure(p_n integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- Built attached-home projects (training.attached_project_metrics) as layout training sites: the project's outline, its building rows
-- (public.buildings inside the outline), homes per row (unit parcels inside each building), year built from the unit parcels.
declare r record; n int := 0; b jsonb; ym int; y10 int; np int; s geometry;
begin
  for r in select a.* from training.attached_project_metrics a where a.site_2274 is not null and a.units >= 6
             and not exists (select 1 from training.built_th_site t where t.grp = a.grp) order by a.grp limit p_n loop
    s := (select d.geom from st_dump(st_makevalid(st_setsrid(r.site_2274, 2274))) d where geometrytype(d.geom) = 'POLYGON' order by st_area(d.geom) desc limit 1);
    select percentile_disc(0.5) within group (order by p.yearbuilt), percentile_disc(0.1) within group (order by p.yearbuilt), count(*)
      into ym, y10, np from parcels p where p.geom_2274 && s and st_contains(s, st_pointonsurface(p.geom_2274)) and p.yearbuilt > 1800 and st_area(p.geom_2274) < 8000;
    select jsonb_agg(jsonb_build_object('wkt', st_astext(st_snaptogrid(g, 0.5)), 'area', round(st_area(g)), 'stories', st,
             'long', round(greatest(e1, e2)::numeric, 1), 'short', round(least(e1, e2)::numeric, 1),
             'u', greatest(1, coalesce(nullif((select count(*) from parcels p where p.geom_2274 && g and st_contains(st_buffer(g, 3), st_pointonsurface(p.geom_2274)) and st_area(p.geom_2274) < 8000), 0),
                                      round(greatest(e1, e2) / greatest(coalesce(r.unit_w_med, 20), 12))::int))))
      into b
      from (select g, st, st_distance(st_pointn(st_exteriorring(st_orientedenvelope(g)),1), st_pointn(st_exteriorring(st_orientedenvelope(g)),2)) e1,
                   st_distance(st_pointn(st_exteriorring(st_orientedenvelope(g)),2), st_pointn(st_exteriorring(st_orientedenvelope(g)),3)) e2
            from (select st_makevalid(st_transform(bd.geom, 2274)) g, nullif(bd.ed_stories,'')::numeric st from buildings bd
                  where bd.geom && st_transform(s, 4326) and st_contains(s, st_pointonsurface(st_transform(bd.geom, 2274)))) q0
            where st_area(g) >= 400) q;
    insert into training.built_th_site(grp, name, units, acres, zoning, year_med, year_p10, n_unit_parcels, n_bldg, bldg, site_wkt, loc, built_since_2010)
    values (r.grp, r.name, r.units, r.site_ac, r.zoning_mode, ym, y10, np, coalesce(jsonb_array_length(b), 0), b, st_astext(st_snaptogrid(s, 0.5)),
            training.fn_site_location(s), ym >= 2010);
    n := n + 1;
  end loop; return n; end $function$
;

CREATE OR REPLACE FUNCTION training.fn_metro_attr_pages(p_where text, p_from integer, p_pages integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare i int; n int; tot int := 0;
begin
  for i in 0..p_pages-1 loop
    n := training.fn_metro_parcel_attr_fetch(p_where || '&orderByFields=OBJECTID', p_from + i * 1000);
    tot := tot + n; exit when n < 1000;
  end loop; return jsonb_build_object('fetched', tot, 'next', p_from + p_pages * 1000); end $function$
;

CREATE OR REPLACE FUNCTION training.fn_mfgen_v3_add_built_th(p_n integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- Built attached-home projects since 2010 as layout lines (same format as fn_mfgen_export_v2's built apartments; typ townhome).
-- Street edges: the outline's runs beside a mapped road (training.fn_site_roads), 40 ft or longer.
declare r record; s geometry; roads geometry; rw double precision := (public.fn_sf_v1_params()->>'row_ft')::double precision; ed jsonb; n int := 0; base int;
begin
  for r in select t.* from training.built_th_site t where t.built_since_2010 and t.n_bldg between 2 and 60 and t.acres <= 40
             and not exists (select 1 from training.mfgen_export_v3_cache c where c.pid = 'builtth_' || t.grp) order by t.grp limit p_n loop
    s := st_geomfromtext(r.site_wkt, 2274);
    begin roads := training.fn_site_roads(s, rw); exception when others then roads := null; end;
    select coalesce(jsonb_agg(jsonb_build_object('type', 'street_frontage', 'wkt', st_astext(st_snaptogrid(q.g, 0.5)))), '[]'::jsonb) into ed
      from (select (st_dump(st_linemerge(st_collectionextract(st_intersection(st_exteriorring(s), st_buffer(roads, rw / 2 + 15)), 2)))).geom g) q where st_length(q.g) >= 40;
    select coalesce(max(rn), 0) into base from training.mfgen_export_v3_cache;
    insert into training.mfgen_export_v3_cache(rn, pid, line) values (base + 1, 'builtth_' || r.grp,
      jsonb_build_object('pid', 'builtth_' || r.grp, 'typ', 'townhome', 'src', 'built', 'recent', true,
        'split', case when abs(hashtext(r.grp)) % 7 = 0 then 'dev' else 'train' end,
        'site', r.site_wkt, 'ctx', jsonb_build_object('boundary_edges', ed),
        'b', (select jsonb_agg(jsonb_build_object('w', x->>'wkt', 't', case when (x->>'u')::int >= 2 then 'townhome_row' else 'detached' end, 'u', (x->>'u')::int, 'st', x->'stories')) from jsonb_array_elements(r.bldg) x),
        'p', '[]'::jsonb, 'd', null, 'tm', jsonb_build_object('units', (select sum((x->>'u')::int) from jsonb_array_elements(r.bldg) x)),
        'pos', true, 'loc', r.loc)::text);
    n := n + 1;
  end loop; return n; end $function$
;

CREATE OR REPLACE FUNCTION training.fn_ml_push_mfgen_v3(p_dataset text, p_chunk integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i integer := 0; txt text; r jsonb; sent integer := 0; lines integer := 0;
begin
  loop
    select string_agg(line, E'\n' order by rn) into txt from training.mfgen_export_v3_cache where rn > i * p_chunk and rn <= (i + 1) * p_chunk;
    exit when txt is null or txt = '';
    r := training.fn_ml_call('/ingest', 'ingest', jsonb_build_object('dataset', p_dataset, 'name', 'plans_' || lpad(i::text, 3, '0'), 'text', txt), 60000);
    if (r->>'http') is distinct from '200' then return jsonb_build_object('dataset', p_dataset, 'sent', sent, 'failed_chunk', i, 'reply', r); end if;
    sent := sent + 1; lines := lines + coalesce((r->'body'->>'lines')::int, 0); i := i + 1;
  end loop;
  return jsonb_build_object('dataset', p_dataset, 'sent', sent, 'lines', lines);
end $function$
;

CREATE OR REPLACE FUNCTION training.fn_th_ai_cohort(p_mode text, p_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare k record; t0 timestamptz := clock_timestamp(); n int := 0; j jsonb; md text := training.fn_th_mode_ctx((select min(ogc_fid) from training.th_v3_cohort), p_mode)->>'mode';
begin
  for k in select c.ogc_fid from training.th_v3_cohort c where not exists (select 1 from training.th_ai_design_log l where l.fid = c.ogc_fid and l.mode = md) order by c.ogc_fid loop
    exit when clock_timestamp() - t0 > make_interval(secs => p_seconds);
    begin j := public.fn_th_ai_design(k.ogc_fid, p_mode);
      if not exists (select 1 from training.th_ai_design_log l where l.fid = k.ogc_fid and l.mode = md) then
        insert into training.th_ai_design_log(fid, mode, picked, error) values (k.ogc_fid, md, coalesce(j#>>'{ai_pick,picked}', 'none'), left(coalesce(j->>'reason', j->>'status', 'no log'), 200)); end if;
    exception when others then insert into training.th_ai_design_log(fid, mode, picked, error) values (k.ogc_fid, md, 'engine', left(sqlerrm, 200)); end;
    n := n + 1;
  end loop;
  return jsonb_build_object('ran', n, 'logged', (select count(distinct fid) from training.th_ai_design_log where mode = md));
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_th_ai_design(p_ogc_fid integer, p_mode text DEFAULT 'aor'::text, p_n integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
-- 2026-11-27: townhome plans from the generative site-plan model compete with the rule search under the engine's own ranking.
declare cfg jsonb := coalesce((select value from training.ai_config where key = 'th_ai_default'), '{}'::jsonb);
  c jsonb; site jsonb; P jsonb; md text; t0 timestamptz := clock_timestamp(); eng record; target int; pr jsonb; mv text; o jsonb; res jsonb; evj jsonb;
  n_opts int := 0; n_props int := 0; r record; out jsonb; ai_h int; ai_s numeric; picked text := 'engine'; g geometry; tried jsonb := '[]'::jsonb;
begin
  perform set_config('statement_timeout', '140s', true);
  if not coalesce((cfg->>'enabled')::boolean, false) then return jsonb_build_object('error', 'ai default disabled'); end if;
  c := training.fn_th_mode_ctx(p_ogc_fid, p_mode);
  if c ? 'skip' then return jsonb_build_object('status', 'skipped', 'reason', c->>'skip'); end if;
  md := c->>'mode'; site := c->'site'; P := c->'P';
  if not exists (select 1 from training.th_v3_run where ogc_fid = p_ogc_fid and mode = md and stage = 'full') then
    perform public.fn_th_v3_run_parcel(p_ogc_fid, p_mode);
  end if;
  select id, n_homes, score into eng from training.th_v3_run where ogc_fid = p_ogc_fid and mode = md and stage = 'full' and score is not null and coalesce(opt->>'source', '') <> 'model' order by score limit 1;
  select max(n_homes) into target from training.th_v3_run where ogc_fid = p_ogc_fid and mode = md and coalesce(opt->>'source', '') <> 'model';
  mv := cfg->>'model_version';
  if exists (select 1 from training.th_v3_run where ogc_fid = p_ogc_fid and mode = md and opt->>'source' = 'model' and opt->>'model_version' = mv) or coalesce(target, 0) = 0 or mv is null then
    out := public.fn_th_v3_run_parcel(p_ogc_fid, p_mode, 1000);
    return out || jsonb_build_object('ai_pick', jsonb_build_object('picked', case when out#>>'{opt,source}' = 'model' then 'model' else 'engine' end, 'cached', true, 'model_version', mv));
  end if;
  g := st_geomfromtext(site->>'site_wkt', 2274);
  pr := training.fn_ml_call('/propose', 'generate', jsonb_build_object('run_id', mv, 'n', coalesce(p_n, (cfg->>'n_designs')::int, 6),
          'site', jsonb_build_object('site_wkt', site->>'site_wkt', 'typ', 'townhome', 'units', target, 'loc', training.fn_site_location(g),
            'edges', (select coalesce(jsonb_agg(jsonb_build_object('type', 'street_frontage', 'wkt', st_astext(d.geom))), '[]'::jsonb)
                      from (select (st_dump(st_geomfromtext(w, 2274))).geom from (values (site->>'street_wkt'), (site->>'extra_wkt')) v(w) where w is not null) d))), 60000);
  if (pr->>'http') is distinct from '200' or pr->'body' ? 'error' then
    insert into training.th_ai_design_log(fid, mode, model_version, engine_homes, engine_score, picked, error, seconds)
      values (p_ogc_fid, md, mv, eng.n_homes, eng.score, 'engine', left(coalesce(pr#>>'{body,error}', pr->>'error', 'no answer'), 200), extract(epoch from clock_timestamp() - t0));
    out := public.fn_th_v3_run_parcel(p_ogc_fid, p_mode, 1000);
    return out || jsonb_build_object('ai_pick', jsonb_build_object('picked', 'engine', 'reason', coalesce(pr#>>'{body,error}', pr->>'error', 'the design model did not answer')));
  end if;
  n_props := jsonb_array_length(pr#>'{body,proposals}');
  for o in select distinct on (x.o_->>'family', x.o_->>'big') x.o_ from jsonb_array_elements(pr#>'{body,proposals}') pp, lateral training.fn_thgen_opts(site, pp) x(o_) limit coalesce((cfg->>'max_opts')::int, 18) loop
    o := o || jsonb_build_object('model_version', mv);
    begin res := public.fn_th_v3_layout(site, o, P, true); exception when others then res := null; end;
    tried := tried || jsonb_build_object('opt', o, 'homes', coalesce((res->>'n_homes')::int, 0)); n_opts := n_opts + 1;
  end loop;
  for r in select x->'opt' opt, (x->>'homes')::int homes from jsonb_array_elements(tried) x where (x->>'homes')::int > 0 order by (x->>'homes')::int desc limit coalesce((cfg->>'full_top')::int, 2) loop
    begin
      res := public.fn_th_v3_layout(site, r.opt, P, false);
      if res is not null and coalesce((res->>'n_homes')::int, 0) > 0 then
        evj := public.fn_th_v3_evaluate(site, res, P);
        insert into training.th_v3_run (ogc_fid, mode, opt, fast, stage, status, family, n_homes, result, metrics, fails, score, ms)
        values (p_ogc_fid, md, r.opt, false, 'full', 'done', r.opt->>'family', (res->>'n_homes')::int, res, evj, array(select jsonb_array_elements_text(evj->'fails')), public.fn_th_v3_rank(evj), extract(epoch from clock_timestamp() - t0) * 1000);
      end if;
    exception when others then null; end;
  end loop;
  if not exists (select 1 from training.th_v3_run where ogc_fid = p_ogc_fid and mode = md and opt->>'source' = 'model' and opt->>'model_version' = mv) then
    insert into training.th_v3_run (ogc_fid, mode, opt, fast, stage, status, family, n_homes, note) values (p_ogc_fid, md, jsonb_build_object('source', 'model', 'model_version', mv), true, 'quick1', 'done', 'ai|none', 0, 'model options drew no homes');
  end if;
  select n_homes, score into ai_h, ai_s from training.th_v3_run where ogc_fid = p_ogc_fid and mode = md and stage = 'full' and score is not null and opt->>'source' = 'model' and opt->>'model_version' = mv order by score limit 1;
  out := public.fn_th_v3_run_parcel(p_ogc_fid, p_mode, 20000);
  if out#>>'{opt,source}' = 'model' then picked := 'model'; end if;
  insert into training.th_ai_design_log(fid, mode, model_version, n_props, n_opts, engine_homes, engine_score, ai_best_homes, ai_best_score, picked, seconds)
    values (p_ogc_fid, md, mv, n_props, n_opts, eng.n_homes, eng.score, ai_h, ai_s, picked, extract(epoch from clock_timestamp() - t0));
  return out || jsonb_build_object('ai_pick', jsonb_build_object('picked', picked, 'model_version', mv, 'rule', 'the engine''s own ranking of full plans (fn_th_v3_rank)',
     'engine', jsonb_build_object('homes', eng.n_homes, 'score', eng.score), 'model_best', jsonb_build_object('homes', ai_h, 'score', ai_s), 'model_options_tried', n_opts,
     'seconds', round(extract(epoch from clock_timestamp() - t0)::numeric, 1)));
end $function$
;

CREATE OR REPLACE FUNCTION training.fn_th_mode_ctx(p_ogc_fid integer, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
-- the mode, site and parameters exactly as fn_th_v3_run_parcel builds them (copied from it, 2026-11-27)
declare site jsonb; P jsonb; rules jsonb;
begin
  if p_mode not like '%|attached%' and p_mode not like '%|detached%' and coalesce((public.fn_th_v3_params()->>'attached_default')::boolean, false) then
    p_mode := case when p_mode ~ '\|\d+(\.\d+)?x\d+(\.\d+)?$' then regexp_replace(p_mode, '(\|\d+(\.\d+)?x\d+(\.\d+)?)$', '|attached\1') else p_mode || '|attached' end;
  end if;
  site := public.fn_th_v3_site(p_ogc_fid, case when p_mode like '%|fill%' then 'floodway' else 'sfha' end);
  if site->>'reason' is not null then return jsonb_build_object('mode', p_mode, 'skip', site->>'reason'); end if;
  rules := site->'rules';
  P := public.fn_th_v3_params_for(case when p_mode like 'aor%' then 'aor' else 'sp' end, rules,
         case when p_mode ~ '\|(\d+(\.\d+)?)x(\d+(\.\d+)?)$' then public.fn_th_v3_params() || jsonb_build_object('unit_w_ft', (regexp_match(p_mode, '\|(\d+(?:\.\d+)?)x'))[1]::numeric, 'unit_d_ft', (regexp_match(p_mode, 'x(\d+(?:\.\d+)?)$'))[1]::numeric) else null end);
  if p_mode like '%|attached%' then P := P || jsonb_build_object('attached', true); end if;
  return jsonb_build_object('mode', p_mode, 'site', site, 'P', P);
end $function$
;

CREATE OR REPLACE FUNCTION training.fn_thgen_opts(p_site jsonb, p_prop jsonb)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
-- Turns one model proposal (building rows and drives, EPSG:2274 WKT) into townhome engine options: which of the site's frames the rows follow,
-- where the drives or the street enter along the frontage, how many cross bands of rows, rows on the side edges. The engine cuts the homes.
declare SITE geometry := st_geomfromtext(p_site->>'site_wkt', 2274); o geometry := st_centroid(SITE); ST0 geometry := st_geomfromtext(p_site->>'street_wkt', 2274);
  f int; ang double precision; th double precision; best_f int; best_ang double precision; best_th double precision; best_sc double precision := -1e9; sc double precision;
  B geometry[]; g geometry; r geometry; FRUN geometry; fx0 double precision; fx1 double precision; x0 double precision; x1 double precision;
  px double precision[] := '{}'; xs double precision[] := '{}'; ys double precision[] := '{}'; v double precision; prev double precision; nb int := 0; er boolean := false;
  e1 double precision; e2 double precision; ax double precision; rel double precision; fam text; bg int; i int;
begin
  select array_agg(st_geomfromtext(x->>'wkt', 2274)) into B from jsonb_array_elements(coalesce(p_prop->'buildings', '[]'::jsonb)) x;
  if B is null or ST0 is null then return; end if;
  for f in 0..jsonb_array_length(p_site->'frame_angles') - 1 loop
    ang := (p_site->'frame_angles'->>f)::double precision; th := -radians(ang - 90); sc := 0;
    foreach g in array B loop
      r := st_orientedenvelope(st_rotate(g, th, o));
      e1 := st_distance(st_pointn(st_exteriorring(r), 1), st_pointn(st_exteriorring(r), 2)); e2 := st_distance(st_pointn(st_exteriorring(r), 2), st_pointn(st_exteriorring(r), 3));
      ax := case when e1 >= e2 then st_azimuth(st_pointn(st_exteriorring(r), 1), st_pointn(st_exteriorring(r), 2)) else st_azimuth(st_pointn(st_exteriorring(r), 2), st_pointn(st_exteriorring(r), 3)) end;
      sc := sc + greatest(e1, e2) * cos(4 * coalesce(ax, 0));           -- rows parallel or square to the frame score +, diagonal rows score -
    end loop;
    if sc > best_sc then best_sc := sc; best_f := f; best_ang := ang; best_th := th; end if;
  end loop;
  th := best_th;
  if st_y(st_centroid(st_rotate(ST0, th, o))) > st_y(st_centroid(st_rotate(SITE, th, o))) then th := th + pi(); end if;
  SITE := st_rotate(SITE, th, o);
  select r_ into FRUN from public.fn_th_v3_runs(st_rotate(ST0, th, o), 40) r_ order by st_length(r_) desc limit 1;
  if FRUN is null then return; end if;
  fx0 := st_xmin(FRUN); fx1 := st_xmax(FRUN); x0 := st_xmin(SITE); x1 := st_xmax(SITE);
  if fx1 - fx0 < 20 then return; end if;
  -- drives the model drew, square to the frontage
  for g in select st_rotate(st_geomfromtext(x #>> '{}', 2274), th, o) from jsonb_array_elements(coalesce(p_prop->'drives', '[]'::jsonb)) x loop
    if abs(st_y(st_endpoint(g)) - st_y(st_startpoint(g))) > abs(st_x(st_endpoint(g)) - st_x(st_startpoint(g))) and st_length(g) > 60 then xs := xs || st_x(st_centroid(g)); end if;
  end loop;
  -- rows: square to the frontage give drive positions between them; parallel ones give the cross bands
  foreach g in array B loop
    r := st_orientedenvelope(st_rotate(g, th, o));
    e1 := st_distance(st_pointn(st_exteriorring(r), 1), st_pointn(st_exteriorring(r), 2)); e2 := st_distance(st_pointn(st_exteriorring(r), 2), st_pointn(st_exteriorring(r), 3));
    ax := case when e1 >= e2 then st_azimuth(st_pointn(st_exteriorring(r), 1), st_pointn(st_exteriorring(r), 2)) else st_azimuth(st_pointn(st_exteriorring(r), 2), st_pointn(st_exteriorring(r), 3)) end;
    rel := abs(sin(coalesce(ax, 0)));                                   -- azimuth from north: 1 = along x (parallel to the frontage), 0 = square to it
    continue when greatest(e1, e2) < 1.5 * least(e1, e2);                -- a square footprint has no direction
    if rel <= 0.5 then
      px := px || st_x(st_centroid(r));
      if st_x(st_centroid(r)) - x0 < 0.15 * (x1 - x0) or x1 - st_x(st_centroid(r)) < 0.15 * (x1 - x0) then er := true; end if;
    elsif rel >= 0.87 then ys := ys || st_y(st_centroid(r)); end if;
  end loop;
  if cardinality(xs) = 0 and cardinality(px) >= 2 then
    prev := null;
    for v in select u from unnest(px) u order by u loop
      if prev is not null and v - prev > 45 then xs := xs || (prev + v) / 2; end if;
      prev := v;
    end loop;
  end if;
  select coalesce(array_agg(distinct q.f_ order by q.f_), '{}') into xs from (select round((least(0.92, greatest(0.08, (u - fx0) / (fx1 - fx0))))::numeric, 2)::double precision f_ from unnest(xs) u) q;
  if cardinality(xs) > 3 then xs := array[xs[1], xs[1 + cardinality(xs) / 2], xs[cardinality(xs)]]; end if;
  prev := null;
  for v in select u from unnest(ys) u order by u loop
    if prev is null or v - prev > 50 then nb := nb + 1; end if; prev := v;
  end loop;
  nb := least(nb, 4);
  fam := format('ai|f%s|%s|b%s|%s', best_f, array_to_string(xs, ','), nb, er);
  for bg in select b_ from (values (0,0),(1,0),(1,1),(2,0),(2,1),(2,2),(3,1),(3,3),(4,2)) v_(n_, b_) where n_ = nb loop
    return next jsonb_build_object('pattern', 'mews', 'frame', best_f, 'angle_deg', best_ang, 'drives', to_jsonb(case when cardinality(xs) = 0 then array[0.5]::double precision[] else xs end),
      'bands', nb, 'big', bg, 'edge_rows', er, 'family', fam || '|mews', 'source', 'model');
  end loop;
  for i in 1..least(cardinality(xs), 2) loop
    return next jsonb_build_object('pattern', 'street', 'frame', best_f, 'angle_deg', best_ang, 'anchor', 'frac', 'frac', xs[i], 'west', 'through', 'east', 'through', 'branch', false, 'loop', false, 'bands', 0, 'big', 0, 'family', fam || '|street' || i, 'source', 'model');
    return next jsonb_build_object('pattern', 'street', 'frame', best_f, 'angle_deg', best_ang, 'anchor', 'frac', 'frac', xs[i], 'west', 'stub', 'east', 'stub', 'branch', false, 'loop', false, 'bands', 0, 'big', 0, 'family', fam || '|street' || i || 's', 'source', 'model');
  end loop;
end $function$
;
