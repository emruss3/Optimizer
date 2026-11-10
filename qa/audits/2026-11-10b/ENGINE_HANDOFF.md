# Engine handoff · cohort run 3 (g17) · 2026-11-10

For the engine-side Claude working in Supabase project `okxrvetbzpoazrybhcqj`.
Written from the app side (emruss3/Optimizer). This follows the g16 handoff
(`qa/audits/2026-11-10/ENGINE_HANDOFF.md`). The engine changed after that
handoff without a new row in `supabase_migrations.schema_migrations` (the
latest is still `20261109155542`), so this run is called g17 here. If the
release has a name, tell me and I will rename the run file.

## 0. The short version

It worked. This is the first release where the count that matters moved.

| | g15 | g16 | g17 |
|---|---|---|---|
| Plans where a civil would draw one | 18 of 40 | 19 of 40 | **24 of 40** |
| Refusals where nothing belongs | 25 of 30 | 26 of 30 | **26 of 30** |
| Mean likelihood, all 40 plans (0–100) | | 42.2 | **48.0** |
| Mean likelihood, all 30 refusals | | 68.8 | **69.8** |
| Plans at 60 or better | | 10 of 40 | **15 of 40** |

(The g16 likelihood figures are restated: 0 Longwood Pl was read at 70 and
is 15. That was my misread, not an engine change; see §4.2.)

Five parcels fixed, none broken by the scorer. Fourteen sheets read better,
four read worse, three the same. Every item from §2 of the last handoff
landed: the division by zero is gone, `best_requested` is filled on every
competition that ran, and the lane rule is the default on ten parcels.

Do next, in this order:

1. **Lots under the district minimum** (§4.1). 21 of 46 plans carry at
   least one. No test catches it. A plan with a 38,416-SF lot on RS40 land
   is not by right.
2. **Parcels with holes** (§4.2). Three cohort parcels are planned on their
   outer boundary, across other owners' lots.
3. **The fallback when a street plan is withdrawn** (§5). It is honest and
   it under-draws: Brittany Park 13 lots on 29 ac, Red Jacket 9 on 38.7 ac.
   This is now the largest group of plan misses by acreage.
4. **The lane that finds no lots** (§6): Hitt Ln, Campbell Rd, Old Hickory
   Blvd R15, 8282 Charlotte Pike, Newsom Station.
5. **Lane details** (§7): the turnaround, the length flag, held land.
6. Multifamily (§8) is unchanged and is now 7 of the 20 remaining misses.

## 1. What landed, and how it read

| Change | Where it shows | Read |
|---|---|---|
| Division by zero in `fn_sf_v1_strip` | 668277 · 8192 Charlotte Pike: one house at the road, the 6-lot street withdrawn | Fixed. 0 → 50. |
| `best_requested` restored | non-null on all 60 competitions that ran (grid 32, drive 12, loop 7, neighborhood 3, townhome 3, single 2, terrace 1); the other ten parcels are skipped | Fixed. The app's fallback stays as a guard. |
| Lane as the default when the street fails or is a street for a few lots (`default_replaced`) | 10 defaults are now `shared private drive`; 17 plans carry `default_replaced` | The right call on every one of them. See §2. |
| Lot the remainder | 0 Clovernook Dr 2 → 3 (two front lots and a flag), 0 Nashboro Blvd 8 → 10, Brittany Park +2, Red Jacket +1 | Clovernook is exactly the target. 50 → 70. |
| Withdraw a street plan that fails grade by a wide margin | Dry Fork Rd (59.5%), Brittany Park (26.4%), Red Jacket (25.8%), 8192 Charlotte (39.4%) | Honest. What replaces it is the next problem (§5). |
| Grade test bounded at the peak (`peak_limit`, `needs_grading`, `standard`) | Mt View Rd: the single street at 13.3% now fails and the T street returns; notes read "one station runs 11.6% (limit 10%): it needs grading there; the test allows 100 ft up to 12%" | Exactly what was asked. Mt View 55 → 70. |
| Terrace as the default where it passes | 0 Hart Ln: 50 lots at 9.2% | The sheet no longer shows a failing loop. 45 → 50. |
| Private-lane grade standard (15%, peak 17%) stated in the test row | Homeland, Old Charlotte Pike, Swiss Ave | Good: the figure and its source are on the row. |

## 2. The lane rule, parcel by parcel

| Parcel | g16 | g17 | Read |
|---|---|---|---|
| 380818 · 3345 Pugh Rd · RS80 · 28.14 ac | 3 lots on a 743-ft public street | **9 lots** either side of a 1,743-ft lane | FIXED. 15 → 65. North 5.3 ac past the turnaround is unassigned ("the lane is kept to the 10 lots a shared drive may serve"). |
| 692464 · 7695 Old Charlotte Pike · R80 · 45.9 ac | 8 lots on 3,184 ft of public street, three code fails | **9 lots** on a 2,810-ft lane, no code fails | FIXED. 35 → 55. 1,535 ft of the lane is in wetland buffer; one station at 16.5%. |
| 679830 · 0 Neelys Bend Rd · RS40 · 18.91 ac | 2 lots | **4 lots** on a 1,637-ft lane up the panhandle | FIXED. 50 → 65. |
| 674961 · 0 Homeland Dr · RS40 · 9.02 ac | 5 lots on 1,378 ft of public street, 3 connections | 5 lots on an 834-ft lane, 1 connection | 35 → 60. Lot 5 is 38,416 SF (§4.1). |
| 676829 · 0 Walker Ln · RS20 · 5.5 ac | 3 lots on 955 ft, fails grade | 4 lots on a 636-ft lane | 25 → 45. Still a miss (5–7): one lot is a 71,265-SF remainder, one is 19,738 SF. |
| 679226 · 0 Hessey Rd · RS10 · 5.8 ac | 8 lots on a cul-de-sac | default unchanged; best = **9 lots** on a 570-ft lane (sheeted) | 40 → 45. One short of the range. Lots run 9,757 to 36,610 SF; evened out, the same land takes 10–12. |
| 679617 · 0 Stewarts Ferry Pike · RS15 | 4 on a public bulb | 4 on a 207-ft lane | 50 → 55. |
| 677645 · 0 Poplar Creek Rd · RS15 | 4 (grid) | 4 on a 218-ft lane | 40 → 50. |
| 661303 · 4525 Cato Rd · RS15 | 2 on a 250-ft public street | 2 on a 212-ft lane | 60, unchanged: still through the wetland buffer, still a full turnaround for two houses. |
| 680001 · 0 Union Hill Rd · RS40 | 3 on a public street; grid 4 sheeted | default 3 on a lane; grid 4 still sheeted (more lots) | 35, unchanged. The sheet is a 644-ft public L street for four lots. The lane row draws 3 and carries `open.unassigned`. |
| 660683 · 605 Harpeth Ln · RS40 | the parcel as one lot | default unchanged; best = **2 lots** on a 760-ft lane (sheeted) | 70 → 60. The lane crosses 549 ft of held hillside to reach a second pad. One house was the cleaner answer. See §7.3. |

## 3. The scoreboard in full

Fixed (5): 380818 Pugh Rd, 692464 Old Charlotte Pike, 679830 Neelys Bend,
673567 Clovernook Dr, 668277 8192 Charlotte Pike.

Plan misses that remain (16):

| Group | Parcels |
|---|---|
| Under-yield behind the first tier (9) | 679226 Hessey (9; 10–16), 676829 Walker (4; 5–7), 679820 Westcap (6; 8–14), 675128 Newsom Station (4; 5–10), 659670 8282 Charlotte (3; 5–6), 659655 Hitt Ln (1; 12–25), 680202 Campbell (1; 2–4), 679273 Old Hickory R15 (1; 3–9), 667802 7963 Charlotte (0, landlocked; 10–16) |
| Hillside (3) | 680596 Hart Ln (50; 55–80), 678964 Brittany Park (13; 28–45), 681357 Red Jacket (9; 70–110) |
| Apartments where attached homes are the product (4) | 670533 Smith Springs, 670783 Nashboro RM6, 676422 Cedarstone, 673509 Carothers |

Refusal misses (4): 679195, 678148, 673974 (the multifamily run on
landlocked land) and 679540 Dry Fork Rd (2 lots; §5.3).

## 4. New findings: plans that are not by right as drawn

### 4.1 Lots under the district minimum, and no test for it

`lot_areas_sf` against `min_lot_sf`, on the default plan:

| Parcel | Pattern | Minimum | Lots under it |
|---|---|---|---|
| 674961 Homeland Dr | shared private drive | 40,000 | 38,416 |
| 676829 Walker Ln | shared private drive | 20,000 | 19,738 |
| 677645 Poplar Creek Rd | shared private drive | 15,000 | 14,530 |
| 680001 Union Hill Rd | shared private drive | 40,000 | 39,407 |
| 380818 Pugh Rd | shared private drive | 80,000 | 79,107 |
| 680596 Hart Ln | terrace | 10,000 | 9,908 · 9,851 · 9,836 · 9,948 |
| 681024 Longwood Pl | single street | 20,000 | 19,614 |
| 667638 Antioch Pike | single street | 8,000 | 7,871 |
| 679911 Swiss Ave | shared private drive | 5,000 | 4,810 |
| 670533 Smith Springs Rd | loop | 6,000 | 5,834 · 5,778 |
| 670783 · 673710 · 673509 (RM) | single street | 6,000 · 3,750 · 5,000 | 5,957 · 3,701 · 4,779 |

Also the sheeted best on 0 Hessey Rd: 9,757 and 9,778 SF on RS10 land.

This is not new in g17: the g16 answers carry it on 18 plans (Red Jacket's
loops had twelve lots under 10,000 SF). I missed it in the last handoff. It
looks like a tolerance of up to about 4% in the lotting pass. Ask: hold
every lot to `min_lot_sf` exactly (shift the lot line, or drop the lot),
and add a `lot.min_area` test that fails when any lot is under, so a plan
that slips cannot read "all pass". Separately, `lot_buildable_sf` is under
the minimum on more lots than that (7 of 9 on Old Charlotte Pike). If the
district minimum is gross area, say so on the test; if hillside or flood
land does not count toward it, those lots fail too.

### 4.2 Parcels with holes are planned on their outer boundary

| Parcel | Holes | What is drawn |
|---|---|---|
| 681024 · 0 Longwood Pl · R20 · 4.41 ac | 5 holes, 3.89 ac | 10 lots on a cul-de-sac, all ten on other owners' lots. The parcel is a co-op's common area. |
| 681357 · 1716 Red Jacket Dr · R10 · 38.68 ac | 49 holes, 4.06 ac | 9 frontage lots, 7 of them across other owners' lots (lot 3 is 650,787 SF) |
| 670533 · 0 Smith Springs Rd · RM6 · 7.0 ac | holes present | the by-right loop puts 21 of 25 lots on them (the sheet shows the apartments) |

The app detects this from the parcel geometry and says "This plan cannot be
built as drawn"; from this release its header chip says the same instead of
"All 13 checks pass". The engine should plan on the polygon with its
interior rings (subtract the holes before the buildable-land step), and
when what is left is common area between other people's lots (Longwood:
0.52 ac of 4.41) return the zero with that reason. Longwood
would then be a correct refusal; its cohort target (7–10 lots, "kept for
the engine") changes to a refusal when it does. Related and still open from
the last handoff: 681029 · 0 Abbott Martin Rd is also a co-op common area.

## 5. When the street plan is withdrawn

The withdrawal is right. The replacement is "frontage lots, no new street",
with the interior cut into remainder lots that each carry one house:

| Parcel | Withdrawn | Sheet now | Remainders |
|---|---|---|---|
| 678964 · 0 Brittany Park Dr · RS20 · 29.0 ac | loop, 29 lots, 26.4% over 1,800 ft | 13 frontage lots | 271,628 · 145,436 · 90,908 · 74,377 · 64,776 SF |
| 681357 · 1716 Red Jacket Dr · R10 · 38.68 ac | 2 loops, 76 lots, 25.8% over 2,700 ft | 9 frontage lots | 650,787 · 313,961 · 308,191 · 225,651 · 109,730 SF |
| 679540 · 0 Dry Fork Rd · RS40 · 31.0 ac | loop, 4 lots, 59.5% | 2 frontage lots | 296,624 SF |
| 668277 · 8192 Charlotte Pike · R40 · 31.63 ac | street, 6 lots, 39.4% over 1,500 ft | 1 lot at the road | 408,105 SF |

### 5.1 It is a holding answer and should say so

A 6.2-ac "lot" with one house on RS20 land is not a plan anyone files; it
is the land the engine could not street. Either name it in the response (a
`remainder_ac` figure and a note: "N ac behind the frontage lots is not
planned: no street, terrace or lane holds the grade"), or leave that land
out of the lots and report it as unplanned open land. Today it reads as
"13 lots, all tests pass, 0% R.O.W." and the cohort scores it a miss for
count only.

### 5.2 The terrace and the lane are close on Brittany Park and Red Jacket

- Brittany Park: terrace 25 lots (fails `block.length`, `street.grade_max`);
  lane 24 lots (fails `access.private_drive_max_lots`,
  `access.private_drive_length`, `street.grade_max`). The target is 28–45.
  Two lanes of 10 from the two frontages, or a terrace that stops each arm
  at the 25% hold, would likely pass. The note already says it: "the land
  beyond it needs a public street or a second lane". Draw the second lane.
- Red Jacket: terrace 56 lots, fails grade. Fix §4.2 first; the holes change
  what is there to plan.
- Hart Ln, where the terrace passes: 50 lots, 42.6% open (`open.unassigned`).
  The notes name the land: "a cul-de-sac into 11.2 ac of open land not
  drawn: its straight line runs 25.1% and no walk holds 10%" and another
  into 3.2 ac. A lane (15%) into the 11.2 ac from the upper terrace is the
  next five to ten lots and puts Hart Ln in range.

### 5.3 Dry Fork Rd: one lot, not two

Two "frontage lots", one with its house in the middle of the mountain at
the end of a strip that runs straight up 36% ground through the held
hillside. One house at the road (the parcel as one lot) is the answer and
scores as a correct refusal. Rule: a frontage or flag lot whose only pad is
reached across held land over 25% is not a lot. 5 → 35 as it stands.

## 6. The lane that finds no lots

`requested: 'drive'` returns `status: 'failed'`, "no lots on a private
drive", on the parcels where the last handoff expected it to work:

| Parcel | Default now | What is there |
|---|---|---|
| 659655 · 1019 Hitt Ln · R20 · 21.61 ac | the parcel as one lot, 3,716-ft driveway | a 10-ac western block under 25%; the grid draws 16 (failing) |
| 680202 · 0 Campbell Rd · RS80 · 17.8 ac | the parcel as one lot, 1,211-ft driveway | 6 ac off the hold; the grid and neighborhood draw 3 (failing) |
| 679273 · 0 Old Hickory Blvd · R15 · 5.51 ac | the parcel as one lot, 323-ft driveway | 1.75 ac off the hold |
| 659670 · 8282 Charlotte Pike · R40 · 11.87 ac | 2 front lots and a 10-ac flag lot | a 4-ac bench at the end of the strip |
| 675128 · 0 Newsom Station Rd · R80 · 27.25 ac | 4 equal 6.8-ac estate lots | benches along the ridge |

On the first three the engine already routes a driveway to a pad on that
land ("the parcel as one lot … with the house pad on the land off the holds
and a 3,716-ft driveway"). The lane grammar is not using that route. Ask:
when the default is "the parcel as one lot" and the land off the holds is
at least three district minimums, run the lane along the driveway's route
and lot the bench it reaches. Hitt Ln is the test case: 21.6 ac of R20 land
drawn as one house.

Also: 679820 · 0 Westcap Rd. The lane row draws **10 lots** (the target is
8–14) and fails `street.grade_max` at the private standard. The default
stays at 6 frontage lots. One regrade or a second entry away from passing.

## 7. Lane details

### 7.1 Every lane ends in a 50-ft-radius turnaround

`bulbs_wkt` is the same 7,804-SF circle on every drive plan, including the
212-ft drive to two houses on Cato Rd and the 207-ft drive on Stewarts
Ferry. On Poplar Creek it is as large as a lot. A private drive to a few
houses ends in a hammerhead or a T; a full bulb is for a fire apparatus
turnaround on a dead end past 150 ft, and even then a hammerhead is
accepted. Ask: no turnaround under 150 ft; a hammerhead above it; the
circle only where the count or the fire access needs it.

### 7.2 `access.private_drive_length`

Limit 750 ft, "jurisdiction value to confirm". It fails on Pugh (1,743),
Old Charlotte Pike (2,810), Neelys Bend (1,637), Homeland (834) and the
Harpeth best (760), and is treated as a quality flag, so those plans read
"buildable as drawn". Either the 750 is not a real limit for estate lanes
(then drop the test or raise it), or it is (then three of the five fixes in
this release fail a code test). This needs the Metro figure. It is on the
owner's list in §10; until it is settled the app shows it as a failed check
on the sheet and the cohort does not count it.

### 7.3 A lane across held land

Harpeth Ln: 549 ft of the 760-ft lane crosses hillside over 25%. Old
Charlotte Pike: 1,535 ft in wetland buffer. Homeland: 160 ft in wetland
buffer. The app prints "549-ft crossing of held-out land: culvert / bridge
to price". A lane that spends most of its length on held land to reach one
more pad should lose to the plan without it (Harpeth: the one-lot default).
Ask: a `access.lane_on_held_land` figure, and do not let a best plan win on
one extra lot when more than half its lane is on held land.

### 7.4 Contract

- `metrics.drive_ft` is on the plan but not on the competition rows; a drive
  row reads `street_ft: 0`. Please add `drive_ft` to each row.
- Please report `lane_w_ft` and `easement_w_ft` in `metrics`. The app
  measures them off the geometry (16 and 24 on every plan in this run).
- `default_replaced` is good. The app shows the note; it will read the
  object once the shape is settled. Keep `why`, `pattern`, `lots`, `fails`,
  `street_ft`.
- No migration row for this release. Please record one, so a run can be
  tied to a version.

## 8. Still open from the last handoff

- **Multifamily, all of §8 there**: holds not honored (4 parcels), the stall
  summary against the bays, over-parking, attached product on RM4–RM9, the
  1-m² overlap on Swiss Ave. Unchanged in g17. Swiss Ave's by-right default
  did change (7 lots on a lane, was 12 on a failing street); the sheet is
  still the 36 townhomes.
- **Landlocked disagreements**: 676422 Cedarstone and 692658 Eagle Rdg say
  landlocked where `fn_parcel_frontage` says not; 667802 · 7963 Charlotte
  Pike drew 12 frontage lots on 11-04 and is landlocked now. No answer yet.
- **House footprints touching** across a lot line: not re-checked on every
  sheet; 0 Old Hickory Blvd RS20 no longer shows it (two lots now).
- **0 Old Hickory Blvd RS20** (673844): the sheet is a 269-ft public street
  and bulb across the flood hold for two houses (grid). The lane row draws
  the same two and fails grade. 40 → 35.
- **Newsom Station**: still four equal 6.8-ac lots. "Do not quarter the
  parcel" has not been taken up.

## 9. What the app changed with this run

- A drive is compared by what it builds. The same-lots rule read a drive as
  "0 ft of new street", so a 536-ft lane took the sheet from a 520-ft
  public cul-de-sac at the same ten lots (Longwood). The app and the scorer
  now add `drive_ft`.
- Lane and easement width are measured across the centreline. Area over
  length counted the turnaround: "a 44-ft lane in a 56-ft access easement"
  on a 207-ft drive is 16 ft in 24.
- The header chip follows the off-parcel finding: "Cannot be built as drawn
  · 7 lots off the parcel", not "All 13 checks pass".

## 10. Acceptance for the next release, and questions for the owner

Run `node scripts/engine-cohort/score.mjs --store <store> --engine g18
--baseline runs/2026-11-10_g17.json`.

- Plans **27 of 40 or better**. In reach: Hessey (one lot), Westcap (the
  lane row already draws 10), Walker (one lot), Hart Ln (five lots), Hitt Ln
  and Campbell (the lane along the driveway route).
- Refusals **27 of 30 or better**: Dry Fork as one lot.
- No lot under `min_lot_sf` on any plan; a `lot.min_area` test on every plan.
- No lot on a hole.
- No parcel that passes at g17 falls to a miss. On thin margins: Harpeth Ln
  (2 lots is the top of its range), Homeland Dr, Neelys Bend.

For the owner:

- The Metro limit on the length of a shared private drive, and on the lots
  it may serve (the engine holds 750 ft and 10 lots; both are marked "to
  confirm").
- Whether a private lane at 15% (17% for 100 ft) is the right standard.
- 0 Longwood Pl and 0 Abbott Martin Rd are co-op common areas. Leave them in
  the cohort as refusals, or take them out?
- 7963 Charlotte Pike: frontage or not.
