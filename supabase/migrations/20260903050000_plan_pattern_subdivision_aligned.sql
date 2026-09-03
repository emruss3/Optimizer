-- Plan-pattern layer: the subdivision generator now exists, so the pattern for
-- large single-family parcels is ALIGNED (fn_generate_subdivision draws it).
-- Two subdivision patterns are told apart by the parcel's short axis: a strip
-- too narrow for back-to-back blocks gets a ROW spine; a tract wide enough for
-- two or more through-streets (≥ 550 ft ≈ 2 × (55 + 2×70 + 20) + 20) gets a
-- street grid. The threshold for "subdivision, not one house" is the land for
-- ~6 district-minimum lots with street overhead, never less than 2 acres.

create or replace function public.fn_plan_pattern(p_ogc_fid integer, p_typology text default 'multifamily')
returns jsonb
language plpgsql
stable
as $function$
declare
  v_g geometry; v_lot numeric; v_acres numeric; v_ring geometry; v_a numeric; v_b numeric; v_aspect numeric;
  v_fr jsonb; v_landlocked boolean; v_frontage numeric; v_corner boolean;
  v_pu jsonb; v_uses jsonb; v_sf boolean; v_tf boolean; v_mf boolean; v_comm boolean; v_ind boolean; v_any_res boolean;
  v_zb text; v_rc jsonb; v_pk text; v_min_lot numeric; v_subdiv_floor numeric;
  v_pattern text; v_alternates text[] := '{}'; v_principles text[];
  v_gen text; v_aligned boolean; v_gen_note text; v_ex jsonb;
begin
  select geom_2274, st_area(geom_2274) into v_g, v_lot from public.parcels where ogc_fid = p_ogc_fid;
  if v_g is null then
    return jsonb_build_object('error','parcel not found','parcel_ogc_fid',p_ogc_fid);
  end if;
  v_acres := v_lot / 43560.0;
  v_ring := st_exteriorring(st_orientedenvelope(v_g));
  v_a := st_distance(st_pointn(v_ring,1), st_pointn(v_ring,2));
  v_b := st_distance(st_pointn(v_ring,2), st_pointn(v_ring,3));
  v_aspect := greatest(v_a,v_b) / nullif(least(v_a,v_b),0);

  v_fr := public.fn_parcel_frontage(p_ogc_fid);
  v_landlocked := coalesce((v_fr->>'landlocked')::boolean, false);
  v_frontage := nullif(v_fr#>>'{primary,length_ft}','')::numeric;
  v_corner := coalesce((v_fr->>'corner_lot')::boolean, false);

  v_pu := public.fn_resolve_permitted_uses(p_ogc_fid);
  v_uses := coalesce(v_pu->'as_of_right', '{}'::jsonb);
  v_sf := coalesce((v_uses->>'single_family')::boolean, false);
  v_tf := coalesce((v_uses->>'two_family')::boolean, false);
  v_mf := coalesce((v_uses->>'multi_family')::boolean, false);
  v_comm := coalesce((v_uses->>'commercial')::boolean, false);
  v_ind := coalesce((v_uses->>'industrial')::boolean, false);
  v_any_res := v_sf or v_tf or v_mf;

  select pz.base into v_zb
  from public.parcels p left join public.planner_zoning pz on pz.zoning_id = p.zoning_id
  where p.ogc_fid = p_ogc_fid;
  v_rc := public.fn_resolve_design_context(p_ogc_fid, case when v_mf or not v_any_res then 'multifamily' else 'single_family' end);
  v_pk := coalesce(v_rc->>'parking_strategy', 'surface');
  v_min_lot := coalesce(nullif(v_rc#>>'{min_lot_area_sqft,value}','')::numeric, 6000);
  -- land for ~6 district-minimum lots with street overhead, never under 2 acres
  v_subdiv_floor := greatest(2 * 43560, 6 * 1.5 * v_min_lot);

  if not v_any_res and (v_comm or v_ind) then
    v_pattern := 'retail_full_plate'; v_alternates := array['retail_stacked_two_tenant'];
    v_principles := array[
      'fill the allowable area (FAR × lot) as a single plate on the frontage — the envelope is the design',
      'front the primary street: front setback, then the height plane; no side setback where the district allows',
      'parking per the district''s exemptions, on site or by shared access — never in front of the storefront',
      'a stacked two-tenant program (retail below, restaurant/bar + roof terrace above) reaches the same ceiling when the height plane allows two stories'];
    v_gen := 'none'; v_aligned := false;
    v_gen_note := 'no retail generator — the allowable area is stated on the commercial capacity card';
  elsif v_mf and v_pk = 'structured' then
    v_pattern := 'podium_tower'; v_alternates := array['bar_on_frontage_rear_field'];
    v_principles := array[
      'podium parking (one or two levels) wrapped by liner units on the street',
      'tower or bar above the podium up to the height plane',
      'the ceiling is FAR / height plane, not surface-parking land',
      'ground-floor active edge on the primary frontage'];
    v_gen := 'seed_v2 (surface)'; v_aligned := false;
    v_gen_note := 'the seed and the frontier model surface parking; the podium ceiling is advisory only (structured_parking_ceiling)';
  elsif v_mf and v_landlocked then
    v_pattern := 'landlocked_axis_bar'; v_alternates := array['court_scheme_perpendicular_bars'];
    v_principles := array[
      'single bar on the long axis of the lot with parking in the residual field',
      'access by easement; no curb cut on a public street',
      'no street face — orient units to the field and a court'];
    v_gen := 'seed_v2'; v_aligned := true;
    v_gen_note := 'axis bar + field is the seed''s landlocked composition';
  elsif v_mf and (v_acres >= 3 or v_aspect >= 2.2) then
    v_pattern := 'court_scheme_perpendicular_bars'; v_alternates := array['bar_on_frontage_rear_field'];
    v_principles := array[
      'bars perpendicular to the street framing courts that open to the frontage',
      'a spine drive from the primary frontage with double-loaded parking fields between the bars',
      'the courts are the amenity; parking never fronts the street',
      'stories stepped to the height plane at the street'];
    v_gen := 'seed_v2 / search core'; v_aligned := false;
    v_gen_note := 'seed_v2 places one connected S/C-form bar with a rear field; the court parti lives only in the search core (perpendicular_bars_court_to_street)';
  elsif v_mf then
    v_pattern := 'bar_on_frontage_rear_field'; v_alternates := array['court_scheme_perpendicular_bars'];
    v_principles := array[
      'street-facing bar on the primary frontage with the entry drive from that frontage',
      'double-loaded parking field behind the bar (rear field / end rows / side rows)',
      'a connected S/C-form when depth allows a second bar — one structure, continuous units',
      'parking reads as clear pavement between stall rows, never in front of the bar'];
    v_gen := 'seed_v2'; v_aligned := true;
    v_gen_note := 'frontage bar + rear field is the seed''s default composition';
  elsif (v_sf or v_tf) and v_lot >= v_subdiv_floor then
    if least(v_a, v_b) >= 550 then
      v_pattern := 'subdivision_street_grid'; v_alternates := array['subdivision_row_spine', 'townhome_rows_on_spine'];
      v_principles := array[
        'streets first: through-streets on the long axis at a pitch of ROW + two lot depths + alley (blocks back to back), cross connectors so no block exceeds 600 ft',
        'double-loaded lots with rear alleys on every street: garages off the alley, fronts on the street',
        'courts interrupting the rows; amenity at the head of the site when the program trades lots for it',
        'hold floodplain, wetlands and greenway out of the lot pattern',
        'lot width and depth from the district minimums — every lot must carry a buildable depth after setbacks'];
    else
      v_pattern := 'subdivision_row_spine'; v_alternates := array['townhome_rows_on_spine', 'subdivision_street_grid'];
      v_principles := array[
        'public right-of-way spine along the long axis (55-ft ROW) — the street network comes first',
        'double-loaded lots with rear alleys: garages off the alley, fronts on the street',
        'courtyards or greens interrupting the rows; amenity at the head of the site',
        'a through-connection or a cul-de-sac where the spine would dead-end beyond 750 ft',
        'hold floodplain, wetlands and greenway out of the lot pattern',
        'lot width and depth from the district minimums — every lot must carry a buildable depth after setbacks'];
    end if;
    v_gen := 'fn_generate_subdivision'; v_aligned := true;
    v_gen_note := 'the subdivision generator draws this organization from the parcel''s own shape: through-streets on the long axis (as many as the width allows), cross connectors ≤ 600-ft blocks, rear alleys, whole lots only, courts every 12 lots, amenity at the head on request, cul-de-sac where a dead-end exceeds 750 ft; floodplain is flagged, not yet carved';
  elsif v_sf or v_tf then
    v_pattern := 'house_on_lot';
    v_alternates := case when v_tf then array['duplex_on_lot'] else '{}'::text[] end;
    v_principles := array[
      'one house centred on the buildable envelope with the driveway off the primary frontage',
      'front the street; garage set back, or off the alley where one exists'];
    v_gen := 'fn_generate_sf_seed'; v_aligned := true;
    v_gen_note := 'house + driveway seed';
  else
    v_pattern := 'unknown'; v_principles := array['no as-of-right use resolved for this parcel'];
    v_gen := 'none'; v_aligned := false; v_gen_note := 'no pattern without a permitted use';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', e.name, 'source', e.source, 'source_date', e.source_date,
           'parcel_ogc_fid', e.parcel_ogc_fid, 'pattern', e.pattern,
           'program', e.program, 'principles', to_jsonb(e.principles)) order by e.id), '[]'::jsonb)
    into v_ex
  from public.site_plan_exemplar e
  where e.pattern = v_pattern or e.pattern = any(v_alternates);

  return jsonb_build_object(
    'version', 'plan_pattern_v1',
    'parcel_ogc_fid', p_ogc_fid,
    'typology', p_typology,
    'pattern', v_pattern,
    'alternates', to_jsonb(v_alternates),
    'principles', to_jsonb(v_principles),
    'selection_basis', jsonb_build_object(
      'lot_acres', round(v_acres, 2), 'obb_aspect', round(v_aspect, 2), 'obb_short_ft', round(least(v_a, v_b)),
      'landlocked', v_landlocked, 'frontage_ft', v_frontage, 'corner_lot', v_corner,
      'zoning_base', v_zb, 'parking_strategy', v_pk, 'uses_as_of_right', v_uses,
      'min_lot_area_sqft', v_min_lot, 'subdivision_floor_sqft', round(v_subdiv_floor)),
    'exemplars', v_ex,
    'generator_alignment', jsonb_build_object('generator', v_gen, 'aligned', v_aligned, 'note', v_gen_note));
end
$function$;

grant execute on function public.fn_plan_pattern(integer, text) to anon, authenticated;
