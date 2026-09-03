-- Plan-organization layer (Eric, 2026-09-03): "We need to know the best way
-- to organize a plan, not fit what's buildable as a box in the corner of the
-- lot." The context engine carried a parti vocabulary for multifamily bars
-- (fn_massing_program) and nothing for subdivisions, retail or podium
-- schemes — and no exemplars behind any of it. This migration adds:
--   1. site_plan_exemplar — a library of real plans with their organizing
--      principles, seeded with the four architect sheets Eric supplied
--      (MDHA 102-lot / 69-lot subdivisions; 2405 12th Ave single-tenant /
--      two-tenant retail). RLS on, read policy for anon + authenticated
--      (every lock ships with its read policy).
--   2. fn_plan_pattern(p_ogc_fid, p_typology) — resolves HOW a parcel should
--      be organized from its product, size, shape, frontage and parking
--      regime: the pattern, its principles, the exemplars that show it, and
--      an HONEST generator-alignment verdict (does our generator draw this
--      pattern today, or not yet — and why).

create table if not exists public.site_plan_exemplar (
  id serial primary key,
  name text not null,
  source text not null,
  source_date date,
  parcel_ogc_fid integer,
  product text not null,
  pattern text not null,
  program jsonb not null default '{}'::jsonb,
  principles text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.site_plan_exemplar enable row level security;
drop policy if exists site_plan_exemplar_read on public.site_plan_exemplar;
create policy site_plan_exemplar_read on public.site_plan_exemplar
  for select to anon, authenticated using (true);
grant select on public.site_plan_exemplar to anon, authenticated;

insert into public.site_plan_exemplar (name, source, source_date, parcel_ogc_fid, product, pattern, program, principles, notes)
select * from (values
 ('MDHA concept 08/21 — 102 lots',
  'MDHA_Property_Concept_08212026.pdf (civil concept sheet)', date '2026-08-21', 550510,
  'townhome_subdivision', 'subdivision_row_spine',
  '{"lots":102,"row_width_ft":55,"lot_width_ft_approx":25,"amenity":false,"greenway":true,"courtyards":4}'::jsonb,
  array['55-ft public right-of-way spine along the long axis of the parcel',
        'double-loaded lots served by private rear alleys — garages off the alley, fronts on the street',
        'courtyards interrupt the lot rows every 8–12 lots',
        'greenway along the railroad edge; floodplain and potential wetlands held out of the lot pattern',
        'connectivity stub toward the adjoining campus (Ed Temple Blvd)'],
  'Highest-yield scheme of the pair; presumes SP-style lot widths (~25 ft), not R6 6,000-sqft lots.'),
 ('MDHA concept 08/30 — 69 lots + amenity',
  'MDHA_Property_Concept_08302026.pdf (civil concept sheet)', date '2026-08-30', 550510,
  'townhome_subdivision', 'subdivision_row_spine',
  '{"lots":69,"row_width_ft":55,"amenity":true,"private_road":true,"greenway":true,"courtyards":3}'::jsonb,
  array['same 55-ft public ROW spine with a private road loop and cul-de-sac at the head',
        'amenity building at the head of the site',
        'fewer, larger lots; more courtyard frontage',
        'floodplain and wetlands held out; greenway retained'],
  'Lower-density alternative traded for amenity and open space.'),
 ('2405 12th Ave S — single-tenant retail',
  '2405_12th_Ave__Single_Tenant_Massing.pdf (The Bradley Projects, 06/04/25)', date '2025-06-04', 408571,
  'retail', 'retail_full_plate',
  '{"gsf":5170,"stories":1,"far":0.6,"site_sqft":8619,"allowable_sqft":5171}'::jsonb,
  array['one-story full plate at the FAR ceiling (5,170 of 5,171 SF allowable)',
        'front setback 15 ft then a 1.5H:1V height plane; no side setback; rear 20 ft',
        'height 30 ft at the setback lines (UZO envelope format)',
        'parking per UZO exemptions: first 2,000 SF of retail exempt, then 1/200'],
  'FAR × lot is the optimum; the plate fills the envelope.'),
 ('2405 12th Ave S — two-tenant stacked',
  '2405_12th_Ave__Two_Tenant_Massing.pdf (The Bradley Projects, 06/04/25)', date '2025-06-04', 408571,
  'retail', 'retail_stacked_two_tenant',
  '{"gsf":5171,"stories":2,"ground_retail_sqft":3508,"upper_restaurant_sqft":1663,"roof_terrace_sqft":1506,"on_site_stalls":5}'::jsonb,
  array['ground-floor retail plate (3,508 SF) with the restaurant/bar stacked above (1,663 SF) and a roof terrace (1,506 SF)',
        'elevator + two egress stairs; vertical circulation at the rear',
        'five on-site stalls plus a shared access easement',
        'the same FAR ceiling as the single-tenant scheme, reorganized vertically for two tenancies'],
  'Same optimum, different organization: a stacked two-tenant program.')
) as v(name, source, source_date, parcel_ogc_fid, product, pattern, program, principles, notes)
where not exists (select 1 from public.site_plan_exemplar e where e.name = v.name);

create or replace function public.fn_plan_pattern(p_ogc_fid integer, p_typology text default 'multifamily')
returns jsonb
language plpgsql
stable
as $function$
declare
  v_g geometry; v_lot numeric; v_acres numeric; v_ring geometry; v_a numeric; v_b numeric; v_aspect numeric;
  v_fr jsonb; v_landlocked boolean; v_frontage numeric; v_corner boolean;
  v_pu jsonb; v_uses jsonb; v_sf boolean; v_tf boolean; v_mf boolean; v_comm boolean; v_ind boolean; v_any_res boolean;
  v_zb text; v_rc jsonb; v_pk text;
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
  elsif (v_sf or v_tf) and v_acres >= 3 then
    v_pattern := 'subdivision_row_spine'; v_alternates := array['townhome_rows_on_spine'];
    v_principles := array[
      'public right-of-way spine along the long axis (55-ft ROW) — the street network comes first',
      'double-loaded lots with rear alleys: garages off the alley, fronts on the street',
      'courtyards or greens interrupting the rows; amenity at the head of the site',
      'hold floodplain, wetlands and greenway out of the lot pattern',
      'lot width and depth from the district minimums — every lot must carry a buildable depth after setbacks'];
    v_gen := 'fn_generate_sf_site_plan'; v_aligned := false;
    v_gen_note := 'the lot generator slices strips across the parcel with no street network (2400 W Heiman: 80 strips, negative buildable depth on all 80); subdivision generator pending';
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
      'lot_acres', round(v_acres, 2), 'obb_aspect', round(v_aspect, 2),
      'landlocked', v_landlocked, 'frontage_ft', v_frontage, 'corner_lot', v_corner,
      'zoning_base', v_zb, 'parking_strategy', v_pk, 'uses_as_of_right', v_uses),
    'exemplars', v_ex,
    'generator_alignment', jsonb_build_object('generator', v_gen, 'aligned', v_aligned, 'note', v_gen_note));
end
$function$;

grant execute on function public.fn_plan_pattern(integer, text) to anon, authenticated;
