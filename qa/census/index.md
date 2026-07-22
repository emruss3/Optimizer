# Generation census (GENERATION_STRATEGY_v2 — the instrument)

Nightly random-sample health check of the live generator. Runner:
`scripts/census/run.mjs` (secrets-gated; artifact + step summary via
`.github/workflows/census.yml`). `latest.json` is the committed snapshot the
dev-build workspace banner reads; dated files are the trend record.

## 2026-07-21 — first census (15 random RM/OR/MU, SQL channel)

| Outcome | Count | Reading |
|---|---|---|
| `error:planner_envelope_unbuildable_depth` | 10 | **All on slivers** (max_gsf 1–1,189 sf — remnant fabric). The refusal is CORRECT; the shape is wrong: this should be a **verdict** class like `generation_not_allowed`, not an error. |
| ok | 1 | 399242 — **89.2%** capture (301,248 / 337,628), 7 bars. The only genuinely buildable lot in the draw solved. |
| verdict (`generation_not_allowed`) | 1 | 421238 (47 sf sliver) |
| `error:planner_unit_gsf_band_infeasible` | 1 | 609035 (max_gsf 2,690 — micro-lot; band check errors instead of relaxing — the known ladder gap) |
| `error:planner_envelope_unplaceable` | 1 | 598649 (max_gsf 1,613 — micro-lot) |
| **exception** | 1 | 687734 — `fn_massing_program` line 35: *upper bound of FOR loop cannot be null* (crashes the whole compile). Unhandled crash — never acceptable. |

**The instrument lesson (encoded into the runner):** 12/15 draws have
max_gsf < 3,000 sf — an unstratified census measures Nashville's parcel-fabric
noise, not the solver. The runner therefore samples TWO strata: `full` (the
ops picture) and `buildable` (sqft ≥ 5,000 — the solver's real exam).

**Upstream items this census produces:**
1. `envelope_unbuildable_depth` on slivers should be a verdict, not an error
   (ladder/verdict taxonomy — ChatGPT lane).
2. `fn_massing_program` null FOR-bound crash on 687734 (engine lane).
3. Band-infeasible still bypasses the ladder (known, in flight).
