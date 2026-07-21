-- DESIGN CONTEXT ENGINE — repo parity export (WO3, 2026-07-20 evening).
-- Source of truth: the LIVE database; these five functions are owned and
-- evolved by the context-engine session and were exported verbatim via
-- pg_get_functiondef. Each section header records the definition md5 at
-- export time — re-export and diff to detect drift before editing here.
-- fn_parcel_frontage here is the shared-edge frontage detector (validated
-- median 3.2 ft agreement vs assessor footage); the site generators'
-- fabric-gap detector (fn_parcel_row_frontage, migration ...024) is a
-- separate function and remains unchanged.

-- ── fn_buildable_envelope_directional (def md5 69868f94134513df85cd3ce4828c1392) ──
CREATE OR REPLACE FUNCTION public.fn_buildable_envelope_directional(p_ogc_fid integer, p_typology text DEFAULT 'single_family'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  ctx jsonb;
  v_front numeric; v_side numeric; v_rear numeric;
  g2274 geometry; ring geometry; n int;
  front_idx int; rear_idx int;
  buildable geometry;
  cut geometry;
  parcel_area numeric; build_area numeric;
  i int; best_len numeric := -1; e geometry;
  fa double precision; fb double precision; ang double precision;
BEGIN
  ctx := public.fn_resolve_design_context(p_ogc_fid, p_typology);
  IF ctx ? 'error' THEN RETURN ctx; END IF;

  v_front := (ctx#>>'{setbacks,front,value}')::numeric;
  v_side  := (ctx#>>'{setbacks,side,value}')::numeric;
  v_rear  := (ctx#>>'{setbacks,rear,value}')::numeric;

  SELECT ST_Transform(ST_MakeValid(wkb_geometry_4326), 2274) INTO g2274
  FROM public.parcels WHERE ogc_fid = p_ogc_fid;
  IF g2274 IS NULL THEN RETURN jsonb_build_object('error','no geometry'); END IF;
  g2274 := ST_Force2D((ST_Dump(g2274)).geom);  -- largest part
  parcel_area := ST_Area(g2274);

  -- Approach: inset the whole polygon by the SIDE setback (applies to all edges as a base),
  -- then additionally trim the front and rear edges by the extra (front-side) and (rear-side) amounts
  -- using directional half-plane cuts. This yields true directional setbacks without full edge classification.
  buildable := ST_Buffer(g2274, -v_side);

  -- Identify front edge = longest boundary segment (v1 heuristic; road-based upgrade later)
  ring := ST_ExteriorRing(g2274);
  n := ST_NPoints(ring);
  FOR i IN 1..(n-1) LOOP
    e := ST_MakeLine(ST_PointN(ring,i), ST_PointN(ring,i+1));
    IF ST_Length(e) > best_len THEN best_len := ST_Length(e); front_idx := i; END IF;
  END LOOP;

  -- Build a directional trim: cut a strip of depth (front - side) inward from the front edge.
  IF v_front > v_side THEN
    e := ST_MakeLine(ST_PointN(ring,front_idx), ST_PointN(ring,front_idx+1));
    -- offset the front edge inward by (front - side) and clip everything on the outer side
    cut := ST_Buffer(e, (v_front - v_side), 'side=left endcap=flat');
    buildable := ST_Difference(buildable, cut);
    -- also try right side in case orientation flips; keep the larger result
    DECLARE alt geometry; BEGIN
      alt := ST_Difference(ST_Buffer(g2274,-v_side), ST_Buffer(e,(v_front - v_side),'side=right endcap=flat'));
      IF ST_Area(alt) < ST_Area(buildable) THEN buildable := alt; END IF; -- pick the one that trims (smaller), front faces out
    END;
  END IF;

  buildable := ST_MakeValid(buildable);
  IF buildable IS NULL OR ST_IsEmpty(buildable) THEN
    build_area := 0;
  ELSE
    build_area := ST_Area(buildable);
  END IF;

  RETURN ctx
    || jsonb_build_object(
      'parcel_sqft', round(parcel_area::numeric,0),
      'parcel_acres', round((parcel_area/43560)::numeric,3),
      'buildable_sqft', round(build_area::numeric,0),
      'buildable_acres', round((build_area/43560)::numeric,3),
      'buildable_pct', round((100*build_area/NULLIF(parcel_area,0))::numeric,1),
      'setbacks_applied', jsonb_build_object('front',v_front,'side',v_side,'rear',v_rear),
      'front_edge_len_ft', round(best_len::numeric,1),
      'method','directional_v1_longest_edge_front',
      'geom_4326', ST_AsGeoJSON(ST_Transform(buildable,4326))::jsonb
    );
END $function$
;

-- ── fn_directional_envelope (def md5 58cf8fbf8548d770b7ed6e93770b9d34) ──
CREATE OR REPLACE FUNCTION public.fn_directional_envelope(p_ogc_fid integer, p_front numeric, p_side numeric, p_rear numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  g geometry; fr jsonb; fline geometry; other geometry; rear_seg geometry;
  env geometry; method text;
BEGIN
  SELECT (ST_Dump(geom_2274)).geom INTO g FROM public.parcels WHERE ogc_fid=p_ogc_fid LIMIT 1;
  IF g IS NULL THEN RETURN jsonb_build_object('error','no geometry'); END IF;
  fr := public.fn_parcel_frontage(p_ogc_fid);

  IF coalesce((fr->>'landlocked')::boolean,true) THEN
    env := ST_Buffer(g, -GREATEST(p_side,p_front));  -- conservative uniform when no frontage
    method := 'uniform_inset_landlocked';
  ELSE
    fline := ST_GeomFromGeoJSON((fr#>'{primary,geom_2274}')::text);
    other := ST_Difference(ST_Boundary(g), ST_Buffer(fline, 2));
    -- rear = the non-frontage boundary segment farthest from the frontage line
    SELECT d.geom INTO rear_seg
    FROM (SELECT (ST_Dump(other)).geom) d
    ORDER BY ST_Distance(d.geom, fline) DESC LIMIT 1;
    env := g;
    env := ST_Difference(env, ST_Buffer(fline, p_front));
    IF rear_seg IS NOT NULL THEN env := ST_Difference(env, ST_Buffer(rear_seg, p_rear)); END IF;
    env := ST_Difference(env, ST_Buffer(ST_Difference(other, coalesce(ST_Buffer(rear_seg,2), ST_GeomFromText('POINT EMPTY',2274))), p_side));
    -- keep largest piece (slivers can appear on odd shapes)
    SELECT d.geom INTO env FROM (SELECT (ST_Dump(env)).geom) d ORDER BY ST_Area(d.geom) DESC LIMIT 1;
    method := 'directional_v1_frontage_based';
  END IF;

  RETURN jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'method', method,
    'setbacks_applied', jsonb_build_object('front',p_front,'side',p_side,'rear',p_rear),
    'area_sqft', round(ST_Area(env)),
    'geom_2274', ST_AsGeoJSON(env)::jsonb,
    'geom_4326', ST_AsGeoJSON(ST_Transform(ST_SetSRID(env,2274),4326))::jsonb);
END $function$
;

-- ── fn_massing_program (def md5 2ca18618e5dd6d36fbf01fb84d0134c4) ──
CREATE OR REPLACE FUNCTION public.fn_massing_program(p_ogc_fid integer, p_typology text DEFAULT 'multifamily'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  mb jsonb; up jsonb; fr jsonb;
  target_gsf numeric; target_stories int; bar_depth numeric; max_bar_ft numeric := 280; -- core spacing 250 + ends; egress-practical
  total_bar_ft numeric; n_bldgs int; bar_ft numeric; footprint numeric;
  ct record; zoning_h numeric; eff_stories int;
  front_ft numeric; landlocked boolean; parti text; rationale text;
BEGIN
  mb := public.fn_max_buildout(p_ogc_fid, p_typology);
  IF mb ? 'error' THEN RETURN mb; END IF;
  up := public.fn_unit_program(p_typology);
  fr := public.fn_parcel_frontage(p_ogc_fid);

  target_gsf := (mb->>'max_gsf')::numeric;
  target_stories := (mb#>>'{program_frontier,gsf_max_option,stories}')::int;
  bar_depth := (up->>'implied_bar_depth_ft')::numeric;

  -- construction type: cheapest that reaches target stories (zoning already capped stories upstream)
  SELECT * INTO ct FROM public.ibc_construction_types
  WHERE max_stories >= target_stories ORDER BY cost_rank LIMIT 1;
  eff_stories := LEAST(target_stories, ct.max_stories);

  footprint := target_gsf / eff_stories;
  total_bar_ft := footprint / bar_depth;
  n_bldgs := GREATEST(1, ceil(total_bar_ft / max_bar_ft)::int);   -- CONSOLIDATION: fewest buildings code allows
  bar_ft := round(total_bar_ft / n_bldgs);

  front_ft := (fr#>>'{primary,length_ft}')::numeric;
  landlocked := coalesce((fr->>'landlocked')::boolean, false);
  parti := CASE
    WHEN landlocked THEN 'court_scheme_easement_access'
    WHEN front_ft >= bar_ft THEN 'street_bar_parking_behind'
    WHEN front_ft >= bar_ft*0.55 THEN 'L_scheme_bar_on_frontage_wing_deep'
    ELSE 'perpendicular_bars_court_to_street' END;
  rationale := format('%s GSF @ %s stories (%s) = %s SF footprint = %s ft of %s-ft bar → %s building(s) × %s ft. Frontage %s ft → %s.',
    target_gsf, eff_stories, ct.const_type, round(footprint), round(total_bar_ft), bar_depth, n_bldgs, bar_ft,
    coalesce(front_ft::text,'0'), parti);

  RETURN jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'typology', p_typology,
    'target_gsf', target_gsf,
    'construction_type', jsonb_build_object('type',ct.const_type,'max_stories',ct.max_stories,
        'max_height_ft',ct.max_height_ft,'description',ct.description,'source',ct.source),
    'stories', eff_stories,
    'building_count', n_bldgs,
    'building_count_basis','consolidation: fewest buildings within max_bar_ft='||max_bar_ft||' (core spacing + egress practice) — NEVER from precedent count',
    'per_building', jsonb_build_object('bar_length_ft',bar_ft,'bar_depth_ft',bar_depth,
        'footprint_sqft',round(bar_ft*bar_depth),'gsf',round(bar_ft*bar_depth*eff_stories)),
    'parti', parti,
    'frontage', jsonb_build_object('primary_ft',front_ft,'landlocked',landlocked,
        'bearing_deg',fr#>>'{primary,bearing_deg}'),
    'rationale', rationale,
    'max_buildout', mb - 'stories_ladder',
    'note','Composition directive for the solver: build THIS program. Precedents inform facade/style, not count or mass.');
END $function$
;

-- ── fn_parcel_frontage (def md5 293924976290f029358eec2f37f61637) ──
CREATE OR REPLACE FUNCTION public.fn_parcel_frontage(p_ogc_fid integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  g geometry;
  nb geometry;
  front geometry;
  prim geometry;
  total_ft numeric;
  n_segs integer;
  prim_ft numeric;
  prim_mid geometry;
  bearing numeric;
  second_ft numeric;
begin
  select (st_dump(geom_2274)).geom into g
  from public.parcels where ogc_fid = p_ogc_fid limit 1;
  if g is null then return jsonb_build_object('error', 'no geometry'); end if;

  select st_union(p.geom_2274) into nb
  from public.parcels p
  where p.ogc_fid <> p_ogc_fid and st_dwithin(p.geom_2274, g, 2);

  if nb is null then front := st_boundary(g);
  else front := st_difference(st_boundary(g), st_buffer(nb, 1.5)); end if;

  if front is null or st_isempty(front) then
    return jsonb_build_object(
      'parcel_ogc_fid', p_ogc_fid, 'landlocked', true,
      'total_frontage_ft', 0, 'n_segments', 0,
      'method', 'parcel_fabric_shared_edge_v1',
      'note', 'no unshared boundary — landlocked or fully interior; access likely via easement');
  end if;

  total_ft := st_length(front);
  select count(*) into n_segs
  from (select (st_dump(front)).geom) d where st_length(d.geom) > 10;
  select d.geom, st_length(d.geom) into prim, prim_ft
  from (select (st_dump(front)).geom) d order by st_length(d.geom) desc limit 1;
  select st_length(d.geom) into second_ft
  from (select (st_dump(front)).geom) d order by st_length(d.geom) desc offset 1 limit 1;
  prim_mid := st_lineinterpolatepoint(st_linemerge(prim), 0.5);
  bearing := degrees(st_azimuth(st_startpoint(st_linemerge(prim)), st_endpoint(st_linemerge(prim))));

  return jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'landlocked', false,
    'total_frontage_ft', round(total_ft, 1), 'n_segments', n_segs,
    'corner_lot', n_segs >= 2 and coalesce(second_ft, 0) > 25,
    'primary', jsonb_build_object(
      'length_ft', round(prim_ft, 1), 'bearing_deg', round(bearing, 1),
      'midpoint_2274', jsonb_build_array(round(st_x(prim_mid)::numeric, 2), round(st_y(prim_mid)::numeric, 2)),
      'geom_2274', st_asgeojson(prim)::jsonb),
    'method', 'parcel_fabric_shared_edge_v1',
    'basis', 'boundary segments not shared with neighboring parcels (2ft adjacency, 1.5ft carve)');
end
$function$
;

-- ── fn_unit_program (def md5 bd45595ba5aead0a8d220cc158b4ca16) ──
CREATE OR REPLACE FUNCTION public.fn_unit_program(p_typology text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
    'typology', p_typology,
    'units', (
      select jsonb_agg(jsonb_build_object(
        'type', unit_type,
        'gsf', gsf,
        'width_ft', width_ft,
        'depth_ft', depth_ft,
        'bedrooms', bedrooms,
        'bathrooms', bathrooms,
        'parking_ratio', parking_ratio,
        'default_mix_pct', default_mix_pct,
        'source', source
      ) order by gsf)
      from public.unit_spec
      where typology = p_typology
    ),
    'corridor_clear_ft', ts.corridor_clear_ft,
    'core', jsonb_build_object(
      'width_ft', ts.core_width_ft,
      'length_ft', ts.core_length_ft,
      'max_spacing_ft', ts.core_max_spacing_ft
    ),
    'implied_bar_depth_ft', (
      select round(2 * avg(depth_ft) + ts.corridor_clear_ft, 1)
      from public.unit_spec
      where typology = p_typology
    ),
    'weighted_unit_gsf', (
      select round(sum(gsf * coalesce(default_mix_pct, 0))
                   / nullif(sum(coalesce(default_mix_pct, 0)), 0), 1)
      from public.unit_spec
      where typology = p_typology
    ),
    'weighted_parking_ratio', (
      select round(sum(parking_ratio * coalesce(default_mix_pct, 0))
                   / nullif(sum(coalesce(default_mix_pct, 0)), 0), 3)
      from public.unit_spec
      where typology = p_typology
    ),
    'source', 'unit_spec + typology_spec',
    'confidence', 'medium',
    'role', 'authoritative_form_and_program_input'
  )
  from public.typology_spec ts
  where ts.typology = p_typology;
$function$
;
