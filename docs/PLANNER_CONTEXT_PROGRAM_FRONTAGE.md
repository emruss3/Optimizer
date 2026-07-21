# Planner context: unit program and frontage contract

This contract is generic across parcels. Named addresses and parcel IDs may appear in historical regression fixtures, but production functions must never branch on them.

## Compile contract

`public.fn_compile_planner_context(p_ogc_fid, p_use, p_user_intent)` composes these additive blocks into the immutable snapshot:

- `solver_brief.max_buildout` — the GSF frontier and hard unit-GSF band.
- `solver_brief.unit_program` — unit dimensions, default mix, weighted parking demand, clear corridor, core spec, and implied apartment-bar depth.
- `solver_brief.geometry` — parcel/buildable geometry plus a verified parcel-fabric frontage segment when one exists.
- `solver_brief.precedent_priors` — Regrid form evidence only; it cannot cap GSF or set apartment-bar depth.
- `solver_brief.program_prior` — retained as a labeled fallback for typologies without an approved unit program.

Identical parcel + selected use + canonical intent requests reuse a bounded snapshot through the existing request fingerprint and return `cache_status = hit`.

## Unit program

`public.fn_unit_program(p_typology)` is backed by read-only `public.unit_spec` reference data and `public.typology_spec` circulation/core fields.

The initial multifamily program includes studio, one-, two-, and three-bedroom dimensions, per-type parking demand, a 5.75-foot clear corridor, core dimensions, and a 67.3-foot implied double-loaded bar depth.

The server solver:

- reads the unit program from the frozen solver brief;
- uses program dimensions rather than whole-building Regrid OBB depth for bar depth;
- may increase parking demand from the weighted program but may never weaken the legal/typology parking ratio;
- retains the 750–1,550 GSF/unit frontier as a hard constraint;
- emits `unit_program_consumed_v1` and `bar_depth_from_unit_program_v1` receipts.

## Frontage

`public.fn_parcel_frontage(p_ogc_fid)` derives unshared parcel-boundary segments from the parcel fabric.

When a primary segment is present, the compiled brief includes:

- `front_edge` in EPSG:4326;
- `front_edge_2274`;
- `frontage_midpoint_2274`;
- `frontage_bearing_deg`;
- `front_edge_is_placeholder = false`;
- `access_method = parcel_fabric_primary_segment`.

The multifamily solver takes the entry point and bar orientation from that immutable brief. It emits `entry_from_context_frontage_v1` and `bar_orientation_from_context_frontage_v1`.

When no parcel-fabric frontage is available, the context remains explicit:

- `landlocked = true`;
- `front_edge_is_placeholder = true`;
- `access_method = easement_assumed_landlocked`;
- flag `landlocked_access_via_easement_assumed`.

This is an assumption requiring title/civil verification, not a claim of verified road access.

## Dispatcher preflight

`public.fn_generate_mf_site_plan_v2` performs its own preflight before dispatching surface, courtyard, or tuck-under regimes:

1. context is required;
2. context belongs to the parcel;
3. requested typology, context typology, and selected use all resolve to multifamily;
4. generation is permitted;
5. `solver_brief.max_buildout.max_gsf` is present.

The solve core repeats the load-bearing checks and consumes the full program/frontage/max-buildout contract.

## Generic regression policy

`tests/sql/planner_context_program_frontage_smoke.sql` dynamically selects cohort members rather than embedding an address-specific solution. It also fails if the production compiler, max-buildout function, dispatcher, or solve core contains an address literal, a literal parcel-ID equality, or a `CASE p_ogc_fid` branch.
