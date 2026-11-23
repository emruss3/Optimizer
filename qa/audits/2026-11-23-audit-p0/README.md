# Audit of 2026-11-22, part 1: numbers on the plan

## 0 Delk Ave (675423, RS5)

Reproduced from the live engine on 2026-11-23, matching the audit:

| Step | Lots | Pattern |
|---|---|---|
| Default plan | 3 | frontage lots, no new street |
| Comparison of patterns | 4 | shared private drive |
| Deep search, 15 layouts | 5 | shared private drive |

The five-lot plan has a 300 ft private lane, 16 ft of pavement in a 24 ft
easement, and 0 ft of new public street.

| Finding | Cause | Fix |
|---|---|---|
| Badge "16 checks pass", basis line "15 tests pass" | One of the 16 (`yield.vs_arithmetic`) is a measurement with no pass or fail verdict. The badge counted it as a pass. | One counting rule (`checkCounts`). Both say 15. The panel says 1 more is a measurement. |
| "Private drive 0 ft" | The row read the new public street length. | Two rows: private drive 300 ft, new public street 0 ft. |
| "The shared private drive draws 4 lots" over a 5-lot plan | The comparison's sentence stayed after the deep search took the sheet. | Cleared when the search takes the sheet. The search line says found 5, up from 4. |

Regression: `src/features/site-plan/api/delk.audit.test.ts` on the captured
plans (`__fixtures__/delk-675423.json`).

Not done on this item: a manual selection while a late search response is
in flight, and reopening a saved revision and exporting it.

## 2600 W Heiman St (553450, RM40): 127 drawn, 20 reported, 122 required

Traced in the live answer of `fn_generate_mf_site_plan_v2` on 2026-11-23.

| Number | Where it comes from |
|---|---|
| 129 | The engine's program: 1.84 stalls per home on 70 homes. Its basis line says "129/122 stalls". |
| 127 | The eight drawn bays: 15, 10, 10, 10, 10, 10, 10 and 52. Two stalls were clipped for the amenity building. |
| 20 | `metrics.stalls` and `parking.stalls`. Both equal the two bays that carry an `area_sqft` field (10 + 10). The other six bays carry no area and are left out. |
| 122 | Required. |

So all 107 stalls of difference are the six bays the summary skips.

The same pattern is in two battery fixtures: 0 Todd Preis Dr (428 drawn,
summary 49, one bay with an area) and 0 Whites Creek Pike (292 drawn,
summary 85, one bay with an area).

What the app does now: it says where the difference comes from, in the
status reason and the tabulation. It still marks parking as needing
verification. The engine's ratio is derived from the same bays, so it
explains the summary and verifies nothing. 428 stalls on 94 homes is not a
believable supply.

Not done: the traced route from the street through a drive and an aisle to
each counted bay, the highlight of the gap in both views, and carrying the
unresolved status onto the sheets and export.

For the engine (not changed here): the summary total in
`fn_generate_mf_site_plan_v2` should add every bay, and the per-bay counts
on the large bays need a check against the bay's own area.

## Still to do in part 1

W Heiman access route, Main St comparison basis, constraint identity,
Mt View guest parking and floor area.
