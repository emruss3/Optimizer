# App reply · to the engine's g18 note, and a read of g19 · 2026-11-10

From the app side (emruss3/Optimizer) to the engine side (Supabase
`okxrvetbzpoazrybhcqj`). Answers "Engine reply · g17 handoff · release g18"
in its order, then reports what was measured on g19, which shipped at 21:30
UTC while this was being written (`sf_v1_engine_g19`, `engine_release`
= `g19`).

## 0. Short version

- Your g18 note checks out against the live engine. The migration row and
  `engine_release` are there; thank you for both.
- Our scorers agree on plans exactly (23 of 39 on the original 70 at g18).
  They differ on refusals by three, for a reason that is not yours (§1).
- The app now reads every g18 contract item. One was a real bug on our
  side: a figure row with `pass: false` was counted as a failed check (§2).
- Checking that turned up something worse, also ours: the app's overlap
  gate was throwing away two whole g18 plans (Hart Ln, Brittany Park). Fixed
  (§3). One ask of you comes out of it.
- Your calls: Old Hickory Blvd RS20 stays 2–5. The three hillside targets
  should come down, and that is the owner's decision, not mine (§4).
- **g19, all 110 parcels: plans 39 of 60, refusals 46 of 50.** The new 40:
  16 of 21 and 18 of 19. Currey Rd and Hunters Ln are fixed by the
  one-sided lane; both read as what a civil would draw (§5).
- Next asks, in order: the replacement rule picks the wrong passing plan
  (§6.1), a lane almost wholly on held land still takes a plan (§6.2), then
  yield on flat tracts and multifamily, both unchanged.

## 1. Scoreboards

| | Yours (c12, 70 parcels) | Mine, g18 (same 70) | Mine, g19 (same 70) | Mine, g19 (all 110) |
|---|---|---|---|---|
| Plans | 23 of 39 | 23 of 39 | 23 of 39 | 39 of 60 |
| Refusals | 31 of 31 | 28 of 31 | 28 of 31 | 46 of 50 |

The three refusals you pass and I do not are 679195 Old Lebanon Dirt Rd,
678148 Hickory Hollow Pkwy and 673974 Hicks Rd. On each the by-right side
is right and the multifamily run still draws apartments, which is what the
app puts on the sheet, which is what my scorer scores. They will pass on my
side the day the multifamily run honors the same access finding.

Note on one line of your §6: you report Hessey Rd's default as the 9-lot
lane. Live, at g18 and at g19, the default is 9 lots on the single street
and the lane is the competition's best at the same 9. The count is the
same either way; the lots (28,590 / 29,962 / 36,555 SF) are still uncut.

## 2. What the app does with the g18 contract

| Field | App |
|---|---|
| `tests['lot.min_area']`, in `fails` when a lot is under | A code fail like any other; counted in the header chip. Gross lot area noted. |
| `tests['access.lane_on_held_land']`, `pass: false`, not in `fails` | A flag on its row (amber "!"), never a failed check. **This was a bug here**: with `fails: []` the app fell back to counting every `pass: false` row, so 0 Swiss Ave's by-right plan read "1 of 16 checks fail". The engine's list is now the list whenever it is sent, even empty. |
| `remainder_ac`, `remainder_lots` | From one acre up: a line in the panel ("11.7 ac inside 7 oversized lots is not planned…") and the header chip reads "All 15 checks pass · 11.7 ac not planned" in amber, not green. This is the "13 lots, all pass" problem closed on the sheet. |
| `metrics.lane_w_ft`, `easement_w_ft` | Used as sent; measured off the drawing only when absent. |
| `drive_ft` on competition rows | Used by the scorer's same-lots rule. |
| `holes`, `holes_ac`, the common-land refusal | Shown through `reason`; no change needed. Longwood reads "0 lots by right — the parcel is the common land round 5 other owners' lots…". |
| `default_replaced` | Shown through the note, as before. |
| `access` (g19) | Not read yet; the notes carry it. It will replace the app's own frontage sentence next pass. |

## 3. Found on our side: the overlap gate was discarding whole plans

The app refuses to draw any plan in which two elements overlap by more than
1 m². Run over every g18 answer, it rejected two by-right plans outright,
and the sheet showed "No plan on the sheet · Plan rejected":

- **680596 · 0 Hart Ln, 51 lots.** "building overlaps drive (2 m²)". Not an
  overlap. The app trims each driveway to its house, which left corner
  points a few microns apart; the polygon library throws on those, and the
  gate read a throw as 2 m². It now cleans the rings to a millimetre and
  measures again. Nothing for you to do.
- **678964 · 0 Brittany Park Dr, 13 lots.** "drive overlaps drive (7 m²)":
  the driveways of lots 5 and 12 in `drives_wkt` share 6.7 m² of pavement.
  The app now cuts each driveway to the ones drawn before it (a shared
  apron is one slab), so the plan draws.

All 127 default and best plans at g18, and the g16 and g17 answers, pass
the gate now. Ask: keep `drives_wkt` free of driveway-on-driveway overlap,
or say when two driveways are meant to share pavement. A test like
`access.exterior_driveways` is the natural home.

## 4. Your calls

**673844 · 0 Old Hickory Blvd RS20: the target stands at 2–5.** The sheet
at g17 (a public street and bulb across the flood hold for two houses) I
read at 35, so losing it costs nothing real. But one lot is not the civil's
answer either. The lane row fails on a single station at 19.1% against 15%
(17% for 100 ft). That is a grading problem, a few feet of cut over one
station, which is the ordinary work of a lane. It is a different thing from
Hitt Ln's 34%. What would let this pass honestly: the lane's grade test
reporting the cut needed to bring the station inside the peak, the way the
street test reports `needs_grading`, with a bound on how much cut counts as
ordinary.

**Hitt Ln, 8282 Charlotte Pike, Newsom Station: I accept the measurement.**
Walks at 27 to 36% are not lanes, and the correction on the driveway (a
straight line, not a route) removes the premise my ask stood on. The
`lane tried:` note is the right way to say it. Those three targets were set
in the first batches from plans drawn before the hillside hold existed.
Proposed, with the same evidence applied to two more:

| Parcel | Target now | Proposed | g19 would |
|---|---|---|---|
| 659655 · 1019 Hitt Ln | 12–25 | 1–4, no public street, a refusal acceptable | pass (1) |
| 659670 · 8282 Charlotte Pike | 5–6 | 2–4, no public street | pass (2) |
| 675128 · 0 Newsom Station Rd | 5–10 | 1–4, no public street, a refusal acceptable | pass (1) |
| 680202 · 0 Campbell Rd | 2–4 | 1–2 (0.78 ac off the holds at 1,211 ft) | pass (1) |
| 679273 · 0 Old Hickory Blvd R15 | 3–9 | 1–3 (1.75 ac off the holds; no lane corridor) | pass (1) |

**These are not applied.** They would move five misses to passes without
the engine changing, which makes it the owner's call: the cohort is his
measure. With them the original 70 read 28 of 39 and all 110 read 44 of 60.

**681029 · 0 Abbott Martin Rd.** No holes (0 interior rings; 10.76 ac inside
and out). The owner of record is a cooperative corporation, which the
engine cannot be asked to know. The rule is right not to fire. It stays in
the cohort as a refusal on ownership.

**§7.1, turnaround.** Agreed: Cato (212 ft) and Stewarts Ferry (207 ft) are
past 150 ft, so the ask reduces to the hammerhead and its end-lot rule.

**Timing, Red Jacket.** At g18 the plan alone took 41 s from here and the
competition did not return in 58 s. At g19 the plan took 29 s and the
competition 21 s, so that is fixed. The app has no timeout of its own under
a minute; a statement cut by the API role's limit shows as a retryable
failure, not as an engine error.

## 5. g19 as measured

Harvested 21:24 to 21:45 UTC, after the function bodies had settled (the
definitions were identical before and after the harvest). Plan and
competition for all 110.

| | g18 | g19 |
|---|---|---|
| Plans, all 110 | 37 of 60 | **39 of 60** |
| Refusals, all 110 | 46 of 50 | 46 of 50 |
| Plans, new 40 | 14 of 21 | **16 of 21** |
| Mean likelihood, plans, new 40 | 48.6 | **51.9** |
| Plans at 60 or better, new 40 | 6 of 21 | **8 of 21** |
| Mean likelihood, refusals, new 40 | 74.7 | 76.1 |

Nothing that passed at g18 fell. Sixteen sheets changed; I drove and read
all sixteen.

### What landed from the batch-5 handoff

| Asked | g19 | Read |
|---|---|---|
| A lane down one side of a deep narrow strip | 675439 · 0 Currey Rd: 2 → **4 lots** on a 507-ft lane along the north line. 678549 · 0 Hunters Ln: 4 → **9 lots** on a 1,203-ft lane along the west line, 110 × 185 lots | Both are the plan a civil draws. 40 → 65 and 35 → 70. `default_replaced.why`: "the no-street plan carries 3.45 ac it does not plan" is exactly the trigger. |
| One access function with a typed answer | `access: {type, edges, method, message}`; `narrow_touch`, `private_lane` seen | The messages now say what was measured ("touches Woodland Way for 22 ft with no straight run of 40 ft: room for a driveway, not for a street"). |
| Landlocked with an address or a narrow touch is one house | 669278 Woodland Way, 406289 and 678361 Trail Hollow Ln, 680449 Campbell Rd, and on the original 70 Hillenglade Dr and Eagle Rdg: "the parcel as one lot, one house by the existing access" | Right. The app shows it with "access via easement assumed" and the unplanned acreage. |
| Frontage the street layer does not carry | 672188 · 0 Kidd Rd: landlocked → 24 lots on a 222-ft street, with "taken as a public right-of-way the street layer does not carry; confirm the road is built" | The right call and the right caveat. The sheet is still the 41 apartments (§6.4). |
| A failing default with a passing row beside it | 332543 · Old Dickerson Pike: the 15-lot street (now also failing grade, so the test is there) is replaced by the 7-lot lane | Passing now, and see §6.2. |

## 6. Asks for the next release, in order

### 6.1 The replacement picks the lane when a better plan passes

679197 · 0 Old Clarksville Pike, RS40, 29 flat acres. The 16-lot street
fails the dead-end test, so the default is replaced by the lane: **7 lots**
("kept to the 10 lots a shared drive may serve; it reached 18 on 1,477
ft"). In the same competition the neighborhood row draws **17 lots with no
code fail** (`best_buildable: true`). The app sheets the 17 because it
draws more, so the count is right on the sheet, but the engine's own
default on 29 flat acres is seven houses. Rule: when the default fails a
code test, replace it with the passing row that draws the most lots, not
with the lane by preference. The lane is the fallback when nothing else
passes.

### 6.2 A lane 86% on held land takes the plan

332543 · 1055 Old Dickerson Pike. The replacing lane is 705 ft, 603 ft of
it across the flood hold and the wetland buffer (`share: 0.86`), to four
lots in a pocket the sheet shows inside the hillside hold; only 3 of the 7
lots carry a house plan. The g18 rule stops such a lane taking a plan "for
one extra lot"; here it gains four, so it passes. A civil draws the three
frontage lots on Old Dickerson Pike and stops. Ask: above some share of
held land (say three quarters) the lane does not take the plan at any
gain, and lots it reaches are checked against the hillside hold like any
other pad. 20 → 30 as drawn; it is one lot under its 8–16 target and
would be right at three.

### 6.3 Unchanged from the batch-5 handoff

- **Yield on flat tracts** (§4 there): 677102 Dickerson Pike 45 of 50–75
  with 39% unassigned; 677449 Whites Creek 17 with the north 2 ac unused;
  664765 Knight Dr 17 on a ring that fails grade. A second street off the
  spine is still the missing step.
- **0 Lebanon Pike** (679218): now "reached by a private lane … 291 ft of
  it within 15 ft", one house. The edge list is still "other 1910 ft, rail
  927 ft, open_edge 505 ft". If the 1,910 ft of "other" is the highway's
  right-of-way parcel, this 11-ac RM20 tract fronts a US route and the
  answer is wrong; if a strip in other ownership lies between, it is
  right. It needs a look at what that neighbour is.
- **Brittany Park's second lane, Hart Ln's lane off the terrace, the
  hammerhead**: as you listed them.

### 6.4 Multifamily

Still untouched, and now 10 of the 25 misses. The by-right side keeps
getting better at saying when land has no access, and the multifamily run
keeps drawing on it: 677274 Hicks Rd and 678148 Hickory Hollow now read
"one house by the existing access" beside 8 and 9 apartments. One call to
the same `fn_parcel_access` before the massing would close four refusal
misses. The rest is as written in the batch-5 handoff §6: 235 stalls for 9
units on RM2-NS (which still has no standards row), the stall summary
against the bays, attached homes on low-density RM.

## 7. Acceptance for g20

Run `node scripts/engine-cohort/score.mjs --store <store> --engine g20
--baseline runs/2026-11-10_g19.json` on all 110.

- Plans 42 of 60 or better (39 now) under today's targets.
- Refusals 48 of 50 or better (46 now): two of the four multifamily draws
  on land with no access gone.
- Old Clarksville Pike's default is the 17-lot plan; Old Dickerson Pike's
  lane does not cross 600 ft of held land for four lots.
- No competition over 30 s on any of the 110.
- Nothing that passes at g19 falls.

## 8. For the owner

- The five target changes in §4. Yes or no.
- Still open: the Metro limits on a shared private drive (750 ft, 10
  lots), the lane grade (15%, 17% for 100 ft), whether the district
  minimum is gross lot area, and whether Longwood and Abbott Martin stay
  in the cohort.
- New: 7963 Charlotte Pike has had no answer in three handoffs. Frontage
  or not.
