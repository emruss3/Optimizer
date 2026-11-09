# Ten random parcels, with detailed engine feedback — 2026-11-09 (batch 4)

Eric: "Run 10 more random parcels, and give detailed engine feedback." Same
recipe as the earlier batches, against the engine's g15 release (the one the
evening re-test of batch 3 found) and the app on `main` after PR #121.

## The draw

Vacant parcels by a fixed hash with a new salt (`:batch4`), every id used in
an earlier batch or the battery excluded (105 ids), the usual non-site
owners excluded (associations, owners in common, co-ops, churches, public
and institutional owners, lots appraised under $5,000). Two per size band
for R / RS (1–2.5, 2.5–6, 6–15, 15–60 ac) and two RM. The RM draw skipped a
church (Awake Nashville) and a townhome common-area remnant (O.I.V. Woodlea
Place Townhomes Ph 2) before settling on two.

| # | Parcel | Zoning | Mapped ac | Shape | Frontage | Hazards | Terrain |
|---|---|---|---|---|---|---|---|
| 673567 | 0 Clovernook Dr | RS10 | 1.17 | 200 × 423 ft | Clovernook Dr, 202 ft | none | 13% mean, 31% max |
| 666615 | 810 Due West Ave N | RS20 | 1.48 | 155 × 507 ft | Due West Ave, 109 ft (68 ft usable) | none | 16% mean, 34% max |
| 661326 | 70 Hillenglade Dr | RS20 | 5.77 | 650 × 774 ft | none by the fabric (see below) | none | 34% mean, 69% max; 4.6 ac over 25% |
| 660683 | 605 Harpeth Ln | RS40 | 5.18 | 509 × 817 ft | a 9-ft pole to Ole Harpeth Ln | wetland buffer 1.6 ac | 24% mean, 47% max; 2.9 ac over 25% |
| 659670 | 8282 Charlotte Pike | R40 | 11.87 | 249 × 2,156 ft strip | Charlotte Pike, 266 ft | none | 24% mean, 52% max; 7.1 ac over 25% |
| 677593 | 0 Drakes Branch Rd | RS40 | 12.22 | 958 × 1,023 ft | none | none | 23% mean, 64% max; 6.0 ac over 25% |
| 668277 | 8192 Charlotte Pike | R40 | 31.63 | 933 × 2,941 ft | Charlotte Pike, 567 ft | creek buffer | 27% mean, 63% max; 20.5 ac over 25% |
| 677706 | 0 Newsom Station Rd | R40 | 19.67 | 1,054 × 1,333 ft | Newsom Station Rd, 1,850 ft | 19.2 ac SFHA, 18.5 ac floodway | 5% mean |
| 673509 | 0 Carothers Rd | RM9 | 4.73 | 289 × 742 ft | Carothers Rd 766 ft, Battle Rd 291 ft | pond 0.14 ac (0.27 ac no-build) | 12% mean, 28% max |
| 675099 | 0 Todd Preis Dr | RM9 | 10.45 | 566 × 1,523 ft | Todd Preis Dr, 576 ft | 9.9 ac SFHA, 3.1 ac floodway, 0.4 ac wetland | 8% mean |

**Terrain.** USGS 3DEP was down for about 25 minutes of the run: 7 of the
first 10 fetches came back `usgs_3dep_unavailable` (502s, 504s and the
engine's 12-s timeout), and every retry failed for 15 minutes. The seven were
harvested without terrain so the app drive could start, then re-harvested
with it as the tiles came back; **every answer below is graded with
terrain.** The two Charlotte Pike tracts were the last to fetch, and the
31-ac one took longer than the 58-s statement limit of the harvest while
USGS was slow (a 20-s anonymous call would never get it). The no-terrain
answers were materially different: 8192 Charlotte Pike drew 17 lots without
terrain and 2 with it; 0 Carothers Rd 25 and 20; 8282 Charlotte Pike kept its
3. The engine marks a no-terrain plan in its notes and the app shows the
note, so nothing was presented as graded that was not.

**Timings** (warm terrain): by-right plans 0.2–1.1 s; competitions 0.2–2.2 s
on R / RS and 5.8 s on the 31-ac tract; the RM competition 2.0 s with the
townhome search inside it; the multifamily plan 1.5–2.6 s; the fill
scenario 0.6–1.5 s.

## The ranking

"Likelihood" means: a competent civil engineer or developer, given the same
parcel, lands on substantially the same answer — the same product, a yield
within about 20%, and the same street concept. It scores the answer the app
shows by default.

| # | Parcel | Default answer | Likelihood |
|---|---|---|---|
| 1 | 0 Newsom Station Rd (R40, 19.7 ac) | skipped: the floodplain leaves no buildable piece (19.2 ac held; the fill scenario finds 0.02 ac after the holds) | 95% |
| 2 | 0 Drakes Branch Rd (RS40, 12.2 ac) | 0 lots: landlocked, and 6.0 of 12.2 ac over 25% | 85% |
| 3 | 70 Hillenglade Dr (RS20, 5.8 ac) | 0 lots: landlocked, and 4.6 of 5.8 ac over 25% | 80% |
| 4 | 810 Due West Ave N (RS20, 1.5 ac) | 1 estate lot (the parcel), all tests pass | 75% |
| 5 | 0 Clovernook Dr (RS10, 1.2 ac) | 2 frontage lots (17,096 SF and a 34,138-SF remainder), all pass | 55% |
| 6 | 0 Carothers Rd (RM9, 4.7 ac) | 42 apartments (−61% margin on cost) over 20 house lots; the townhome row's 42 fail `alley.street_to_street` | 50% |
| 7 | 8282 Charlotte Pike (R40, 11.9 ac) | 3 estate lots: two 41,000-SF frontage lots and one 9.96-ac flag lot (4 ac buildable) | 35% |
| 8 | 605 Harpeth Ln (RS40, 5.2 ac) | 1 lot on a 744-ft public cul-de-sac at 17.7% grade, 481 ft through the wetland buffer; 2 fails | 25% |
| 9 | 8192 Charlotte Pike (R40, 31.6 ac) | 2 lots on a 1,414-ft cul-de-sac at 24% grade, 1,091 ft through the creek buffer; 4 fails (the drive draws 4, also failing) | 15% |
| 10 | 0 Todd Preis Dr (RM9, 10.5 ac) | 94 apartments in four bars on 9.9 ac of flood hazard area (3.1 ac floodway); the by-right side skipped for the floodplain | 5% |

Three of ten are zero / skipped and all three are right. Of the seven drawn,
one is what a civil would draw (Due West Ave N), one is close (Clovernook Dr,
one lot short), and five are not. A harder draw than batch 3: two Charlotte
Pike hillside tracts, a floodway, two landlocked hillsides. What decided the
bottom half is not new land, it is three rules: the remainder lot, a street
for one lot, and a multifamily generator that does not hold the floodplain
out.

## Lot by lot

### 1 · 0 Newsom Station Rd (677706) — R40, 19.7 ac mapped, appraised $51,469
19.2 of 19.7 ac in the SFHA and 18.5 ac of it floodway, 4.8% mean slope, a
riverine wetland along the north edge. The engine skips ("floodplain leaves
no buildable piece"); the app hatches the hold over the whole site, offers
the one house it carries and the fill scenario. The fill scenario (floodway
only held) finds 1.1 ac of site, 1.0 ac of it over 25% (the bank), 0.02 ac
left: no lot. Right on every count.

### 2 · 0 Drakes Branch Rd (677593) — RS40, 12.2 ac mapped, 11.0 deeded
No road within 60 ft of any edge; 23% mean slope, 64% max; 6.0 ac over 25%.
0 lots with the reason ("landlocked … and 6.0 of the 12.21 ac is steeper
than 25%"), `access.landlocked` failing, the hillside hatched. A developer
with an easement would get 4–6 lots on a drive along the 6 ac left; without
one this is the answer.

### 3 · 70 Hillenglade Dr (661326) — RS20, 5.8 ac mapped, appraised $94,900
The engine says landlocked. TIGER has a "Hillenglade Dr" centerline touching
the parcel for 154 ft, so the call was checked against the parcel fabric:
the five neighbors share 2,380 ft of boundary against a 2,379-ft perimeter
(no right-of-way gap anywhere), and the centerline's midpoint lies inside
parcel 484926 (30 Hillenglade Dr, a house lot). It is a private lane. The
engine is right by the fabric. What the fabric also shows: four of the five
neighbors (60, 71, 51 and 61 Hillenglade Dr, all "vacant rural land") belong
to the same owner, Dovecote-Hillenglade LLC. This parcel is one piece of an
assemblage, and the assemblage reaches the lane. 34% mean slope, 69% max,
4.6 ac over 25%, 1.16 ac left: the zero is right for the parcel; the
engine could say "the adjoining land under the same owner reaches Hillenglade
Dr" (ask 8).

### 4 · 810 Due West Ave N (666615) — RS20, 1.5 ac, 155 × 507 ft
68 ft of usable frontage on a 155-ft-wide, 507-ft-deep lot; 16% mean slope
with 95 ft of fall. One estate lot, the parcel, all tests pass; arithmetic
says 1. The engine's note: "estate lots on 1.48 ac touching 68 ft of
frontage: 1 with frontage." A front lot cannot meet the 100-ft module on 68
ft of frontage, so no second tier hangs behind it. A civil would try a
flag-lot split (front house, 20-ft pole, 1-ac lot behind) and probably be
told the same thing. Right.

### 5 · 0 Clovernook Dr (673567) — RS10, 1.2 ac, 200 × 423 ft, 202 ft of frontage
Two frontage lots: a 70 × 145-ft standard lot of 17,096 SF and a 34,138-SF
"estate" lot that is everything else. Arithmetic says 3 (the engine's own
62% net-to-gross line says 3 too). The district minimum is 10,000 SF, so the
second lot is 3.4 minimums in one lot. A civil draws three frontage lots at
67 ft (if the RS10 width minimum allows it, ask 9) or two frontage lots and
a flag behind. The remainder lot (ask 2) is the whole difference.

### 6 · 0 Carothers Rd (673509) — RM9, 4.7 ac mapped, appraised $691,200, Wood Ridge Investments LLC
766 ft on Carothers Rd and 291 ft on Battle Rd, 12% mean slope, a 0.14-ac
pond held out (0.27 ac no-build). The by-right side: 20 lots of 5,000–8,500
SF on a 545-ft cul-de-sac at 9.7% grade, all tests pass, plus two remainder
lots of 16,672 and 24,819 SF at the end (ask 2 again). The competition's
townhome row: 42 homes (th_v3, 54 drawn and trimmed to the cap) failing
`alley.street_to_street` (six dead alley arms). The multifamily engine: 42
apartments in two 3-story bars, 63 stalls for 73 required, and the money at
−61% margin on cost ($175/SF hard cost against $105/SF from 70 local
sales). The sheet defaults to the apartments because they place as many
homes as anything and the townhome row fails; the app now says what the
row drew and why it is not the best. The owner's answer on this land is 36–42
townhomes; the engine has it but cannot pass its own alley rule on a
289-ft-wide site (ask 5).

Without terrain the same competition's townhome row came back from the v2
engine with 34 lots, `optimization_status: infeasible_functional_checks`,
and the verdict "buildable as drawn" (ask 5).

### 7 · 8282 Charlotte Pike (659670) — R40, 11.9 ac, 249 × 2,156 ft strip, appraised $530,200
A strip four times longer than Charlotte Pike's frontage is wide, climbing
246 ft from the road; 7.1 ac over 25% held out, 4.7 ac left. The estate
grammar draws two 41,000-SF frontage lots (one of them 79% hillside: 8,533
SF buildable of 41,223) and one 9.96-ac flag lot behind them with 4 ac
buildable. Arithmetic says 8. The grid and the neighborhood grammars draw
3–4 lots on 2,400 ft of street with four fails each; the drive grammar says
"no lots on a private drive" with terrain (it drew 8 on 2,052 ft without
terrain). A developer runs a private lane up the strip and plats 5–6 lots on
the bench; the engine's answer is the two front lots plus a remainder
(ask 2, ask 4).

### 8 · 605 Harpeth Ln (660683) — RS40, 5.2 ac, a 9-ft pole to Ole Harpeth Ln
24% mean slope with 131 ft of fall, 2.9 ac over 25%, 1.6 ac of wetland
buffer; 2.3 ac left. The default draws one lot, 71,568 SF with 45,553 SF of
it held, at the end of a 744-ft public cul-de-sac that runs 481 ft through
the wetland buffer at 17.7% grade: two fails (`street.grade_max`,
`cost.street_ft_per_lot` at 744 ft for one lot). The competition's best, the
grid, draws 2 lots on 320 ft, also failing grade. The estate grammar did not
fire ("the district module 140 × 290 drew no lot"; the module was reshaped
to 245 × 165). For one lot the parcel is the lot and the access is a
driveway, as 4819 Fairmeade Ct was drawn in batch 3; nobody dedicates 744 ft
of street to one house (ask 3).

### 9 · 8192 Charlotte Pike (668277) — R40, 31.6 ac mapped, 29.9 deeded, appraised $32,921 (greenbelt)
567 ft on Charlotte Pike, 27% mean slope with 247 ft of fall, 20.5 ac over
25% held out, 11.2 ac left in a creek valley. Two lots (77,298 and 65,838
SF, about half of each held) on a 1,414-ft cul-de-sac at 24.2% grade that
runs 1,091 ft through the creek buffer: four fails. The drive grammar draws
4 lots on 1,266 ft, failing grade and the 750-ft limit; the grid 4 lots on
5,716 ft. Arithmetic says 21. The honest answer is either 0 with the reason
(nothing passes) or 3–6 estate lots on a lane along the valley floor
priced with the culvert; a 1,414-ft public street for two houses is neither
(ask 3, ask 4).

### 10 · 0 Todd Preis Dr (675099) — RM9, 10.5 ac mapped, 7.4 deeded, appraised $9,700
9.9 of 10.5 ac in the SFHA, 3.1 ac of it floodway, a riverine wetland and a
forested wetland; 8% mean slope. The by-right side skips for the floodplain
(right) and the townhome engine skips with it (right). The multifamily
engine draws 94 apartments in four 3-story bars with 49 stalls for 163
required, 98% capture, `optimization_status: feasible`, and
`flood_constrained` among 60 flags that change nothing. The parcel's
buildability call says "buildable, 355,625 SF envelope." The fill scenario
(floodway held) finds one estate lot on 4.8 ac with 2.7 ac of it in the
floodplain and "0 cy of fill to bring pads to BFE 558.9 + 4 ft" (the earthwork
line reads a pad target with no fill because the pad is a 140,000-SF lot
with no pad placed).

Before this round the app put the 94 apartments on the sheet as the
default with "No neighborhood plan: floodplain leaves no buildable piece,
so the sheet stays multifamily." That is the worst sheet of the batch:
an apartment complex in a floodway, labelled by right. Fixed in the app
(below); the engine is asked to hold the floodplain out of the massing run
(ask 1).

## Fixed in the app with this batch

- **A flood-skipped competition on multifamily land flags the multifamily
  plan.** The layout rule carries `floodHold` when the competition skipped
  for the floodplain; the panel badges the multifamily option "in the flood
  hazard area" and the sentence says the engine does not hold it out yet
  ("…its 94 apartments stand in it: a what-if until it does, not a by-right
  default"); the site layers are fetched and the flood hold is hatched over
  the apartments, so the legend and the sheet show what the plan stands in.
  The apartments stay on the sheet because nothing else draws. Battery:
  0 Todd Preis Dr (675099) gates the badge, the sentence and the hold on the
  sheet (`requireLayout.floodHold`, `holdOnSheet`, `sentenceIncludes`).
- **The townhome row's count is said when it drew more than the best but
  fails.** 0 Carothers Rd: "…so they are the default. The townhome row drew
  42 homes but fails alley.street_to_street." The owner builds townhomes;
  the number was there and hidden behind "all 5 neighborhood plans".

Not fixed, noted: switching the layout to the neighborhood and back redraws
the multifamily plan from its seed and drops the hold hatch; the panel's
badge and sentence stay.

## For the engine, in order of how often it decided the answer

1. **The multifamily generator does not hold the floodplain out.** 0 Todd
   Preis Dr: 94 apartments on 9.9 ac of SFHA with 3.1 ac of floodway,
   `feasible`, `flood_constrained` as a flag. `fn_sf_v1_site` already returns
   the hold as geometry (`hold_wkt`); the massing run should subtract it
   from the envelope (or skip with the same reason the by-right side gives)
   and `fn_parcel_buildability` should not say "buildable, 355,625 SF
   envelope" on it.
2. **The remainder lot.** Where the frontage or estate grammar stops, the
   leftover land becomes one lot: 34,138 SF on a 10,000-SF district
   (Clovernook Dr), a 9.96-ac flag lot with 4 ac buildable (8282 Charlotte
   Pike), 16,672 and 24,819 SF on a 5,000-SF district at the end of the
   Carothers Rd cul-de-sac. A remainder over twice the module should be
   re-lotted (a second flag tier, or a drive into it) or the plan should
   say how many lots it forgoes there. This is the batch's most frequent
   yield loss, and the only reason Clovernook Dr is 2 and not 3.
3. **One lot is the parcel, not a street.** 605 Harpeth Ln: a 744-ft public
   cul-de-sac at 17.7% grade through 481 ft of wetland buffer, for one lot
   (`cost.street_ft_per_lot` 744 against a limit of 368 says so). 8192
   Charlotte Pike: 1,414 ft for two. When the lot count on a street plan is
   one or two and the street fails, the by-right answer is the frontage or
   estate answer (the parcel as one lot with a driveway, as 4819 Fairmeade
   Ct), or the drive; a public street that fails three tests is not it.
4. **The deep strip.** 8282 Charlotte Pike is 249 ft wide and 2,156 ft deep
   with 266 ft of frontage. One estate tier reaches 630 ft (the block
   depth); the rest is the remainder. The drive grammar returned "no lots
   on a private drive" with terrain and 8 lots on 2,052 ft without it: what
   does the hillside hold do to the drive's lotting? A lane up the strip to
   the 4-ac bench is the plan here, and the drive grammar is the one that
   can draw it.
5. **The townhome row depends on the budget.** 0 Carothers Rd: without
   terrain the row came from the v2 engine (34 lots,
   `optimization_status: infeasible_functional_checks`) and the competition
   called it "buildable as drawn"; with terrain, from th_v3 (42 homes,
   `alley.street_to_street`). A row should carry its engine's own
   feasibility, and "infeasible_functional_checks" should never read as
   buildable. On the th_v3 answer itself: 42 homes with six dead alley
   arms on a 289-ft-wide site; the alley rule needs a loop or a
   street-to-street alley the site cannot hold, so the row never passes
   here. Is a dead-arm alley with a turnaround a pass?
6. **mf_max_gsf parking and money on small RM lots** (batch 3's ask 3, still
   open). Carothers Rd: 63 stalls for 73 required in the metrics and
   "209/73 stalls" in the plan basis line (two numbers for one plan); the
   money −61% on cost. At or below 9 du/ac the product that pencils is
   attached at the density cap; the apartments are the default only because
   the townhome row fails.
7. **Terrain for big parcels.** `fn_parcel_topo_fetch` on the 31-ac tract
   ran past the 58-s statement limit of the harvest while USGS was slow,
   and the app's anonymous role has 20 s. A fetch in tiles with partial
   caching, or the prefetch queue the owner has not scheduled, is the only
   way a 30-ac parcel gets terrain on a slow day. (8 of 10 first fetches
   failed this run; the `parcel_topo_fail` cache then made every plan a
   no-terrain plan for 10 minutes.)
8. **Landlocked, with the assemblage.** 70 Hillenglade Dr: right by the
   fabric (no right-of-way gap; the TIGER "Hillenglade Dr" is a private
   lane inside a house lot). Four of the five adjoining parcels belong to
   the same owner and together they reach the lane. A `same_owner_adjoiners`
   note on the landlocked answer (count, acres, whether they touch a
   street) turns a zero into the real question.
9. **RS10 lot width.** The engine's module is 70 × 145 ft. On 202 ft of
   frontage that is two lots; at 60 ft it is three. Which width does the
   district table carry, and is the module's width the district minimum or
   a design value?
10. **The fill scenario's earthwork line on a lot with no pad.** Todd Preis
    Dr: "0 cy of fill to bring pads to BFE 558.9 + 4 ft (median pad fill  ft,
    0 lots over 10 ft)" for a 140,000-SF estate lot with 2.7 ac in the
    floodplain and no pad placed; the sentence has a blank where the median
    should be. When the pad is not placed, say so instead.

Still open from before: contour-following streets; the estate grammar on
long tracts (batch 3's Old Charlotte Pike; now 8282 and 8192 Charlotte
Pike); th_v3 alley and dead-end rules; the −5555 density sentinel; the
non-site owner filter.

## Pictures

`673567_clovernook_dr_2_lots.png`, `660683_harpeth_ln_1_lot_744ft_street.png`,
`659670_charlotte_pike_3_estate_lots.png`,
`668277_charlotte_pike_2_lots_1414ft_street.png`,
`673509_carothers_rd_20_lots.png`, `673509_carothers_rd_42_apartments.png`,
`677706_newsom_station_rd_skipped.png`, `661326_hillenglade_dr_landlocked.png`,
`675099_todd_preis_dr_94_apartments_in_floodplain.png` (before the fix) and
`675099_todd_preis_dr_hold_over_apartments_after_fix.png` (the battery's
capture after it).
