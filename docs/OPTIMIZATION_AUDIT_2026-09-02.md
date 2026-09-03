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
| 2400 W Heiman (MDHA, R6, 13.15 ac) | ROW-spine subdivision with rear alleys — precedent: MDHA 08/21, 08/30 | **not yet** — strip slicing, no street network |
| 2405 12th Ave S (CS) | Retail full plate (alt: stacked two-tenant) — precedent: Bradley single/two-tenant | **not yet** — no retail generator |
| 55 Music Sq E · 1917 Broadway (ORI · MUI-A) | Podium parking, liner units, tower above | **not yet** — surface frontier |
| 2600 W Heiman · 2622 W Heiman (RM40, ≥2.2 aspect / ≥3 ac) | Perpendicular bars framing courts | **not yet** — seed draws one S-form bar; courts live in the search core |
| 1200 W H Davis (landlocked) | Axis bar, easement access | follows |
| 1710 Meharry (RM20, 1.76 ac) | Bar on the frontage, field behind | follows |
| 303 E Palestine (RS10) | One house on the lot | follows |

**What it does not do yet:** the generators do not *consume* the pattern.
That is the engine-lane build in priority order: (1) the subdivision
generator (street spine, blocks, alleys, lot depth, floodplain carve —
acceptance: the MDHA sheets), (2) a structured-parking frontier and a podium
composition for `podium_tower` parcels, (3) the court parti in the seed,
(4) retail massing. Until then the layer is a promise the product states out
loud, with the precedent that proves it, instead of a box in the corner.

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
subdivision land it produces lot counts without producing lots. The data
gap that made a fifth of the universe compile with no caps is closed; the
frontier now confesses its parking assumption and publishes the podium
ceiling; the two generator problems are named with their acceptance cases.
