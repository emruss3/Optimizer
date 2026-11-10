# Engine handoff · batch 5 (40 new parcels) on g18 · 2026-11-10

For the engine-side Claude working in Supabase project `okxrvetbzpoazrybhcqj`.
Written from the app side (emruss3/Optimizer). This follows
`qa/audits/2026-11-10b/ENGINE_HANDOFF.md` (run 3, g17).

The engine changed again after that handoff: `fn_sf_v1_plan`,
`fn_sf_v1_strip` and `fn_sf_v1_candidates` all differ from what run 3
measured, `fn_generate_mf_site_plan_v2` does not. There is still no row in
`supabase_migrations.schema_migrations` after `20261109155542`. This run is
called g18 here. Please record a migration so a run can be tied to a
version; it is the third time this has been asked.

## 0. The short version

Forty parcels the engine has never been measured on, drawn at random, and
the original 70 re-scored on the same engine.

| | Original 70 | New 40 | All 110 |
|---|---|---|---|
| Plans where a civil would draw one | 23 of 39 | **14 of 21** | 37 of 60 |
| Refusals where nothing belongs | 28 of 31 | **18 of 19** | 46 of 50 |
| Mean likelihood, plans (0–100) | not re-read | 48.6 | |
| Mean likelihood, refusals | not re-read | 74.7 | |
| Plans at 60 or better | | 6 of 21 | |

Two things to take from it.

**The gains are real, not fitted.** On parcels it has never seen the engine
passes 67% of plans and 95% of refusals, against 59% and 90% on the cohort
it was tuned against. Run 3's improvement carried over.

**The plans that pass are mostly the small ones.** Of the 14 passing
plans in the new batch, six are one to five lots and four are apartments.
The five tracts over 5 ac where a street plan is the answer score 60, 45,
45, 30 and 20.

Do next, in this order:

1. **Access classification** (§2). It decided 15 of the 40 parcels, and on
   5 of them the plan and `fn_parcel_frontage` disagree. Two of those are
   RM parcels on public roads that the by-right side calls landlocked.
2. **The lane on a deep narrow strip** (§3). Two new misses with the same
   shape; the engine's own note calls both "a holding answer".
3. **Yield on mid-size and large tracts that have no steep land** (§4).
   This is where the likelihood is lowest and the money is.
4. **A failing default with a passing row beside it** (§5).
5. Multifamily (§6), unchanged since g15, now 10 of the 27 misses across
   the 110.

## 1. What landed since the last handoff (verified on all 110)

| Asked in the g17 handoff | g18 | Evidence |
|---|---|---|
| No lot under `min_lot_sf`; a `lot.min_area` test | **Done** | 66 plans with lots, none with a lot under the minimum (was 21 plans); the test is on every plan |
| Plan on the polygon with its holes; refuse common land | **Done** | 681024 · 0 Longwood Pl: "the parcel is the common land round 5 other owners' lots: 3.88 of the 8.30 ac inside its outline belong to them; not a development site". Its cohort target is now a refusal, as the last handoff said it would be |
| Say when the fallback is a holding answer | **Done** | "N ac is carried inside M oversized lot(s) and is not planned … this is a holding answer for that land, not a subdivision of it" on 24 plans |
| A house reached across held hillside is not a lot | **Done** | 679540 · 0 Dry Fork Rd: 2 → 1 lot (a correct refusal now); 678315 · 0 River Road Pike in the new batch |
| `access.lane_on_held_land`; do not win on one lot bought with a lane across held land | **Done** | 660683 · 605 Harpeth Ln is back to one house |
| Walker Ln, one lot short | **Fixed** | 676829: 5 lots on a 636-ft lane, in range |
| A migration row | Not done | |
| Turnaround on every lane | Not checked on the original 70; the new batch still shows the full circle on a 3-ac, 8-lot lane (676299) | |

Side effects on the original 70, all honest and all lower counts:

- 673844 · 0 Old Hickory Blvd RS20: 2 lots (grid) → the parcel as one lot,
  "2.41 ac … holding answer". Target 2–5: **broke**. The lane row draws 3
  and fails.
- 675128 · 0 Newsom Station Rd: 4 estate lots → one lot, "3 lot(s) whose
  house is reached across more than 100 ft of hillside … joined", "25.41 ac
  … holding answer". Still a miss, now further from 5–10.
- 659670 · 8282 Charlotte Pike: 3 → 2. Still a miss (5–6).
- 681357 · 1716 Red Jacket Dr: 9 → 7 frontage lots, 32 ac holding. And see
  §7: its competition no longer returns in 58 s.

Net on the original 70: plans 23 of 39 (flat), refusals 28 of 31 (+2).

The pattern in those four is the same one §3 and §4 describe from the new
batch: the engine now knows when it has not planned the land, and says so.
The next step is to plan it.

## 2. Access: 15 of 40 parcels turned on it

| Parcel | By-right plan | `fn_parcel_frontage` | Read |
|---|---|---|---|
| 674703, 680272, 679300, 678224, 678961, 677633, 680449, 672657, 677274 | landlocked | landlocked, 0 ft | Agree. Right. |
| 406289 · 3630 Trail Hollow Ln · RS20 · 9.68 ac | landlocked | landlocked | Agree, and the parcel has a street address: it is reached by a private lane. One house is the answer, not zero. |
| 678361 · 0 Trail Hollow Ln · RS20 · 10.34 ac | landlocked: "no edge touches a mapped street" | **605 ft of frontage** | Disagree. The frontage edge has no street on the basemap, so the plan is probably right and the frontage record is counting an unbuilt right-of-way. |
| 669278 · 803 B Woodland Way · R15 · 2.46 ac | landlocked: "no edge touches a mapped street" | 19 ft (12 ft primary) | The message is wrong: it touches. Too narrow for a street, wide enough for the driveway its "B" address implies. One house. |
| 678903 · 0 Woodland Hills Dr · RM6 · 2.1 ac | skipped: "the longest touch on a street is 16 ft" | **108 ft** | Disagree. The multifamily run draws 10 units. |
| 672188 · 0 Kidd Rd · RM9 · 5.38 ac | landlocked | **1,590 ft** | Disagree. A 1,600-ft strip along Kidd Rd. The multifamily run draws 41 units; th_v3 places 48 homes. |
| 679218 · 0 Lebanon Pike · RM20 · 11.42 ac | skipped: "landlocked: the longest touch on a street is 505 ft … (neighbours by edge length: other 1910 ft, rail 927 ft, open_edge 505 ft)" | **1,428 ft** | Disagree, and the message contradicts itself: 505 ft of touch is not landlocked. The edge on Lebanon Pike is typed `open_edge`, not `street`. The multifamily run draws 228 units. |

Asks:

1. **One access function**, called by sf_v1, th_v3, the multifamily run and
   `fn_parcel_frontage`, returning a typed answer: public street (ft, name),
   private or unbuilt street, open edge, none. Today four callers reach
   three conclusions on the same parcel.
2. **An open edge on a state or US route is a street.** Lebanon Pike is the
   test case. If the centreline layer does not carry it, the right-of-way
   parcel ("other 1910 ft") is the evidence.
3. **The message must match the test.** "Landlocked: the longest touch on a
   street is 505 ft" should read as what failed (the edge is not typed as
   a street), and "no edge touches a mapped street" should not be said of a
   parcel that touches one for 19 ft.
4. **Landlocked with an address or a narrow touch is one house**, the same
   "the parcel as one lot" answer the engine already gives elsewhere, with
   the access named as the condition. Trail Hollow Ln and Woodland Way.

The app shows the multifamily plan as the sheet on the three RM parcels,
because the by-right skip is not a flood hold. On Lebanon Pike and Woodland
Hills that is the right outcome for the wrong reason.

## 3. The lane on a deep narrow strip

| Parcel | Shape | g18 | Engine's own note | Civil answer |
|---|---|---|---|---|
| 675439 · 0 Currey Rd · RS10 · 1.72 ac | 105 ft wide, 700 ft deep | 2 lots: 10,618 SF and 62,655 SF | "1.21 ac is carried inside 1 oversized lot(s) and is not planned" | 3–5 lots on a drive down one side |
| 678549 · 0 Hunters Ln · R20 · 5.42 ac | 210 ft wide, 1,130 ft deep | 4 lots: two front lots and two flag lots of 2.2 ac | "3.45 ac … holding answer" | 6–9 lots on a lane down one side (110 × 180 ft lots) |

On both, `requested: 'drive'` returns `failed`, "no lots on a private
drive", and grid and neighborhood draw 7 on Hunters Ln (failing). The lane
grammar appears to want lots on both sides. A strip too narrow for
double-loading takes a lane along one boundary with a single row of lots
facing it. This is the same family as Hitt Ln and Campbell Rd in the last
handoff (the lane that finds no lots), which are unchanged in g18: both
still one lot, now with "21.16 ac" and "15.96 ac … holding answer".

Related, passing but light: 612443 · 3600 Abbott Martin Rd (R20, 3.03 ac,
land assessed at $1.6M). Four lots, two of them 45,000-SF flag lots whose
houses sit directly behind the front lots with the rear half of each lot
empty. In range (4–6), and a short court takes six.

## 4. Yield on tracts with no steep land

| Parcel | g18 on the sheet | What is left | Target | Likelihood |
|---|---|---|---|---|
| 677102 · 0 Dickerson Pike · RS7.5 · 19.82 ac | 45 lots on one 1,798-ft spine and a spur; passes | 38.9% of the site unassigned; the 62-lot loop fails grade and is replaced | 50–75 | 45 |
| 679197 · 0 Old Clarksville Pike · RS40 · 29.06 ac · 3% slope | 17 lots (neighborhood row) on two streets that converge to a sliver; 17% right-of-way | two interior lots of 1.4 and 2.1 ac | 16–24 | 45 |
| 677449 · 0 Whites Creek Pike · R10 · 10.04 ac | 17 lots on one 1,097-ft street; passes | the north 2 ac | 17–26 | 60 |
| 664765 · 2825 Knight Dr · RS7.5 · 7.0 ac | 17 lots on a ring road; **fails grade** (13.6% over 500 ft); 22.4% right-of-way; two island lots | three greens inside and outside the ring | 20–30 | 30 |
| 676299 · 0 Smith Springs Rd · RS10 · 3.19 ac | 8 lots on a private lane with a full turnaround | three green remnants | 7–10 | 55 |

What a civil does differently on these:

- **Second street.** Dickerson Pike and Whites Creek stop at one spine. A
  parallel street or a court off the spine into the unassigned land is the
  missing 6 to 20 lots. `open.unassigned` at 39% is the engine telling
  itself this.
- **One street, not two that meet.** Old Clarksville Pike's two streets run
  100 ft apart at the south end. A single spine with a loop at the wide end
  serves the same lots on less pavement, and the two oversized interior
  lots split.
- **Knight Dr** is neither withdrawn (the failure is not "by a wide
  margin") nor replaced (the terrace draws 18 and also fails). At 13.6%
  over 500 ft on 10.6% ground, a street laid across the slope instead of
  round a ring should hold 10%.

## 5. A failing default with a passing row beside it

332543 · 1055 Old Dickerson Pike · R20 · 19.13 ac:

- Default: 15 lots on a 1,431-ft street with lots on one side only; fails
  `street.dead_end_max` and `block.length`; 45% unassigned; 536 ft in the
  water-quality buffer.
- The notes say "the street walk could not hold 10% on this ground: its
  steepest station runs 24%", and **the plan carries no `street.grade_max`
  test at all** (value, limit and `ft_over_limit` are null). A 24% station
  is going untested.
- The competition's best is the lane: 7 lots, buildable, no code fails.
- `default_replaced` does not fire. On Hart Ln and Dickerson Pike the
  engine replaces a failing default with a passing plan that has fewer
  lots; here it does not.

Asks: the grade test present on every plan that has a street; and one rule
for replacement. If the default fails a code test and any row passes, the
passing row is the default, whatever the count, with the failing plan kept
as a row. The app keeps the default when it draws more lots, so today this
sheet shows the failing street.

## 6. Multifamily (unchanged; 10 of the 27 misses across the 110)

New evidence from the batch:

| Parcel | What is drawn | Problem |
|---|---|---|
| 664926 · 428 Old Lebanon Dirt Rd · RM2-NS · 4.88 ac | 9 apartments and **235 stalls** (26 per unit); `metrics.stalls` 238, required 16 | The parking field fills the site. And `RM2-NS` has no row in `jurisdiction_zoning_standards`, so the by-right and townhome sides are skipped and this is the only answer offered. Nine homes at two to the acre is the product. |
| 677274 · 0 Hicks Rd · RM4 · 2.12 ac | 8 apartments, 64–85 stalls | Landlocked on every record and 1.5 of 2.1 ac over 25%. The by-right side refuses; this draws. |
| 679218 · 0 Lebanon Pike · RM20 · 11.42 ac | 228 apartments | `metrics.stalls` 113, required 395, 551 in the drawn bays |
| 309819 · 5215 Blue Hole Rd · RM15 · 3.79 ac | 56 apartments | `metrics.stalls` 73, required 97, 135 in the drawn bays. The 44 townhomes (th_v3, no fails) are the better-resolved plan. |
| 672188 · 0 Kidd Rd · RM9 · 5.38 ac | 41 apartments in one bar, parking 600 ft away | Attached homes are the product on a 150-ft-deep strip; th_v3 places 48 and fails three tests |
| 672657 · 0 Old Hickory Blvd · RM4 · 2.0 ac | nothing | Right, with the wrong reason: `planner_generation_not_allowed`, "multi family is not permitted as-of-right on this parcel". RM4 permits it; the parcel is landlocked and 37 ft wide. |

The asks are the ones in the g16 handoff, §8, in the same order: honor the
site's holds, reconcile the stall summary with the bays, stop over-parking
once the unit cap binds, choose attached homes on low-density RM. Add:
a standards row for `RM2-NS` (and a check for any other district code on a
vacant parcel with no row).

## 7. Time

- 681357 · 1716 Red Jacket Dr: `fn_sf_v1_plan_app` alone takes 41 s;
  `fn_sf_v1_candidates_app` does not return in 58 s (it cancelled inside
  `st_slope` under `fn_sf_v1_plan_core` line 1203). At g17 the plan and the
  competition together took about 25 s. The run records its competition as
  an error. Whatever was added for holes or holding answers is expensive on
  a 38-ac parcel with 49 holes.
- New batch: every plan and competition returned; the largest (29 ac) well
  inside the limit.
- Terrain: all 40 fetched on the first or second try; the 20-ac and larger
  parcels take 30 to 55 s to fetch, close to the statement limit.

## 8. What the app changed with this run

Nothing in the app. The scorer changed in one place: on RM land a by-right
side skipped for a reason other than the flood hazard area leaves the
multifamily plan on the sheet (that is what the app does), so the
apartments are the answer scored. It was scoring those as "drew nothing".
The g16 and g17 runs score the same under it.

Contract seen for the first time, all handled without a change:
`lot.min_area`, `access.lane_on_held_land`, `access.exterior_driveways` in
`tests`; the holding-answer and joined-lot notes.

## 9. Acceptance for the next release

Run `node scripts/engine-cohort/score.mjs --store <store> --engine g19
--baseline runs/2026-11-10_g18.json` on all 110.

- Plans **41 of 60 or better** (37 now). In reach: Currey Rd and Hunters Ln
  (the one-sided lane), Dickerson Pike (a second street), Knight Dr (hold
  grade), Old Dickerson Pike (the passing lane as the default), Hessey Rd
  and Hart Ln (one and four lots short).
- Refusals **47 of 50 or better** (46 now). The four misses are all the
  multifamily run on landlocked land.
- The five access disagreements in §2 resolved, each with a message that
  matches its test.
- Every plan with a street carries `street.grade_max`.
- No competition over 30 s on any of the 110.
- No parcel that passes at g18 falls to a miss.
- A migration row.

## 10. For the owner

- Still open from the last handoff: the Metro limits on a shared private
  drive (the engine holds 750 ft and 10 lots, both "to confirm"). Six
  defaults across the 110 now exceed the 750.
- 0 Abbott Martin Rd (681029), the other co-op common area in the cohort,
  still draws one estate lot. With Longwood now refused for the same
  reason, it is the next one to check.
- Whether "one house by the existing access" should be the app's stated
  answer on a landlocked parcel that has a street address.
