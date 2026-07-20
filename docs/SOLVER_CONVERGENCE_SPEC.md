# Max-GSF solver convergence — governing spec (owner directive, 2026-07-20)

Status: **accepted, next server round.** The client-side terminology half is
shipped (theoretical bound vs best-feasible, gap, optimization status). This
document is the contract for the generator work.

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
