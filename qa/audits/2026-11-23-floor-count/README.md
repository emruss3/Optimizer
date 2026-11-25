# Story counts read under either field name (2026-11-23)

Audit package 2026-11-23, first delivery, PR 1.

## The defect

2600 W Heiman St (553450, production revision c1d84ac9) showed buildings A to D
as 3 stories, estimated 34 ft. The engine's answer for that scheme says 5 floors
on each residential building.

The adapter read `stories` on the building, then `stories` on the scheme, then
assumed three. This answer names the field `floors`, and its floor area
`gfa_sqft`. So every building fell through to the assumption.

## The fix

`storyCount` in `src/features/site-plan/api/generateMfPlan.ts` reads, in order:

| Order | Source | Recorded as |
|---|---|---|
| 1 | The building's own `stories` or `floors` | `building` |
| 2 | The scheme's `stories` or `floors` | `scheme` |
| 3 | Floor area divided by footprint, when both are given | `floor_area` |
| 4 | Three, and the plan is flagged `stories_assumed_no_count_in_plan` | `assumed` |

Where one building carries both names and they disagree, the taller is drawn
and the plan is flagged `stories_conflict_in_plan`. Each building element
carries `storiesBasis`. Both plan families now use the same reading.

Height is still an estimate from the story count (14 ft ground story, 10 ft
above), labelled as estimated. Five stories reads 54 ft.

## Per-building table for the W Heiman answer

| Building | Engine says | Was drawn | Now drawn | Estimated height |
|---|---|---|---|---|
| A | 5 floors | 3 | 5 | 54 ft |
| B | 5 floors | 3 | 5 | 54 ft |
| C | 5 floors | 3 | 5 | 54 ft |
| D | 5 floors | 3 | 5 | 54 ft |
| E, amenity | one story | 1 | 1 | 14 ft |

Homes (70) and floor area (106,776 GSF) are the engine's and do not change.

## What proves it

Tests in `generateMfPlan.test.ts`, "story counts are read under either field
name": the W Heiman shape, a mixed-height plan, the amenity, the conflict case
and both fallbacks.

## Not proved here

A before and after picture from a fixed camera. The committed W Heiman fixture
is an older answer (one building, with `stories`), and this environment cannot
reach the released planner. The picture needs a fresh harvest of the live
answer, which is the next step.
