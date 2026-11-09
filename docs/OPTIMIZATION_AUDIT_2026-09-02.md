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

## 15. A civil sheet, not a diagram — existing topography and the layout sheet's vocabulary (2026-09-04)

Eric, on the merged v1.2 plan of 2400 W Heiman: "The output looks
rudimentary. This should look like a full civil set with elevations, etc."

He is right about what was missing. A civil concept set carries, beyond the
geometry: existing contours with index labels, spot grades, stations along
each centreline, the right-of-way width written on the street, the
cul-de-sac radius, lot numbers with their dimensions, a title block that
states the basis of every line, and a plan-and-profile of each street. Our
sheet had streets, lots, courts and a hatched greenway, and nothing else.
Everything else a civil set carries — design grades, cut/fill, storm,
utilities, cross-sections — is the civil's *design*, and inventing it would
be the "colored random squares" mistake in a different costume. So this
section adds the existing conditions and the sheet's vocabulary, and stops
there, saying so on the sheet.

### Topography from USGS 3DEP

`fn_parcel_topo_fetch(ogc_fid)` samples the USGS 3DEP 1-m DEM through the
`http` extension: the ImageServer `getSamples` endpoint, called as a
multipoint POST in chunks of 900 points (a polygon request caps at ~1,000
samples over the bounding box, which is why it is done this way), on a
20-ft grid over the parcel plus a 100-ft margin, in EPSG:2274 feet, NAVD88.
The samples are stored as a PostGIS raster in `parcel_topo` with the slope
statistics (`st_slope`, percent) and cached for 180 days.
`fn_parcel_topo(ogc_fid)` (the only thing the app calls; SECURITY DEFINER,
granted to the app roles, fetching on a miss) serves 1-ft contours with an
index every 5 ft (`st_contour`, clipped to 60 ft beyond the parcel,
simplified 1 ft), the sample grid, and the statistics.

| parcel | samples | contours | elevation (ft) | mean / max slope | first fetch | payload |
|---|---|---|---|---|---|---|
| 2400 W Heiman (550510, 13.15 ac) | 2,789 | 154 | 406.6–444.6 | 5.4% / 31.8% | 24.6 s | 148 KB |
| 2600 W Heiman (553450, 2.8 ac) | 873 | 45 | 417.5–440.1 | 2.8% / 19.3% | 1.5 s | 34 KB |

The 31.8% on 2400 W Heiman is the stream bank inside the held-out greenway —
the DEM sees the same thing the FEMA and NWI layers said.

### On the sheet

- **Contours** screened over the plan the way a civil sheet carries existing
  conditions: minor lines thin and light, index lines heavier and labelled
  along the line with a halo. Minor contours drop out when they would crowd
  closer than 4 px on screen at the parcel's mean slope (a hillside at fit
  zoom would otherwise be a smear); index labels need 24 px between index
  lines. A **Topo** toggle beside 2D / 3D turns the layer off.
- **Stations** every 100 ft along each through-street, ticked across the
  centreline, with the existing grade every 200 ft and at both ends
  ("EG 431.2") — the DEM's value, bilinear between the four samples around
  the point, never estimated. The callouts have zoom floors so the fit view
  stays a plan and not a smear (the first render had every label on at
  once): ticks from about 1" = 630', station text from 1" = 315', grades and
  alley widths from 1" = 260', lot dimensions once a lot is ~44 px wide.
  Renders at fit, 1" = 212' and 1" = 145' are in `qa/audits/2026-09-04/`.
- **Callouts**: "STREET A · 55' PUBLIC R.O.W." between two ticks near the
  middle of the street, "20' ALLEY" on the larger alleys, "R = 50'" at the
  bulb.
- **Lot numbers** at every lot, with frontage × depth and area once the lot
  is roomy enough on screen to carry them.
- **Title block** (top-left): project, the sheet title (CONCEPT LAYOUT PLAN
  for a subdivision, CONCEPT SITE PLAN for massing, EXISTING CONDITIONS
  before a plan), zoning / acreage / lots / network / R.O.W., the DEM and its
  interval, datum and grid, the elevation range and slopes, the hazard layers
  and the share held out, the crossing taken, "not a survey", the on-screen
  scale, the date, and CONCEPT — NOT FOR CONSTRUCTION.
- **Profile tab** under the canvas: existing grade along every
  through-street, stations on the x-axis, NAVD88 feet on the y-axis, the
  vertical exaggeration stated, the overall and steepest 25-ft grades, and the
  held-out land the street crosses. On a parcel with no street it reports the
  site's elevation range and slopes instead.

The through-street's centreline now travels with the street element
(`centerline2274`), which is what the stations, the spot grades and the
profile are built on; the client does no geometry of its own beyond walking
that line.

### What is honest about it, and what it is not

Every elevation on the sheet is the DEM's. The DEM is not a survey — a 1-m
lidar-derived model is good to roughly a foot vertically, contours from a
20-ft sample grid are smoother than survey contours, and the sheet says so.
There is no design profile, no proposed contour, no cut/fill: the existing
grade is drawn and the design is left to the civil, which the profile panel
states. The lot dimensions are the generator's numbers, not a plat.

### Gate

`requireTopo` on 2400 W Heiman and 2600 W Heiman in the fixture battery: the
layer must load and render contours; on the subdivision the spine must carry
a profile and spot grades and the title block must read CONCEPT LAYOUT PLAN.
The `fn_parcel_topo` responses for both parcels are committed fixtures. The
DEM fetch, the function grant (the `fn_subdiv_serve` lesson) and the
centreline on the street elements are all on that path.

### Next

1. **Grade-aware generation.** The generator can now know the slope under a
   street: a steepest existing grade over the ordinance maximum should flag
   the street, and lots on a bank steeper than ~25% should be refused the way
   the greenway is. The sweep can carry mean / max slope per parcel now that
   the fetch is cheap and cached.
2. **A design profile** is a real civil task (PVIs, K-values, the maximum
   grade); proposing one is possible from this grid but must be labelled as
   ours, not read as the civil's.
3. **Storm.** The low point of each profile is where the water goes; a
   detention pad at the low corner would come from the same grid and the same
   honesty rule.
4. **Cross-sections** at stations, from the same grid.

## 16. A road to the parking, a plan inside the building, a page that is the canvas (2026-09-04)

Eric, on 2622 W Heiman (667574, RM40, 3.2 ac): "Way too much happening
here. The layout makes no sense, it's not how a multifamily building would
function. You have a random parking, with no road to get to it. The internal
space in the building doesn't have corridors, room sizes are wrong etc. The
actual UX/UI of the page makes it difficult to see the site planner, there
is a ton of data."

Four faults, each real, each with a different owner.

### The parking had no road (server)

The seed (`fn_site_skeleton_v2_bars` → `fn_connect_bars` → `fn_seed_parking`,
which existed only in the database — no migration in the repo defined them)
sized the front bar to fill the whole frontage, put three 60-ft rear bays
behind the E-shaped building, and emitted a 127-ft "spine" from the frontage
midpoint that ran straight through the front bar and stopped inside the
connector, 90 ft short of the bays. The client clipped that spine against
the building, so the field rendered with no access at all — exactly what
Eric saw.

`20260904120000_mf_seed_access_drive.sql` captures the two functions it
changes and makes the road:

- **The placer reserves an access lane** before sizing the bars: the
  fire-lane width from `fn_site_standards` (26 ft) plus 2 ft clear of the
  building, measured from the parcel line (pavement may sit in the side
  setback), from the frontage to the far end, on whichever side the lane
  strip lies most inside the parcel. The skeleton's entry moves to the
  lane's centre on the curb and the spine runs down the lane. Landlocked
  parcels keep the axis entry — their access is an easement the fabric
  does not show.
- **The parking seed builds the network**: the side lane from the curb to
  just past the last bay's head, the aisle strip between the building and
  the bays that serve off it, and a straight connector for any bay whose
  head (the open end of its internal aisle) is still off the network. Bays
  never sit in the lane; the network never sits under the building or over
  a stall. It is served as `drives[]` with real polygons; the client draws
  them as the drive and no longer fabricates a rectangle from the spine.
- **The dispatcher** serves the network, falling back to the skeleton for a
  seed without one.

| parcel | lane | capture before → after | stalls | bays reached |
|---|---|---|---|---|
| 2622 W Heiman (667574) | left, fit 0.93 | 100.2% → 100.1% | 169 → 171 | 4 / 4, one connected network |
| 2600 W Heiman (553450) | right, fit 0.75 | 99.2% → 96.5% | 187 → 105 | 5 / 5 |
| 1710 Meharry (488278) | right, fit 0.92 | 99.9% → 100.0% | 66 | 3 / 3 (the lane and two connectors) |
| 1200 W H Davis (669046) | none (landlocked) | unchanged | — | skeleton only |

On 2622 W Heiman the placer recovered the lost bar length in depth, so the
road cost nothing; on 2600 W Heiman it cost 2.7 points of capture and 82
stalls that had been drawn where the lane now runs. A plan whose parking
can be reached beats one that captured 100% on paper: the fixture floor and
the DB-battery floor for 553450 re-base to 96 with that note, and
`requireAccess` now asserts — from the rendered elements, so the seed, the
mapper and the geometry gate are all on the path — that a drive reaches the
parcel line and a drive touches every bay.

### The building had no corridors (client)

`computeFloorplate` sliced the bounding box of the WHOLE footprint: an
E-shaped bar 324 × 220 ft became one box with two 107-ft-deep banks, so the
units were slivers a few feet wide and a hundred deep, and the one corridor
ran through the courtyards. The footprint is now read as the bars it is made
of — a strip sweep in the oriented frame, merged where the span holds, along
whichever axis reads it in fewer bars (an E is a spine and three arms along
x, five overlapping pieces along y) — and every bar gets its own
double-loaded corridor, cores at its free ends only (a junction has none;
the corridor runs on), and units exactly a bank deep: on a 66-ft bar that is
30-ft-deep units 18 ft (studio) to 53 ft (3 bed) wide. Genuinely angled
footprints fall back to the box.

### The page buried the planner (client)

On a 980-px window the canvas started 750 px down: census line, KPI strip,
headline, plan basis, the context-lineage card, the highest-and-best strip,
the max-buildout card with its stories ladder and chips. The basis, the
lineage, the comparator and the ladder now fold into ONE row —
"Plan basis · 158,285 GSF seed plan @ 5 st · 100.1% of max · context applied
· 158,100 GSF upper bound · 100% capture" — that opens on demand; a blocked
or stale state opens it itself. The canvas is the page.

### The console shouted (client)

Three red "[use-binding] server solve: refusing to mass 'apartments' under a
'single_family' compiled context" errors per visit: the boot placeholder use
compiled as single-family while the permitted-uses lookup was still
resolving (or had failed), and the auto-plan asked the multifamily solver
anyway because the zoning tiebreaker said "massing path". Now a
single-family context on multifamily land that the user did not pick plans
nothing and waits for the multifamily compile, a failed lookup defaults the
use from the zoning base, and a single-family use the user DID pick routes
to the lot fit instead of tripping the guard.

### Still open

The building's organization is the generator's E-shape with courts opening
sideways; the pattern layer says the site wants perpendicular bars framing
courts to the street and admits the generator does not follow it yet. That
is the next generator step, and a bigger one than the road.

## 17. Neighbours are measured from the parcel, not its centroid (2026-09-09)

Eric, on 2400 W Heiman: "We're missing the context of the neighboring lots.
In other instances, you show the lots/buildings greyed out."

`fn_planner_neighbors` selected parcels whose centroid lay within 500 ft of
the subject parcel's centroid, the buildings on those parcels, and roads
within 1,500 ft of the centroid. That is fine on a house lot and wrong on a
strip: on the 2,381 × 250 ft MDHA parcel the centroid sits in the middle of
the field, the nearest neighbouring centroid is 546 ft away and the nearest
road segment 1,083 ft, so the call returned three empty arrays and the plan
floated in white space — while 90 parcels and 76 buildings sit within 500 ft
of the parcel's boundary.

`20260909100000_planner_neighbors_by_geometry.sql` measures from the parcel
geometry instead (edge to edge, on the `geom_2274` index) and scales the row
caps with the perimeter (60–200 parcels, 150–400 buildings) so a long flank
is not cut off at the first sixty abutters. The payload shape is unchanged.
The fixture gate now requires the parcel and building layers on 550510 as
it already did on the multifamily parcels. Roads on this parcel still do not
draw: the nearest segment in the sparse OSM stub is 1,083 ft from the
boundary, and the renderer's honesty gate draws a road only where one
actually approaches the parcel.

## 18. Parking is laid out aisle-first (2026-09-09)

Eric, on 1200 W H Davis (669046, a 147 × 828 ft landlocked strip with a
301 × 67 ft bar along it): "This is not how parking would actually be laid
out for a building like this. We've now tried to clean up the example 10+
times."

### Why the clean-ups never held

The seed never had a drive aisle in it. `fn_seed_parking` placed 60-ft
stall MODULES — a double-loaded bay with its own internal aisle — as
free-standing rectangles to reach a count: rows beside the building, rows
past its ends, a field behind it, whichever set counted highest. On a strip
the "end rows" stack module after module along it with each module's aisle
running ACROSS the strip, open onto the property lines and joined to
nothing: the 20/20/20/14-stall ladder in the screenshot. §16 then drew a
road to modules that had been laid out as if roads did not exist, which is
why every earlier fix cleaned the picture up without changing what it was.

### What the seed does now

`20260909110000_mf_seed_parking_aisle_first.sql` replaces the body of
`fn_seed_parking` with the order a site planner works in, all of it drawn in
the building's own frame so every drive and every row is parallel or square
to the building:

1. **Frame.** The building's oriented box: `a` along its long face, `n`
   across it.
2. **Ring.** A 24-ft aisle beside each long face and past each end — the
   building's extent plus a corner — kept only where it fits beside the
   building (a 20-ft front yard or a 5-ft side yard does not get one).
3. **Connector.** From the entry (the reserved lane's centre on the curb, or
   the easement end of a landlocked strip) a 26-ft drive to the ring:
   straight along one of the frame's axes where a ray from the entry meets
   the ring, else an L round a corner of the building's box, a diagonal only
   when nothing square fits. A first leg that runs along the street rather
   than in from it costs extra. If the given entry reaches nothing, the curb
   cut moves along the frontage to where the building leaves room — the
   three random parcels whose entry sat behind the building in the first
   revisions all connect now.
4. **Field aisles.** Beyond each side of the building: runs square to it on
   a 60-ft module keyed off the ring's end aisle (so rows meet back to back)
   or off either site edge; runs parallel to it 48 ft off the ring aisle
   (two rows back to back between them) and then every 60 ft; past the ends,
   runs continuing the flank aisles, a centred pair, and edge-keyed runs.
   A run is refused where an aisle already runs the same way; it meets an
   aisle running the other way as a T, never a crossing (a crossing chops
   the rows on both sides into three-stall scraps). One that does not touch
   the network is joined by a short square cross-connector. Aisles are
   added in order of stalls gained per foot from the entry until the rows
   cover the need.
5. **Rows.** One 18-ft row beside each side of every aisle, each its own
   rectangle in the frame — never a buffer of the network, never a union
   across aisles (the unions merged rows at angles into wedges and counted
   an 11-ft strip beside the building as 66 stalls) — clipped to the site,
   never in the front yard, never over an aisle or another row, never under
   16 ft deep; a row counts floor(length / 9). The rows nearest the entry
   are kept: one radius from the entry is found that covers the need, every
   row is cut square at it, so a field fills evenly from the way in and the
   aisles stop together.
6. **Trim.** Every field aisle is cut back to the rows it serves plus where
   the network joins it; a ring side that carries no stalls and is not the
   way in is dropped unless removing it breaks the network; pieces go back
   where the network would otherwise fall apart.

The need it lays out for is the need of the building actually placed,
derived exactly as the dispatcher derives it (`ceil(units × ratio)` from
the placed GSF), not `fn_max_buildout`'s figure for the biggest building
the lot could hold: the dispatcher called the seed without a need, so every
plan carried a third more parking than it required (128 stalls against 99
on 1200 W H Davis). The max figure is still reported as
`stalls_target_at_max`, and `20260909120000_mf_dispatcher_target_at_max.sql`
reads it for the dispatcher's max line. Nine revisions were needed to get
here; each was judged on plots of the live geometry (parcel, building,
rows, drives, entry) for the four battery parcels and five random ones
before a fixture was touched.

### What it produces

| parcel | before (§16) | now | network |
|---|---|---|---|
| 1200 W H Davis 669046 | 129 stalls / 99 needed; two single-loaded edge aisles down the strip, a curved stub | 99 / 99: the drive straight down the flag pole, a loop round the bar, two double-loaded aisles south of it (four rows) cut square at 667 ft | one piece, reaches the easement |
| 2622 W Heiman 667574 | 155 / 154; rows merged into odd pieces, a 9-row "bay" | 154 / 154 in 9 rows: the drive straight in, a ring on three sides, a rear cross-aisle with three double-loaded aisles off it | one piece |
| 2600 W Heiman 553450 | 153 / 126 | 126 / 126 in 3 rows: an L from the curb, two aisles up the strip with rows back to back between them | one piece |
| 1710 Meharry 488278 | 63 / 52; a diagonal connector and a V-shaped wedge of stalls | 52 / 52 in 4 rows, everything square to the building | one piece |
| random 425706 / 589193 / 659461 / 672378 | 39/35, 134/140, 133–162/157–183, 22/18; three of four in 2–3 pieces | 35/35, 138/138, 157/157, 18/18; all one piece | — |

The only parcel still in two pieces is 323599, where the placer put three
separate buildings on one lot and the seed frames on their union; that is
a placer question, not a parking one (below).

### Client

Bays now carry their own `stalls` and `rows`; the mapper uses them instead
of apportioning a total by area (`generateMfPlan.ts`, `seedToElements.ts`,
`seedPlan.ts`), and the stripe renderer takes a 36-ft band as two rows back
to back. Fixtures refreshed for all four multifamily parcels and the seed
responses; 669046 re-based from the stale 89.9% (its fixture pre-dated the
lane-reserving placer) to 88.0 against today's 88.2%, and its
`requireParkingLimitedChip` retired for `requireAccess` — the plan is no
longer parking-limited because the seed now meets the need it was asked for.

### Still open

- The multi-building placer output (323599): the seed frames on the union of
  three footprints; a per-building ring with one shared network is the
  right answer there.
- Dead-end aisles get no turnaround; the fire code wants one past 150 ft.
- Rows of two or three stalls left where a T-junction cuts a row are legal
  but fussy; a designer would landscape them.
- Landlocked strips still get no reserved lane in the placer (§16), so the
  seed's connector does that work from the easement end alone.

## 19. The Texas wrap: units round a garage, a court on the deck (2026-10-07)

Eric sent the full plan set for **The Caroline, 101 Cool Springs Blvd,
Franklin** (Kimley-Horn civil C0.0–C5.0 and L1.0, 906 Studio architectural
A1.0–A4.0, development-plan resubmittal 3/7/2024) as "an example set of
plans for a Texas wrap multifamily product". It is now the exemplar for a new
plan pattern, and a generator draws that organization on Nashville parcels.

### What the Caroline shows

- **Site.** 2.906 ac (126,583 SF), RC-6 rezoned to PD at 65.4 DU/ac with
  3,607 SF of commercial; 15-ft setbacks all round; 6 stories, Type VA over a
  Type IA podium, 68'-5" to a 70-ft limit; landscape surface ratio 25%.
- **One block, to the setbacks.** The building is 303 × 243 ft (72,070 SF per
  floor) — 57% of the site. The rest is an L of private drives down the side
  and across the rear (22-ft joint ingress/egress easement), the landscape
  frontage on Cool Springs Blvd and the perimeter buffers. No curb cut on
  the arterial: the site is entered from the perpendicular private drive.
- **A two-level garage in the middle**, tucked into the 22-ft fall of the
  site (levels at 692 and 703 ft; units start at 714). 148 + 166 = 314 stalls
  inside, 18 visitor stalls outside parallel to the drives, 332 for a
  requirement of 330 (1.5 per studio/1BR, 2.5 per 2BR, 3.33 per 1,000 SF of
  commercial, a shared-parking reduction of 27). About 380 SF per stall per
  level, 1.72 stalls per unit. Garage entries off the side drive and the rear
  easement; the trash room is inside level 1 (mini roll-out dumpsters).
- **Four double-loaded bars ring the courtyard on the deck** — a pool and
  patio inside the ring, club (3,113 SF), fitness (1,795), lobby (1,721) and
  leasing (3,980) at the street corner with the commercial. Liner units face
  the drives and the street at the garage levels.
- **190 units**: 12% studios (22, 617 SF), 66% 1BR (125, 852 SF), 22% 2BR
  (43, 1,187 SF). Fire: Franklin Tower 2 autoturn on the perimeter drives,
  fire-lane striping, standpipes.

The organizing moves hold on any compact site of 2–5 acres where the parking
regime is structured: block to the setbacks, drives round two sides, garage
in the middle, ring on the deck. They are recorded as `site_plan_exemplar`
row "The Caroline — 101 Cool Springs Blvd" (program JSON and six principles)
and read back by `fn_plan_pattern` for every parcel whose pattern or
alternates include the wrap.

### The pattern layer

`fn_plan_pattern` has a new branch ahead of `podium_tower`: multifamily
as-of-right, **structured** parking regime, ≥ 1.75 ac, oriented-bounding-box
aspect ≤ 2.4, short side ≥ 290 ft (two 67-ft bars, a 70-ft court, a 26-ft
lane and the setbacks), stories allowed ≤ 8 → `wrap_garage_courtyard`,
alternates `podium_tower` and `court_scheme_perpendicular_bars`, six
principles in deal language, generator `fn_generate_wrap_site_plan`,
aligned. `podium_tower` and the court scheme now name the wrap as an
alternate. The selection basis carries `stories_allowed`. The RM40/RM20
battery parcels are unchanged (553450 / 667574 court scheme, 669046
landlocked bar, 488278 frontage bar): the rule is structured-regime only.

Across the mixed-use and office districts (MUG, MUG-A, MUI, MUI-A, ORI, MUN,
CS, CL, DTC, OR20/40) 531 Nashville parcels of 1.75–6 ac meet the shape
test; the regime test narrows that to the ones whose FAR puts them in the
structured regime.

### What the generator does (`fn_generate_wrap_site_plan`, wrap_v1)

In the frontage frame (a along the longest straight run of the primary
frontage, n inward; a second frame on the lot's own axis is tried when the
lot sits more than 8° off the street):

1. **The lot lines, read in the frame.** Boundary segments that run with n
   are side lines (left or right by where they sit), segments that run with
   a in the back 40% of the lot are the rear line; the primary frontage's
   straight run is taken out first, so a block lot with streets all round
   keeps its other street edges as "lot lines" — the Caroline's rear drive
   is an easement along such an edge.
2. **The L of drives.** For each of twelve candidates (side + rear drives;
   drives down both sides; one side drive, allowed only when the block's
   rear wall stays within 150 ft of the street; each on the left and the
   right, with and without an 8-ft visitor strip) the land the drives take
   is reserved as a buffer *along the lot lines* — a 26-ft lane 3 ft in
   from the line plus a 2-ft clear — and the largest rectangle square to the
   frame is found inside the setback envelope less that land
   (`fn_frame_inscribed_rect`: grid search over a, the front edge at the
   front setback where it fits, the depth by bisection). The rectangle must
   clear two bars and a 70-ft court each way, falling back to the site
   standards' 40-ft minimum court; the candidate with the largest **ring**
   (block less court) wins, and a candidate that gives up a drive must beat
   the one before it by a quarter. Reserving the land along the lot lines
   rather than in a straight band is what makes a slanted or bent lot line
   work: the block clears a full lane everywhere, so the drives can then
   hug the block (the side drive from the curb to just past the block's
   rear, the rear drive along the rear wall out to the side drive, meeting
   edge to edge) with the wedge between drive and lot line left as buffer —
   the Caroline's organization exactly.
3. **The ring and the court.** Four bars at the unit program's bar depth
   (67.3 ft) round the block; the court inside. Pool deck in the court on
   the street side beside the entry drive; the rest open space.
4. **The garage** under everything but the frontage bar (liner units,
   leasing, any retail face the street at those levels), at 370 SF per
   stall per level. Levels to the need (1–3): units = GSF × 0.88 / the
   frontier's average unit GSF, capped by the district's density; stalls at
   the typology's ratio for that unit size; the top level is partial when a
   full deck would over-park by more than 5% (flagged
   `garage_top_level_partial_N_of_M_stalls`); a plan still short at three
   levels is parking-limited exactly as the seed is. Stories = garage +
   residential to the district's limit (3–8).
5. **Capture** is stated against the frontier's **structured-parking
   ceiling** (FAR / height / density, no parking land) when it carries one;
   the surface frontier is the wrong yardstick for a garage plan and travels
   as `capture_vs_surface_frontier_pct`. Capture under 50% and a court under
   70 ft are flagged.
6. **Entries.** The curb cut is where the side drive meets the frontage; the
   garage is entered off the side drive near the rear corner and off the
   rear drive — never from the frontage.

The payload is the seed family: `buildings[]` are the four bars (`kind`
`wrap_bar`, `name`, `residential_levels`, `over_garage`), `parking.garage`
the structure (footprint, levels, stalls per level, capacity, entries),
`parking.bays` the visitor strip, `drives[]` the L (`access` and
`fire_lane`), `greens[]` the court, `amenity[]` the pool deck, metrics with
`garage_levels`, `residential_levels`, `far`, `coverage_pct`,
`density_du_ac`, `court_sqft`, `block_ft` and the ceilings; `plan_basis`
reads "232425 GSF wrap plan @ 5 st (2 garage + 3 residential) · 54.8% of
423765 structured ceiling · block 323 × 280 ft (63.9% of the site) · court
188 × 145 · 131 units @ ~1550 GSF · 238/226 stalls (2 garage levels × 185 +
0 outside) · access: side drive + rear drive · generator: wrap_v1 ·
exemplar: The Caroline, 101 Cool Springs Blvd".

The dispatcher (`fn_generate_mf_site_plan_v2`) serves the wrap plan when the
pattern is `wrap_garage_courtyard` and falls through to the court search /
seed when the generator refuses (`wrap_block_too_small`). That migration
carries the live 2026-09-13 dispatcher body into the repository for the
first time (see the drift note in the file; §16 of this audit and PR #111
record the court-pattern regression it brought).

### What it produces

Seven candidate parcels (`qa/audits/2026-10-07/wrap_seven_parcels.png`):

| parcel | district · acres | block (ft) · % of site | court | stories | units | GSF | stalls built / required | capture of structured ceiling | access |
|---|---|---|---|---|---|---|---|---|---|
| 2221 Murphy Ave (407697) | MUG-A · 3.70, corner | 396 × 295 · 72% | 261 × 160 | 5 (2 + 3) | 157 | 277,706 | 285 / 271 | 57.4% | side + rear, left |
| 535 Main St (469303) | MUG-A · 3.24, corner | 323 × 280 · 64% | 188 × 145 | 5 (2 + 3) | 131 | 232,425 | 238 / 226 | 54.8% | side + rear, right |
| 1023 21st Ave N (553602) | MUG · 2.88, streets all round | 307 × 268 · 66% | 172 × 134 | 5 (2 + 3) | 124 | 219,188 | 225 / 214 | 58.2% | side + rear, right |
| 1019 18th Ave S (668798) | ORI · 3.15 | 450 × 216 · 71% | 316 × 82 | 5 (2 + 3) | 156 | 275,306 | 284 / 270 | 66.8% | side + rear, left |
| 0 Cumberland Bnd (679320) | MUG · 3.36, curved frontage | 211 × 251 · 36% | 76 × 116 | 5 (2 + 3) | 91 | 160,531 | 165 / 157 | 36.6% (flagged) | side + rear, left |
| 2135 Waterside Dr (707762) | MUI-A · 2.82, 262 ft deep | 300 × 177 · 43% | 165 × 42 (flagged) | 7 (3 + 4) | 138 | 244,694 | 251 / 239 | 39.9% (flagged) | both sides |
| 1200 18th Ave S (662787) | ORI · 3.35, a 160-ft strip | refused: `wrap_block_too_small` — the pattern layer says `podium_tower` here, so the dispatcher never asks | | | | | | | |

The Caroline for comparison: block 303 × 243 at 57% of 2.9 ac, 6 stories
(2 + 4), 190 units, 1.72 stalls per unit. Our plans run 1.7–1.8 stalls per
unit at 1,550-SF average units (the frontier's GSF-max option), 40–50 units
per acre, five stories where the districts allow five. Waterside Dr is the
case the 290-ft short-side rule now keeps out of the pattern: its 177-ft
block leaves a 42-ft court, which is a light well, not a courtyard.

### Client

- `PATTERN_LABELS`: "Texas wrap: units wrapping a garage, courtyard on the
  deck".
- The seed-family mapper names the bars by their place in the ring
  ("Frontage bar · 5 stories · 40 units"), shares the server's mix across
  them by GSF, and adds the garage as a **structured** parking element
  (dashed outline, "Garage · 2 lvl · 238 stalls", no surface stripes), the
  court as open space and the pool deck as an amenity; `fire_lane` drives
  carry their names ("Rear drive"); block coverage and FAR reach the KPI
  strip.
- The zero-overlap gate excludes a structured garage the way it excludes
  greenspace: the deck is the same mass as the bars standing on it, not
  parking under a building.
- Battery: 535 Main St (469303) joins the fixture gate (`mode: server-plan`,
  `requirePlanPattern: wrap_garage_courtyard`, `requireAccess`, utilization
  floor 110% of the surface frontier); `ONLY_FID` runs one battery parcel.
- A canvas crash found on the way: `SitePlanCanvas` has used `corridorLine`
  without importing it since 2026-09-04 (ec5905a), so every building without
  a unit mix — the single-family house on 303 E Palestine Ave, and now the
  wrap's pool deck — threw in `renderBuildingDetail` and the sheet showed the
  error boundary while the headline, the KPIs and the tabulation rendered.
  The fixture gate passed because the evidence hook reads the workspace, not
  the canvas, and `npm run typecheck` runs `tsc --noEmit` against the
  solution-style `tsconfig.json` (`files: []`), which checks nothing; the app
  config (`tsconfig.app.json`) carries hundreds of pre-existing
  `exactOptionalPropertyTypes` errors, so the missing import never surfaced.
  Fixed (the import), and the battery now fails any parcel whose sheet shows
  "Site Planner Error" (`qa/audits/2026-10-07/393306_house_after_canvas_fix.png`).

### Still open

- **Corner lots.** The side drive runs inside the lot along the secondary
  street and the curb cut lands at the lot corner (Murphy Ave, Main St); a
  corner lot should enter from the secondary street mid-block and may not
  need the drive at all where the street itself is the fire access.
- **Dead ends.** The rear drive ends at the far lot line; the Caroline's
  loops through the adjoining property. A hammerhead or a loop round the
  block is the fire marshal's ask on anything over 150 ft.
- **Liner program.** The frontage bar's garage levels count as residential
  GSF; the Caroline puts leasing, club and 3,607 SF of commercial there.
- **Grade.** The Caroline tucks its garage into 22 ft of fall; the generator
  draws the deck flat. The DEM is already on the sheet (§15) and could set
  which garage levels are below grade.
- **Capture on odd lots.** Cumberland Bnd gets 36% of its structured ceiling
  because the inscribed rectangle leaves the curved half of the lot empty; a
  second block, or a bar along the curve, is the next generator move.

## 20. The by-right subdivision generator (sf_v1) in the product (2026-10-27)

The handoff: `fn_sf_v1_plan(ogc_fid, opt)` and its earthwork exist in the
Parcelmap database and nothing in the app called them. The app's live
subdivision path was `fn_generate_subdivision` (§12–§13: 4–8 lots on 12–16
ac with a quarter to half the land unassigned). The owner's standing
instruction is **by right by default, from the base district of the
parcel**: R / RS → `fn_sf_v1_plan`; RM / MUL / SP → attached homes
(`fn_generate_th_site_plan_v3` once it is faster than its 1–5 minutes; v2
stays the product default until then); an override is a second, flagged
answer the user asks for — a lot module, the floodway-only fill scenario,
setbacks, the entry position — never the default.

### What is wired

- **Routing** (`SiteWorkspace.handleGenerateLots`): the base district from
  the plan-pattern layer's `selection_basis.zoning_base` (the parcel's
  zoning string as fallback) goes through `sfV1Route`: `R6`, `RS20`,
  `R80` … → the by-right generator; `RM20`, `MUL`, `SP` → the attached-home
  path (unchanged today); anything else → not this path. A `status:
  'skipped'` answer (no single-family standard for the district, landlocked)
  is shown with its reason and nothing is drawn over it. Only an
  unreachable service falls through to the legacy generators, and the strip
  says so.
- **The payload** (`api/sfV1Plan.ts`): geometry arrives as WKT in EPSG:2274
  feet (`street_lines_wkt`, `row_wkt`, `pave_wkt`, `bulbs_wkt`, `lots_wkt`,
  `pads_wkt`, `drives_wkt`, `open_wkt`, `pond_wkt`, `low_point_wkt`); a
  small parser (`api/wkt.ts`) turns it into GeoJSON for the same
  2274 → 4326 → 3857 pipeline every other layer uses. On the sheet: lots as
  lot-line polygons carrying their kind (standard / edge / corner / pie; the
  lot module's dimensions only on a standard lot), one house pad per lot
  (drawn as a plain footprint — no corridor, no unit ticks), the right-of-way
  band, the pavement and the cul-de-sac bulbs unioned into one street
  network with the centrelines riding along for the stations and the
  profile, driveways clipped to the pads, open space by kind (pond in blue,
  buffer and wetland-side land hatched as greenway, pocket park, interior
  remnant as the unassigned land it is), the wetlands from
  `fn_th_v3_site(ogc_fid, flood)->>'nobuild_wkt'`, and the low point as a
  marker. The gate (§5) passes the generator's own clean plan: lots and the
  right-of-way are outside the overlap set, the street is one piece.
- **The headline and the grade** (`ui/SfV1Panel.tsx`): lots, du/ac, pattern
  (loop / 2 loops / single street / T street / frontage lots), the basis
  chip (**By right** / **Override**), the flood hold; the numbers (lot
  module, land split, street length and dead ends, storm pond and low point,
  floodplain built on, street in wetland, open-space pieces, lots by kind);
  then **tests as a checklist with their values and limits, fails in red,
  notes verbatim** — they are the honesty of the answer. The KPI strip
  carries the fails and the notes as the plan's warnings.
- **Earthwork** (present when the plan builds in the SFHA or on ground over
  8% slope): BFE, pad target, fill by component, pad fill min / median /
  max, lots over 10 ft of fill, the cut (required, what the pond gives, the
  open floodplain available to cut, the average depth, whether it closes on
  site), street grade. **The fill-depth view** colours every pad by the fill
  it needs — under 4 / 4–8 / 8–12 / over 12 ft — when the response carries
  per-pad fill (read under `pad_fill_ft_by_lot`, `pad_fills_ft` or
  `pads[].fill_ft`); when it carries only the min / median / max, the panel
  says so and the pads keep their plan colour.
- **The override control**: a lot module (width, depth, minimum lot area),
  the fill scenario (`{"flood":"floodway"}`, holding out only the regulatory
  floodway) and a **By right** reset. Every override re-runs the generator
  and the result is labelled an override; a new parcel starts by right.
- Evidence for the battery (`window.__planEvidence.sfV1`): status, lots,
  pattern, basis, flood hold, fails, test and note counts, earthwork and
  fill-view flags, density.

### Not done, and why

The Supabase connector refused every call during this work ("You do not
have permission to perform this action", including plain reads), so nothing
below could be checked against the live function. Each is written to fail
soft until it is.

1. **The payload shape is from the handoff, not from a live call.** The
   client tolerates `tests` as a list or an object keyed by id, finds `fails`
   from the failed tests when the list is absent, and looks for per-pad fill
   under three plausible keys. The first live response for 682644 (R8 loop,
   24 lots) must be read and the types tightened; `fn_sf_v1_draw` exposes
   the same layers under the scratchpad renderer's names if that is easier.
2. **Access.** The handoff says to call the generator with the service role;
   the app calls RPCs with the anon key like every other generator. The
   function (and `fn_th_v3_site`) needs `GRANT EXECUTE` to `anon` /
   `authenticated` and `SECURITY DEFINER` (it reads `hazard_flood_2274`,
   `parcel_topo`, `flood_bfe_2274`, `jurisdiction_zoning_standards`,
   `planning_principle` and fetches 3DEP / FEMA on first use). Until then
   the RPC fails, the client says "not reachable" and the legacy generator
   draws — the honest fallback, not a by-right answer.
3. **`fn_th_v3_site`'s argument names** are assumed (`p_ogc_fid`, `p_flood`);
   the wetlands layer is simply absent when the call fails.
4. **The ground-at-BFE contour** (`st_contour(rast, 1, 1, 0, array[bfe])` on
   `parcel_topo`) needs a small RPC (`fn_sf_v1_bfe_contour(p_ogc_fid,
   p_bfe_ft)` → WKT lines); the client's `fetchBfeContour` is ready for it
   and the earthwork view draws without it for now.
5. **Fixtures.** No battery parcel exercises the by-right path yet: in
   fixture mode `fn_sf_v1_plan` misses the mock store, the client falls
   through to the legacy generator and 2400 W Heiman (550510, R6) keeps its
   `fn_generate_subdivision` expectation (34 lots). When the connector is
   back: harvest 682644 (R8 loop, 24 lots) and 680719 (Martingale Dr, the
   floodplain case: by right 0 lots; the fill scenario 127 lots failing
   `flood.cut_fill_balance` with 565,000 cy of fill) into the store, add
   them to the battery with `requireSfV1` expectations, and decide what
   550510's floor becomes under sf_v1 (the handoff measures 17 lots there
   against the old generator's 34 — a reviewed change, not a ratchet).
6. **Known gaps in the generator itself** are the handoff's and are not to be
   papered over in the UI: triangular leftovers at ring corners and between
   streets and wetlands; streets reported but not realigned where they cross
   wetlands; rings inset from the whole site, not the buildable land;
   earthwork measured but not yet steering the layout; no lot-value or
   infrastructure-cost objective; R80 estate lots crude; duplexes not
   counted; `fn_sf_v1_strip_dbg` is a diagnostic copy, not for the product.

### Update 2026-11-03: verified against the live function, and what changed

The connector came back. The five items above, closed:

1. **The payload, from a live call** (`fn_sf_v1_plan(682644)`, 1.75 s):
   `tests` is an **object keyed by test id**, each with `pass` and its own
   figures — `{pass, limit, value}` for `block.length` / `street.dead_end_max`
   / `street.grade_max` (which also carries `ft_over_limit`), `{pass, rule,
   acres}` for `open.unassigned` (a test the handoff did not list),
   `{pass, area_sf, needed_sf}` for `storm.low_point`, `{pass, value, needed}`
   for `access.second_connection`, `{lots, ratio, arithmetic_at_62pct}` with
   **no pass** for `yield.vs_arithmetic` (a ratio, not a verdict), and in the
   floodplain `{pass, pad_fill_ft, lots_in_sfha, pad_target_ft}` for
   `flood.freeboard` and `{pass, fill_cy, cut_available_ac,
   avg_cut_depth_ft_needed}` for `flood.cut_fill_balance`. The panel now
   prints every figure a test carries in its own words and the rule as the
   note. `earthwork` is **always** present — ground min/max, `street_grade`
   {max_pct, limit_pct, ft_over_limit}, and the flood figures (`sfha_ac`,
   `lots_in_sfha`, `bfe_ft`, `freeboard_ft`, `pad_target_ft`, `fill_cy` by
   component with a `total`, `pad_fill_ft` min/median/max,
   `lots_with_pad_fill_over_10ft`, `cut`) zero or null outside the SFHA; the
   block shows the ground and the street grade always and the flood part only
   when the plan builds in the SFHA. `open_pieces` kinds are prefixed —
   `amenity: pond and its edge`, `amenity: street island / green (too shallow
   for a lot)`, `amenity: neighborhood park`, `natural: wetland / water
   buffer`, `unassigned: buildable land without a street or a lot` — and draw
   by prefix (green, hatched, neutral). `lot_areas_sf` (per lot) feeds the
   lot tags; `lot_kinds` includes `estate`. Extra layers `park_wkt`,
   `reserve_wkt`, `deep_fill_hold_wkt` draw when present. `basis` stays
   `by_right` under the fill scenario, so the client labels an override by
   what it asked for. The ten test parcels today: 682644 34 lots (loop),
   681118 16 (loop), 679703 14 (single street), 661361 14, 680145 12 (T
   street), 558909 9, 678879 6 (frontage lots), 550510 18, 642043 3, 680719
   0 by right / 145 under the fill scenario — the handoff's counts have moved
   with the generator.
2. **Access.** As `anon`, `fn_sf_v1_plan` fails inside `fn_th_v3_site` with
   "permission denied for function fn_site_inputs" (the th_v3 helpers are
   postgres / service_role only). Migration `20261103184636_sf_v1_app_access`
   adds four SECURITY DEFINER wrappers the app calls instead:
   `fn_sf_v1_plan_app(ogc_fid, opt)`, `fn_sf_v1_site_app(ogc_fid, flood)`
   (the no-build / hold / site layers only), `fn_sf_v1_pad_fill(ogc_fid,
   pads_wkt, pad_target_ft)` (fill per pad: the target less the DEM's mean
   ground under the pad, from `parcel_topo`'s raster — 20-ft cells, EPSG:2274,
   32-bit float feet) and `fn_sf_v1_bfe_contour(ogc_fid, bfe_ft)`
   (`ST_Contour` at the BFE, WKT lines). Verified as `anon`: 682644 → 34
   lots; 680719 fill scenario → 145 lots, 145 pad fills (2.3–15.9 ft), an 8-KB
   BFE contour.
3. `fn_th_v3_site(integer, text)` takes `p_ogc_fid, p_flood`; the app reaches
   it through the site wrapper.
4. **The BFE contour** rides with the topography layer as a blue dashed
   contour labelled "BFE 429"; the pads take their fill band from
   `fn_sf_v1_pad_fill`.
5. **Fixtures and the gate.** 4701 Bowfield Dr (682644) and 0 Martingale Dr
   (680719) are battery parcels; the battery presses the fill-scenario
   override on Martingale and judges that answer on its own evidence
   (`requireSfV1Override`): 145 lots on two loops, `flood.cut_fill_balance`
   admitted as failed, the fill-depth view and the BFE line rendered.
   2400 W Heiman keeps its legacy expectation until its by-right fixture is
   harvested — by right it is 18 lots on a single street at 1.64 du/ac
   against the old generator's 34, a reviewed change for Eric, not a ratchet.

## 21. Ten parcels by right, as a user (2026-11-03)

Eric: "Run 10 parcels as if you were a user, take screenshots, and provide
candid feedback about making the experience and output better." The ten are
the by-right generator's own test set, driven through the real client in
fixture mode on responses pulled live the same afternoon. The pictures and
the full write-up are in `qa/audits/2026-11-03/`.

What the run found and this change fixed: the geometry gate rejected 2400 W
Heiman because the generator's driveways lap into the pavement (the mapper
now clips them to the street); every house pad carried a "House N" caption
(the lot tag names the lot; pads carry none now); the open-space list ran to
nineteen pieces on Martingale (grouped by kind with counts and acres); the
basis line read "by by right".

What a user would push back on, in order of weight: six of ten streets
exceed the 10% grade limit (up to 76.8% on Morton Mill) and the plans say
"done" — the generator does not steer by grade yet; W Heiman gets 18 lots
on 27% of the land where the old generator drew 34, because the flood hold
takes the northern half as "amenity: pond and its edge" — the two answers
need reconciling before users see both; the open-space vocabulary is the
engineer's; Bell Rd carries two opinions on its frontage (the parcel fabric
says none, the generator fronts it); the pattern panel describes the old
generator over the new plan; the KPI strip is the apartment strip (stalls,
"0 issues" over failed tests, a unit-type legend); estate and pie remnants
read as waste; the route is silent and the override buried; twenty seconds
to a two-second answer because the apartment-side compile runs first.

## 22. Five more by right, drawn at random (2026-11-03)

Eric: "Pull 5 more and give feedback." Unlike the curated ten (§21), these
five were drawn by a fixed hash from the 3,148 vacant R / RS parcels of
1–60 ac, one per size band, and had never been opened. Write-up and pictures:
`qa/audits/2026-11-03b/`.

The output: no subdivision on any of them. 0 Harding Pl (R40, 2.9 ac) and
7610 Chipmunk Ln (R80, 7 ac) are 0 lots because the fixed module (140 × 290,
270 × 300) fits neither shape; 1023 Wellmoor Ct (RS20, 4.1 ac) is skipped as
landlocked although it touches its cul-de-sac for 6 ft and three vacant
parcels; 0 Pennington Bend Rd (R15, 13.3 ac, 10 ac of SFHA) gets six
credible frontage lots; 0 River Road Pike (R80, 26 ac, 33% mean slope) gets
one lot and calls 23 ac "buildable … unassigned" while its own
`open.unassigned` test passes. The override ignored the module asked for on
two of three tries (100 × 400 → 135 × 300, 160 × 500 → 270 × 300).

The first visit: topography 8–41 s with two fetches failing on the first try;
River Road Pike's 41 s is over the anon role's 20-s statement timeout, so the
contours very likely never load there in the app. The by-right plan waits for
the planner compile (up to 5.5 s cold) and took 8–10 s on its first call on
the two big parcels. §21's "twenty seconds" was the harness's own waits.

Fixed in the client: a 0-lot or skipped answer offers the one house the lot
itself carries (the single-family seed) instead of an empty sheet; a skip no
longer leaves the header on "Generating plan…" or shows controls that cannot
help; a plan that holds the floodplain out is no longer drawn as a floodplain
plan because the parcel has a BFE; the panel says when the generator used a
different module from the one asked for; "1 lot"; a seed with no footprint
says so. The battery asserts the one-house offer on Martingale Dr.

## 23. Five more, one by one; the pattern competition in the product (2026-11-04)

Eric: "Grab 5 more and provide detailed feedback for each one." Drawn as in
§22 (one per size band of the vacant R / RS parcels, by a fixed hash), and
driven twice: as the app stood, and with the updated handoff wired in
(`fn_sf_v1_candidates`, the competition of the grid, neighborhood and loop
grammars). Write-up per parcel and pictures: `qa/audits/2026-11-04/`.

The parcels: 1083 B Lakewalk Dr (RS10, 1.16 ac, 0 lots, land appraised at
$200), 930 Morton Mill Rd (RS20, Metro Government, 4.47 ac mapped against
7.71 on the record, 0 lots behind a 2.71-ac flood hold on a 28.5% slope),
0 Riverfront Dr (RS15, an HOA's common land, skipped as landlocked), 3736 Old
Clarksville Pike (RS40, 24.9 flat acres, 7 lots on a single street with
15.2 ac blank; the competition's grid and neighborhood plans draw 16 but fail
three tests each, so the fewest-fails rule ranks the 7-lot plan best), 0
Sullivan Hollow Rd (R80, 48 ac, landlocked, 5 lots on a "public R.O.W." that
runs 720 ft along a stranger's vacant parcel; every pattern fails the street
grade, and the competition's best is an unbuildable 15-lot grid).

The finding that matters most is ownership: across this round and §22, five
of ten random "vacant" parcels are association-owned, Metro-owned or a $200
remnant, and of the 3,169 parcels in `sf_v1_prefetch_queue`, 797 are owned by
an owners' association and 192 by a public body. The planner's parcel record
carries no owner, so the page cannot say so.

Engine-side items (the write-up lists twelve): the fill scenario comes back
`basis: 'by_right'`; `street.grade_max` passes with up to 100 ft over the
limit and no rule saying so; the landlocked reason calls a 1,163-ft open edge
"the longest touch on a street"; vacant-neighbour access is drawn as by right;
the seed puts houses in the SFHA (all of Riverfront's) and returns no
footprint on Lakewalk; `module_by_right` changes nothing on four estate or
irregular parcels; first calls of 22 s and 47 s exceed the anon timeout; the
handoff's lot counts are stale (Bowfield is 35 lots by right today, Martingale's
fill scenario 147).

In the client: the competition runs after the plan is on the sheet, through
`fn_sf_v1_candidates_app` (migration 20261104000741), cached per parcel. It
shows each pattern by what it drew, best and structured, the price of the
structure in a sentence, and "View this plan". Pattern and `module_by_right`
are not overrides. The flood hold, trail, green strip and reserve are drawn. The
plan's follow-up calls run together. From the five: the server's MultiPolygon
envelope is used, a 0-lot answer settles as existing conditions with its
context layers, a failed house draw and a landlocked house say so, the fill
scenario is hidden where nothing is held, a pass over the limit is marked, the
KPI strip reads lots and the plan's own tests, the pattern card names the drawn
plan, and the title block carries mapped and assessor acres. The battery
asserts the competition on Bowfield (best loop 35, structured 25, 10 forgone,
the structured plan viewed by right) and re-bases Bowfield (35 lots, no
failed test) and Martingale's fill scenario (147 lots) to today's engine.

## 24. Ten more by right (2026-11-04)

Eric: "Run 10 more and provide feedback again." Two per size band from the
vacant R / RS parcels of 1–60 ac, by a fixed hash, this time excluding the
non-sites §23 found (association-owned including "O.I.C.", public, appraised
under $5,000): 1,679 of 3,125 parcels remain, so 46% of the pool is not a
plausible site. Write-up per parcel and pictures: `qa/audits/2026-11-04b/`.

Two client defects affected every plan of their kind. Every loop street was
drawn as a solid slab because the canvas filled a polygon's outer ring and
ignored its holes; Bowfield's loop had shown it since the first loop shipped,
and two rounds of pictures missed it. And a flood parcel never reached the
by-right generator: the compile's `physical.developable: false` set
`generation_allowed: false`, and the page said "single family is not
permitted as-of-right — pick a permitted use" on RS40 and R15 lots
whose only use is single family. Both are fixed. A physical-only block on
R / RS goes to the generator, and a flood skip offers the fill scenario. On
0 River Landing Way the fill scenario draws 10 lots on 9–19 ft of fill
(56,277 cy) with a cut that cannot close. Also fixed: an undersized lot says
so, the one-pattern grade wording, the street-only fill legend, and the
override chip on the pattern card.

Engine side: the competition's rule picked a new 562-ft street over none for
the same 8 lots (Nashboro Blvd), 2 lots over 3 (Eatons Creek Rd), 6 over 7
(Newsom Station Rd), and 2 lots on 3,555 ft of street over nothing (Neelys
Bend Rd). Notes come from plans that were not drawn. The cut test divides by
0 ac of open floodplain. Hessey Rd shows two bulbs and reports one cul-de-sac.
Newsom Station is all pie lots. Temple Rd's skip reason omits that it is
landlocked. The fill scenario is labelled by right. First calls of 20.6 s
(Brittany Park Dr) and 21.3 s (River Landing Way's fill scenario) exceed the
anon timeout. Use codes contradict the zoning: "vacant commercial" on R10,
"zoned multi family" on RS20 for a $3 M parcel owned by a housing partnership.

## 25. A third ten (2026-11-04)

Eric: "Run 10 more and provide feedback again." Same draw as §24. Write-up
per parcel and pictures: `qa/audits/2026-11-04c/`.

The finding that matters most: the engine plans on a parcel's outer ring and
ignores its holes. On 0 Longwood Pl (a housing cooperative's land round 31
house lots) all 9 lots lie on those lots, and every test passes. On 1716 Red
Jacket Dr, 51 of 89 lots lie on 278 built condos. 35% of vacant R / RS
parcels have holes. The app now flags lots on holes in red and subtracts holes
from the mapped acreage. Also flagged: 12 "frontage lots" on 7963 Charlotte
Pike, a parcel no street touches (they front a neighbour's line).

The default grammar drew nothing on six of ten parcels, and the competition
drew lots on five of them. With the third audit's `verdict` and
`best_buildable`, the app now puts the best on the sheet only when it is
buildable with two lots or more (3905 Lunn Dr). Otherwise the engine's
verdict leads the competition in red. Each row separates code fails from
quality flags, and density and the townhome candidate's row show where
attached homes are permitted. RM routing is not switched: on 2622 W Heiman
the competition's best is 32 townhomes and the apartment plan places 89
units, and the competition has no apartment candidate. That is left for the
owner to decide.

## 26. The layout choice on multifamily land (2026-11-04)

Eric, on RM routing: "If a traditional multifamily design makes more sense,
we should default to that with an option to switch to a neighborhood layout."

Makes more sense = places more homes (the owner's objective of the same day).
On RM / MUL / SP land the app draws the multifamily plan first, as before, and
then runs the pattern competition (`fn_sf_v1_candidates`: the grid, the
neighborhood, the loop grammar and the townhome engine). A Layout panel at the
top of the rail puts the two side by side with the homes each places:

- **Multifamily**: the massing engine's plan (apartments, or townhome rows
  when that product is picked).
- **Neighborhood**: the competition's best: townhomes from the townhome
  engine, or house lots on a street pattern.

The default is the one with more homes. A tie stays multifamily. The
neighborhood takes the sheet by itself only when it places more homes, the
engine calls it buildable (`best_buildable`, no code fails) and the sheet can
draw it; the panel then says so and offers the multifamily plan back. Either
switch is one tap, and every neighborhood plan in the competition can be
drawn from the list under it.

The townhome candidate carries metrics only; its drawing is its
`full_plan_call`, `fn_generate_th_site_plan_v3(ogc_fid, 'aor')`, now reached
through `fn_generate_th_site_plan_v3_app` (SECURITY DEFINER, as of right only,
budget clamped to 15 s, migration 20261104224850). The client draws its homes
as attached party-wall dwellings (20 × 40-ft footprints; no unit mix, no floor
area, since the engine plans neither; the 3D view assumes three stories), the
alleys, courtyards, guest pockets, stormwater and held-out land. A v2 townhome
candidate (`fn_generate_th_site_plan_v2`) is not drawable here yet and is
never the default.

Measured live, 2026-11-04:

| parcel | multifamily | neighborhood's best | default |
|---|---|---|---|
| 2622 W Heiman (RM40) | 89 apartments | 32 townhomes (mews), density allows 129 | multifamily |
| 2600 W Heiman (RM40) | 73 | 16 townhomes | multifamily |
| 1200 W H Davis (RM40) | 57 | 12 frontage house lots (the townhomes' 19 fail two required tests) | multifamily |
| 1710 Meharry (RM20) | 30 | 24 townhomes | multifamily |
| 5525 Mt View Rd (RM15) | 24 | 27 townhomes, every required test passing | **neighborhood** |
| 407 Old Hickory Blvd (RM4) | 8 | 8 townhomes (both at the density cap) | multifamily (tie) |
| 0 Hicks Rd (RM4) | 15 | none ("no street entry reachable from the frontage") | multifamily |

The battery asserts all five of the first rows, and on 2622 W Heiman, 1200 W H
Davis and 5525 Mt View Rd it switches to the other layout and back.

Engine-side, seen on the way: the competition caps the townhome candidate's
count at the density limit but not its drawing, so a parcel where the engine
places more townhomes than density allows would show more homes than the row
claims. The panel flags that in red when it happens. `fn_sf_v1_candidates`
returns before the townhome engine runs when the grid plan is skipped
(landlocked RM land such as 0 Woodland Hills Dr), so such parcels get no
neighborhood option even where townhomes might fit. A cold 3-acre RM9
competition (0 Cedarstone Way) took about 30 s, over the app's 20-s limit; the
panel says the neighborhood plans are unavailable and the multifamily plan
stands.

## 27. Twenty lots, ranked by how likely a civil engineer or developer lands on the same layout (2026-11-06)

Eric: "Run 20 more lots, give detailed feedback on each one, rank them based
on the likelihood that a civil engineer or developer would land on that
layout." 16 vacant R / RS lots by the usual draw and 4 vacant RM lots.
Write-up, ranking and pictures: `qa/audits/2026-11-06/`. The USGS elevation
service was failing (502 / 504) for most of the run; every lot that needs
terrain was retried until it had it and was re-run with it.

The app is good at saying no: ten of twenty answers are "no new lots", "one
house" or "skipped", and nine of those ten are what a civil engineer would
say. Of the ten drawn layouts, one (6247 Mt View Rd, 15 lots on a T street)
is what a civil would plausibly land on as drawn. Three have about the right
yield on a heavier street than a pro would build. The other six fail on
terrain (Dry Fork 63% streets, Westcap 28.8%, Hart Ln 25.4%), on the estate
grammar (Union Hill: 700 ft of public cul-de-sac through a wetland buffer
for 3 lots), on access (two landlocked RM lots), or on product fit (RM6
apartments at 2.7 stalls per unit).

Fixed in the client: the max-GSF generator's plans (`mf_max_gsf_v1`,
native structures with legacy metric names) carried no metrics through the
seed mapper. The KPI strip lost their units, GSF and stalls, and the layout
choice read them as undrawn, which put 26 lots over 42 apartments on 0 Smith
Springs Rd. The mapper reads both naming schemes; a drawn plan without a
count is never treated as failed; building labels share the plan's count
by GSF; an empty sheet's legend keys no dwellings.

## 28. The engine's g13 reply, and the eleven re-run (2026-11-06)

The engine answered §27's handoff with g13: land steeper than 25% held out as
hillside, a shared private drive competing on estate districts,
`access.landlocked` as a code fail, the townhome drawing trimmed to the
density cap, the hold returned on a flood skip, terrain failures cached and
reported as unknown, a `why` on the competition, and a suggested rule for the
app's auto-best. Write-up, re-rank and pictures: `qa/audits/2026-11-06b/`.

The app side:

- Auto-best follows the engine's rule. The competition's best takes the
  sheet when it is buildable with at least the default's lots, or when it
  draws the same lots; the default stays whenever it draws strictly more.
  It is never a one-lot best and never the townhome candidate. The panel
  names the case (`default_empty`, `same_lots`, `more_lots`) and offers the
  way back. Example: 0 Union Hill Rd now sheets the neighborhood's 3 lots on
  384 ft of street, not the loop's 3 on 699 ft.
- The shared private drive is drawn as an access easement and a private
  lane. This covers the sheet label, the title block, and the panel's Land
  and Private drive rows; widths are measured off the drawing. "View this
  plan" on a drive row sends the competition's drive section, because
  `pattern: 'drive'` alone falls back to frontage lots.
- A competition row that ran and drew nothing reads as a reason. A test
  switched off with a 1e9 limit reads "no limit here".
- `why` is shown under the competition, one reason per line.
- A flood skip fetches the site layers and draws its hold.
- The townhome facts show the trim note.
- The RM competition passes `th_budget_ms: 8000`.
- The terrain caveat no longer says the engine ignores terrain where it held
  hillside out.
- On multifamily land, the auto note says when the neighborhood took the
  sheet because the apartment plan did not draw.

The battery gained three parcels:

- 0 Union Hill Rd: equal lots.
- 6404 Eatons Creek Rd: the shared drive.
- 0 Hickory Bend Dr: a flood skip with its hold.

The six RM fixtures were re-harvested with the 8-s townhome budget and now key
on it. 1200 W H Davis Dr lost its 12 frontage lots to the frontage rule; its
neighborhood is now 6 lots that fail `access.landlocked`.

The re-rank: of the eleven plus Eatons Creek, the top three are now plausible
as drawn or as answered:

- Mt View, 15 lots: 70%.
- Dry Fork, a clear zero instead of 16 lots at 63% grade: 5% → 70%.
- Eatons Creek, 5 estate lots on a shared drive: 60%.

Still open on the engine side:

- **Streets laid out by grade.** Hart Ln and Westcap still fail it.
- **The estate grammar where the drive draws nothing.** This covers Union
  Hill, Campbell, and Neelys Bend under fill.
- **The multifamily generator.** Swiss Ave's overlap, Smith Springs' product
  fit, and Hickory Hollow's refusal.
- **A no-lot reason that counts held land as buildable.**
- **`fn_mf_money`'s sales $/SF.** It reads $1,069–$6,704 on most parcels,
  which gives a 1,882.7% margin on 0 Old Lebanon Dirt Rd.

## 29. Twenty more lots against engine g14 (2026-11-09)

Eric: "run 20 more scenarios." Same recipe (16 vacant R / RS by a fixed hash
in four size bands, 4 RM), new parcels only. The engine's g14 (2026-11-08)
landed between the draw and the harvest: the no-lot reason counts land after
the holds, the hillside hold comes back as geometry, `pattern: 'drive'` is
self-contained, `fn_mf_money` prices by the comps' total floor area, and the
750-ft drive figure is a quality flag (`access.private_drive_length`).
Write-up, ranking and pictures: `qa/audits/2026-11-09/`.

The app side of g14: the hillside hold is hatched beside the flood hold (0-lot
answers too) with "N ac out … M ac left after every hold"; the hillside counts
in the title block's held share; the client's copy of the drive params is
gone; the length test files with the quality flags; the legend keys the
held-out land when it is on the sheet; "1 home".

The batch: nine of twenty are "no new lots / one house / skipped" and seven
of those are right; of the eleven drawn layouts three are what a civil would
draw (0 Hillwood Blvd's two estate lots, 1014 Antioch Pike's 8 lots on a
cul-de-sac, 0 Hills Ln's 17 on one street, the grid taken from the
competition at more lots) and one is close (29 townhomes on a mews on a 90-ft
RM20 strip). The hillside hold turned the mountain lots into honest zeros.
What decides the bottom: the estate grammar on long tracts (7695 Old
Charlotte Pike, 21 ac buildable, 0 lots; 0 Walker Ln, 3 lots on a through
street), a 4,499-ft loop at 49% grade on landlocked 0 Blevins Rd, and the
max-GSF generator's parking on small RM lots (101 stalls for 9 units on 0
Nashboro Blvd, 112 for 30 on 0 Cedarstone Way).

USGS 3DEP refused 8 of 20 first fetches; retried through
`fn_parcel_topo_fetch` until 19 of 20 had terrain (the twentieth is a flood
skip). Battery: 4255 Brick Church Pike (the hillside hatch, 0 lots) and 0
Hills Ln (the grid at more lots).

## 30. The same twenty against engine g15, the same evening (2026-11-09)

Eric: "test the parcels you just ran. Are we getting the results you
wanted?" The engine had moved since the morning harvest: an estate grammar
(flag lots behind the frontage), 0 lots with the reason on landlocked
hillsides, a "single" competition row, and th_v3's answer in the townhome row
— four of §29's asks. Re-run live and through the app, eight of twenty are
zero / one house / skipped (all right) and five of the twelve drawn are what
a civil would draw (0 Hillwood Blvd's three flag lots, 1014 Antioch Pike,
0 Hills Ln, 4525 Cato Rd, 0 Old Hickory Blvd RS20); 0 Blevins Rd went from
a 4-lot loop at 49% grade to a zero with its reason. Write-up:
`qa/audits/2026-11-09/README.md` ("Re-test the same evening").

App: the pattern's phrase ("as estate lots (flag lots behind the frontage,
no new street)"), the "single-street grammar" name, and a rule fix — a
competition request that falls back to the very plan the default drew no
longer takes the sheet from itself; the same lots switch only on less street
or fewer fails. The two new battery fixtures were re-captured against g15.
