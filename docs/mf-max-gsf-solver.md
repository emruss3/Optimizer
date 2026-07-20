# Multifamily max-GSF solver

The production API remains `public.fn_generate_mf_site_plan_v2(...)`. Its objective is:

> Maximize gross square feet inside the legal, physical, parking, circulation, and program frontier.

Density limits units, not gross square feet. Unit size and mix are programming variables within the frontier.

## Max-buildout contract

`fn_compile_planner_context` includes both `entitlement_capacity` and `max_buildout` in the solver brief. The current contract is:

```json
{
  "contract_version": "max_buildout_v2",
  "max_gsf": 137688,
  "at_stories": 4,
  "at_unit_gsf": 1550,
  "units_at_max": 88,
  "footprint_at_max": 34422,
  "binding_constraint": "impervious_coverage",
  "program_frontier": {
    "gsf_max_option": {},
    "units_max_option": {}
  },
  "stories_ladder": []
}
```

`program_frontier.gsf_max_option` is the quantity target. The top-level `at_*` keys are compatibility aliases and must remain equal to that option. The SQL solver and TypeScript client accept either representation. An incomplete frontier returns `planner_max_buildout_contract_invalid`; it never silently becomes one story.

`fn_max_buildout` sweeps 750, 950, 1,150, 1,350, and 1,550 GSF/unit across the height-supported story range. It considers density, FAR when applicable, usable land, surface-parking land, and impervious coverage.

## Objective profile

```text
profile: maximize_gsf_v1
zoning_utilization:     0.55
financial_return:       0.15
circulation_quality:    0.07
unit_or_program_yield:  0.05
parking_compliance:     0.05
precedent_fit:           0.05
internal_program_fit:   0.05
open_space_quality:     0.03
```

`zoning_utilization` is achieved GSF divided by `max_buildout.max_gsf`. A parking shortfall is rejected before scoring. A plan below 85% capture receives a score ceiling; favorable pricing or open space cannot hide underbuilding.

## Regrid role

Regrid precedents shape form only. Whole-building OBB depth is labeled as such and is not used as apartment-bar depth. Local building length remains a scoring and segmentation preference, but may not cap quantity:

```text
depth_semantics: whole_building_oriented_bounding_box_not_bar_depth
bar_depth_source: typology_or_program_spec_only
quantity_role: form_only_never_caps_gsf
precedent_bar_length_soft_target_not_quantity_cap
```

The hard per-bar constructability maximum is 300 feet.

## Hard constraints

A renderable candidate must pass:

- context parcel and selected-use agreement
- generation permission and parcel containment
- building coverage and impervious coverage
- FAR when binding, height, and density
- required parking ratio
- one connected drive network reaching every building
- parking within 250 feet of each entrance proxy
- parking access from the drive network
- zero material building/parking/drive overlap

Building centroid remains the documented entrance proxy until explicit entrances are emitted.

## Parking and circulation adaptation

The solver may use:

1. Parking streets between bars.
2. A 45-foot bar with double-loaded parking when the full shallow-site module fits.
3. Connected parking along drives and double-loaded relief fields.
4. Proportional bar shortening before dropping a bar.
5. A second parking pass after trimming, followed by bar regrowth.
6. Pruning of site lobes that cannot connect to the entry spine.

Buildings remain inside the directional building-setback envelope. Connected surface parking may use the broader side-setback site envelope assumed by `fn_max_buildout`; this is flagged pending parking-specific setback standards.

Drive bridges are refused when they cross a building. Parking programming reserves 10% on shallow double-loaded modules and 5% elsewhere before final topology cleanup.

## Lineage

```text
generator_version: mf_max_gsf_v1
score_version: context_score_gsf_v1
```

Persisted records retain the context, objective profile, target and achieved GSF, capture percentage, binding constraint, clamp reason, hard-constraint receipts, Regrid IDs, and program-prior version.

## July 20 regression receipt — parcel 669046

A richer `program_frontier` payload was deployed without the top-level aliases still consumed by the solver and frontend. Before repair:

```text
stories: 1
GSF: 28,822
capture: 24.5%
parking: 66 / 65
```

The repair restored contract compatibility, aligned the parking and buildout envelopes, blocked drive bridges through buildings, preferred the double-loaded shallow-site module, iterated parking after trimming, and made Regrid length a soft target. Seed 17 now returns:

```text
max-GSF target: 117,794 SF
stories: 4
GSF: 108,000
capture: 91.7%
units: 75
average GSF/unit: 1,440
parking: 117 / 113
connected drive components: 1
hard constraints: passed
cross-system overlap: 0 SF
yield clamp: none
score: approximately 0.737
```

The dedicated SQL regression requires at least 85% capture, full parking, one drive component, nested-frontier consumption, soft precedent length, and zero cross-system overlap.

## Other current receipt — parcel 553450

```text
max-GSF target: 137,688 SF
achieved: 103,266 SF
capture: 75.0%
stories: 4
units: 66
parking: 106 / 99
yield clamp: parking_land
cross-system overlap: 0 SF
```

This parcel remains honestly parking-land constrained under the current surface-parking grammar.

## Snapshot reuse

Identical parcel, use, and canonical intent requests reuse the same context snapshot for 30 minutes. A measured warm test returned 688.4 ms for a miss and 0.6 ms for a hit.

## Remaining limitations

- Road frontage is still heuristic.
- Building centroid is still the entrance proxy.
- The active multifamily program prior remains low confidence.
- Corridor width is temporarily 5.5 feet clear until per-type unit/core data lands.
- Parking-specific setbacks are not yet loaded.
- Structured parking, podium, and wrap alternatives are not yet searched.
