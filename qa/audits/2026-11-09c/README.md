# The Site Planner scope, P0 baseline and the first release: one plan across every surface — 2026-11-09

The scope ("Parcel Proforma Site Planner · implementation scope for Claude
Code") names four regression parcels from the first browser review and ten
from the follow-up on build `3e46df3`, and asks that each be reproduced on
the current build before a root cause is assigned. This folder is that
reproduction, on build `892a35d` (main after PR #123), and the first
release: P0.1, every surface reading the same plan.

## How the reproduction was run

The sandbox cannot reach the deployed app, so the actual workflow was driven
on the same code locally: the engine's answers for the fourteen parcels were
harvested live from the database (every RPC the planner calls), served to a
dev build through the fixture mock, and the planner was opened for each
parcel the way the battery opens it (the parcel drawer → Site Planner → the
default generation), with the header, the KPI strip, the unit table, the
layout panel, the canvas and the evidence hook recorded. A response from a
solver is not a rendered layout; what is reported below is what the sheet
drew. USGS 3DEP was refusing fetches during the run; the two multifamily
reconciliation parcels have terrain cached and were graded with it.

| APN | Parcel | Zoning | Terminal outcome on the current build |
|---|---|---|---|
| 05900020800 | 0 Whites Creek Pike (680339) | RM9 | **Reproduced.** 53 apartments, 80,471 GSF. Header "8 studios, 35 one-beds, 30 two-beds, 14 three-beds" (87 units); table "1 Bed 1" (53); canvas bays labelled 32 / P·10 / P·8 / 49 / 108 stalls (292) under a header of 85; KPI 85 / 92 with "Code compliant · constrained: coverage-capped +1"; table "Pkg req" 80. |
| 06000003400 | 2937 Brick Church Pike (486359) | RM15 | **Reproduced.** 29 apartments; KPI 74 / 51 "Code compliant"; the bays hold 13 + 57 + 2 = 72; table "Pkg req" 40. 3D not exercised by the drive. |
| 07106006700 | 0 W Trinity Ln (675987) | RS5 | Skipped for the floodplain (0.81 ac held, the whole site), the hold hatched, the one house and the fill scenario offered. No massing error overlay on this build. |
| 07106007700 | 1360 Brick Church Pike (478622) | CL | **Reproduced the routing and the dead spinner.** The permitted-use resolver returns commercial, industrial and multi-family (permitted with conditions) with multi-family as the suggested primary use, so the planner opened on "multi family", compiled a multifamily context and dispatched the massing solver. With no plan served the banner read "Server plan failed" while the header stayed on "Generating plan…". The commercial context compile timed out inside the engine's built-form sampler on both commercial lots. |
| 10605001000 | 73 Nance Ln (660724) | CS | Same path as 1360 Brick Church Pike: multi-family by default, the massing solver dispatched. |
| 13402000900 | 1289 Currey Rd (616415) | RS10 | Skipped: landlocked ("no edge touches a mapped street; no vacant neighbour to connect through"); the one house offered with "a house here assumes an access easement across a neighbour, which is not by right." The house sketch's own badge is P0.2 work. |
| 14700001502 | 339 Wallace Rd (664534) | MUL-A-NS | "Massing blocked — zoning context unavailable": the multifamily context compile timed out live. Map selection was not exercised here. |
| 16300005500 | 5118 Mt View Rd (668869) | RM20-NS | **A worse case of the Whites Creek bug.** 168 apartments in ten bars; header "38 studios, 140 one-beds, 126 two-beds, 51 three-beds" (355); table total **215** under a KPI of 168, with "1 Bed 0". No single-family standard for RM20-NS, so no neighborhood plan. |
| 16300013700 | 5515 Mt View Rd (660871) | RM15 | **A hidden shortfall.** Header 56 stalls, 52 required, "Code compliant"; the bays hold 46. |
| 12100019400 | 0 Bell Rd (673908) | R20 | The by-right generator answered on this build (3 lots on a shared drive, from the competition); the legacy fallback the review saw could not be reproduced because the service was reachable. The fallback's vocabulary ("0 apartments in six 1-story buildings") is P0.3 work. |
| 07400008500 | 2250 Neelys Bend Rd (661546) | RS80 | Skipped for the floodplain, 13.75 ac held, the hatch over the whole site. Kept as the scope asks. |
| 03313000600 | 0 Fonnic Dr (675772) | RS20 | 0 lots, landlocked, with the reason and the `access.landlocked` fail; terrain cached on this run. |
| 00900012000 | 0 Ivey Point Rd (680396) | RS80 | **Reproduced the contradictory text.** The engine's skip reason: "landlocked: the longest touch on a street is 2069 ft … (neighbours by edge length: open_edge 2069 ft, residential 945 ft)"; the house note: "No street touches this parcel". P0.2 work (typed edges). |
| 11602002000 | 4727 Post Rd (420007) | RS40 | 5 estate lots (3 with frontage, 2 flag lots), "All tests pass" with no scope on the badge. P0.2 work. |

## Where each disputed value entered the UI

- **The unit mix.** The max-GSF generator reports a plan-level unit count
  (`units_est`) and no mix. The mapper shared the count across the bars for
  their labels, but generated each bar's mix from a GFA estimate (footprint ×
  floors ÷ 950 sf), so the mixes summed to 87 on a 53-unit plan (64 + 23) and
  to 355 on a 168-unit plan. The header summed the raw mixes; the tabulation
  forced its total back to the KPI count by subtracting the whole difference
  from the largest type, which is how "35 one-beds" and "1 Bed 1" sat on one
  page, and "1 Bed 0" under a total of 215 on 5118 Mt View Rd.
- **Parking.** The engine returns each bay with its own stall count and a
  summary total that does not equal their sum: 32 + 85 + 10 + 108 + 8 + 49 =
  292 under a summary of 85 on Whites Creek Pike (its own ratio field, 5.58
  per unit, agrees with 292); 72 under 74 on 2937 Brick Church Pike; 46
  under 56 on 5515 Mt View Rd. The canvas labelled the bays; the header and
  the table showed the summary.
- **The requirement.** The table's "Pkg req" column was computed from
  typology parking ratios (80 on Whites Creek Pike); the header's required
  figure was the engine's (92).
- **The badge.** A parking shortfall was one of several "constrained" reasons
  and lost the ordering: "Code compliant · constrained: coverage-capped +1".
- **The spinner.** The KPI strip rendered "Generating plan…" whenever it had
  no metrics, which includes a failed solve.

## P0.1, shipped in this PR

- Each bar's mix is generated from the units it carries; the mixes sum to the
  engine's count on every parcel (53, 29, 30, 168).
- Stalls provided are what the drawn bays hold when the bays carry counts;
  the engine's summary rides along as `stallsReported`, shown beside the
  stalls line ("engine summary 85") and filed as the flag
  `parking_summary_disagrees` with its explanation. 5515 Mt View Rd now reads
  "Parking shortfall · 46 of 52 stalls" where it read "Code compliant".
- The table's per-type requirement splits the engine's requirement by units
  (largest remainder), so its total is the header's (92, 51, 52, 291), and the
  receipts line says so ("Parking required: 92 from the engine, split by
  units"); without an engine requirement the typology defaults stand and say
  so.
- The badge leads with the shortfall ("Parking shortfall · 85 of 92 stalls ·
  coverage-capped") and never with "Code compliant" when one exists.
- A massing response that arrives after a newer call started, or after the
  parcel changed, is discarded (a run number on every call).
- The KPI strip's empty state says why: generating, failed (with the cause),
  blocked (with the reason), or no plan.
- The export reuses the tabulation component and the same metrics, so it
  carries whatever the sheet shows.
- Evidence: `mfTabulation` (units, the mixes' sum, stalls provided / required
  / drawn / reported, the bays' sum). Battery: 0 Whites Creek Pike (680339)
  gates all of them (`requireMfTabulation`).

After: `680339_whites_creek_pike_after.png` (header 292 stalls and a mix of
5 / 22 / 19 / 7 summing to 53; table total 53 and 92; the stalls line with the
engine's 85 beside it), `668869_mt_view_rd_after.png` (table total 168),
`660871_mt_view_rd_after_shortfall.png`, `478622_brick_church_pike_cl_after.png`
("No plan: the solve failed — …").

## P0.2, shipped in the second PR: the status explains itself

The scope's second finding: a green "Code compliant" or "All tests pass"
over a plan that had not earned it. Reproduced on four of the named lots
and fixed on the same answers.

| Lot | Before | After |
|---|---|---|
| 1289 Currey Rd (RS10, landlocked) | house drawn, badge "Code compliant" | badge **Conditional · assumes an access easement across a neighbour (no mapped street contact)**; the basis line carries the same clause; the panel says the sketch is conditional on that easement |
| 0 Ivey Point Rd (RS80) | skip text "the longest touch on a street is 2069 ft" beside "no street edge" | the panel adds **Edges by class: 2,069 ft open edge (no street, no parcel) · 945 ft residential neighbour · no mapped street contact**, and the house note says the open edge is not a street |
| 4727 Post Rd (RS40) | "All tests pass" | **All 12 checks pass**, the tooltip listing the twelve and "Not evaluated: survey and legal access, utility capacity, stormwater detention sizing, geotechnical, street and driveway permits"; the panel repeats the diligence line under the tests |
| 0 Whites Creek Pike (RM9) | 49 generator flags in one list | actionable flags as rows (parking below ratio, the parking-summary disagreement); the derivation receipts behind "N generator notes (derivation receipts, no action needed)" |

Where it lives: `SiteMetrics.conditional` (set by the house sketch after a
landlocked or flood skip, read by the KPI badge, the one-line basis summary
and the evidence hook); `parseEdgeClasses` / `edgeClassSentence` in
`sfV1Plan.ts` (the engine's "neighbours by edge length" clause, typed);
`KpiStrip` subdivision `tests` and `legacy` (the chip counts its checks; a
legacy generator's plan reads "Legacy generator · provisional"); `FlagsPanel`
`isActionableFlag`. Shots: `616415_currey_rd_conditional_house.png`,
`680396_ivey_point_rd_edges_by_class.png`, `420007_post_rd_all_12_checks.png`.

Also in this PR, from Eric's note on the toolbar: the **Seed** toggle is now
**Quick massing** ("the engine's fast first-pass composition … that the full
solve starts from. Not the solved plan"), and its basis line reads "Quick
massing (the engine's first pass, not the solved plan): …" instead of "Seed
plan (Stage 1+2)". `toolbar_quick_massing.png`. The battery's
`seed-toggle` test id is unchanged.

Eric's screenshot (2915 Hillhurst Dr, RS10) showed the deeper problem: on a
lot whose plan is three by-right lots, the toggle swapped in a 25-unit
apartment massing under "LOTS 3 · All tests pass", and the table read
Studio 133% / 2 Bed 500% against the lots' count. The quick massing is the
multifamily solve's first pass; it is an alternative view only when the plan
on the sheet is a multifamily massing. The toggle now appears only then (no
toggle on 4727 Post Rd; present on 0 Whites Creek Pike), and while it is
shown the table tabulates the massing's own mix (Whites Creek: 86 units,
100%, where the solved plan is 53). The KPI strip keeps the solved plan's
figures in that view; the basis line names the view.

Seen while verifying, not fixed here: the house sketch's table shows "Pkg
req 2" (typology default) while the strip shows stalls 0 / 0, the same
header-versus-table split P0.1 closed for multifamily; and the house the
engine places on 1289 Currey Rd is 437 SF, which is a shed, not a house
(engine: the single-family seed's envelope on a 56-ft-wide lot).

## Left for the next releases

- **P0.2** — the explainable status: per-check rows with value, threshold,
  source and data status; "All tests pass" naming its checks and the civil
  diligence it does not cover; the house sketch after a landlocked or flood
  skip marked Conditional on the badge, the basis line and the handoff; typed
  frontage edges (Ivey Point Rd); the Flags tab split into what needs
  attention and the generator's notes.
- **P0.3** — use routing on commercial lots (a selected commercial use goes to
  the capacity card, never to the massing solver, and never asks for a use
  absent from the list); the legacy lot generator's plan summarised as lots
  and houses with a "legacy generator · provisional" label; the 3D view's
  error boundary with a scoped retry and the way back to 2D; the command
  palette's parcel result opening the drawer through the same path as a map
  click (today its action is a TODO).
- **Engine asks from this reproduction:** the parking summary total should
  equal the bays' sum (or say which one the plan counts); the commercial
  context compile times out in the built-form sampler on CL and CS lots; the
  skip reason on Ivey Point Rd calls a 2,069-ft open edge "the longest touch
  on a street".
