# Neighborhood Master-Planning (P3-1) — Design

Status: **design (2026-07-20)** — implementation needs a dedicated session.
This document exists so that session starts with the architecture settled
and the honesty contract explicit.

## Objective

Extend the single-parcel objective to an assemblage:

```
maximize Σ_blocks constructively feasible GSF (or units, per objective profile)
subject to: every single-parcel constraint per block · internal street
            network connectivity to verified frontage · shared systems
            (detention, amenity) sized for the whole · phasing feasibility
```

The governing rule stands: examples identify failure classes, never
solutions; every number is solver-reproduced or labeled theoretical.

## Foundations already live (with receipts)

| Foundation | Where | Why it matters here |
| --- | --- | --- |
| Real-solve comparison harness | `fn_generate_mf_site_plan_v2` dispatcher (PR #64) | The ONLY honest way to pick a product per block — solve each candidate completely, argmax by achieved objective. Proxy ranking was falsified twice (PR #63). |
| Competing schemes persisted | dispatcher persists both regimes | The rail's compare-from-schemes seed = per-block alternatives UI. |
| TH lane grammar + verdicts | `fn_generate_th_site_plan` (PRs #54, #68) | Townhome blocks come with lane networks and entitlement-cap verdicts. |
| Verified frontage detector | `fn_parcel_row_frontage` (PR #65) | Works on ANY polygon — including synthetic blocks — so internal streets can root at real ROW and each block gets a true entry. |
| Professional validators | fire/ADA/EV receipts (PR #69) | Per-block receipts roll up to a masterplan compliance sheet. |
| Honest vocabulary | optimization_status/proof end to end | Block verdicts aggregate without laundering: a masterplan is `feasible` only if every block's verdict is. |

## Architecture

### 1. Assemblage envelope
- Input: a set of `ogc_fid`s (adjacency validated: union must be a single
  polygon; holes allowed with a flag).
- Internal lot lines dissolve; exterior setbacks apply to the union
  boundary only. Interior setbacks are replaced by the block grammar.
- Context: requires a compiler-side `fn_compile_assemblage_context`
  (COORDINATION: context-engine session owns the compiler; the union
  geometry + merged legal basis must come from one compile, not client
  stitching. Until then, v0 may planning-run on the largest member's
  context with an explicit `assemblage_context_pending` flag).

### 2. Block subdivision
- Internal street network: start from verified frontage access points
  (fabric-gap detector on the union), run a street grid sized by product
  (MF blocks 300–500 ft, TH blocks 200–350 ft with lanes), connect all
  blocks; every block edge on an internal street is "frontage" for its
  sub-solve.
- Streets consume land honestly (ROW width 50–60 ft) and count as
  impervious in the roll-up.
- Subdivision is a CONFIGURATION: generate 2–3 street-grid candidates
  (orientation from the union's long axis and from the dominant exterior
  frontage), and compare COMPLETE masterplan solves — never grid proxies.

### 3. Per-block product tournament
- Each block × each permitted product (MF surface, MF tuck-under, TH
  lanes) = one complete sub-solve via the existing generators (they
  already accept arbitrary parcel polygons in principle; blocks enter as
  synthetic parcels — requires the generators to accept geometry input or
  a temp-parcel mechanism; DECISION for the implementation session).
- Selection per block: argmax by the objective profile, with mix
  constraints (e.g. ≥20% TH if the profile asks) solved greedily then
  repaired by swap passes — all real solves.

### 4. Shared systems (phase 2 of the implementation)
- Detention: sized from total impervious across blocks, placed in the
  worst-solving block's residual land (turns its weakness into the
  system's home) with the trade recorded.
- Amenity: one shared amenity replaces per-block minimums where ordinance
  allows; flagged per block.

### 5. Phasing + ledger
- Each block carries its own lineage (parent chain), verdict, validators,
  and money receipts; the masterplan ledger is the SUM of block receipts
  with no synthesis — if a block is `feasible_optimization_incomplete`,
  the roll-up says so per block and refuses a total-level "optimized"
  claim.

## Acceptance (scenario classes, never addresses)
- Two-parcel side-by-side assemblage → one street, two blocks, both solve.
- Corner assemblage (L-union) → grid handles the bend; no orphan block.
- Assemblage with a fabric-locked member → union frontage rescues it;
  flag records that the member alone was landlocked.
- Mixed-product profile → tournament produces both products with honest
  per-block verdicts.
- Random-N assemblage sweep (hash-ordered adjacent pairs/triples from the
  parcel fabric) with structured-outcome and plan-or-proven gates, same
  discipline as `mf_generalization_sweep.sql`.

## Explicitly out of scope for v1
Financial optimization across blocks (pro-forma layer still parked);
jurisdiction 2; grading/earthwork; unit-plan libraries (A–H widths).
