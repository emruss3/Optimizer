# Cohort re-run on engine g16 · 2026-11-10

Eric: "rerun the parcels … look at them vs. the previous run, analyze the
visual output and rank it against the likelihood a civil engineer and the
best developer would come up with the same answer. Provide detailed context
engine updates to hand off."

The engine handoff is [ENGINE_HANDOFF.md](ENGINE_HANDOFF.md). This page is
the comparison, the ranking of all 70 parcels and the sheets.

## The number

| | g15 (11-09) | g16 (11-10) |
|---|---|---|
| Plans where a civil would draw one | 18 of 40 | **19 of 40** |
| Refusals where nothing belongs | 25 of 30 | **26 of 30** |
| Mean likelihood, plans judged in both runs | 46.9 | 46.7 |
| Mean likelihood, refusals judged in both runs | 67.4 | 65.6 |
| Mean likelihood, all 40 plans / all 30 refusals | | 43.6 / 68.8 |
| Plans at 60 or better | | 11 of 40 |

The cohort is 70 parcels (40 where something should be drawn, 30 where
nothing new belongs). g16 is the engine at migration `20261109155542
sf_v1_civil_cohort`, which landed six minutes after the g15 baseline. It
fixed two parcels, changed ten more without changing their verdict, and
raised an error on one. The likelihood did not move: the gains (Harpeth Ln
25 → 70, Westcap Rd 25 → 55, Old Hickory Blvd R40 55 → 80) are offset by
the losses (Dry Fork Rd 70 → 5, Old Hickory Blvd RS20 60 → 40, Mt View Rd
70 → 55, Carothers Rd 50 → 35, 8192 Charlotte Pike 15 → 0).

Why it is flat: 14 of the 21 plan misses are the same problem, the land
behind the first tier of lots, and this release did not address it. Three
more are hillside streets that fail grade and four are apartments where
attached homes are the product.

## How it was read

Each parcel's live answers were harvested through SQL (the plan, the
competition, the site, terrain, and on RM the multifamily and townhome
runs), scored with `scripts/engine-cohort/score.mjs` against the g15
baseline, then driven through the app on a local build against those
answers. Every plan sheet was screenshotted and read as a plan: lot shapes,
where the street goes and what it crosses, what is left over, whether the
houses fit. The likelihood (0–100) is one reader's judgment on the scale
used in batches 1–4. A parcel whose answer did not change keeps its earlier
figure, so only real changes move the mean; "—" means the parcel had no
earlier figure and this is its first read. The sandbox cannot reach the
production app, so nothing here is a statement about the deployed build.

## The ranking

"Cohort" is the scorer's verdict against the target; the likelihood is the
visual read. They differ where a plan is in range and passes the tests but
is not what anyone would build (3905 Lunn Dr), or misses the range and is
still a sound answer (0 Westcap Rd).

### Plans (40): something should be drawn

| # | Parcel | On the sheet now | Cohort | Likelihood | Read |
|---|---|---|---|---|---|
| 1 | 0 Hillwood Blvd · RS40 · 2.85 ac (679618) | 3 estate lots | pass | 85 → **85** | Right. |
| 2 | 1014 Antioch Pike · R8 · 2.8 ac (667638) | 8 lots on a cul-de-sac | pass | 75 → **75** | One more lot than g15; pie lots round the bulb. |
| 3 | 0 Old Hydes Ferry Pike · RS20 · 1.37 ac (679683) | 2 estate lots | pass | 75 → **75** | A front lot and a flag lot. |
| 4 | 0 Nashboro Blvd · R10 · 3.46 ac (672524) | 8 frontage lots | pass | — → **70** | Eight lots off the boulevard, no street. Lot 2 is 43,657 SF beside 15,700-SF neighbours. |
| 5 | 0 Longwood Pl · R20 · 4.41 ac (681024) | 10 lots on a cul-de-sac | pass | — → **70** | A clean 520-ft cul-de-sac, 100 x 200 lots both sides. |
| 6 | 0 Hills Ln · R10 · 6.62 ac (680391) | 17 lots on one street | pass | 70 → **70** | A straight street with 70 x 145 lots both sides. (The sheet showed the 14-lot default until the app stopped depending on best_requested.) |
| 7 | 605 Harpeth Ln · RS40 · 5.18 ac (660683) | 1 lot, the parcel | pass (was miss) | 25 → **70** | FIXED: was one lot on a 744-ft public street at 17.7%. One house and a 622-ft driveway. |
| 8 | 6404 Eatons Creek Rd · R40 · 9.02 ac (661661) | 5 estate lots (2 flag) | pass | 60 → **60** | Three frontage lots and two 2.8-ac flag lots on poles. Plausible. |
| 9 | 0 Ridgewood Rd · RS80 · 6.33 ac (680408) | 0 lots, landlocked | pass | — → **60** | Acceptable here. |
| 10 | 0 Hickory Hollow Pkwy · RM20 · 1.95 ac (673710) | 29 townhomes on a mews | pass | 60 → **60** | Four rows on a drive loop. |
| 11 | 4525 Cato Rd · RS15 · 2.14 ac (661303) | 2 lots on a 250-ft public street | pass | 65 → **60** | A street and bulb through the wetland buffer for two lots. |
| 12 | 6247 Mt View Rd · RS10 · 6.9 ac (666092) | 16 lots on one street | pass | 70 → **55** | Lost the T: one connection now, a 13.3% station, 21% unassigned wedges in the north half. |
| 13 | 0 Swiss Ave · RM15 · 4.1 ac (679911) | 36 townhomes on a street | pass | 55 → **55** | The multifamily plan (60 units) fails the app's geometry gate (a building overlaps a drive), so the townhomes are the sheet. |
| 14 | 0 Westcap Rd · R15 · 10.6 ac (679820) | 6 frontage lots | miss | 25 → **55** | Improved: was 8 lots on a street at 27%. Six clean lots off Westcap Rd, hillside held; two of the six are double-size. |
| 15 | 0 Neelys Bend Rd · RS40 · 18.91 ac (679830) | 2 lots on a shared drive | miss | — → **50** | Improved: was 3 lots on 1,864 ft of public street. A 1,892-ft drive up the panhandle to two houses; 3-4 fit on the bench. |
| 16 | 0 Stewarts Ferry Pike · RS15 · 3.3 ac (679617) | 4 lots on a cul-de-sac | pass | 50 → **50** | Four lots round a bulb; the fourth is a 47,871-SF tail. |
| 17 | 0 Clovernook Dr · RS10 · 1.17 ac (673567) | 2 frontage lots | miss | 55 → **50** | A 10,000-SF lot and a 34,138-SF remainder; three fit. |
| 18 | 0 Old Hickory Blvd · R15 · 5.51 ac (679273) | 1 lot, the parcel | miss | — → **45** | 68% over 25%; one house with a 323-ft driveway. The target (3-9) is optimistic for this strip. |
| 19 | 0 Hart Ln · R10 · 35.0 ac (680596) | 76 lots on a loop (fails grade) | miss | 45 → **45** | The engine now offers a 50-lot terrace plan that holds 9.2% and passes; the sheet keeps the 76-lot loop at 23.4% because it draws more lots. |
| 20 | 0 Hessey Rd · RS10 · 5.8 ac (679226) | 8 lots on a 465-ft cul-de-sac | miss | — → **40** | Holds grade now (9.2%). Lot 1 is an 80,327-SF remainder round the wetland; a civil gets 10-12. |
| 21 | 7963 Charlotte Pike · R40 · 16.95 ac (667802) | 0 lots, landlocked | miss | — → **40** | Both the plan and fn_parcel_frontage say landlocked; on 11-04 the engine drew 12 frontage lots. One of the two is wrong: see the handoff. |
| 22 | 0 Poplar Creek Rd · RS15 · 2.5 ac (677645) | 4 lots (grid) | pass | 40 → **40** | A street and bulb for four lots; a private drive is likelier. |
| 23 | 0 Campbell Rd · RS80 · 17.8 ac (680202) | 1 lot, the parcel | miss | 40 → **40** | 66% over 25%; one house with a 1,211-ft driveway. Two to four on a shared drive is the target. |
| 24 | 0 Old Hickory Blvd · RS20 · 5.27 ac (673844) | 3 lots (grid) | pass | 60 → **40** | The default fell to "the parcel as one lot" (was 4 lots on a street); the grid's 3 lots reach across the flood hold, and two house footprints nearly touch. |
| 25 | 0 Homeland Dr · RS40 · 9.02 ac (674961) | 5 lots on a 1,378-ft public street | pass | — → **35** | Regressed in kind: g15 sheeted 5 lots on a shared drive. Now a Y street with three connections, 18% of the site in right-of-way, a 16.9% station and a 155-ft wetland crossing, for five estate lots. |
| 26 | 0 Newsom Station Rd · R80 · 27.25 ac (675128) | 4 estate lots | miss | — → **35** | Four equal 6.8-ac lots stacked up a ridge at 28% slope, no drive drawn to three of them. |
| 27 | 0 Union Hill Rd · RS40 · 7.6 ac (680001) | 4 lots (grid) | pass | 35 → **35** | A 644-ft L street from a 46-ft frontage to four RS40 lots; a shared drive does this. |
| 28 | 7695 Old Charlotte Pike · R80 · 45.9 ac (692464) | 8 lots on a 3,184-ft street | miss | 35 → **35** | The right idea (lots along the bench) on the wrong standard: fails dead end, block and grade as a public street. |
| 29 | 0 Carothers Rd · RM9 · 4.73 ac (673509) | 42 apartments | miss | 50 → **35** | The bays hold 206 stalls where the summary says 63; townhomes at 36-42 is the product. |
| 30 | 8282 Charlotte Pike · R40 · 11.87 ac (659670) | 3 estate lots | miss | 35 → **35** | Two front lots and a 10-ac flag lot whose house sits at the far end of a 1,900-ft pole through held hillside. |
| 31 | 3905 Lunn Dr · RS15 · 2.11 ac (680860) | 3 lots on a 365-ft street | pass | — → **30** | A public street along the north line to a bulb, 23.6% of a 2-ac site in right-of-way; two house footprints touch. Two or three flag lots off Lunn Dr is the civil answer. |
| 32 | 0 Nashboro Blvd · RM6 · 1.66 ac (670783) | 9 apartments | miss | 30 → **25** | Ninety-nine stalls for nine units. |
| 33 | 0 Walker Ln · RS20 · 5.5 ac (676829) | 3 lots on a 955-ft street | miss | 25 → **25** | Three connections and an 11.6% station for three lots; a 500-ft cul-de-sac takes 5-7. |
| 34 | 0 Smith Springs Rd · RM6 · 7.0 ac (670533) | 42 apartments | miss | 20 → **20** | One bar with 106-113 stalls for 42 units on RM6 land; townhomes at the cap is the product. |
| 35 | 0 Cedarstone Way · RM9 · 3.37 ac (676422) | 30 apartments | miss | 20 → **20** | 110 stalls for 30 units on a 17.6% slope. The by-right side now calls the parcel landlocked; fn_parcel_frontage says it is not. |
| 36 | 0 Brittany Park Dr · RS20 · 29.0 ac (678964) | 29 lots on a loop | miss | — → **15** | Fails grade (26.4% over 1,800 ft) and block length; streets cross the held hillside. |
| 37 | 1019 Hitt Ln · R20 · 21.61 ac (659655) | 1 lot, the parcel | miss | — → **15** | 21.7 ac drawn as one lot with a 3,716-ft driveway; the 10-ac western block takes a street. |
| 38 | 3345 Pugh Rd · RS80 · 28.14 ac (380818) | 3 lots on a 743-ft public street | miss | — → **15** | Three houses at the mouth of 28 flat acres (3.4% mean slope); 74% left open. |
| 39 | 1716 Red Jacket Dr · R10 · 38.68 ac (681357) | 76 lots on two loops | miss | — → **10** | Fails grade (25.8% over 2,700 ft); 22.6% right-of-way; slivers between streets. |
| 40 | 8192 Charlotte Pike · R40 · 31.63 ac (668277) | engine error | miss | 15 → **0** | fn_sf_v1_plan raises "division by zero" (fn_sf_v1_strip line 84). g15 drew 2 lots. |

### Refusals (30): nothing new belongs

| # | Parcel | On the sheet now | Cohort | Likelihood | Read |
|---|---|---|---|---|---|
| 1 | 0 Temple Rd · RS40 · 2.78 ac (677010) | skipped: floodplain | pass | — → **95** | Nothing, with the reason and the hold drawn. |
| 2 | 0 Newsom Station Rd · R40 · 19.67 ac (677706) | skipped: floodplain | pass | 95 → **95** | Right. |
| 3 | 0 Couchville Pike · RS80 · 1.43 ac (676960) | 0 lots | pass | — → **90** | Smaller than one RS80 lot; said so. |
| 4 | 0 River Landing Way · R15 · 15.39 ac (676430) | skipped: floodplain | pass | — → **90** | Nothing; the fill scenario stays an override. |
| 5 | 6438 Old Clarksville Pike · RS40 · 1.4 ac (667565) | 1 lot, the parcel | pass | — → **90** | One house on the lot of record. |
| 6 | 6211 Brownlee Dr · RS40 · 1.2 ac (424990) | 1 lot, the parcel | pass | 90 → **90** | Right. |
| 7 | 4819 Fairmeade Ct · RS40 · 1.25 ac (661591) | 1 lot | pass | 90 → **90** | Right. |
| 8 | 0 Penn Meade Way · RS10 · 6.6 ac (677281) | skipped: floodplain and landlocked | pass | 90 → **90** | Right. |
| 9 | 3730 Homeland Dr · RS40 · 1.6 ac (667183) | 1 lot, the parcel | pass | 85 → **85** | Right; the hillside is held. |
| 10 | 5014 Buena Vista Pike · RS15 · 1.1 ac (661271) | skipped: floodplain | pass | 85 → **85** | Right. |
| 11 | 54 Park Crescent Cir · R15 · 1.52 ac (659921) | 1 lot, the parcel | pass | 85 → **85** | Now one house with a 31-ft driveway (was "no lot fits"): the better answer. |
| 12 | 0 Drakes Branch Rd · RS40 · 12.22 ac (677593) | 0 lots, landlocked | pass | 85 → **85** | Right. |
| 13 | 0 Larkin Springs Rd · RS10 · 23.0 ac (680721) | skipped: floodplain | pass | 80 → **80** | Right. |
| 14 | 4255 Brick Church Pike · R20 · 4.09 ac (686430) | 1 lot | pass | 80 → **80** | Right. |
| 15 | 1422 Campbell Rd · R20 · 17.3 ac (665951) | 0 lots, landlocked | pass | 80 → **80** | Right. |
| 16 | 0 Old Hickory Blvd · R40 · 3.21 ac (673175) | 0 lots, landlocked | pass (was miss) | 55 → **80** | FIXED: was 2 lots on a street with access.landlocked failing. |
| 17 | 0 Blevins Rd · RS20 · 31.8 ac (670893) | 0 lots, landlocked | pass | 80 → **80** | Right. |
| 18 | 70 Hillenglade Dr · RS20 · 5.77 ac (661326) | 0 lots, landlocked | pass | 80 → **80** | Right. |
| 19 | 810 Due West Ave N · RS20 · 1.48 ac (666615) | 1 lot | pass | 75 → **75** | Right. |
| 20 | 0 Gulch St · RS7.5 · 2.4 ac (680528) | skipped: floodplain | pass | 70 → **70** | Right. |
| 21 | 0 Robinson Rd · R10 · 31.0 ac (680785) | skipped: floodplain | pass | 70 → **70** | Right. |
| 22 | 0 Abbott Martin Rd · R20 · 10.76 ac (681029) | 1 estate lot | pass | — → **60** | A house on a co-op common area: the engine cannot know the ownership. |
| 23 | 415 Eagle Rdg · R15 · 2.9 ac (692658) | 0 lots, "landlocked" | pass | 65 → **60** | Right count, wrong reason: fn_parcel_frontage says it has frontage; one house on a hillside is the answer. |
| 24 | 0 Hickory Bend Dr · RS10 · 5.3 ac (672526) | skipped: floodplain | pass | 60 → **60** | Right; Zone A with no BFE needs a study. |
| 25 | 1430 Neelys Bend Rd · RS80 · 8.4 ac (395417) | 0 lots | pass | 50 → **50** | Right; 1.25 buildable ac under the RS80 lot. |
| 26 | 0 Old Lebanon Dirt Rd · RM9 · 4.9 ac (679195) | 38 apartments (multifamily) | miss | 35 → **30** | Landlocked: the by-right side refuses, the multifamily run still draws an L bar and 68 stalls. |
| 27 | 0 Hicks Rd · RM4 · 4.07 ac (673974) | 14 apartments (multifamily) | miss | 20 → **20** | Landlocked and 28% slope; the multifamily run draws. |
| 28 | 0 Todd Preis Dr · RM9 · 10.45 ac (675099) | 94 apartments, flagged a what-if | pass | 5 → **10** | The engine still draws 94 units on 9.9 ac of flood hazard area; only the app holds it out as a what-if. |
| 29 | 0 Hickory Hollow Pkwy · RM20 · 1.7 ac (678148) | 9 apartments (multifamily) | miss | 5 → **5** | A 54-ft landlocked strip; the bar is drawn across neighbours' buildings. |
| 30 | 0 Dry Fork Rd · RS40 · 31.0 ac (679540) | 4 lots on a loop | miss | 70 → **5** | A 2,653-ft loop at 59% through 25 ac of held hillside. g13 refused this. |

## The sheets

Fixed and improved:

| | |
|---|---|
| ![679820](679820.png) 0 Westcap Rd: six frontage lots, hillside held (was 8 lots on a street at 27%) | ![679830](679830.png) 0 Neelys Bend Rd: two lots on a shared drive up the panhandle |

Sound plans:

| | |
|---|---|
| ![680391](680391.png) 0 Hills Ln: 17 lots on one street | ![681024](681024.png) 0 Longwood Pl: 10 lots on a cul-de-sac |
| ![679618](679618.png) 0 Hillwood Blvd: 3 estate lots | ![661661](661661.png) 6404 Eatons Creek Rd: three frontage lots and two flag lots, poles drawn as access strips |
| ![673710](673710.png) 0 Hickory Hollow Pkwy: 29 townhomes on a mews | |

In range, not what a developer builds:

| | |
|---|---|
| ![674961](674961.png) 0 Homeland Dr: 1,378 ft of public street for five estate lots | ![680860](680860.png) 3905 Lunn Dr: a street and bulb for three lots, two footprints touching |
| ![666092](666092.png) 6247 Mt View Rd: the T is gone, the north half unassigned | ![673844](673844.png) 0 Old Hickory Blvd RS20: lots across the flood hold |

The land behind the first tier:

| | |
|---|---|
| ![380818](380818.png) 3345 Pugh Rd: three houses at the mouth of 28 flat acres | ![659670](659670.png) 8282 Charlotte Pike: a 10-ac flag lot on a 1,900-ft pole |

Hillside:

| | |
|---|---|
| ![680596](680596.png) 0 Hart Ln, the default: 76 lots on a loop at 23.4% | ![680596 terrace](680596_terrace.png) 0 Hart Ln, the terrace plan: 50 lots at 9.2%, passes |
| ![678964](678964.png) 0 Brittany Park Dr: streets across the held hillside | ![679540](679540.png) 0 Dry Fork Rd: a loop at 59% where g13 refused |

Multifamily, and the error:

| | |
|---|---|
| ![670783](670783.png) 0 Nashboro Blvd RM6: 99 stalls for nine units | ![679195](679195.png) 0 Old Lebanon Dirt Rd: 38 units on landlocked land |
| ![668277](668277_engine_error.png) 8192 Charlotte Pike: the engine's division by zero, shown as an engine error | |

## What changed in the app

Found while reading the sheets, fixed in the same PR:

- **Flag lots were mislabelled.** The rule from the last release ("lot
  polygons past the lot count are access strips") drew the second flag
  lot's body as a grey strip and a pole as "Lot 5" on 6404 Eatons Creek
  Rd. The engine sends each flag lot as one member holding a body and a
  pole; the app now reads lots by member, draws the pole as "Access strip
  · lot N" and keeps the houses aligned to their lots.
- **The best plan stopped reaching the sheet.** The engine returns
  `best_requested` as null on every parcel in g16, and the auto-best rule
  keyed on it, so 0 Hills Ln fell from the 17-lot grid to the 14-lot
  default with no message. The app (and the scorer) now work the grammar
  out from the best plan's pattern and lot count.
- **An engine error is shown as one.** 8192 Charlotte Pike raises
  "division by zero" inside the generator. The panel says so, the header
  chip reads "Generator error · no plan", and nothing is substituted
  (before, the legacy generator ran in its place). Timeouts and network
  misses keep the existing retry path.
- The terrace grammar has a name in the panel ("a hillside street with
  arms").
- Scorer: an engine error is a miss with the message; one lot with no
  fails passes a target whose range starts at one (605 Harpeth Ln). The
  g15 baseline scores the same under the new scorer (18 of 40, 25 of 30).

## One decision for the owner

0 Hart Ln now has a passing plan (50 lots on terraces at 9.2%) beside the
default that fails grade (76 lots on a loop at 23.4%). The app keeps the
default on the sheet whenever it draws strictly more lots; that rule was
deliberate (g13) and is covered by tests, so it was left alone. Sheeting a
buildable best over a default that fails a code test would put the
terrace plan up on Hart Ln. It is a one-line rule change if wanted.

## Files

- `ENGINE_HANDOFF.md`: the handoff for the engine side.
- `ranking.json`: every parcel with previous and current likelihood, what
  is on the sheet, and the read.
- `scripts/engine-cohort/runs/2026-11-10_g16.json`: the scoreboard.
