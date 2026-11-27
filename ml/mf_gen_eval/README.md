# Generative site-plan model (mf_gen): first test on the review set (26 Nov 2026)

Model `mfgen_1126a` (Modal, T4): transformer, d=192, 6 layers, trained 50 epochs on 158 approved SP plans
(train split); 40 development plans as validation (best validation loss 2.381). Held-out not used.

Path: `training.fn_mfgen_propose` (site, street edges, buildable envelope, by-right units) -> Modal `/propose`
(6 sampled plans, about 6-13 s warm) -> each plan's massing program (parti, bar count, length, depth) ->
`fn_mf_solve_core` with GUC `mf.massing_override` (exact, then split_one, then plus_one) -> review rubric.

Pick rule, both arms: default plan plus candidates; keep the plans within 2% of the most homes; then fewest
failed review checks. 14 apartment parcels where both arms finished, 6 tries each.

| Arm | Failed checks (default 32) | Homes (default 627) | Parcels improved | Valid plans |
|---|---|---|---|---|
| Model proposals | 23 | 633 | 6 | 77 of 84 |
| Random massing control | 27 | 638 | 4 | 78 of 84 |

Reading: most of the gain comes from trying several massings and choosing by the review checks; the model
adds about 4 checks over random at equal tries. 14 parcels is too few to call the difference firm.
The pick uses the same checks it is scored on, so the selector must be the product's own rule.
