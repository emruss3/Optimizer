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

## Still to do in part 1

W Heiman parking and access, Main St comparison basis, constraint identity,
Mt View guest parking and floor area.
