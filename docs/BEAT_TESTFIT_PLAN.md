# Best on the Market — Product Plan (v2)

*Status: adopted plan (v2, 2026-07-10). v1 ("Beat TestFit") is preserved below as
history; v2 extends it with the full market bar, a scored audit of the current
product, and phases A–D. One rule carried forward: no more polishing symptoms —
every milestone moves the generation core, the money loop, or the deal surface.*

## 0. Audit scorecard (current main, 2026-07-10)

Scored against "what a deal-maker pays for", 0–10, with the market leader in
each dimension as the bar:

| Dimension | Score | Bar (leader) | Gap in one line |
|---|---|---|---|
| Site generation quality | 4 | TestFit (8) | v1 grammar is real (rows/streets/courts/spine/amenity) but rigid: one archetype, no perimeter-following on odd parcels, no townhome/wrap/podium, no garages, entry = longest-edge guess, constraints (flood/slope/easements/FAR caps) not enforced |
| Interactivity / tool feel | 4 | TestFit (9) | Client plans drag/undo well; server plans are static (v1 trade-off); tools exist but lack affordance (disabled states unexplained, zoom semantics vary by device); UI polish uneven |
| Financial truth | 5 | Deepblocks (6) | One debt-aware pro forma engine (good bones) but revenue/cost assumptions are defaults — `fn_local_pricing` is displayed, not yet piped into the pro forma or the generator's objective |
| Data moat | 9 asset / 3 exploited | nobody | 359k parcels + 28-col zoning + **328k built footprints** + 4,989 floorplans + local pricing + flood/slope — no competitor has this depth locally; the product barely uses it |
| Trust & provenance | 6 | nobody | Provenance badges, honest flags, deterministic solver, build stamp — differentiated; needs to extend to every number on screen |
| Output / deliverables | 2 | TestFit (7) | No PDF board, no DXF/GeoJSON export, 3D is basic; deal-makers buy exports |
| Speed to first plan | 7 | TestFit (8) | Auto-plan on open, generator ~1.5s; keep p95 < 2s |
| Collaboration / persistence | 2 | Giraffe (7) | Candidates now persist (first rows 2026-07-10) but no schemes UI, no share links, no multi-user (RLS pending) |
| Coverage | n/a | — | Nashville-depth only; expansion is a data-ops pipeline, not product code |
| Product coherence | 4 | — | 4 planner components still shipped (5,331-line legacy monolith included); one true surface needed |

**Verdict: "rudimentary" is accurate for what a user can *touch* today, while the
foundations (generator core, candidate persistence, context engine, data moat)
are now genuinely differentiated. v2 is about converting foundations into felt
product.**

## 1. The market bar (who we have to beat, and where they can't follow)

- **TestFit** — the generation/iteration bar: real-time site solving, strong
  parking + unit engines, co-creation feel. *Cannot follow us on:* market
  evidence (no parcel DB, no comps, no local pricing — you bring your own site
  and your own numbers).
- **Autodesk Forma (ex-Spacemaker)** — early-design environment analyses (sun,
  wind), Autodesk gravity. *Weak on:* underwriting, US parcel/zoning ground truth.
- **Deepblocks** — parcel + zoning + quick feasibility. *Weak on:* generation
  quality (boxes), depth of local evidence.
- **Giraffe** — map-native collaboration + app ecosystem. *Weak on:* generation
  and money.
- **Land-intel tools (Regrid/LandVision/CityBldr)** — parcels and scores, no design.

**The open lane (ours):** *parcel-click → evidence-grounded scheme → local-priced
pro forma → lender-ready export, in one loop.* Nobody owns that end-to-end. The
sentence no competitor can say stays the north star:

> "This plan is a 3-story garden-bar cluster because that is what the last 40
> projects within a mile actually built — and at local pricing it yields 6.4%
> on cost."

## 2. Shipped since v1 (the foundation is real)

- **M0 (client half)**: typology-based SF/MF routing (+ RM/MF zoning-code guard),
  zoning-grounded default use via `fn_resolve_permitted_uses` (planner + HBU),
  vocabulary bridge, honest 404 fallbacks, parking spec grounded from
  `typology_spec`, viewport rebuilt (anchored zoom, wheel wiring, auto-fit,
  on-canvas zoom cluster), full-screen planner without friction, build stamp.
- **M1+M2 v1**: `fn_generate_mf_site_plan` — entry drive from primary frontage,
  spine, oriented bar rows, alternating double-loaded parking streets and green
  courts, amenity pad, adaptive on tight sites, EPSG:2274 truth, **first-ever
  rows persisted to `siteplanner_session` / `siteplanner_candidate`**.

## 3. Phases (each converts a foundation into felt product)

### Phase A — Close the loop that exists (the "no longer rudimentary" phase)
- **A1. Schemes rail (candidate tree UI).** Every Generate already persists a
  candidate; show them: thumbnails, KPI compare, restore, "variation of"
  lineage via `parent_candidate_id`. Generate stops being a slot machine and
  becomes an explorable design space. *Accept: flip between 5 schemes on one
  parcel in <1s each; KPIs visibly differ; survives reload.*
- **A2. Edit-as-regeneration.** Dragging a bar on a server plan becomes a
  constraint (`p_pins`) and the site re-solves around it server-side (parking
  streets re-flow, courts re-shape), persisting a child candidate. Restores
  full interactivity on server plans — the v1 trade-off erased, the TestFit
  feel achieved *with* persistence. *Accept: drag a bar → coherent re-plan
  <1.5s → child candidate in the rail.*
- **A3. Money objective in the loop.** Pipe `fn_local_pricing` +
  `default_costs_by_use` into the pro forma AND the generator: K seeds ranked
  by yield-on-cost, best returned, all persisted. Plan basis cites evidence:
  "$X/SF from N local sales". *Accept: two parcels with different local
  pricing produce differently-shaped winners, and the pro forma shows local
  numbers with provenance badges.*
- **A4. Tool feel.** Every control works or explains why it's disabled;
  cursor states per tool; hover highlights; measure with live readout;
  trackpad pinch + smooth exponential zoom (shipped); delete/copy/paste
  coherent in every plan mode. *Accept: a first-time user can zoom, pan, fit,
  measure, select, and duplicate without instructions.*

### Phase B — Evidence moat (the unmatchable phase)
- **B1. Plan-from-precedent.** Archetype + bar depth/length/stories chosen
  from the `buildings` corpus around the parcel (p25–p75 envelopes), with an
  evidence card ("what the last 40 projects within a mile built") next to the
  plan. This is the differentiator sentence, live.
- **B2. Typology expansion.** Seed `typology_spec` (townhome, two_family,
  wrap, podium); townhome-row generator (unit ticks + garage stubs — the
  reference-image grammar); SF subdivision v2 (streets + culs-de-sac, not
  bbox slices).
- **B3. Constraint truth.** Flood/slope developable mask from
  `fn_resolve_physical_context` respected by the generator and drawn on
  canvas; easement upload (schema exists: `uploaded_easements`); FAR/density/
  coverage enforced with floors-vs-parking auto-balance (structured parking
  when `structured_parking_threshold_far` trips).
- **B4. Real road edges.** Ingest the county road network (OSM/TIGER) →
  `get_parcel_front_edge_with_roads` becomes real → entries from actual
  streets, corner parcels get corner treatments.

### Phase C — Deal surface (the "buy it" phase)
- **C1. One-click board export.** PDF: plan graphic + KPIs + pro forma +
  evidence citations + provenance. This is what gets shown to capital.
  DXF/GeoJSON out for the architect handoff.
- **C2. 3D + sun.** Massing with shadows (deck.gl), one toggle. Cheap wow,
  real utility for height conversations.
- **C3. Share links.** RLS on, read-only scheme pages (candidate + KPIs) —
  the collaboration wedge without building multiplayer.
- **C4. Presentation-grade canvas.** Landscape garnish, hatching, line
  weights tuned to the reference plans; the plan should look like the
  marketing site plans users pinned as the bar.

### Phase D — Platform
- **D1. One planner surface.** Delete the legacy monolith + duplicates
  (5,331 + 568 + 401 lines); `EnterpriseSitePlannerShell` + `SiteWorkspace`
  is the only planner.
- **D2. County onboarding pipeline.** Parcels/zoning/buildings/pricing as a
  repeatable data-ops recipe — coverage becomes sales-driven, not eng-driven.
- **D3. Assemblage.** Multi-parcel selection → merged envelope → same loop
  (`optimize_assemblage_massing` exists as a starting point).

**Sequence: A1 → A2 → A3 → A4, then B, then C, then D — except C1 (export)
may pull forward if a sales conversation needs it.**

## 4. Kill list (unchanged + additions)

- Client SA as primary generator (edit-refiner only, then retire behind A2).
- Any further polish on the legacy planner components (delete in D1).
- Numbers without provenance — if a value can't say where it came from, it
  doesn't ship.
- Silent fallbacks — every degraded mode says so on screen (pattern: the
  fallback-envelope banner, `parking_below_ratio`, build stamp).

## 5. Operating rules

1. Every PR moves generation, money, or deliverables — or deletes debt.
2. Live parcels are the test suite: 669046, 667899, 293030, 554963, 554959 +
   one large greenfield; a milestone isn't done until they all render sanely.
3. The DB is ahead of the repo: functions apply live via MCP, then commit the
   migration with an "already applied" header.
4. Deploy state is checkable at a glance: the build stamp in the planner
   header is authoritative — debug code only when the stamp matches main.

---

# Appendix: v1 plan (2026-07-05, superseded but preserved)

## v1.1 Honest diagnosis: why we're 2/10 despite months of green CI

Everything shipped so far — live drag re-solve, pins, undo, floorplates, KPIs,
context panel — is **frame around the generator**. The generator itself (client-side
bars + strip parking + a naive drive spine) produces layouts no developer would
recognize as a site plan. Polishing the frame cannot fix the picture. The cycle of
minor updates exists because each user test correctly finds the output bad, and each
fix improves the *symptom* while the generation core stays a toy.

**The center of gravity is wrong.** The one genuinely good generator we have —
`fn_generate_sf_site_plan` — lives in PostGIS next to the data, returns
market-grounded, canvas-ready plans in ~350ms. The MF path should work the same way.

## v1.2 What the backend audit found (2026-07-05, project okxrvetbzpoazrybhcqj)

| Asset | Scale | What it means |
|---|---|---|
| `buildings` (+ `building_parcel_join`) | **328,158 real building footprints**, 357k parcel joins | The built environment as queryable precedent |
| `typology_spec` | schema complete, 2 rows seeded | Parametric archetype library incl. structured-parking threshold, podium levels |
| `siteplanner_session` / `siteplanner_candidate` | schema complete — **now in use (2026-07-10)** | The server-side generation loop with candidate lineage |
| `floorplans` (+rooms/walls/openings) | 4,989 | Unit-plan-level data for later fidelity |
| `fn_local_built_form` / `fn_local_pricing` | live, full coverage | Comps distributions + $/SF — the money objective |
| `get_parcel_front_edge_with_roads` | live but a **stub**; roads ~68 rows | Real road-grounded access is B4 data work, not a rename |
| `default_costs_by_use`, `zoning` (28 cols), `parcel_constraints` | live | Cost + regulation grounding |

**Contract clarification (audited from `fn_resolve_design_context` source):**
`regime` is the PARKING-STRUCTURE axis (`vertical` / `horizontal` /
`horizontal_pending` = FAR unknown). It must never route SF-vs-MF; the resolved
`typology` does that (and RM/MF/RX zoning codes are the tiebreaker).

## v1.3 Milestones M0–M5 (dispositions)

- **M0 Rewire** — client half SHIPPED (PR #24); backend half (typology_spec
  seeding) folded into B2.
- **M1 Site skeleton / M2 Server MF generator** — v1 SHIPPED (PR #25); depth
  continues in A2/B1–B4.
- **M3 Plan-from-precedent** — now B1.
- **M4 Structured parking / podium** — now B3.
- **M5 Money objective + candidate tree** — now A1 + A3 (pulled earlier: it is
  the differentiator and the persistence already exists).
