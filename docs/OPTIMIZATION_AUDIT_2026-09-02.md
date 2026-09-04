# Are we truly optimizing? — audit of 2026-09-02

**Ask (Eric):** "Run a full audit, check 10 different parcels and make sure that
we're truly optimizing. For example, here are two different site plans for a
parcel." — with two architect concept sheets for an MDHA property
(`MDHA_Property_Concept_08212026.pdf`, `MDHA_Property_Concept_08302026.pdf`).

**Method.** "Optimizing" was tested at three layers, because a plan can capture
100% of a ceiling that is itself wrong:

1. **Is the ceiling right?** For each parcel, an independent legal ceiling was
   derived from the compiled ordinance caps (height, FAR, density, ISR) with
   parking *not* consuming ground — the way an architect on an urban lot
   builds — and compared with `fn_max_buildout.max_gsf`, which the product
   calls the "theoretical upper bound".
2. **Does the plan capture it?** Default seed generator and the deep search
   core, both live.
3. **Is the product right?** On the MDHA parcel, the architect chose a
   townhome-lot subdivision, not a multifamily bar — so our lot fit was the
   thing to compare.

Sample: the MDHA parcel plus nine deterministic draws stratified by size from
the buildable RM|OR|MU stratum (salt `:audit-2026-08-04`).

---

## 1. The MDHA parcel — our tool vs the architect

**2400 W Heiman St, ogc_fid 550510 — R6, 13.15 ac (572,831 sqft measured, an
exact match to the sheet's "13.15 Ac").** Long strip along the Tennessee
Central Railroad ROW beside TSU.

| | Architect 08/21 | Architect 08/30 | Our tool (as-of-right) |
|---|---|---|---|
| Product | 102 townhome lots on a 55' public ROW spine, private alleys, courtyards, greenway | 69 lots + amenity building, private road, more courtyards | Single-family lot fit (R6 permits SF only as-of-right; MF/2F compile `generation_allowed=false` — correct) |
| Lots | 102 (~25' × 100', SP-style) | 69 | **80** @ 6,000 sqft target (local comps p75, "high" confidence) |
| Streets | Yes — spine + alleys | Yes | **None** |
| Floodplain / wetlands | Avoided (SW end held out) | Avoided | **Ignored** |

The lot count looks competitive. The geometry is not a plan. Measured from the
payload (`qa/audits/2026-09-02/mdha_2400_w_heiman_lotfit_payload.json`,
rendered in `mdha_2400_w_heiman_our_lotfit.png`):

- every "lot" is a full-width strip across the parcel: **median 330 ft long ×
  21 ft deep** (all 80 within 254–330 × 21). A 6,000-sqft lot at 21 ft deep.
- with the district's 20-ft front + 20-ft rear setbacks, buildable depth is
  **−19 ft on 80 of 80 lots**; the generated "footprints" are 47 × 11 ft
  (459 sqft) slivers.
- `fn_generate_sf_site_plan` (4.8 KB) slices the envelope's bounding box into
  equal-area strips along one axis. It has no concept of a street, a block, a
  lot width, or a lot depth (source contains none of `street`, `row`,
  `alley`, `depth`, `min_lot_width`). At a 2,500-sqft target it returns
  **0 lots**; at 3,000 it returns 160 strips.
- the sheet's floodplain is real in our data and ignored: `fema_flood_zone_raw`
  for the parcel is 78% X, 6% X-0.2%, **15% AE (100-year)**, but the
  parcel-level field says `X` (majority) and `context.physical.flood` reads
  `zone X · dev_impact none`. 129 parcels in the MF universe carry ≥10% AE
  behind an `X` label. No floodplain geometry layer exists in the database
  (only per-parcel percentages), so nothing can carve it yet.
- the architect's 102 lots presume an SP rezoning (~2,500-sqft townhome lots
  on R6 land). Our tool models as-of-right only. That is a product decision,
  not a bug — but "80 lots" on this parcel is a number, not a plan, and the
  developer's real optimum (69–102 lots with streets) is not reachable from
  what we draw.

**Verdict on the headline parcel:** not optimizing. The as-of-right product
choice is right; the lot generator cannot produce a subdivision; the
floodplain is invisible; the SP scenario is out of scope.

---

## 2. Nine multifamily parcels — is the ceiling right?

Columns: frontier = `fn_max_buildout.max_gsf` (published "theoretical upper
bound"); podium ceiling = the same height/FAR/density/ISR caps with no parking
land consumed (now published by the engine as
`structured_parking_ceiling`, advisory); seed = default generator; deep =
`_search`. Captures are against the *frontier*.

### Before this audit's fixes

| Parcel | Zoning | Acres | Caps on file | Frontier GSF (st) | Podium ceiling | Frontier ÷ ceiling | Seed capture | Deep capture |
|---|---|---|---|---|---|---|---|---|
| 412137 · 1917 Broadway | MUI-A | 0.23 | **none** (3-st default) | 7,750 (3) | 18,421* | 42% | 66.8% (legacy) | 66.8% |
| 662842 · 106 28th Ave S | MUG-A | 0.30 | **none** | 10,850 (3) | 23,204* | 47% | 69.7% (legacy) | 69.7% |
| 410587 · 542 Moore Ave | RM20-A-NS | 0.33 | **none** | 10,850 (3) | 25,817* | 42% | 63.9% (legacy) | 63.9% |
| 407431 · 55 Music Sq E | ORI | 0.69 | 65 ft · FAR 3 · ISR .9 | 34,100 (5) | 89,733 | **38%** | 100.0% | 38.0% |
| 624220 · 2600 Gallatin Pk | MUL-A | 0.97 | **none** | 41,850 (3) | 76,171* | 55% | 81.7% | 59.3% |
| 595520 · 2144 Fairfax | RM40 | 1.05 | 45 ft · 40 du/ac | 46,500 (4) | 65,389 | 71% | 86.7% | 86.7% |
| 411756 · 755 E Argyle | ORI | 2.09 | 65 ft · FAR 3 | 117,800 (5) | 273,633 | **43%** | 99.7% | 65.4% |
| 681234 · 0 Walton Ln | RM20 | 4.05 | 30 ft · 20 du/ac | 125,550 (2) | 125,569 | 100% | 88.1% (4 structures) | 21.3% |
| 661528 · 526 Northcrest | RM9 | 11.69 | 20 ft · 9 du/ac | 162,750 (1) | 163,091 | 100% | 102.9% | 61.2% |

\* ceiling computed at the *defaulted* 3 stories — the true district ceiling
was higher still (see after).

Three findings fall straight out of the table:

**F1 — On density-bound suburban districts the frontier is the legal max
(RM20, RM9: 100%).** There, "99% capture" means what it says.

**F2 — On intensive districts the frontier is a *surface-parking* ceiling,
not the legal one.** `fn_max_buildout` charges every stall 420 sqft of ground
(`stall_land_sf`), never models a podium, and never reads
`parking_strategy` — while the design context for the same ORI parcel says
`parking_strategy: "structured"`. Result: 55 Music Sq E is told 34,100 GSF is
its upper bound and that the seed captured 100% of it; the FAR-3 ceiling a
podium-parked building reaches is 89,733. Universe sample (60 buildable
draws): RM median 98.6% of ceiling, OR 98.7% (one below 60%), MU 85.7% with
2 of 5 below 60%.

**F3 — 19.1% of the multifamily universe compiled with no caps at all.** The
"-A" alternative districts (MUL-A 1,673 parcels, RM20-A 1,186, RM20-A-NS 981,
MUG-A 719, MUI-A 650, ORI-A 593, MUN-A 234, MUL-A-NS 234, RM15-A 173, RM40-A
137, OR20-A 131 — 7,254 parcels) have only `attached`/`sf_two_family` rows in
`jurisdiction_zoning_standards`; the multifamily/mixed bulk rows are absent,
so the compiler carried NULL height/FAR/density and the frontier silently
assumed 33 ft (3 stories). 1917 Broadway (MUI-A: 105 ft, FAR 5) was capped at
7,750 GSF.

Plan-layer findings, for completeness: the deep search core underperforms the
seed on 7 of 9 parcels (21–69% vs 82–103%); the seed emitted **4 structures**
on the 4-acre RM20 parcel; 55 Music Sq E placed 15 stalls against 35
required; the same under-parking and spine-under-bar patterns as the 07-28
and 08-04 sweeps persist.

### After this audit's fixes (live)

| Parcel | Caps now | Frontier GSF (st) | Podium ceiling | Frontier ÷ ceiling | Seed capture |
|---|---|---|---|---|---|
| 412137 · MUI-A | 105 ft · FAR 5 · ISR 1.0 (ordinance, via base MUI) | 10,850 (8) | 51,170 (FAR) | 21% | 61.9% (legacy, 7 st) |
| 662842 · MUG-A | 75 ft · FAR 3 · ISR .9 | 12,400 (5) | 38,673 (FAR) | 32% | 99.8% (legacy, 6 st) |
| 410587 · RM20-A-NS | 30 ft · FAR .8 · **20 du/ac** | 9,300 (2) | 10,207 | 91% | 66.7% (legacy) |
| 624220 · MUL-A | 45 ft · FAR 1.0 · ISR .9 | 41,850 (3, FAR-bound) | 42,317 | 99% | 81.7% |
| 407431 · ORI | unchanged | 34,100 (5) | 89,733 (FAR) | 38% | 100.0% |
| 411756 · ORI | unchanged | 117,800 (5) | 273,633 (FAR) | 43% | 99.7% |
| 553450 · RM40 (floor parcel) | unchanged | **125,550** (identical) | 171,530 | 73% | 99.2% |
| 488278 · RM20 (floor parcel) | unchanged | **54,250** (identical) | 54,623 | 99% | 99.9% |

Reading it honestly: the data fix makes every district resolve real caps
(RM20-A-NS *dropped* from 10,850 to 9,300 because a real 20 du/ac cap now
binds — that is the correct direction). What remains is F2 alone: on ORI /
MUG-A / MUI-A the surface-parking frontier sits at 21–43% of the legal
ceiling, and the plans dutifully capture ~100% of the wrong number.

---

## 3. What shipped in this audit

| # | Change | Where | Effect |
|---|---|---|---|
| 1 | `fn_ordinance_standards` resolves "-A" alternative districts to the base district's bulk standards (exact row still wins; "-NS" was already stripped). Per Metro 17.12 the "-A" suffix adds design standards, not bulk. | `supabase/migrations/20260804063000_ordinance_standards_alternative_district_fallback.sql` (live) | 7,254 parcels (19.1% of the MF universe) stop compiling with NULL height/FAR/density. Cached snapshots for the four audit parcels expired; other -A parcels had no live snapshot. |
| 2 | `fn_max_buildout` publishes `structured_parking_ceiling {gsf, stories, binding, basis}` (advisory), `frontier_basis = 'surface_parking'`, and `assumptions.height_source` — additive; `max_buildout_v4` fields untouched. | `supabase/migrations/20260804060000_max_buildout_structured_ceiling_advisory.sql` (live) | The engine now states what its ceiling assumes and what the podium ceiling is. Floor parcels byte-identical. |
| 3 | Headline chips: amber "surface-parking bound · podium ceiling N GSF (binding) · structured parking not yet modeled" when the advisory ceiling exceeds the bound by >15%; red "height cap missing — 3-story default applied". | `MaxBuildoutHeadline.tsx`, `maxBuildout.ts` (+4 tests) | A developer on an ORI lot is no longer told "100% capture" of a number 2.6× too low without being told why. |

Gates: 418 unit tests, 5-parcel fixture battery green, db-battery floors
unchanged by construction (verified live).

---

## 4. What the engine lane owns next (ranked by yield)

1. **A structured-parking frontier option** in `fn_max_buildout` — model
   podium/tuck-under (`typology_spec.structured_parking_threshold_far`,
   `podium_levels` already exist in the schema, unused by the frontier) and
   publish the *legal* ceiling as the headline where
   `parking_strategy = 'structured'`. This single change moves every urban
   parcel's "upper bound" by 2–2.6×, and the seed/search cores then have a
   real target. Until then the product under-promises on exactly the lots a
   Nashville developer cares most about.
2. **A real subdivision generator** for lot fit: street spine (ROW width from
   `typology_spec.road_row_width_ft`), double-loaded blocks, lot width/depth
   from `min_lot_width_ft` / `target_lot_depth_ft`, setback-aware buildable
   depth (reject lots with ≤0 buildable depth), and a 2,500-sqft target that
   does not return zero. The 80-strip output on 2400 W Heiman is the
   acceptance case; the architect's 102/69 with streets is the bar.
3. **Floodplain from the data we already have:** consume the `fema_flood_zone_raw`
   fractions in `context.physical.flood` (A/AE/AH/AO/VE share) and discount
   usable land by that share until a FEMA NFHL geometry layer is loaded (none
   exists in the database today). 129 universe parcels hide ≥10% AE behind an
   `X` label; the MDHA parcel is one.
4. **SP / rezoning scenario** as a first-class product mode (the architect's
   frame on MDHA land): out of scope for as-of-right, but it is the number
   the client's counterpart is holding.
5. Seed core carry-overs from the 07-28 / 08-04 sweeps: footprint deficits on
   1-story impervious-bound lots, parking placement short of honest
   requirements, spine centerline under the bar, multi-structure seeds
   (681234: 4 structures on RM20).

---

## 5. Retail benchmark — 2405 12th Ave S vs two architect massings

Eric's second pair of sheets (The Bradley Projects, `2405_12th_Ave__Single_Tenant_Massing.pdf`, `…Two_Tenant_Massing.pdf`) is a **retail** product on a 12South commercial lot:

| Sheet | Program | Parking |
|---|---|---|
| Zoning summary (both) | CS · UZO overlay · site 8,619 SF · **FAR 0.60 → allowable 5,171 SF** · ISR 0.90 · front 15 ft then 1.5H:1V plane · side none · rear 20 ft · height 30 ft at setback lines | UZO: retail first 2,000 SF exempt then 1/200; restaurant first 1,000 exempt then 1/150 → ~12 spaces at full build |
| Single-tenant | one-story 5,170 SF retail building — 100% of the allowable | on/off-site per UZO |
| Two-tenant | 3,508 SF retail ground + 1,663 SF restaurant/bar 2nd floor + 1,506 SF roof terrace = 5,171 SF, elevator, egress | 5 spaces on site + shared access easement |

Both schemes are the same optimum — **FAR × lot** — in two configurations. Our data agrees on the ceiling to within a rounding error: ogc_fid 408571, CS, 8,622 sqft measured, `entitlement_capacity.max_gfa_sqft = 5,173` (FAR 0.60, height 30 ft, ISR 0.90, front/rear 20 ft — the ordinance row `17.12.020C`; the sheet's 15-ft front is the UZO variant).

What the product did with that before this audit:

1. **Called the lot industrial-only.** Regrid's per-polygon `permitted_land_uses_as_of_right` for this CS polygon reads `industrial_uses_permitted` (sibling CS polygons carry the commercial token), and `fn_resolve_permitted_uses` trusted it. Across the county, **20,115 parcels** in districts whose ordinance rows permit commercial (CS 5,316; MUL 1,839; CL 1,273; ORI 1,128; MUL-A 1,673; MUG-A 719; MUI-A 650; …) were flagged non-commercial.
2. **Defaulted the planner to a use it cannot compile** ('industrial' → "unknown typology") → the enterprise gate blanked the canvas.
3. **Suggested a house** (the MF refusal card's SF switch) on a lot where no residential use is permitted as-of-right.
4. Has **no retail massing engine** at all (`typology_spec` = single_family, multifamily).

Shipped: `fn_resolve_permitted_uses` derives commercial permission from the ordinance's `mixed_nonres` row when the Regrid flag lacks it (basis published: `ordinance_mixed_nonres_row:CS`); `pickDefaultUse` never returns a non-compilable use; a commercial-only lot renders the **CommercialCapacityCard** — "Commercial lot · CS — retail / office permitted as-of-right; no residential use is. Allowable floor area 5,173 SF (FAR 0.6 × 8,622 SF lot) · height 30 ft · impervious 90% …" — and never a house switch; battery mode `commercial-capacity` pins it. The retail massing engine itself (full-plate vs stacked two-tenant, UZO parking exemptions) is a new product for the engine lane; the ceiling it must hit is already on the card.

## 6. The plan-organization layer — "not a box in the corner of the lot"

Eric (2026-09-03): "I thought we had plans that helped drive context for the
best way to site plan. We need to know the best way to organize a plan, not
fit what's buildable as a box in the corner of the lot."

**What existed.** The context engine's plan knowledge was (a) precedent
*statistics* from Regrid footprints (median/p75 footprint, stories, length,
coverage, buildings per site) and (b) a parti vocabulary inside
`fn_massing_program` for multifamily bars only (`street_bar_parking_behind`,
`L_scheme_bar_on_frontage_wing_deep`, `perpendicular_bars_court_to_street`)
plus the seed's composition/strategy notes. No exemplar plans, nothing for
subdivisions, retail or podium schemes, and no place where the product says
*how this site should be organized*.

**What shipped (2026-09-03).**

- `site_plan_exemplar` — a library of real plans with structured organizing
  principles, seeded with the four architect sheets (MDHA 102-lot ROW-spine
  subdivision; MDHA 69 + amenity; 2405 12th Ave single-tenant full plate;
  two-tenant stacked). RLS on, read policy shipped with it.
- `fn_plan_pattern(p_ogc_fid, p_typology)` — resolves the pattern for a
  parcel from product, lot size, shape (OBB aspect), frontage/landlocked and
  parking regime: `subdivision_row_spine`, `house_on_lot`,
  `bar_on_frontage_rear_field`, `court_scheme_perpendicular_bars`,
  `podium_tower`, `landlocked_axis_bar`, `retail_full_plate` /
  `retail_stacked_two_tenant`; returns principles, the matching exemplars,
  the selection basis, and an **honest generator-alignment verdict**.
- Client: the "How to organize this site" panel at the top of the Design
  Context column (pattern, principles, precedent plans, green "generator
  follows this" / amber "generator: not yet" + why); evidence fields; the
  battery gates the pattern on all seven parcels.

| Parcel | Pattern | Generator |
|---|---|---|
| 2400 W Heiman (MDHA, R6, 13.15 ac) | ROW-spine subdivision with rear alleys — precedent: MDHA 08/21, 08/30 | **follows** (2026-09-03, §9) — `fn_generate_subdivision` draws the spine, alleys, lots, courts |
| 2405 12th Ave S (CS) | Retail full plate (alt: stacked two-tenant) — precedent: Bradley single/two-tenant | **not yet** — no retail generator |
| 55 Music Sq E · 1917 Broadway (ORI · MUI-A) | Podium parking, liner units, tower above | **not yet** — surface frontier |
| 2600 W Heiman · 2622 W Heiman (RM40, ≥2.2 aspect / ≥3 ac) | Perpendicular bars framing courts | **not yet** — seed draws one S-form bar; courts live in the search core |
| 1200 W H Davis (landlocked) | Axis bar, easement access | follows |
| 1710 Meharry (RM20, 1.76 ac) | Bar on the frontage, field behind | follows |
| 303 E Palestine (RS10) | One house on the lot | follows |

**What it does not do yet:** the multifamily and retail generators do not
*consume* the pattern. The subdivision generator now does (§9). The
engine-lane build in priority order: (1) a structured-parking frontier and a
podium composition for `podium_tower` parcels, (2) the court parti in the
seed, (3) retail massing, (4) the floodplain carve (a geometry layer — the
generator can only flag the parcel-level FEMA fraction today). Until then the
layer is a promise the product states out loud, with the precedent that
proves it, instead of a box in the corner.

## 7. Our MDHA render vs the civil's concepts — how to be better

Side-by-side in `qa/audits/2026-09-02/mdha_compare.png` (our app screen vs
the 08/21 and 08/30 sheets).

**Layout.** Theirs is organized by movement first: a 55-ft public ROW down
the long axis, lots hung off it in double-loaded rows, private alleys
taking the garages, courtyards breaking the rows, the greenway on the
railroad edge, the floodplain and wetlands simply not built on, a
connectivity stub to the campus. Ours is organized by arithmetic: slice the
envelope into 6,000-sqft strips and count them. The strips have no street
to front, no alley to park from, 21 ft of depth against 40 ft of setbacks,
and they cover the floodplain. Their 102 or 69 lots are buildable; our 80
are not.

**UX / UI.** What the screen said before this work: "80 lots · lot target
6,000 SF" with nothing to tell a developer that none of them stand up —
the failure mode Eric named, capacity dressed as a plan. What it says now:
the pattern panel names the ROW-spine subdivision, lists the principles,
cites the two civil concepts as precedent, and admits the generator does
not draw it yet. Still to fix on the screen itself: (a) the lot-fit napkin
must read like a subdivision — lots · ROW length · land in streets ·
buildable depth per lot — and refuse to count lots with no buildable
depth; (b) the canvas legend has no vocabulary for ROW, alley, courtyard,
greenway or floodplain, so even a correct plan could not be drawn honestly
in it; (c) the floodplain (15% AE on this parcel) should render as a held-out
layer before any lot is placed; (d) the use selector briefly shows "Two
Family" on an SF-only lot while the compile settles — a permitted-use list
should never display a use the parcel does not have; (e) the H&B strip's
"Single Family · lot fit" pill reads as solved; it should read as the
pattern ("ROW-spine subdivision · not yet drawn") until the generator
follows the pattern.

## 8. One-line answer

On suburban density-bound land the tool optimizes truthfully (frontier = legal
max, seed ≥95% on most). On urban intensive land it optimizes against the
wrong ceiling — a surface-parking bound at 21–43% of the legal one — and on
subdivision land it produced lot counts without producing lots until §9. The
data gap that made a fifth of the universe compile with no caps is closed;
the frontier now confesses its parking assumption and publishes the podium
ceiling; the subdivision generator draws the neighbourhood; the multifamily
court/podium problems are named with their acceptance cases.

## 9. The subdivision generator — the civil's organization on any parcel (2026-09-03)

Eric: "The design you came up with is nothing like what our civil designed …
Those [two MDHA sheets] should be used as an example of how to design a
neighborhood across any parcel of size, not just this one."

**What shipped.** `fn_generate_subdivision(p_ogc_fid, …)` reads the two
sheets as *principles* and derives the network from the parcel's own shape,
in the parcel's oriented frame (x along the long axis, y across):

1. **Streets first.** Through-streets on the long axis at a pitch of
   ROW + two lot depths + alley (blocks back to back). How many fit across
   the short axis, at what lot depth, is solved from the width with lots as
   the objective (faces × frontage ÷ the width the district minimum needs at
   that depth; a shallower lot must beat a deeper one by 8%). A 250-ft strip
   gets one spine at 75-ft lots; a 900-ft tract gets two streets of 100×150
   lots rather than three of 145×105.
2. **Cross connectors** every ≤ 600 ft when there are two or more
   through-streets (ladder / grid) — no block longer than the max.
3. **Double-loaded lots, rear alleys** behind every row; alleys at the outer
   edges too when the width allows (front-loaded outer rows are flagged).
4. **Courts** every 12 lots, both faces of a street at the same station.
5. **Amenity at the head** of the site when the scheme asks for it
   (the 08/30 trade).
6. **Access** from the unshared boundary at an end of the long axis, with a
   street test — a parcel across the edge within a ROW-width gap (15–90 ft)
   is a street; a 104-ft gap is the CSX corridor, not a frontage. A dead-end
   spine over 750 ft gets a cul-de-sac bulb; a side-only frontage gets an
   entrance connector; nothing read → through-access assumed and flagged,
   with the neighbours across each end named (the 08/21 sheet's stub to the
   campus).
7. **Whole lots only**, or an irregular lot whose front edge is complete and
   which still holds ≥ 60% of nominal and the district minimum. Every lot
   carries a buildable depth after front/rear setbacks. No two ROW pieces
   overlap (the client's geometry gate would reject them).

Floodplain is flagged from the parcel-level FEMA fraction, not carved — the
one thing the sheets do that the tool cannot yet, for want of a geometry
layer. The plan-pattern layer now says **generator follows this** for both
subdivision patterns (`subdivision_row_spine` under 550 ft of short axis,
`subdivision_street_grid` above), and the client draws the result — ROW,
alleys, lots, courts, amenity, reserves — with a "Neighbourhood plan" panel
and a scheme switch (district lots / SP townhomes 25 ft / SP + amenity 10%).

**MDHA, 2400 W Heiman (R6, 13.15 ac, 2,381 × 250 ft)** —
`qa/audits/2026-09-02/mdha_subdivision_screen.png`:

| Scheme | Lots | Courts | Amenity | ROW / alleys / lots / residual | Gross du/ac |
|---|---|---|---|---|---|
| District lots (R6 6,000 sf → 80×75) | 52 | 4 | — | 22.3% / 15.5% / 56.3% / 1.6% | 3.95 |
| SP townhomes 25×75 | 163 | 12 | — | 22.3% / 15.6% / 54.9% / 0.7% | 12.4 |
| SP 25 ft + amenity 10% (37,300 sf at the head) | 148 | 12 | 37,317 sf | 22.3% / 14.6% / 50.1% / 0.1% | 11.25 |

Against the civil's 102 (08/21) and 69 + amenity (08/30): the same
organization — one 55-ft spine on the long axis, double-loaded rows, 20-ft
rear alleys, courts every 12 — and higher counts because the 15% AE
floodplain and the railroad greenway are not yet carved; that is exactly the
gap the flags name. Buildable depth is 35 ft on every lot (75 − 20 − 20); the
old strip generator's 80 "lots" had −19 ft.

**Ten other single-family parcels, 2–50 ac, default scheme (same day):**

| Parcel | Zoning · ac · OBB ft | Network | Lots | Lot ft | ROW / lots / residual | Notes |
|---|---|---|---|---|---|---|
| 4678 Lickton Pike 667934 | R15 · 49.8 · 2925×902 | ladder, 2 through + 4 cross | 87 (8 irregular) | 100×150 | 15.9% / 67.7% / 8.5% | access from the start end (street read) |
| 219 Stewarts Ferry Pike 602825 | R10 · 17.0 · 1323×724 | ladder, 2 + 2 | 36 (10 irregular) | 85×120 | 23.5% / 51.3% / 22.4% | irregular outline (fill 0.77) |
| 2018 Old Murfreesboro Pike 662275 | R10 · 11.3 · 1214×628 | ladder + entrance connector | 21 | 95×110 | 28.6% / 45.5% / 20.8% | street on a long side only |
| 1404 Pleasant Hill Rd 605697 | R15 · 4.65 · 707×346 | spine | 9 | 120×125 | 16.0% / 66.6% / 7.4% | |
| 0 Skyline Ridge Dr 674582 | RS10 · 4.47 · 510×390 | spine | 10 | 85×120 | 14.2% / 64.2% / 13.1% | access assumed both ends |
| 300 Rural Hill Ct 698955 | R10 · 2.39 · 527×249 | spine | 5 | 135×75 | 23.8% / 49.2% / 17.5% | depth cut to 75 to fit 249 ft |
| 8346 Highway 70 662383 | R40 · 5.44 · 945×276 | single-loaded edge street | 5 | 185×220 | 12.9% / 86.4% / 0.7% | pattern says house_on_lot (under the 6-lot floor) |
| 1293 Currey Rd 633045 | RS10 · 2.94 · ~1273×100 | — | 0 | — | — | refused: too narrow for a street and a lot |
| 4999 Clarksville Hwy 406234 | RS15 · 2.22 · 396×275 | spine | 2 | 170×90 | 22% / 31% / 41% | under the floor → house_on_lot |
| Parcel 681127 | R15 · 3.34 · 599×347 | spine | 2 | 120×125 | 20.5% / 20.3% / 57.6% | irregular outline: the honest answer is 2 lots + 58% unassigned |

What the sweep says: the network choice tracks width (spine under ~550 ft,
ladder/grid above), the lot objective keeps district-proportioned lots,
the ROW share sits at 14–24% on regular parcels, and the weak results are
the irregular outlines, where whole/irregular-lot rules leave 20–58% of land
unassigned — the next lever is an outline-following lot fit at the block
ends, not a different network.

**UX / UI, what changed on the screen.** The canvas draws the ROW as
pavement, alleys lighter, lots as lot lines, courts and reserves green, the
amenity a stronger green; the "Neighbourhood plan" panel states lots,
network, lot dimensions, buildable depth, land split, access, density and
every flag in plain words; the plan-basis line is the generator's own
sentence. Still open from §7: the legend has no ROW/alley/court vocabulary,
and the floodplain is a flag, not a held-out layer. (Both closed in §10.)

## 10. Hazards held out, open space with intent — generator v1.1 (2026-09-03)

Eric, on the v1 render: "This isn't a good site plan. You just cut a road
straight through the middle, and colored random squares as 'amenities'. You
didn't take into account wetlands, flood plains, etc."

Two of the three are fair and are fixed here; the third is the site. A
250-ft-wide strip has exactly one organization — the civil drew the same
spine — but the v1 courts were placed by a lot counter and the residual
slivers were painted the same green as the amenity, so the plan read as
"random squares". And the floodplain was a flag, not geometry, because the
database had none.

**Real hazard geometry, fetched by the database itself.** The agent sandbox
cannot reach FEMA or USFWS, but Postgres can: the `http` extension pages the
FEMA NFHL flood-hazard layer (S_FLD_HAZ_AR, SFHA only — floodway included;
the county-sized X zones are never carved so never fetched) and the USFWS
National Wetlands Inventory into `hazard_flood_2274` / `hazard_wetland_2274`
over a 6 × 6 county tile queue. Run 2026-09-03: 6,422 flood features and
9,596 wetland features across all 72 tiles, no stuck tile. Coverage is
tracked per tile, so a parcel whose tiles are not ingested says so instead of
pretending.

**What v1.1 does differently.**

1. Floodplain (A/AE/AH/AO/V/VE) and wetlands (with a 25-ft buffer) are held
   out before a lot is drawn: lots, alleys and courts sit only on the
   developable remainder; the held-out pieces come back as greenway polygons
   with their zone; a street that crosses one says so with the crossing length
   (a culvert or a bridge, for the civil to price). A parcel that is mostly
   hazard is refused with the reason.
2. The amenity goes beside the greenway when the site has one (a window search
   along the axis for the most developable ground touching the held-out
   land), otherwise at the head. Courts sit on a block rhythm — a mid-block
   green every 600 ft on both faces of the street — not on a lot count.
3. Estate lots (district minimum ≥ 40,000 sf) get no alleys.
4. Residual land is drawn as "Unassigned" in neutral grey, never green; the
   legend on a subdivision reads Street / Alley / Lot / Greenway / Court /
   Amenity / Unassigned.

**MDHA, 2400 W Heiman, v1.1** — `qa/audits/2026-09-02/mdha_subdivision_v1_1_hazards_screen.png`:

| | v1 (no carve) | v1.1 (held out) | Civil |
|---|---|---|---|
| Held out | flag only (FEMA 15%) | 22.2% greenway: AE floodplain 15.1%, riverine wetland R4SBC + buffer 10.4% | floodplain + greenway held out |
| District lots 80×75 | 52 | 33, 5 courts on a 600-ft rhythm, 0 lots in the greenway | — |
| SP townhomes 25 ft | 163 | 122 | 102 (08/21) |
| SP 25 ft + amenity 10% | 148 | 101 lots + 57,300-sf amenity beside the greenway | 69 + amenity (08/30) |
| Street crossing | — | Street A crosses the held-out land for 373 ft (culvert/bridge) | — |

The SP counts now sit where the civil's do, for the same reason: the land the
civil held out is held out. The battery gate asserts it (`minPctHazard`:
coverage ingested and ≥ 20% held out on 550510); the lot floor was re-based
from 52 to 30 because the definition changed, and the file says so.

**What the greenway does to the ten other parcels.** 4678 Lickton Pike loses
17 lots to 7.9% held out; 1404 Pleasant Hill Rd loses 4 of 9 to a wetland
(15.2%); 4999 Clarksville Hwy is 63.7% floodplain and now yields zero lots
instead of two on the water. None of these numbers were visible before.

**Still not modelled:** topography (steep slopes), tree canopy, stream
buffers beyond the NWI polygon, sewer availability. Each is the same pattern
— a geometry layer the database fetches, held out or costed before a lot is
drawn.

## 11. The population, not the parcel — the subdivision sweep (2026-09-03)

Eric: "Are you doing this for other parcels or just MDHA? … Everything we do
needs to help train decision making for multiple parcels, not just a one off
solve."

Every parcel the plan-pattern layer would route to the subdivision generator
— single-family or agricultural-residential zoning, land ≥ max(2 ac, 9 ×
the district minimum lot), AR2a capped at 100 ac — was run through v1.1 and
the outcome stored, numbers only, in `subdivision_sweep` (4,111 parcels;
`qa/audits/2026-09-03/subdivision_sweep_v1_1.csv`). Two things come out of
it: a **calibration** every parcel is now read against, and a ranked list of
what the generator gets wrong.

**Calibration in the product.** `fn_plan_pattern` now carries, for a
subdivision parcel, what the generator achieved on parcels like it — same
zoning base, half to twice the acreage: the count, median and quartile lots
per acre, median land split, median held-out share, refusal rate, network
mix. The pattern panel shows it under "Calibration · parcels like this
one", so 33 lots (2.5 lots/ac) on 2400 W Heiman is read against 36 R6
parcels of 6.6–26.3 ac with a median 3.2 lots/ac (quartiles 2.9–3.4) — the
gap is the 22% the greenway takes, which those parcels mostly do not carry. The nightly DB battery gates the generator the
same way it gates the multifamily solver: a floor parcel (550510: ≥ 30 lots,
≥ 20% held out, hazards ingested) and a rotating single-family cohort.

**What the population says.**

| Slice | Parcels | Solved | Median lots | Median lots/ac | Median ROW | Median unassigned |
|---|---|---|---|---|---|---|
| All | 4,111 | 3,862 (94%) | 5 | 0.76 | 19.4% | 26.6% |
| R6 | 129 | 125 | 14 | 2.96 | 24.2% | 12.1% |
| R8 | 133 | 123 | 12 | 2.19 | 24.0% | 16.5% |
| RS5 / RS7.5 | 161 | 149 | 19 / 8 | 3.33 / 2.32 | 23–24% | 11–19% |
| R10 / RS10 | 976 | 881 | 6 | 1.52 | 22–23% | 20–21% |
| R15 / RS15 / R20 / RS20 | 1,390 | 1,302 | 6 | 0.8–1.1 | 17–21% | 21–25% |
| R40 / RS40 / R80 / RS80 (estate) | 377 | 363 | 3–5 | 0.08–0.36 | 17–18% | 31–40% |
| AR2a (≤ 100 ac) | 932 | 906 | 1 | 0.05 | 18.2% | 42.9% |
| Regular outline (fill > 0.85) | 779 | 737 | 6 | 1.26 | 20.1% | 12.9% |
| Irregular outline (fill < 0.70) | 2,334 | 2,183 | 4 | 0.42 | 19.4% | 33.5% |

Refusals: 221 parcels mostly floodplain or wetland (honest zeros — 54% of
the population touches a hazard, median 8% of the parcel where it does), 28
too narrow for a street and a lot, no exceptions after the valid-geometry
hardening. Networks: 1,467 spines (median ROW 17.5%), 1,286 ladders (19.9%),
897 grids (20.2%), 212 single-loaded. Access: 34% of parcels had no street
read on any edge and were given through-access with a flag — the parcel
fabric cannot tell a railroad from a road.

**What it gets wrong, ranked by lost lots — the next levers, from evidence
instead of one parcel:**

1. **Irregular outlines** (57% of the population): whole-lot and
   complete-front rules leave a third of the land unassigned. An
   outline-following lot fit at block ends — lots that bend with the
   boundary — is the single largest lever.
2. **Estate and rural lots** (AR2a, R40–RS80): 400-ft-wide lots on a
   through-street grid is the wrong module; these subdivide as flag lots on a
   shared drive or a cul-de-sac loop. A separate estate module.
3. **Access reading**: a road-centerline layer would replace the parcel-fabric
   guess and remove the "assumed both ends" flag from a third of parcels.
4. **ROW share**: R6/R8 parcels sit at 24% ROW against the civil's ~22%; the
   600-ft block cap is worth relaxing to 800 ft on narrow-lot districts once
   Metro's block-length rule is in the ordinance machine.

The sweep re-runs in batches (`fn_subdivision_sweep_next`) whenever the
generator changes, so every rule change is measured on the population before
it is believed.

## 12. Streets stop at the greenway — generator v1.2 (2026-09-03)

Eric, on the v1.1 render: "You just cut a road straight through the middle."

§10 held the floodplain and the wetland out of the lots and called the
through-street "the site". It was not. Street A still ran the full 2,381 ft,
373 ft of it through the AE floodplain and the stream, to reach an end where
no street had been read — a bridge built on an assumption. v1.2 makes the
street answer to the greenway.

**What v1.2 does differently.**

1. **Each through-street is walked from its access end along its own
   centreline.** A greenway crossing is taken only when the developable land
   beyond it, in that street's row band, is worth it: two lots' worth for a
   crossing up to 60 ft (a buffer finger or a swale — a culvert), one lot more
   per further 30 ft (a 270-ft floodplain fill wants nine lots behind it; the
   lot is capped at an R15 lot so estate districts are judged on land, not on
   2-acre lots). The street stops before the first crossing that is not worth
   it, with a cul-de-sac; two neighbouring streets of a ladder or grid that
   stop at the same greenway are closed by a loop connector. The land beyond
   is unserved — never lotted, reported in square feet, drawn Unassigned.
   Every crossing taken is priced in the flags (culvert / bridge).
2. **Assumed access picks the end with the least crossing.** With no street
   read on any edge and a greenway on the axis, the plan no longer assumes
   stubs at both ends: it enters from the end that serves the most developable
   land for the least crossing and says what the other end would cost. A
   dead-end over 750 ft names the neighbour sharing the most boundary as the
   second connection to negotiate.
3. **Courts are a pair at the same station.** Each face takes the lot slot
   nearest the station — exact on a regular parcel, within half a lot where a
   greenway carves one face — without leaving its own lot grid, so no lot is
   lost to the court; a court is a whole number of lots wide; none sits within
   150 ft of a crossing its street takes or of its greenway end — the greenway
   is that block's green. (Two earlier drafts snapped the courts to a shared
   grid; they aligned exactly and cost 5–15% of the lots on carved parcels.
   That trade was not worth it.)
4. **Lots only where the street reaches:** each face's lot strip is clipped to
   its street's served range plus the bulb.

**MDHA, 2400 W Heiman, v1.2** —
`qa/audits/2026-09-03/mdha_subdivision_v1_2_greenway_stop_screen.png`:

| | v1.1 | v1.2 |
|---|---|---|
| Access | assumed at both ends (stubs to TSU and 2518 W Heiman) | from the 2518 W Heiman end: 102 ft of crossing (an 85-ft stream culvert, a 17-ft buffer finger) against 373 ft from the Ed Temple end |
| Street A | 2,321 ft, through the floodplain (373-ft crossing) | 1,990 ft; stops at the AE floodplain with a cul-de-sac — the 271-ft crossing would have reached 3,071 sf |
| Dead end | — | 2,055 ft, over the 750-ft rule: a second connection is needed, e.g. via 2700 W Heiman St (1,542 ft of shared boundary) |
| District lots 80×75 | 33 · 5 courts · 22.3% ROW | 34 · 4 paired courts · 20.0% ROW |
| SP townhomes 25 ft | 122 | 119 |
| SP 25 ft + amenity 10% | 101 + 57,300 sf | 94 + 57,224 sf beside the greenway |
| Through-access forced at both ends | 33 | 33 — the court change is yield-neutral |

The battery gate asserts it (`requireGreenwayStop`: the network stops at a
greenway; `maxCrossingFt: 150`: a culvert, never a bridge on an assumed
access), and the lot floor ratchets 30 → 33. The neighbourhood panel and the
plan-basis line say where the street stops, what it crosses, and who could
give the second connection.

Eric, 2026-09-04, on the sheet: "You're showing wetlands and floodplains in
white. Shouldn't they be called out?" They were — in this branch's client,
as the teal "Greenway (floodplain / wetland)" fill — but the build on his
screen was `main`, whose client predates the hazard payload and draws
nothing where the greenway is. Merging this branch is the fix for that. On
top of the fill, the held-out land is now called out on the sheet itself:
a diagonal hatch (the map convention for a floodplain) and a label naming
the zone ("AE floodplain", "Wetland (riverine) · 25-ft buffer") on every
piece big enough to carry one.

**The population, re-swept on v1.2 (4,111 parcels;
`qa/audits/2026-09-03/subdivision_sweep_v1_2.csv`; the v1.1 numbers stay in
`subdivision_sweep_v1_1.csv`).** No exceptions, the same 249 refusals. 797
plans now stop at a greenway; 376 plans that assumed through-access enter
from one end; the plans with a street through held-out land fall from 1,519
to 1,009, and the crossings still taken total 314,138 ft against 427,644 ft
declined — 1,078 ac of developable land is left unserved rather than reached
by a road through a floodplain. Lots 45,001 → 43,924 (−2.4%): 2,648 parcels
unchanged, 402 up, 1,061 down. On the 1,873 parcels with no hazard the count
moves only where the court rule places a court v1.1 skipped (+450 courts
population-wide, one lot each: 19,109 → 18,592). The largest losses are
streams that run along a street line for thousands of feet — 405868 (R15,
197 ac) 143 → 115 with 6,828 ft of crossing declined; 679506 (R10, 23 ac)
20 → 7 — where v1.1 drew the street in the stream; the honest count is lower,
and moving the street off the stream is the next lever. Median ROW 19.4% →
18.8%. The calibration 2400 W Heiman is read against (36 R6 parcels of
6.6–26.3 ac) is now v1.2's: median 3.23 lots/ac, quartiles 2.86–3.43; the
parcel's 2.59 sits under the band because 22% of it is greenway.

**The ten other parcels** are unchanged except 2018 Old Murfreesboro Pike
(17 → 16, one more court) and 1404 Pleasant Hill Rd (5 → 4: the street ends
in a cul-de-sac before a 72-ft wetland crossing that would have reached
10,463 sf). A grid the first draft of this rule wrecked — 82 ac of R8
(659603), seven streets, a stream across three of them — keeps its 131 lots:
three streets end in cul-de-sacs at the stream, the other four run through,
5.0 ac beyond the stream stays unserved.

**Next levers, from the population:** a street that runs along a stream
should move off it, not stop (the largest losses above); the road-centerline
layer (§11) would replace the assumed-end pick with a read one; the estate
module (§11).

## 13. The multifamily page says what is being built (2026-09-03)

Eric, on 2600 W Heiman (RM40): "There is a ton of stuff happening on this
page; it's hard to follow, and I have no clue what's actually being built
(building w/ 25, 25, 25, 18). The colored building doesn't make any sense
from an actually multifamily layout."

Three things were true. The page led with receipts — a red census line, the
KPI strip, the solver's basis string (`133595 GSF seed plan @ 5 st · 99.1% of
134850 max · 1 structure(s) · 76 units @ ~1547 GSF · 118/132 stalls (90.8% of
placed need, 78.1% of max) · side_rows · generator: seed_v2 …`), the context
lineage, the highest-and-best strip, the capacity card — and nowhere a
sentence. The parking bays carried a bare number in the same grey as the
building, so four rectangles labelled 25, 25, 25 and 18 read as a building.
And the floor plate was drawn as saturated per-type stripes across the whole
bar — a barcode, not a plan.

**What changed.**

1. **A headline above the plan, in words, read off the plan the engine
   returned** (`BuiltHeadline.tsx`): "76 apartments in one 5-story building ·
   133,595 GSF · 118 stalls (1.6 per unit)", and under it "One connected
   S-form bar with a parking field behind it · 8 studios, 30 one-beds, 26
   two-beds, 12 three-beds". Nothing is re-measured: units, GSF and stalls
   are the engine's metrics; the composition and the parking words are the
   generator's own notes (`bars_connected_S_form`, `rear_field_perp`) put
   into English; the mix is the server's rows. The solver's basis line stays
   under it as the audit trail. The subdivision and the house seed keep their
   own lines.
2. **Buildings are named by what they are** — "Apartments · 5 stories · 76
   units" on the sheet, not "bars connected S form × 5 st". The composition
   token still travels in the element for the headline and the receipts.
3. **Parking bays say "25 stalls"**, never "25".
4. **The floor plate is drawn as a plan**: units a pale tint of their type,
   the demising walls the dark lines, the corridor a clear 5.5-ft strip
   between the two banks with the centreline dashed over it, the cores
   hatched as before.
5. **The dev census line is collapsed** to one grey line ("Census 2026-07-21
   · 1/15 ok · 1 exception · dev only · details"). It is a diagnostic about
   the population, not about the plan on the screen, and in red it read as
   one.

Render (fixture mode, the committed 553450 response, which is an older
vintage than the live one Eric saw — 70 units on 4 stories):
`qa/audits/2026-09-03/heiman_2600_mf_legibility_screen.png`.

**Still open from the same critique.** The stack under the headline —
context lineage, highest-and-best, the capacity card with its stories
table — is the analysis the earlier audits asked for, and it is still a lot
of page. The next step is one "Analysis" disclosure so the sentence and the
plan come first and the receipts open on demand.

## 14. The solver-floors gate was red for a month on one parcel (2026-09-04)

The live DB battery (`scripts/db-battery`) had been red on 619 N 5th St
(480089, RM20, 0.39 ac) on every run since the buildability verdict layer
landed on 2026-07-23 — acknowledged in the #92 and #96 merge commits and
carried over into #97. Its floor, 47% capture, was measured on 2026-07-21,
two days before the verdict existed.

The verdict is right. The parcel is a 320 × 57 ft strip; the height-control
plane (Table 17.12.020B: walls 7.5 ft inside the setback line may rise to
45 ft) turns the ordinance setbacks of 20 / 5 ft into design setbacks of
27.5 / 12.5 ft, which leaves a 32-ft-wide, 3,752-sf envelope — under the
4,038-sf minimum multifamily footprint. A house fits (8,010-sf envelope,
31.5 ft wide) and the refusal suggests it, exactly as the fixture gate
already asserts on 303 E Palestine.

So the floor became a **verdict floor**: `floors.json` now says the honest
answer on 480089 is the refusal (`buildability.verdict = unbuildable_area`,
`suggested_typology = single_family`), and both battery layers assert it. A
plan appearing there, or the verdict changing, reds the gate as loudly as a
capture regression — and says to re-measure and put a capture floor back.
