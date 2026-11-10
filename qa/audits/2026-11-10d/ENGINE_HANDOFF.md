# Engine handoff · batch 6 and the batch-5 re-run · measured on g21 · 2026-11-10

From the app side. 60 parcels: the 40 of batch 5 again, and 20 new ones drawn
at random (`md5(ogc_fid || ':batch6')`, same filters as batch 5). All
answers were harvested between 22:43 and 22:50 UTC with `engine_release` =
`g21` and last migration `20261110224254` before and after. A first pass
straddled `sf_v1_g21_time_budgets` and is not used.

## 0. The owner's question, and the answer

The owner asked today: "We are making very small changes with each round. I
should see better outcomes."

The numbers agree with them.

| Same 40 parcels | g18 mid-patch | g19 | g21 |
|---|---|---|---|
| Plans where a civil would draw one, of 21 | 14 | 16 | 17 |
| Refusals where nothing belongs, of 19 | 18 | 18 | 18 |
| Usable lots against the target midpoint | 78% | 86% | 88% |

| 20 new parcels, first look | g21 |
|---|---|
| Plans, of 11 | 8 |
| Refusals, of 9 | 7 |

Two of the passes are not real. In the 40, Old Dickerson Pike passes on a
lane your own rule blocks (§5.1), so counted honestly the 40 did not move
from g19. In the new 20, Pennington Bend Rd passes with driveways on Briley
Pkwy (§4), so the honest count there is 7 of 11.

Three rounds have fixed the cheap items: wording, flags, one lane, a
replacement rule. The three defects below cost most of the lots and have not
been started. They are ranked by what they cost. Please take them in this
order and do §1 before anything else.

| Rank | Defect | Parcels it costs in these 60 | Lots or homes at stake |
|---|---|---|---|
| 1 | The street is tested on raw ground, one station at a time (§1) | 4 plan misses, 2 more held down | 45 lots on four parcels |
| 2 | Streets that carry lots on one side, and lots twice the minimum (§2) | 4 | 15 to 25 lots |
| 3 | Multifamily: no access check in effect, parking that fills the site, apartments where attached homes fit (§3) | 6 | 3 wrong refusals, 3 wrong products |
| 4 | Frontage counted on a road no driveway may enter (§4) | 1 | a false pass |
| 5 | Small things in g20 and g21 that are not as the reply says (§5) | 3 | |

---

## 1. The street grade test throws out the best plan on rolling ground

This is the largest loss in the cohort and it is one mechanism.

On each parcel below the engine drew a street plan in or near the target,
then threw it out on `street.grade_max`, and fell back to a frontage plan or
a smaller pattern. I asked for each thrown-out plan by name
(`{"pattern": …}`) and read its test.

| Parcel | District, acres | Default that passes | Plan thrown out | Worst 100-ft station | Street over 10% | `cut_ft_at_worst_station` |
|---|---|---|---|---|---|---|
| 677102 0 Dickerson Pike | RS7.5, 19.8 | single street, 47 | loop, 62 | 20.1% | 300 ft | 10.1 |
| 664765 2825 Knight Dr | RS7.5, 7.0 | frontage lots, 10 | loop, 18 | 13.6% | 500 ft | 3.6 |
| 680757 0 Moss Rd | RS7.5, 8.5 | frontage lots, 9 | neighborhood, 25 | 15.3% | 1,000 ft | 5.3 |
| 699525 4775 Drakes Branch Rd | RS15, 30.4 | terrace, 44 | loop, 50 | 15.3% | 800 ft | 5.3 |
| 332543 1055 Old Dickerson Pike | R20, 19.1 | estate lots, 6 | single street, 17 | 18.0% | 700 ft | 8.0 |
| 660601 2840 Old Franklin Rd | RM15, 8.7 | grid, 24 | loop, 29 | 10.9% | 200 ft | 0.9 |

The first four are plan misses today. Their defaults total 110 lots. The
plans thrown out total 155. That is 45 lots, 29% of the yield, on four
parcels.

The test is right on truly steep land and should stay there:
679632 Whites Creek Pike at 29.1%, 485279 Brick Church Pike at 34.1%,
666342 Hitt Ln at 47.1%.

### What is wrong

1. **It measures the ground, not a street.** `value` is the slope of the
   existing ground under the centreline over one 100-ft station. No street
   is built on existing ground. A civil sets a profile: a grade line at or
   under the limit with vertical curves, and the ground is cut and filled to
   it. None of that is modelled. `cut_ft_at_worst_station` is not earthwork.
   In every row above it equals `value − limit`, the extra rise over one
   station.
2. **It fails a plan that needs 0.9 ft.** Old Franklin Rd's loop needs 0.9 ft
   at its worst station. `cut_ft_allowed` is 2. It still fails, because
   200 ft is over 10% and the peak allowance covers one station. Two tests
   are disagreeing inside one.
3. **Nothing turns the street when the run over the limit is long.**
   On Moss Rd every grammar fails: grid 24, neighborhood 25, loop 20, single
   22, terrace 24. The land rolls at 14% with nothing over 25%. Streets
   drawn square to Moss Rd run straight down that fall for 600 to 1,000 ft.
   A civil would run the street along the slope and step the lots down from
   it. The terrace grammar is meant to do that and it fails the same test
   with 24 lots, so it is not following the contour here.

### What to build

- **A design profile for every street and lane.** Take the centreline ground
  at 25-ft stations. Fit a grade line with grade at or under the limit and a
  vertical curve at each break. Report `max_cut_ft`, `max_fill_ft`, the
  length in cut or fill over 4 ft, and the cut and fill volumes over the
  right-of-way width. Pass when the profile exists and `max_cut_ft` and
  `max_fill_ft` are within the bound. Keep the raw ground figure as a second
  line so the sheet can show both.
- **One bound, the owner's.** Today the allowance is 2 ft at one station.
  From this data:

  | Bound on cut or fill | Plans it would let through here |
  |---|---|
  | 2 ft, today | Old Franklin Rd loop 29, once the length rule stops overriding it |
  | 4 ft | Knight Dr loop 18 |
  | 6 ft | Moss Rd neighborhood 25, Drakes Branch loop 50, the Old Hickory RS20 lane at 4.1 |
  | 8 ft | Old Dickerson Pike single street 17, if its dead end and block length are also fixed |
  | 10 ft and over | Dickerson Pike loop 62 |

  These are from the one-station figure and will change once a profile is
  fitted. A long run over the limit needs more cut than one station shows.
- **Turn the street before giving up.** When more than 300 ft of a street is
  over the limit, try the same grammar with the spine rotated to the contour
  direction at the parcel centroid, and the terrace with arms on the
  contour. Report the angle between each street and the contour.
- **Do not withdraw to frontage lots while a street plan is within 6 ft.**
  Show the street plan as the default with the grading it needs as a flag
  and a quantity. "25 lots, 5 ft of cut over 1,000 ft of street" is an
  answer a developer can price. "9 lots and 6.1 ac not planned" is not.

### Acceptance

| Parcel | Today | Wanted |
|---|---|---|
| 680757 Moss Rd | 9 | 20 or more, on a street that passes |
| 664765 Knight Dr | 10 | 18 or more |
| 677102 Dickerson Pike | 47 | 55 or more |
| 699525 Drakes Branch Rd | 44 | 50 or more |
| The three steep parcels above | refused | still refused |

The five lane parcels from earlier handoffs fail on the same test and should
be re-run under it: 1019 Hitt Ln, 8282 Charlotte Pike, Newsom Station Rd,
Campbell Rd, Old Hickory Blvd RS20.

---

## 2. Streets loaded on one side, and lots twice the minimum

The plans that do pass leave lots on the table in the same two ways.

| Parcel | Lots | Street | Lots per 100 ft of street | Average lot against the minimum | Lots over twice the minimum | Not planned |
|---|---|---|---|---|---|---|
| 699525 Drakes Branch Rd, RS15 | 44 | 4,053 ft | 1.09 | 1.60 | 10 | 2.07 ac in 3 lots |
| 677102 Dickerson Pike, RS7.5 | 47 | 1,798 ft | 2.61 | 2.02 | 18 | 4.93 ac in 14 lots |
| 677449 Whites Creek Pike, R10 | 17 | 1,097 ft | 1.55 | 1.67 | 4 | 0.49 ac, and 22% open |
| 679197 Old Clarksville Pike, RS40 | 17 | 4,558 ft | 0.37 | 1.46 | 2 | none |
| 677761 Nora Ln, RS10 | 4 | 329 ft | 1.22 | 1.45 | 1 | 23% open, 20% right-of-way |

A street with 85-ft lots on both sides carries 2.35 lots per 100 ft.
Drakes Branch carries 1.09, so more than half its street frontage has no
lot on it. Dickerson Pike loads its one street well and then stops: 18 of
47 lots are more than twice the minimum because the land behind them has no
street.

### What is wrong, parcel by parcel

- **Drakes Branch Rd.** 4,053 ft of street with three dead ends and a
  circle in the middle, for 44 lots. The lots are labelled 85 by 180 ft on
  a 15,000-sf district, where 85 by 180 is already 15,300, and they still
  average 23,900. 44 lots is 1.45 per acre on RS15, where 2.0 to 2.3 is
  ordinary.
- **Dickerson Pike.** One street, 47 lots, and 4.93 ac carried inside 14
  lots. This is the second street, asked for in three handoffs.
- **Nora Ln.** A 2.33-ac infill site gets a full cul-de-sac bulb in its
  centre, 0.35 ac called "street island / green (too shallow for a lot)",
  and four lots. Street and open land take 43% of the site. About six lots
  fit on a short stub with a hammerhead.
- **Old Clarksville Pike.** 268 ft of public street per lot. It passes on
  count and no developer builds it.

### What to build

1. **The second street.** When `remainder_ac` is over 2 ac in lots that
   back onto one street, stub a second street off the first between two
   lots and lot both sides of it. Then run the grade profile on it.
2. **Cut every oversized lot again.** After lotting, any lot over twice the
   minimum with twice the minimum width on a street is split. You do this
   once now ("1 lot added by lotting a remainder lot again"). Do it until
   nothing splits.
3. **Lot both sides or do not draw the street there.** Report
   `lots_per_100ft_street` as a test. Under 1.8 on standard lots is a flag.
   A street segment with no lot on either side for 100 ft is removed.
4. **Depth.** Set block depth from the district's lot, not from what is
   left over. A lot more than 1.5 times the standard depth gives its back
   to the next block or to the second street.
5. **Small sites.** Under 3 ac or under 10 lots: a hammerhead or T
   turnaround, not a bulb. No amenity piece under 0.25 ac. Under the
   owner's rule of today that land joins a lot.

### Acceptance

Drakes Branch 55 or more. Dickerson Pike 55 or more with under 2 ac
unplanned. Nora Ln 6. Whites Creek Pike R10 20 or more.

---

## 3. Multifamily: three defects, untouched for four rounds

Four of the 20 new parcels are RM. Three of the four sheets are wrong.

### 3.1 The access guard is not in effect

Your reply says `fn_generate_mf_site_plan_v2` "refuses on `none` and
`private_lane`" and that `assume_access` bypasses it. The deployed function
reads:

```
IF payload->>'type' IN ('none','private_lane')
   AND jsonb_typeof(p_pins) = 'object'
   AND coalesce((p_pins->>'require_access')::boolean, false) THEN …
```

So it refuses only when the caller sends `require_access: true`. The app
sends pins as a list, as it always has. Nothing changed on any sheet:

| Parcel | `access.type` | Drawn at g21 |
|---|---|---|
| 677012 0 Whites Creek Pike, RM9 | `private_lane`, 17 ft of lane within reach | 10 apartments |
| 405068 262 Martingale Dr, RM20 | `none`: the open edge is the railroad | 35 apartments |
| 677274 0 Hicks Rd, RM4 | `private_lane` | 8 apartments |
| 679218 0 Lebanon Pike, RM20 | `private_lane` | 228 apartments |

Say which you mean. If refusal is the default, drop the `require_access`
condition and keep `assume_access` as the way round it. If it is opt-in,
say so in the contract and the app will send the pin once the owner rules
on `private_lane`. That rule is still open with the owner.

One more point. `fn_parcel_frontage` still reports 404 ft of frontage and
`landlocked: false` on 262 Martingale Dr. That edge is the railroad.
Whatever reads that function reads a street there.

### 3.2 Parking sized to the site, not to the homes

679632 0 Whites Creek Pike, RM4, 4.31 ac. Density allows 17 homes. The plan
is one 3-storey building of 17 units in the south-east corner and six
parking fields that cover the rest of the parcel. The plan's own count is
237 stalls for 17 homes, 14 per home. This is the same
defect as 428 Old Lebanon Dirt Rd, 235 stalls for 9 units, reported in two
handoffs.

The plan's own metrics say it: `stalls_required` 30, `stalls` 237,
`parking_ratio_provided` 13.94.

On 660601 2840 Old Franklin Rd the summary does not agree with itself:
`stalls` 53, `stalls_required` 225, `parking_ratio_provided` 3.72 for 130
units, and the bays on the sheet are labelled for about 240.

Build: stalls = units × the district's ratio, plus guest stalls, rounded up
to whole bays. Stop laying bays when that count is met. The land left over
is open space or a second building, never paving.

### 3.3 Apartments where attached homes fit

On the same parcel your own competition draws 17 townhomes on a street,
buildable, no fails. The massing draws 17 apartments. Same count, and the
district is 4 homes per acre. No one builds a walk-up at 4 per acre.

Build: on RM at 9 homes per acre or under, the attached row is the
multifamily answer when it reaches the density. The app keeps apartments on
a tie today because that is the owner's stated rule. I am putting the
change to the owner (§7).

Still missing from earlier rounds: 672188 Kidd Rd, 664926 Old Lebanon Dirt
Rd.

---

## 4. Frontage on a road no driveway may enter

672722 0 Pennington Bend Rd, R15, 3.64 ac. `access.message` is "public
street frontage: 470 ft on Briley Pkwy". The plan is six frontage lots, "no
new street", with the three standard lots and their driveways on that edge.
`lane_name` is Pennington Bend Rd with 65 ft within reach.

Briley Parkway is a controlled-access state route. I could not confirm that
from a class field: I found no functional class on the street data the
access function reads, and the two road tables I could see hold 68 and 310
rows. Treat the class as my knowledge, not a measurement.

Build: carry a class on every centreline. Motorway, trunk, ramp and any
controlled-access route give no frontage and take no driveway. A parcel
whose only street edge is one of those is `narrow_touch` or `none` by
whatever else it touches. Here the plan should enter from Pennington Bend
Rd.

This parcel scores as a pass today on its count, 6 in 5 to 8. It is not
one.

---

## 5. g20 and g21 against the reply

### 5.1 The lane block is not in the competition

Reply §2: above 75% on held land "the lane takes no plan, in the default
path and in the competition". On 332543 Old Dickerson Pike the default path
does block it: 6 estate lots. The competition does not:

| Row | Lots | Fails | Lane on held land | `best` |
|---|---|---|---|---|
| drive | 8 | none | 603 of 705 ft, share 0.86 | yes, "buildable as drawn" |

`lane_on_hold_share_block` is 0.75. The sheet takes the competition's best
when it has more lots and no fails, so the sheet shows the blocked lane and
the parcel scores as a pass at 8. The rows carry no share, so the app
cannot filter it. Apply the block in the competition, and put
`lane_on_held_land_share` on each row.

### 5.2 `remainder_ac` counts held land

Now that it is on every plan it reads wrong on hillside parcels.

| Parcel | `remainder_ac` | Hillside held | Buildable and not planned |
|---|---|---|---|
| 485279 4080 Brick Church Pike | 7.12 | 5.77 | 1.35 |
| 666342 1021 Hitt Ln | 28.33 | 13.08 | 15.25 |
| 679942 2855 Old Hickory Blvd | 13.09 | | |

The sheet says "7.1 ac not planned" on a parcel that is three-quarters too
steep to plan. Send `remainder_buildable_ac`, or take holds out of
`remainder_ac`.

### 5.3 Confirmed as you described

- 679197 Old Clarksville Pike: default is the 17-lot neighborhood.
- 664765 Knight Dr: 10 frontage lots, no fails, the failing loop in
  `default_replaced`.
- 677102 Dickerson Pike: 47 lots, `remainder_ac` 4.93 in 14 lots.
- Time: the slowest competition in the 60 was 18.5 s, Drakes Branch Rd.
  None over 20 s.

### 5.4 One access reading to look at

673347 0 Wright Ave, RS10, 2.88 flat ac. `private_lane`: "Wright Ave is
mapped along or across the boundary (197 ft of it within 15 ft) over
neighbouring parcels". A named avenue beside a vacant RS10 tract is more
often a public street on an easement or an unrecorded dedication than a
private lane. One lot is the safe answer and the target accepts it. It
needs a person to look.

---

## 6. The 20 new parcels

Targets are in `scripts/engine-cohort/cohort.json` with `batch: 6`. Sheets
are beside this file as `<fid>.png`.

| Parcel | District, acres | Target | g21 | Result | What a civil would say |
|---|---|---|---|---|---|
| 679627 0 Knight Dr | RS20, 2.46 | refuse | nothing | pass | Right. No street, 1.5 ac steep. |
| 674590 0 Buffalo St | R15, 1.61 | refuse | nothing | pass | Right. |
| 395119 317 Connare Dr | RS20, 1.53 | 2 to 3, no street | 3 estate lots | pass | Three lots is right. With 316 ft on the street, plain frontage lots look possible where it draws flags. |
| 677761 0 Nora Ln | RS10, 2.33 | 5 to 8 | 5 on the sheet, 4 by default | pass | Low. The bulb and greens take 43% of the site. §2. |
| 673347 0 Wright Ave | RS10, 2.88 | refuse | one lot | pass | Safe. §5.4. |
| 660480 3262 Kings Ln | RS40, 5.44 | 3 to 5 | 4 on a 1,090-ft drive | pass | Right count. The drive is 340 ft over Metro's limit and is flagged. |
| 672722 0 Pennington Bend Rd | R15, 3.64 | 5 to 8 | 6 frontage lots | pass on count | Wrong. Driveways on Briley Pkwy. §4. |
| 676928 0 Buena Vista Pike | RS15, 2.89 | refuse | nothing | pass | Right on this data. |
| 670613 0 Old Charlotte Pike | R80, 6.52 | refuse | nothing | pass | Right. |
| 677434 0 Union Hill Rd | RS40, 6.04 | refuse | nothing | pass | Right. |
| 680757 0 Moss Rd | RS7.5, 8.48 | 20 to 32 | 9 frontage lots | miss | 6.1 ac not planned. Every street fails the grade test. §1. |
| 485279 4080 Brick Church Pike | RS20, 7.57 | refuse | one lot | pass | Right. |
| 672095 0 Hudson Rd | RS80, 15.47 | 5 to 8 | 5 estate lots | pass | The low end. Two flag lots of 4.9 ac each hold 6.1 ac. A drive behind the frontage lots would give about 7. |
| 699525 4775 Drakes Branch Rd | RS15, 30.41 | 48 to 70 | 44 on a terrace | miss | A real plan, thin. §2. The 50-lot loop is thrown out on grade. §1. |
| 300575 3432 Hobson Pike | RS80, 15.41 | 4 to 7 | 5 on a 1,528-ft drive | pass | Right count. The drive is twice Metro's limit and crosses the wetland buffer at the entrance. |
| 666342 1021 Hitt Ln | R20, 28.79 | 1 to 4, or nothing | one lot | pass | Right. A 49-ft pole and 13 ac steep. |
| 677012 0 Whites Creek Pike | RM9, 1.92 | refuse | 10 apartments | miss | No street. §3.1. |
| 660601 2840 Old Franklin Rd | RM15, 8.69 | 100 to 130 homes | 130 apartments | pass | Five bars with parking between. Plausible. |
| 679632 0 Whites Creek Pike | RM4, 4.31 | 12 to 17 attached | 17 apartments | miss | 237 stalls for 17 homes. §3.2, §3.3. |
| 405068 262 Martingale Dr | RM20, 2.04 | refuse | 35 apartments | miss | The open edge is the railroad. §3.1. |

## 7. For the owner

- The bound on cut and fill for a street or lane. §1 has what each figure
  lets through.
- The access rule on multifamily. Still open from the last reply.
- On RM at 9 per acre or under, attached homes ahead of apartments on a
  tie.
- 0 Wright Ave needs a person to look at the street.

## 8. Acceptance for the next release

Score all 130 with `node scripts/engine-cohort/score.mjs --store <store>
--baseline scripts/engine-cohort/runs/2026-11-10_g21.json`. One
`engine_release` before and after.

- The four grade parcels in §1 at their wanted counts. This alone is the
  release.
- No plan refused on grade that needs under 2 ft.
- The competition's best is never a lane over the block.
- Nothing that passes at g21 falls. The three steep parcels stay refused.
