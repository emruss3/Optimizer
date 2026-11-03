-- 2026-10-07 · The Texas wrap, from The Caroline (101 Cool Springs Blvd).
--
-- Eric: "Here's an example set of plans for a texas wrap multifamily
-- product." — The Caroline Development Plan, Franklin TN (Kimley-Horn civil
-- 3/7/2024; 906 Studio architecture; Gamble Design Collaborative): 190
-- apartments on 2.906 acres (65.4 DU/ac), six stories = two garage levels
-- (148 + 166 stalls) with four residential levels ringing a courtyard on the
-- garage deck, a 303 × 243 ft block (72,070 sf per floor) to the 15-ft
-- setbacks, Type VA over a Type IA podium at 68'-5", club / fitness / lobby /
-- leasing at the street corner, 3,607 sf of commercial on the private drive,
-- 332 stalls provided against 330 required (1.5 per studio and 1BR, 2.5 per
-- 2BR; 27 fewer by shared-parking study), 18 of them outside. The garage is
-- entered from the side private drive and the rear joint-access easement —
-- no curb cut on the arterial — and the fire truck (a Franklin Tower 2) runs
-- the perimeter drives. Trash is inside the garage, collected by roll-out.
--
-- This migration (1) adds the set to the exemplar library and (2) teaches
-- fn_plan_pattern the pattern: on a multifamily parcel in the structured-
-- parking regime that is compact enough to hold a block of two bars and a
-- court each way, the organization is a wrap — units around a garage, a
-- court on the deck, an L-shaped drive down one side and across the rear.
-- The generator that draws it is 20261007110000_mf_wrap_generator.sql.
--
-- The body of fn_plan_pattern below is the live 2026-10-07 definition (it
-- had been revised in the database on 2026-09-13 outside this repository:
-- subdivision floors, calibration, retail honesty) with the wrap branch
-- added before the podium branch and the wrap named as an alternate on the
-- court scheme. Nothing else in it changes.

insert into public.site_plan_exemplar (name, source, source_date, parcel_ogc_fid, product, pattern, program, principles, notes)
select * from (values
 ('The Caroline — 101 Cool Springs Blvd, Franklin (Texas wrap over a 2-level garage)',
  '101_Cool_Springs_-_BOMA_combined_full_plans.pdf (Kimley-Horn C0.0–C5.0, L1.0; 906 Studio A1.0–A4.0; development plan resubmittal 3/7/2024)', date '2024-03-07', null::integer,
  'multifamily', 'wrap_garage_courtyard',
  '{"site_acres":2.906,"site_sqft":126583,"zoning":"RC-6 → PD (65.4 DU/ac, 3,607 sf commercial)","units":190,"du_ac":65.4,"stories":6,"garage_levels":2,"residential_levels":4,"height_ft":68.4,"construction":"Type VA over Type IA podium","block_ft":[303,243],"floorplate_sqft":72070,"block_share_of_site":0.57,"courtyard":"pool and patio on the garage deck inside the ring","unit_mix":{"studio":22,"1br":125,"2br":43},"avg_unit_sf":{"studio":617,"1br":852,"2br":1187},"amenity_sf":{"club":3113,"fitness":1795,"lobby":1721,"leasing":3980,"commercial":3607},"parking":{"required":330,"garage":314,"garage_by_level":[148,166],"exterior":18,"provided":332,"ratio_per_unit":1.72,"ratios":{"studio_1br":1.5,"2br":2.5},"shared_parking_reduction":27,"garage_sf_per_stall":380},"setbacks_ft":{"front":15,"side":15,"rear":15},"landscape_surface_ratio":0.25,"open_space_pct":5,"access":"garage entries off the side private drive and the rear 22-ft joint ingress/egress easement; no curb cut on Cool Springs Blvd; leasing entrance at the street corner","fire":"Franklin Tower 2 autoturn on the perimeter drives; fire lane striping on the side and rear drives; standpipes","trash":"trash room inside garage level 1; private collection by mini roll-out dumpsters","grade":"site falls 22 ft from the street corner; the garage is tucked into the slope (692 and 703 ft), units start at 714 ft"}'::jsonb,
  array['one block to the setback lines, about 57% of the site; the rest is the L of drives, the landscape frontage and the perimeter buffers',
        'two garage levels in the middle of the block with units wrapping them where they face a drive or a street (liner units, leasing and the commercial at the corner); the garage is tucked into the grade',
        'four double-loaded bars (~65–70 ft) ring a courtyard on the garage deck; pool, patio, club and fitness sit in and beside the court at the street corner',
        'four residential levels over the garage to the height limit (Type VA over Type IA); 6 stories, 65 units per acre, 1.7 stalls per unit',
        'the garage is entered from the side drive and the rear easement, never from the arterial; eighteen visitor stalls outside, parallel to the drives',
        'the fire truck runs the perimeter drives; trash and loading are inside the building or off the rear drive'],
  'The organizing moves hold on any compact site of 2–5 acres where the parking regime is structured: block to the setbacks, drives round two sides, garage in the middle, ring on the deck.')
) as v(name, source, source_date, parcel_ogc_fid, product, pattern, program, principles, notes)
where not exists (select 1 from public.site_plan_exemplar e where e.name = v.name);

CREATE OR REPLACE FUNCTION public.fn_plan_pattern(p_ogc_fid integer, p_typology text DEFAULT 'multifamily'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_g geometry; v_lot numeric; v_acres numeric; v_ring geometry; v_a numeric; v_b numeric; v_aspect numeric;
  v_fr jsonb; v_landlocked boolean; v_frontage numeric; v_corner boolean;
  v_pu jsonb; v_uses jsonb; v_sf boolean; v_tf boolean; v_mf boolean; v_comm boolean; v_ind boolean; v_any_res boolean;
  v_zb text; v_rc jsonb; v_pk text; v_min_lot numeric; v_subdiv_floor numeric; v_stories numeric;
  v_pattern text; v_alternates text[] := '{}'; v_principles text[];
  v_gen text; v_aligned boolean; v_gen_note text; v_ex jsonb; v_cal jsonb;
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
  -- the stories the district allows: an object under the height plane, a number from the ordinance, else the height at 11-ft floors
  v_stories := coalesce(nullif(v_rc#>>'{max_height_stories,value}','')::numeric,
                        case when jsonb_typeof(v_rc->'max_height_stories') = 'number' then (v_rc->>'max_height_stories')::numeric end,
                        nullif(v_rc#>>'{height_max_ft,value}','')::numeric / 11.0);

  if not v_any_res and (v_comm or v_ind) then
    v_pattern := 'retail_full_plate'; v_alternates := array['retail_stacked_two_tenant'];
    v_principles := array[
      'fill the allowable area (FAR × lot) as a single plate on the frontage — the envelope is the design',
      'front the primary street: front setback, then the height plane; no side setback where the district allows',
      'parking per the district''s exemptions, on site or by shared access — never in front of the storefront',
      'a stacked two-tenant program (retail below, restaurant/bar + roof terrace above) reaches the same ceiling when the height plane allows two stories'];
    v_gen := 'none'; v_aligned := false;
    v_gen_note := 'no retail generator — the allowable area is stated on the commercial capacity card';
  elsif v_mf and v_pk = 'structured' and v_acres >= 1.75 and v_aspect <= 2.4 and least(v_a, v_b) >= 290 and coalesce(v_stories, 6) <= 8 then
    -- 2026-10-07: the Texas wrap (The Caroline, 101 Cool Springs Blvd). A
    -- compact site in the structured regime that can hold two bars and a
    -- court each way is organized as units round a garage, not a podium
    -- tower; the block goes to the setbacks and the drives round two sides.
    v_pattern := 'wrap_garage_courtyard'; v_alternates := array['podium_tower', 'court_scheme_perpendicular_bars'];
    v_principles := array[
      'one block to the setback lines (about 55–60% of the site); a 26-ft access drive down one side and across the rear — the fire lane and the way to the garage',
      'a 2- or 3-level garage in the middle of the block, units wrapping it on the street side at those levels (liner units, leasing and any retail on the primary frontage)',
      'four double-loaded bars about 67 ft deep ring a courtyard on the garage deck; pool and club in the court on the street side',
      'residential levels above the garage to the height limit (Type VA over a Type IA podium): 5–6 stories, 60–70 units per acre',
      'about 1.7 stalls per unit in the garage at roughly 370 sf per stall per level; a dozen visitor stalls outside along the drive; the garage is entered from the side drive, never the arterial',
      'trash inside the garage, collected by roll-out; loading off the rear drive'];
    v_gen := 'fn_generate_wrap_site_plan'; v_aligned := true;
    v_gen_note := 'wrap_v1 (2026-10-07) draws the block, the L of drives, the garage, the ring of bars and the court from the parcel; exemplar: The Caroline, Franklin TN (Kimley-Horn / 906 Studio, 2024)';
  elsif v_mf and v_pk = 'structured' then
    v_pattern := 'podium_tower'; v_alternates := array['wrap_garage_courtyard', 'bar_on_frontage_rear_field'];
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
    v_pattern := 'court_scheme_perpendicular_bars'; v_alternates := array['bar_on_frontage_rear_field', 'wrap_garage_courtyard'];
    v_principles := array[
      'bars perpendicular to the street framing courts that open to the frontage',
      'a spine drive from the primary frontage with double-loaded parking fields between the bars',
      'the courts are the amenity; parking never fronts the street',
      'stories stepped to the height plane at the street'];
    v_gen := 'seed_v2 / search core'; v_aligned := true;
    v_gen_note := 'default generate prefers search-core court/L prior (perpendicular_bars_court_to_street or L_scheme); aisle-first seed_v2 S is relaxation fallback only';
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
        'floodplain and wetlands held out as greenway before a lot is drawn; the amenity sits beside the greenway',
        'streets stop at the greenway unless through-access is read at both ends — a crossing is taken only for the land beyond it and priced as a culvert or a bridge; two streets that stop at the same greenway are closed by a loop',
        'double-loaded lots with rear alleys on every street: garages off the alley, fronts on the street',
        'a mid-block green every block, the same station on both faces of the street — paired courts on a rhythm, not scattered',
        'lot width and depth from the district minimums — every lot must carry a buildable depth after setbacks'];
    else
      v_pattern := 'subdivision_row_spine'; v_alternates := array['townhome_rows_on_spine', 'subdivision_street_grid'];
      v_principles := array[
        'public right-of-way spine along the long axis (55-ft ROW) — the street network comes first',
        'floodplain and wetlands held out as greenway before a lot is drawn; the amenity sits beside the greenway',
        'the spine stops at the greenway unless through-access is read at both ends — a crossing is taken only for the land beyond it and priced as a culvert or a bridge; with no street read, the plan enters from the end that costs the least crossing',
        'double-loaded lots with rear alleys: garages off the alley, fronts on the street',
        'a mid-block green every block, the same station on both faces of the street — paired courts on a rhythm, not scattered',
        'a through-connection or a cul-de-sac where the spine would dead-end beyond 750 ft; a dead-end over 750 ft names the neighbour that could give the second connection',
        'lot width and depth from the district minimums — every lot must carry a buildable depth after setbacks'];
    end if;
    v_gen := 'fn_generate_subdivision'; v_aligned := true;
    v_gen_note := 'the subdivision generator (v1.2) draws this organization from the parcel''s own shape: FEMA floodplain and NWI wetlands held out from real geometry, streets that stop at the greenway unless through-access is read (a crossing only for the land beyond it, priced as a culvert or a bridge), through-streets on the long axis (as many as the width allows), cross connectors ≤ 600-ft blocks, rear alleys, whole lots only, paired courts every 600 ft, amenity beside the greenway on request, cul-de-sac or loop where a street stops';
    v_cal := public.fn_subdivision_calibration(p_ogc_fid, v_zb, v_acres);
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
      'zoning_base', v_zb, 'parking_strategy', v_pk, 'stories_allowed', v_stories, 'uses_as_of_right', v_uses,
      'min_lot_area_sqft', v_min_lot, 'subdivision_floor_sqft', round(v_subdiv_floor)),
    'exemplars', v_ex,
    'calibration', v_cal,
    'generator_alignment', jsonb_build_object('generator', v_gen, 'aligned', v_aligned, 'note', v_gen_note));
end
$function$;
