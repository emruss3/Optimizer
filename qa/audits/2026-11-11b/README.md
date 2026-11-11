# Batch 7 · twenty new parcels on engine g23 · 2026-11-11

The owner asked for an audit of 20 parcels, ranked, and whether anything is
improving.

## What was run

- 20 parcels drawn at random: vacant R, RS and RM land, land value of
  $5,000 or more, ordered by `md5(ogc_fid || ':batch7')`, four from each
  size band (1 to 2.5, 2.5 to 6, 6 to 15, 15 to 60 ac) and four RM. The 130
  cohort parcels were excluded, with the owner-name exclusions of batch 6.
- Harvested on 2026-11-11 between 18:35 and 18:38 UTC. `engine_release`
  read `g23` before and after, the last migration was the same, and
  `training.fn_engine_drift()` returned nothing.
- All 20 were driven through the app on those answers. The sheets are here
  as `<fid>.png`. No sheet raised an app error.
- The 22 RM parcels already in the cohort were run again on g23, because
  g23 and the two migrations after it are about townhomes.
- The run is `scripts/engine-cohort/runs/2026-11-11_g23.json`. The cohort is
  150 parcels.

## Ranking

Likelihood is how likely a civil engineer or a developer would accept the
sheet as drawn, 0 to 100.

| Rank | Parcel | District, acres | What the sheet shows | Target | Likelihood |
|---|---|---|---|---|---|
| 1 | 420885 6305 Robin Hill Rd | RS40, 1.26 | one lot, one house | pass | 90 |
| 2 | 675288 0 Antioch Pike | RS7.5, 4.8 | nothing: all in the flood hazard area | pass | 90 |
| 3 | 680676 0 Kirkman Ln | R40, 1.56 | nothing: flood hazard area and no street | pass | 85 |
| 4 | 675939 0 Vadenwood Ln | RS40, 15.04 | nothing: no street | pass | 85 |
| 5 | 672901 0 Vadenwood Ln | RS40, 17.72 | nothing: no street | pass | 85 |
| 6 | 679103 0 Old Hickory Blvd | RS20, 5.69 | the parcel as one lot | pass | 80 |
| 7 | 673467 0 Vester Rd | RS40, 9.02 | the parcel as one lot | pass | 80 |
| 8 | 693461 7070 River Road Pike | R80, 2.89 | one lot, house above the hillside | pass | 75 |
| 9 | 405284 9052 Old Charlotte Pike | R80, 1.8 | nothing: no 80,000-sf lot fits | pass | 65 |
| 10 | 680641 0 Bellshire Dr | R10, 5.02 | the parcel as one lot, house on the dry corner | pass | 65 |
| 11 | 666667 4329 Central Pike | RS15, 7.27 | 13 lots on one street to a bulb | pass | 60 |
| 12 | 660428 4044 Dickerson Pike | R20, 17.05 | nothing: no street | pass | 60 |
| 13 | 421423 2957 Morgan Rd | RS40, 13.27 | 10 lots on one street, 1,553 ft | pass | 55 |
| 14 | 670638 0 Bell Rd | RM15, 5.07 | 42 apartments as a flood what-if | pass | 55 |
| 15 | 660058 6564 Holt Rd | R20, 9.83 | 12 lots on a T street; the default is 10 | pass | 50 |
| 16 | 628101 3335 Walton Ln | RM20, 1.59 | 23 apartments | pass | 45 |
| 17 | 664916 3210 Lakeshore Dr | RS20, 2.05 | 4 lots: one on the street, three flag lots behind it | pass | 40 |
| 18 | 675327 0 Campbell Rd | R20, 34.2 | 24 lots on a terrace; 8.4 ac not planned | miss | 30 |
| 19 | 680159 0 Whites Creek Pike | RM9, 3.87 | 25 apartments, marked no street access | miss | 20 |
| 20 | 701867 330 Athens Way | RM15, 5.93 | no plan on the sheet | miss | 5 |

The scorer reads 330 Athens Way as a pass, 88 apartments. The sheet draws
nothing, so it is a miss here. See below.

## Are we improving

Not in a way these numbers can show.

| First look at a new batch | Engine | Plans in target | Refusals right | Likelihood, plans | Likelihood, refusals | Likelihood, all |
|---|---|---|---|---|---|---|
| Batch 5, 40 parcels | g18, mid-patch | 14 of 21 | 18 of 19 | 48.6 | 74.7 | 61.0 |
| Batch 6, 20 parcels | g21 | 8 of 11 | 7 of 9 | 44.1 | 64.4 | 53.2 |
| Batch 7, 20 parcels | g23 | 7 of 9 | 10 of 11 | 47.8 | 71.8 | 61.0 |

The pass rate of batch 7 is the best of the three and it comes from the
draw. Eleven of the 20 are refusals, all of them land that is in the flood
hazard area, has no street, or is one lot. Only four parcels ask for a real
street plan, and the one on steeper rolling ground misses.

The likelihood of a plan has not moved across three batches and five engine
releases: 49, 44, 48. A sheet that draws lots is still a coin flip to a
civil.

The same parcels over time say the same. The 110 parcels of g19 read plans
39 of 60 then, and 41 of 60 on g22 this morning, one of the two gains real.
The 22 RM parcels read 9 of 22 on g22 and 9 of 22 on g23: not one sheet
changed.

What is better, and it is real:

- Refusals are honest and say why. Ten of eleven are right.
- No engine error on any of these 20.
- Small flat sites draw a sound street: Morgan Rd, Central Pike.

What is not:

- **The engine error found this morning is still live on g23.** 1019 Hitt
  Ln still returns `record "best" is not assigned yet`. The line and the fix
  are in `qa/audits/2026-11-11/APP_REPLY_3.md` §1.
- Rolling ground. 0 Campbell Rd draws 24 lots on 34 ac. The 40-lot
  neighborhood plan is thrown out on the grade test alone.
- Multifamily. One sheet has no plan, one draws apartments with no street.

## What is wrong, parcel by parcel

### 701867 330 Athens Way · RM15 · 5.93 ac · no plan on the sheet

The multifamily plan comes back with 88 units in three buildings. The app's
geometry check finds a building over a drive by 19 m², retries, finds it
again, and draws nothing: "The plan failed the geometry gate after a retry:
building overlaps drive (19 m²)". The plan's own flags say
`i1_pairwise_element_disjointness_hard_pass`. Its metrics say 57 stalls
against 153 required. So two of the plan's own hard passes are not true on
this parcel. The only thing left on the sheet is the townhome row, 53 homes,
failing the second connection. The land is assessed at $2.2 million and the
sheet shows "existing conditions".

By right the default is six frontage lots with 3.34 ac not planned. The
16-lot street is withdrawn at 21.2% over one 100-ft station.

### 675327 0 Campbell Rd · R20 · 34.2 ac · 24 lots, 35 to 55 wanted

| Pattern | Lots | Code fails |
|---|---|---|
| terrace, the default | 24 | none; 8.38 ac not planned in 3 lots |
| neighborhood | 40 | `street.grade_max` only |
| grid | 38 | `street.grade_max` only |
| loop | 26 | grade, block length |

The ground rolls at 14% with 1.9 ac over 25%. This is the sixth parcel in
three batches where a plan inside the target fails only the grade test:
Dickerson Pike, Moss Rd, Drakes Branch Rd, Westcap Rd, Old Hickory Blvd
RS20, and now this one.
Two lots on the sheet are 127,000 and 237,000 sf on a 20,000-sf district.

### 680159 0 Whites Creek Pike · RM9 · 3.87 ac · 25 apartments, no street

`access.type` is `none`. The by-right side draws nothing and says so. The
multifamily plan draws 25 apartments in two buildings. The sheet now marks
them "no street access on record". They still stand as the default until
the owner rules.

### 664916 3210 Lakeshore Dr · RS20 · 2.05 ac · the count is right, the layout is not

Four lots is right. The drawing is one lot on the street and three flag
lots behind it, each on its own pole, side by side. With 239 ft on the
street, two lots front it and two sit behind on one shared drive. Three
parallel poles is not a layout a civil submits.

### 421423 2957 Morgan Rd · RS40 · 13.27 ac · passes its dead-end test on a stub

Ten lots on both sides of one street, 140 by 290 ft each. A clean drawing.
The street is 1,553 ft long from a 58-ft neck. `street.dead_end_max` reads
value 0, limit 750, pass, because "the street carries past the 750-ft
dead-end limit to a stub at the adjoining land … that connection is the
second way out and the plan depends on it". The land next door is a
vacant parcel. Until someone builds there the street is a 1,553-ft dead
end. Say that on the test as a condition, not as a pass.

### 405284 9052 Old Charlotte Pike · R80 · 1.8 ac · "0 lots" where one house stands

The lot is 78,400 sf on an 80,000-sf district. The answer is "0 lots: no
lot of 80000 sf fits". A lot of record under the district minimum still
takes one house. The sheet should say "one house on the lot of record", as
it says "the parcel as one lot" on the four parcels here that are just
over a minimum.

### 660428 4044 Dickerson Pike · R20 · 17.05 ac · no street on this data

`access.type` is `none`: 1,762 ft of "other", 928 ft vacant, 844 ft
residential. It has an address number. A 17-ac tract with a Dickerson Pike
address usually has a way in. It needs a person to look.

### The rest

- **666667 4329 Central Pike:** 13 lots, the low end of 13 to 19. The lots
  average 20,500 sf on a 15,000-sf district.
- **660058 6564 Holt Rd:** the default is 10 lots with 2.28 ac not planned;
  the sheet takes the competition's 12-lot T street. The 14-lot grid fails
  only the grade test.
- **628101 3335 Walton Ln:** 23 apartments in one building at the back of
  the lot; density allows 31 and the front half is empty.
- **670638 0 Bell Rd:** the flood what-if works as designed.

## App

- The access banner and the multifamily mark shipped this morning work on
  the new parcels: 0 Whites Creek Pike and 4044 Dickerson Pike show "No
  street access on record".
- **A defect to fix next.** On 4329 Central Pike the sheet labels the north
  edge as the front, "F 20'". The street frontage is the south edge, where
  the engine's street starts, 8 ft from the frontage layer's primary edge.
  7070 River Road Pike looks the same: the house and its driveway sit at
  the edge labelled rear. The label comes from somewhere else in the app
  and I have not traced it yet.
- **A gap in the scorer.** It passes 330 Athens Way on 88 apartments. The
  app's geometry check rejects that plan and the sheet is empty. The scorer
  does not run the check. Until it does, a multifamily pass means the
  engine returned a plan, not that the sheet drew it.

## For the owner

Unchanged, and still gating most of what is left:

- The cut and fill a street may need before the plan is refused.
- Apartments on land with no street: leave, mark as a what-if for no
  access, or also for a private lane.
- The engine error from this morning needs the engine side to apply one
  fix. It has not been applied.
