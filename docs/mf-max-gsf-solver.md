# Multifamily max-GSF solver

The production multifamily API remains:

```sql
public.fn_generate_mf_site_plan_v2(
  p_ogc_fid integer,
  p_typology text,
  p_seed integer,
  p_pins jsonb,
  p_parent uuid,
  p_persist boolean,
  p_context_id uuid
)
```

Its implementation now follows one development objective:

> Maximize gross square feet inside the legal, physical, parking, circulation and program frontier.

Unit count is not the primary objective. Density limits units, but unit size and mix remain programming variables. When density or parking binds, the solver may use fewer, larger units to recover buildable GSF.

## Context contract

`fn_compile_planner_context` adds two additive blocks to the solver brief:

```json
{
  "entitlement_capacity": {},
  "max_buildout": {
    "max_gsf": 137688,
    "at_stories": 4,
    "at_unit_gsf": 1550,
    "units_at_max": 88,
    "footprint_at_max": 34422,
    "binding_constraint": "impervious_coverage",
    "stories_ladder": []
  }
}
```

`fn_max_buildout` sweeps gross unit sizes of 750, 950, 1,150, 1,350 and 1,550 SF across the height-supported story range. It evaluates density, FAR when applicable, measured usable land, surface-parking land and impervious coverage.

The objective profile is:

```text
profile: maximize_gsf_v1
financial_return:       0.15
unit_or_program_yield:  0.05
parking_compliance:     0.05
zoning_utilization:     0.55
precedent_fit:           0.05
internal_program_fit:   0.05
circulation_quality:    0.07
open_space_quality:     0.03
```

`zoning_utilization` is achieved GSF divided by `max_buildout.max_gsf`. Parking compliance is still present in the score receipt, but a shortfall is rejected before scoring.

## Regrid precedent role

Regrid precedents shape form only:

- local building length
- story norms as descriptive evidence
- aspect ratio and compactness
- local construction-form lineage

They never reduce the quantity target.

The existing Regrid `depth_ft` metric is a whole-building oriented-bounding-box depth. It is now labeled:

```text
depth_semantics: whole_building_oriented_bounding_box_not_bar_depth
bar_depth_source: typology_or_program_spec_only
quantity_role: form_only_never_caps_gsf
```

The multifamily bar depth therefore comes from the program/typology specification, not the approximately 100-foot OBB depth found in some garden-apartment complexes.

## Coverage semantics

The brief separates two different constraints:

```text
max_building_coverage_pct
  building footprints only

max_impervious_pct / max_impervious_sqft
  buildings + parking + drives + other impervious area
```

The legacy `max_coverage_pct` key remains as a compatibility alias for building coverage. For RM40, the current values are typically 60% building coverage and 75% impervious coverage; they are not interchangeable.

When the entitlement resolver marks multifamily FAR as uncapped, the solver brief carries `max_far = null`. Height, density, building coverage, impervious coverage, parking and physical constraints remain binding.

## Hard rejection conditions

A candidate is never returned as renderable when any of these fail:

- context parcel mismatch
- context selected-use or typology mismatch
- generation is not allowed
- pin lies outside the parcel
- building coverage
- impervious coverage
- FAR, when binding
- density
- parking ratio
- drive network connectivity
- vehicle access to every building
- parking within 250 feet of every building entrance proxy
- parking access from the drive network

Current entrance distance uses the building centroid as a documented proxy until explicit entrances are emitted by the program solver.

Successful candidates include:

```text
parking_ratio_hard_pass
drive_network_connected_hard_pass
parking_within_250ft_hard_pass
entrance_proxy_building_centroid
```

## Site-system adaptation

Before reducing GSF, the solver attempts to use available land through:

1. Parking streets between residential bars.
2. One-row-deep parking along the connected drive network.
3. Connected double-loaded relief parking fields.
4. Proportional shortening of all bars before dropping a whole bar.
5. Exclusion of generated site lobes that cannot connect to the entry spine.

Parking is clipped against final buildings and drives before its stall count is accepted. One stall is reserved during programming to protect against topology cleanup and integer rounding.

## Score discipline

A candidate below 85% GSF capture must carry a clamp reason. Its overall score is capped:

```text
with clamp:    score <= capture × 0.65
without clamp: score <= capture × 0.50
```

This prevents a materially underbuilt plan from receiving a high score merely because local pricing or open-space components are favorable.

## Lineage

```text
generator_version: mf_max_gsf_v1
score_version: context_score_gsf_v1
```

Persisted session and candidate records retain:

- frozen context ID and version
- objective profile
- target maximum GSF
- achieved GSF and capture percentage
- average programmed GSF per unit
- buildout binding constraint
- yield clamp reason
- hard-constraint receipts
- Regrid precedent IDs
- program-prior version

## 2600 W Heiman regression receipt

Parcel `553450`, seed `17`:

```text
max-GSF target:       137,688 SF
achieved:             104,831 SF
capture:              76.1%
buildings:            3
stories:              4
programmed units:     67
average GSF/unit:     1,565
parking:              101 / 101
connected drives:     1 component
hard constraints:     passed
yield clamp:          parking_land
overall score:        approximately 0.495
cross-system overlap: 0 SF
```

The solver does not claim that 104,831 SF is the theoretical entitlement maximum. It reports that the current connected surface-parking grammar is parking-land constrained and scores the 76.1% capture accordingly.

## Snapshot reuse

Identical compile requests reuse a recent snapshot for 30 minutes. The request fingerprint contains:

- compiler revision
- parcel ID
- selected use
- canonical JSONB user intent

The cache is non-sliding and returns the same context ID and hash. A measured warm test returned:

```text
first compile: 688.4 ms, cache miss
second compile: 0.6 ms, cache hit
```

## Remaining limitations

- Verified road frontage is still a heuristic.
- Building centroid is an entrance proxy.
- The active multifamily program prior remains low confidence.
- Corridor width is temporarily 5.5 feet clear until the per-type unit/core specification lands.
- The surface-parking grammar may capture less than the theoretical GSF frontier on irregular parcels; those losses are explicit and scored.
- Structured parking, podium and wrap alternatives are not yet searched by this solver.
