# Massing-program relaxation ladder

The compiled `massing_program` is a **preferred composition prior**, not a hard feasibility gate.

It still supplies the first design hypothesis:

- consolidated building count;
- per-building bar length and depth;
- story count and construction type;
- frontage-responsive parti;
- a human-readable rationale.

Those values are attempted before generic packing, but they may be relaxed when the real directional envelope, parking, or connected-access geometry cannot carry the preferred arrangement.

## Server solve order

For an unpinned multifamily solve, `fn_generate_mf_site_plan_v2` evaluates complete, hard-validated solutions in this order:

1. **Exact prior** — preferred count, dimensions, stories, and parti.
2. **Split one bar** — increase preferred count from `N` to `N + 1` and preserve total linear bar demand by shortening each bar.
3. **Add one further count** — increase from `N` to `N + 2`, again preserving total linear bar demand.
4. **Free-pack** — release the prior's count, bar length, and parti while retaining the immutable context's legal, unit-program, parking, frontage, access, and circulation constraints.

The ladder is guaranteed to continue when the exact attempt:

- returns `planner_drive_network_disconnected`; or
- achieves less than 90% of the max-GSF target.

Other hard-feasibility errors also continue through the ladder rather than turning a preferred composition into a production outage.

## Free-pack performance floor

Free-pack is always evaluated. When it returns a valid plan, no selected prior-based result may have less GSF.

The dispatcher enforces this twice:

- it selects the highest-GSF hard-valid result among the ladder and other eligible regimes;
- it returns `planner_free_pack_floor_violation` if the final result would somehow fall below the free-pack baseline.

A successful comparison records:

```text
metrics.regime_comparison.policy = massing_prior_relaxation_ladder_v1
metrics.regime_comparison.free_pack_floor_gsf
metrics.regime_comparison.floor_satisfied
metrics.massing_relaxation_mode
metrics.free_pack_floor_gsf
```

## Receipts and flags

Important flags include:

```text
massing_program_preferred_prior_v1
massing_program_exact_prior_attempt_v1
massing_program_relaxed_split_one_bar_v1
massing_program_relaxed_plus_one_count_v1
massing_program_relaxed_free_pack_v1
massing_program_relaxation_trigger_drive_network_disconnected
massing_program_relaxation_trigger_placement_shortfall_gt_10pct_gsf
massing_program_count_prior_met
massing_program_count_prior_relaxed_by_geometry
massing_program_free_pack_floor_verified_v1
```

The selected mode also receives a mode-specific `..._selected_v1` flag.

## User pins

Pinned buildings are user-authored geometry. They bypass the massing-prior experiment and solve using free packing around the pins. Legal, parking, program, and access constraints remain in force.

## Small lots

The compact/small-lot regime remains open. The ladder may recover a feasible small-lot plan through split or compact packing, but this change does not claim that the small-lot grammar has converged or that every small lot reaches a high percentage of the theoretical max-GSF frontier.

## Regression policy

Production functions may not contain address- or parcel-specific branches. Named parcels are permitted only as regression fixtures.

`tests/sql/massing_prior_relaxation_smoke.sql` checks:

- the static exact/split/plus/free-pack contract;
- a dynamically selected generic multifamily cohort;
- the invariant that selected GSF never falls below feasible free-pack GSF;
- connected-drive, parking, and hard-constraint recovery on prior failure fixtures;
- an explicit `open` status for the small-lot fixture.
