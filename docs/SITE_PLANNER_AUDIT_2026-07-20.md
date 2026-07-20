# Site Planner — first-principles audit (2026-07-20)

Evidence-based: every number here was measured against the live system on
this date (deterministic 12-parcel random sweep, hash-ordered selection over
`zoning ~ '^(RM|OR|MU)'`, 0.2–9 ac; latency from live compile/solve timings;
feature claims verified in code or on screen this session).

## Headline numbers

> **End-of-day P0 result (same date, after the coverage ledger closed):**
> original random-12: **11/12 solving (92%), 12/12 plan-or-proven**. Unseen
> random-12 (ranks 4–6 per band, never tuned on): 6/11 eligible solving,
> 100% structured. **Combined random-24: 74% solving, 82.6% plan-or-proven —
> the P0 acceptance gate (≥80%) passes.** Enforced by
> `tests/sql/mf_generalization_sweep.sql`. Residual classes: tiny-shape
> packer misses ×2, bridge-blocked ×1, parking variant ×1 — all structured.

- **Coverage (morning baseline)**: 4/12 randomly sampled eligible parcels
  produce a rendered plan (33%); was 3/12 before today's slab-fallback.
  8/12 return structured, classifiable diagnoses (was: dead strings).
  0/12 die silently.
- **Quality when the grammar fits**: 99.9% / 83.3% / 59.5% / 56% capture, all
  fully parked, zero building×pavement overlap, deterministic, classified
  (`feasible` / `incomplete` / `demonstrably_constrained` with proof).
- **Latency**: warm compile ~1.3 s + solve 1–3 s ≈ **3–5 s click-to-plan**;
  cold compile ~8 s (client retry included) ≈ 9–12 s worst case.
- **Failure ledger** (by class, from the sweep): tiny-envelope grammar gap
  ×3 (0.24–0.5 ac), extreme-shape placement ×1 (2.3 ac), parking self-sizing
  ×1 (0.82 ac), drive connectivity ×1 (4.3 ac), impervious-trim
  non-convergence ×1 (8.6 ac), shallow-envelope early refusal ×1 (string,
  needs structuring).

---

## Q1 — Does this give a developer highest/best development in seconds?

**Verdict: half.** For the third of parcels the grammar fits, yes: click →
ordinance-compiled context → theoretical envelope + stories ladder + solved
plan with receipts in 3–5 s warm. Two structural gaps:

1. **Coverage** — 2/3 of eligible parcels get a diagnosis, not a plan
   (ledger above; every class has a named fix).
2. **"Highest and best" is asserted, not analyzed.** We default to the
   densest as-of-right use and solve it. True HBU compares uses ×
   products × financial yield. The financial layer is deliberately parked
   (yield chip hidden, IRR=0 placeholder, margin from local-sales comps
   only).

**Plan**: (a) close the failure ledger (P0); (b) **HBU comparator** — compile
every as-of-right use, run each product's envelope + solve + quick residual
land value, return a ranked verdict strip in one interaction (P1).

## Q2 — Does it move dynamically and optimize within constraints?

**Verdict: yes on the happy path — proven this week.** Drag/resize streams
the footprint as a pin; parking and drives re-solve around the user's hand;
caps strained show as flags, caps broken as red violations; the solver
iterates to fixpoint with in-envelope parking, infill, and court
reallocation; every result self-classifies with a quantified proof;
byte-identical determinism.

**Gaps**: one orientation and one grammar per solve (no configuration
sweeps); server plans change by regeneration while only worker plans
live-resolve on sliders; `optimization_status` is computed server-side but
the UI still infers it from capture.

**Plan**: config sweeps (orientation ± / bar-count variants, best-of-N by
score) (P1); surface `optimization_status`/`proof_basis` verbatim in the
headline and Flags dock (P1, small).

## Q3 — Does the context engine need to be more robust?

**Verdict: it is the moat, and it is thin in three places.**

Strong: ordinance-sourced hard constraints with provenance; typology-aware
Regrid priors; immutable hashed snapshots; use-binding; compile-race-proof
client; honesty gates (no context → no massing).

Thin: **(1) Frontage** — every plan carries "access remains based on a
frontage heuristic, not a verified road edge"; the roads corpus is 68 rows.
Entry, front setback direction, and curb cuts are guesses. **(2) Priors** —
precedent samples of 5–6 (medium/low confidence) steer form. **(3) Intent**
— `p_user_intent` is hashed into snapshot identity but consumed by nothing;
"plan at N stories" cannot round-trip.

**Plan**: G0 road-edge ingestion (real street geometry → verified frontage,
front setback direction, curb-cut placement) (P1); intent consumption
(target stories/mix → brief → generators, with clamp vocabulary) (P1);
per-district ordinance completeness audit with a confidence dashboard (P2);
second jurisdiction pilot to force generalization (P2).

## Q4 — How does the UI beat TestFit?

**Verdict: already differentiated on honesty; behind on ergonomics and
deliverables.** TestFit cannot show ordinance receipts, precedent lineage,
optimization proofs, or refuse-to-fake behavior — that is the wedge. What
TestFit does better today: direct-manipulation ergonomics and the exit
artifact.

**Plan (ranked)**: clickable stories ladder + editable unit mix (rides
intent, P1); **PDF export** — plan + tabulation + ladder + receipts page
(the `pdf-export` edge function already exists, unused) (P1);
side-by-side scheme compare from the rail (P1); type-a-dimension editing
and snap guides (P2); presentation mode (P2).

## Q5 — How does 3D massing become legit?

**Verdict: contextual but toy-grade.** Has extrusions, neighborhood white
massing, street trees, orbit. Reads as a diagram, not a study model.

**Plan**: floor banding (spandrel lines at f2f heights) + thin parapet (P1);
**sun study** — date/time slider with real shadow casting (deck.gl lighting;
shadows are an entitlement argument, not decoration) (P1); ground plane with
street/drive texture from the plan itself (P2); camera bookmarks + PNG
export for decks (P1, small); terrain/FFE from grading data (P2, the
West Heiman grading exhibit is the reference).

## Q6 — Designing site plans for neighborhoods?

**Verdict: displays neighborhoods; does not design them.** The West Heiman
reference (154 units on a private lane network with dispersed pocket parks)
is the bar.

**Plan**: TH lane-network grammar — lanes as first-class circulation, rows
fronting lanes, rear-loaded aprons, pocket greens (spec'd, queued) (P1);
**multi-parcel assemblage MVP** — select adjacent parcels → merged envelope
→ one plan + per-parcel yield ledger (P2); block subdivision + product
mixing per block (TH rows + MF corner) and phasing (P3).

## Q7 — Roads/parking sense; architect/planner realism?

**Verdict: engineered-legible, not yet professional.** Good: connected
drive invariant, curb cut at the boundary, apron parking for TH, stall/aisle
math, bar-to-drive and bar-to-parking access rules, zero-overlap contract.

Missing, in the order a reviewer would redline: fire apparatus access
(turning geometry, hammerheads, hose-lay distances); ADA + EV stall
allocation; aisle directionality; **tuck-under/podium/structured regimes**
(tuck-under is also the biggest yield unlock on impervious-bound lots —
parking under the bar frees land the proof says is missing); server-side
core/corridor model (efficiency is currently a client-side estimate);
build-to/street-wall lines and entries oriented to the street; courtyard /
point-block / wrap grammar library chosen by lot class; unit-depth
daylighting limits.

**Plan**: tuck-under regime (P1 — directly re-opens proven-constrained
lots); fire-access validator as flags (P2); server core/corridor model (P2);
grammar library by lot class (P2–P3); build-to lines from verified frontage
(arrives with G0 roads, P1 dependency).

---

# The plan

## P0 — coverage: close the failure ledger (acceptance: ≥80% of a random 24-parcel sweep returns plan-or-proven; 100% structured)
1. Compact street-loaded plex grammar for tiny envelopes (largest class:
   0.2–0.5 ac lots — block + apron/tandem parking, no internal drive).
2. Rotated/oriented slab search for extreme-shape parcels (2.3 ac failure).
3. Impervious-trim convergence on large parcels (trim parking+drives with
   bars, never refuse when trimming can satisfy).
4. Parking self-sizing retry (shrink program before refusing, unpinned).
5. Drive-connectivity bridging on large irregulars.
6. Structure the last string error ("envelope too shallow").

## P1 — decisiveness: the developer verdict (acceptance: HBU verdict < 5 s warm; stories-click round-trip < 3 s; PDF in hand)
1. HBU comparator verdict strip (all as-of-right uses × products, ranked).
2. Intent consumption: clickable stories ladder, editable mix.
3. Config sweeps (best-of-N orientations/bar counts). **Outcome
   (2026-07-20): in-function proxy ranking falsified head-to-head and
   reverted (migrations 20260720000018..21); seed phases measured
   invariant (≤0.02%). Honest sweeps must compare complete real solves —
   harness folds into the parking-regime work (item 4). Full record in
   SOLVER_CONVERGENCE_SPEC.md §Phase 3.**
4. Tuck-under parking regime (now also carries the real-solve
   configuration-sweep harness from item 3). **Shipped 2026-07-20
   (migrations 20260720000022..23): fn_mf_solve_core regime worker +
   dispatcher comparing complete solves by achieved GSF. 558613 converts
   parking-infeasible → 227,760 GSF / 100% capture feasible; random-24
   ratchets to 87.0% plan-or-proven (gate raised 80→85). Receipts in
   metrics.regime_comparison; tuck chip + Flags receipts in UI.**
5. PDF export deliverable.
6. G0 road-edge ingestion → verified frontage.
7. Surface optimization_status/proof verbatim in UI.
8. Ship auth (persistence is live and waiting) + front-end deploy pipeline.

## P2 — depth: professional grade
1. 3D legitimacy pack: floor banding, sun study with shadows, camera
   bookmarks/PNG export, plan-textured ground.
2. TH lane-network grammar (West Heiman bar), then assemblage MVP.
3. Fire-access validator; ADA/EV allocation; core/corridor server model.
4. Grammar library by lot class (courtyard, podium, point block, wrap).
5. Ordinance completeness dashboard; second jurisdiction pilot.

## P3 — neighborhood master-planning
Block subdivision, product mixing per block, phasing, shared
amenity/detention allocation, cross-parcel yield ledger.

---

*Discipline carried forward: examples identify failure classes, never
solutions (`tests/sql/no_parcel_literals_in_functions.sql` enforces);
"achievable" only for solver-reproduced numbers; compliance ≠ optimization;
every refusal structured and measurable.*
