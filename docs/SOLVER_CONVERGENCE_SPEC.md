# Max-GSF solver convergence — governing spec (owner directive, 2026-07-20)

Status: **phase 1 shipped (migration `mf_v2_convergence_phase1`, applied
live)**; phase 2 open. Shipped: §1 vocabulary (client), §2 partially — the
parking-search → stall-recount → bar-regrow pass now iterates to a bounded
fixpoint instead of running once; §3 residual-capacity accounting computed on
every solve; §4 classification (`feasible` / `feasible_optimization_incomplete`
/ `feasible_demonstrably_constrained`) with the quantified proof object in
`metrics.optimization_proof`; §5 static no-parcel-literal regression.

Phase 2a shipped (migrations `mf_v2_convergence_phase2a` + `_slab_fix`):
**in-envelope supplemental parking** (stall land beside the drive network
INSIDE the building envelope — the outside-only search missed it) and
**infill bars** carved from residual envelope land (slab-scan at three
vertical anchors, near-rectangular pieces only), both inside the convergence
loop, capped by live parking/coverage/impervious headroom and the access
contract (drive reach + 250 ft of parking). Measured live: 669046 rose
92.9% → **100.0% capture (`feasible`)**; 488068 at 96.9% (96u); 2611 W
Heiman gained +6 units (28→34) at unchanged GSF — its residual land is
genuinely not bar-shaped, so infill correctly declined and the result stays
honestly `feasible_optimization_incomplete`.

Phase 2b/2c shipped (migrations `..._phase2b_court_realloc`,
`..._phase2c_envelope_proof`): infill may reclaim green-court land under an
open-space guard (≥ binding minimum, 15% floor), and the classifier prices
land by ELIGIBILITY, not just budget — it measures remaining
footprint-eligible envelope land, and when stories are maxed and that land
cannot host the missing floorplate even as an upper bound, the result is
PROVEN constrained (`proof_basis: buildable_envelope_exhausted`).

**Acceptance fixture closed**: 2611 W Heiman = `feasible_demonstrably_constrained`,
`constraint_proven: true`, 1,760 sqft footprint-eligible remaining vs 3,100
needed, stories maxed — after the search genuinely exhausted iteration,
in-envelope parking (+6 units), and court-reallocated infill. 669046 holds
100.0% `feasible`.

## Generalization sweep (2026-07-20, deterministic random sample)

Hash-ordered random sample of multifamily-eligible parcels (RM/OR/MU,
8k–450k sqft), stratified in four size bands, 12 parcels, zero
cherry-picking. **Before the slab-fallback fix: 9 of 12 produced nothing.**
Dominant class (6): `no bars fit the envelope` — the band grid demands
OBB-aligned rectangles the true polygon must cover, so irregular envelopes
placed zero bars.

Shipped fix (`mf_v2_slab_fallback_placement`): a slab-fallback placement
runs before any refusal (near-rectangular slab pieces hugging the spine
corridor, 45 ft minimum run), and residual refusals are STRUCTURED
(`planner_envelope_unplaceable` + envelope dimensions + grammar minimums).
Recovered 2 of the 6 immediately (1.31 ac → 36u parked; 0.69 ac → 13u
parked, both honestly classified); fixtures unregressed (669046 holds
100.0%); determinism holds.

## Measured failure-class ledger (phase 3 backlog, by sample frequency)

1. **Tiny-envelope small lots** (3/12: 0.27–0.50 ac): post-setback envelope
   cannot host the spine + bar + parking-module grammar at all. Needs a
   compact street-loaded small-plex grammar (no internal spine).
2. **Extreme-irregular envelopes** (1/12: bent-strip parcel, 475×363 bbox,
   zero axis-aligned slabs): needs rotated/oriented slab search.
3. **Drive-network connectivity on large irregular lots** (1/12, 4.3 ac):
   `planner_drive_network_disconnected` on an unpinned solve.
4. **Impervious trim non-convergence on very large lots** (1/12, 8.6 ac):
   the trim loop refused instead of converging.
5. Parking self-sizing on ~0.8 ac (1/12): unpinned
   `planner_parking_infeasible` — generator mis-sized its own bars.

Phase 3 (open): the ledger above, plus bar deepening/lengthening beyond
initial capacity, parking module variants, unit-program variation,
structured/tuck-under regimes. The rule stands: examples identify failure
classes; the sweep measures them; no fix may condition on a parcel.

### Phase 3 measured result (2026-07-20): orientation-by-proxy FALSIFIED

Two in-function orientation strategies were built, applied live, probed
head-to-head against the pre-change generator, and **reverted with
receipts** (migrations `20260720000018..21`):

1. **Proxy frame ranking** (score candidate frames by dry-run band area,
   switch on a 5% win): regressed the flagship fixture 669046 from
   `feasible` / 100.0% capture to `feasible_demonstrably_constrained` —
   parking and circulation dominate the real solve, so placeable band area
   cannot rank two frames that both place bars.
2. **Rescue-only switching** (alternate considered only when the incumbent
   frame places zero bars, with the dry run faithfully mirroring the
   placer's shallow-frame adaptations): regressed 408769 from 13,650 GSF /
   62.9% capture to 6,120 GSF / 28.2%. The slab-scan / MICC-packer /
   compact-plex fallbacks exist precisely for band-less frames and beat a
   banded alternate frame. Across the random-24 acceptance sample the
   rescue converted zero refusals (both depth-terminals stayed terminal).

Seed phase classes (`p_seed % 3` band offsets 0/4/8 ft) were also measured:
max spread 24 GSF on 122,636 (0.02%), zero on the others — the convergence
passes make the generator phase-invariant, so best-of-seeds is 3× latency
for noise.

**Standing conclusion**: a configuration sweep is honest only when it
compares *complete real solves* (frames, bar counts, parking regimes) by
achieved GSF. That multi-solve harness is the same machinery the
tuck-under/structured parking regime comparison requires, so it ships with
the regime work, not as an in-function heuristic. Live generator remains
byte-identical to the pre-sweep source (md5 `096a1dba…`), re-verified by
the full acceptance sweep at the recorded baseline (82.6% plan-or-proven).

### Phase 3 shipped (same date): the regime dispatcher — real solves compared

P1-4 delivered the honest harness the falsification demanded (migrations
`20260720000022..23`):

- `fn_mf_solve_core(...7 args..., p_regime)` is the full solver body with
  eight mechanical transforms that all collapse to the original expression
  in the surface regime (verified: surface output byte-equal to the
  pre-restructure generator on 669046 — top level AND metrics). Tuck-under
  regime: ground floor of every bar is a parking level (~380 sqft gross
  per stall), residential floors = floors − 1 with a story bought back
  inside the legal caps when available, stall supply gains
  `floor(footprint/380)`, coverage/footprint targets size against
  residential floors, trim loops cannot consume the parking level, and a
  structured `planner_regime_infeasible` refusal covers sub-2-story caps.
- `fn_generate_mf_site_plan_v2` (contract unchanged) dispatches: surface
  solve first; only when refused or below the envelope, one more complete
  tuck-under solve; argmax by achieved GSF (challenger needs 2% + 1 sqft);
  receipts in `metrics.regime_comparison`. Pinned edits keep the fast
  single-solve path. Feasible parcels pay zero extra latency.
- **Measured**: 558613 converted from `planner_parking_infeasible` to
  227,760 GSF / 147 units / 100% capture `feasible` (tuck). 408769 and
  627065 kept their better surface solves (height caps block the story
  buy-back — the comparison said so and chose surface). 385519 (1-story
  cap) kept surface via the challenger's structured refusal. Random-24:
  **18/23 solving (78.3%), 20/23 plan-or-proven (87.0%)** — up from
  82.6%; acceptance gate ratcheted 80 → 85. Remaining residuals: 2
  tiny-shape packer misses, 1 bridge-blocked — all structured.

## 1. Vocabulary (shipped client-side)

- The algebraic envelope from `fn_max_buildout` is the **theoretical GSF
  upper bound** (statutory/land-use envelope). It is never called
  "achievable" until the constructive solver has actually reproduced it.
- The generator's result is the **best constructively feasible GSF found**.
- The UI shows both, plus the **optimization gap** (absolute + percent) and a
  solver proof status. Compliance and optimization are separate verdicts:
  `✓ Code compliant` never implies optimality; below 85% capture an explicit
  `⚠ n% of theoretical envelope` chip appears.

## 2. Convergence loop (server, to build)

```
generate several building configurations
→ solve connected parking and drives
→ select a feasible unit program
→ calculate residual capacity
→ grow buildings, add buildings, or add stories
→ re-solve parking
→ vary unit GSF and mix
→ repeat until no feasible improvement remains
```

Minimum search dimensions: 1..N building configurations; every legal story
count up to the height limit; multiple bar orientations; bar lengths across
the constructable range; typology-derived bar depths; single- and
double-loaded parking modules; parking on different sides of buildings; unit
sizes across the hard program band; unit mixes with differing parking
demand; surface / tuck-under / podium / wrap / structured regimes when the
context permits them.

## 3. Mandatory residual-capacity check (server, to build)

A result must not return `parking_land` (or any clamp) as the final answer
merely because parking initially caused trimming. Before returning, test
remaining parking supply, impervious capacity, building-coverage capacity,
story/height capacity, density capacity, and valid building envelope.

Invariant:

```
If   stalls_provided > stalls_required
 AND (stories < legal_story_limit OR residual footprint capacity exists)
 AND density/FAR do not prohibit additional GSF
Then the solver MUST attempt another growth-and-parking pass.
```

## 4. Capture classification (server, to build)

Below 85% capture, a result must be classified as either
`feasible_optimization_incomplete` or `feasible_demonstrably_constrained`.
The latter requires a quantified proof object, e.g.:

```json
{
  "binding_constraint": "parking_land",
  "required_additional_gsf": 12400,
  "additional_units_at_selected_program": 8,
  "additional_stalls_required": 12,
  "remaining_stall_capacity": 4,
  "remaining_impervious_sqft": 2200,
  "minimum_land_needed_sqft": 5100,
  "constraint_proven": true
}
```

A bare clamp string is not proof.

## 5. Generalization discipline

Named parcels are immutable regression fixtures only — they reproduce past
failures and may never steer runtime branches, weights, geometry constants,
constructability limits, parking assumptions, unit-size limits, or
acceptance thresholds. Enforced by
`tests/sql/no_parcel_literals_in_functions.sql` (static scan of production
functions for parcel-literal patterns).

Scenario classes the test suite must cover (behavioral, not address-bound):
narrow urban infill (search vertical before shrinking GSF); wide shallow
(rotated bars + parking modules); deep (multiple rows + connected parking
streets); irregular (residual polygons, not bounding boxes); density-bound
(grow unit GSF before adding units); parking-bound (vary mix, form, or
regime); coverage-bound (add legal stories before shrinking); height-bound
(prove vertical capacity exhausted); sparse precedents (form evidence only,
never quantity); context unavailable (refuse authoritative generation).

## The governing rule

> Examples identify a failure class. They do not define the solution.

Production objective:

```
maximize constructively feasible GSF
subject to: parcel geometry · legal constraints · program feasibility ·
            parking · connected circulation · access · impervious limits ·
            building coverage · height · density
```
