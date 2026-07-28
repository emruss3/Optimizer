# Seed-default QA sweep — 20 random buildable parcels (2026-07-28)

Eric's ask: "Check 20 random parcels. Make sure the capacity is 95%+. We
aren't designing multiple buildings. The roads / parking all make sense."

**Sample:** deterministic draw (`md5(ogc_fid || ':sweep-2026-07-28')`) over
the RM|OR|MU universe, first 20 parcels whose `fn_parcel_buildability`
verdict is `buildable`. (450 screened to find 20 — the raw universe is
~91% refusal-shaped slivers, consistent with the census.) Each parcel:
live `fn_compile_planner_context` → default `fn_generate_mf_site_plan_v2`
→ independent `fn_max_buildout` denominator, all harvested in one pass so
numerator and denominator share a vintage.

## Scorecard vs the three criteria

| Criterion | Result |
|---|---|
| Capture ≥ 95% | **12 / 20** (8 misses: 4 legacy-fallback 63–79%, 4 seed 58.2/87.1/90.8/94.2) |
| Single structure | **16 / 20** by the seed contract (all seed_v2 plans are one connected single-ring polygon); 4 legacy-fallback plans are multi-bar (worst: 15 bars) |
| Roads/parking sane | **Zero overlaps, zero parcel leaks, entry on frontage (0 ft) on every seed plan; 270–294 sf/stall.** BUT: 3 seed plans have ZERO parking (`strategy: none`), the spine centerline runs under the building (~1,600 sqft) on 14/16 seed plans, and 2 plans over-park at 2–3.5× need |

## Named findings (full numbers in results.json)

1. **The dispatcher silently serves the legacy multi-bar core** (`mf_max_gsf_v1`,
   old payload shape) on 4/20 parcels — 19-acre 696525 (15 bars, 1047/300
   stalls, 79.2%), 426535 (3 bars, 67.1%), tiny 659666 (63.0%), 597497
   (63.5%). Every product promise (single structure, 95%+) breaks silently
   on this path.
2. **Degenerate seed programs**: 679082 / 597177 / 468156 emit `units: 1`,
   all-zero mix, `stalls: 0`, `strategy: 'none'` — while keeping full mass
   (up to 60,522 GSF as "1 unit") and two of them claim ≥99.7% capture.
   Capacity that can't be parked or programmed isn't capacity.
3. **Capture > 100 twice** (394526 at 105.6%, 701855 at 103.1%): the seed's
   GSF exceeds `fn_max_buildout`'s frontier — one of the two contracts is
   wrong ("over-105 extinct" has a counterexample at exactly 105.6).
4. **Spine centerline under the building on 14/16 seed plans** (~1,600 sqft
   ≈ one 67-ft bar crossing): the access route pierces the front bar to
   reach the rear field. The client clips the drawn corridor, but the
   engine's own access logic drives under the mass.
5. **Over-parking**: 696955 places 81 stalls vs 26 required (312%), 394526
   101 vs 49 (206%) — land burned on stalls nobody requires.
6. Client fix shipped from this sweep: the mapper no longer fabricates a
   GFA-derived unit count when the server sent an (all-zero) mix.

Rerun: `node scripts/qa-sweep/analyze.mjs` against a fresh harvest
(see the script header for the harvest queries).
