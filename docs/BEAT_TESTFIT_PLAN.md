# Beat TestFit — Product Plan (v1)

*Status: adopted plan. Supersedes incremental patching of the client massing engine.*

## 1. Honest diagnosis: why we're 2/10 despite months of green CI

Everything shipped so far — live drag re-solve, pins, undo, floorplates, KPIs,
context panel — is **frame around the generator**. The generator itself (client-side
bars + strip parking + a naive drive spine) produces layouts no developer would
recognize as a site plan. Polishing the frame cannot fix the picture. The cycle of
minor updates exists because each user test correctly finds the output bad, and each
fix improves the *symptom* while the generation core stays a toy.

**The center of gravity is wrong.** The one genuinely good generator we have —
`fn_generate_sf_site_plan` — lives in PostGIS next to the data, returns
market-grounded, canvas-ready plans in ~350ms. The MF path should work the same way.

## 2. What the backend audit found (2026-07-05, project okxrvetbzpoazrybhcqj)

Assets the UI has never touched:

| Asset | Scale | What it means |
|---|---|---|
| `buildings` (+ `building_parcel_join`) | **328,158 real building footprints** (geom, footprint SF, stories, heights, volume), 357k parcel joins | Nashville's entire built environment as queryable precedent — the raw material for "plan from what actually gets built here" |
| `typology_spec` | schema complete, **only 2 rows seeded** | A parametric archetype library: setbacks, coverage, parking ratios, stall/aisle dims, floorplate depth, **structured_parking_threshold_far, podium_levels** — the archetype system already designed, waiting for rows |
| `typology_built_form` | 12 rows | Per-typology empirical form stats |
| `siteplanner_session` / `siteplanner_candidate` | schema complete, **0 rows** | A designed-but-unbuilt server-side generation loop: candidates carry `geometry_buildings/parking/drives` + `metrics` + `parent_candidate_id` (an evolution tree). Someone already architected the right system. |
| `floorplans` (+rooms/walls/openings) | 4,989 | Unit-plan-level data for later fidelity |
| `fn_local_built_form` / `fn_local_pricing` | live, full coverage | Comps distributions + $/SF — the money objective |
| `get_parcel_front_edge_with_roads`, `fn_buildable_envelope_directional` | live | Road-aware access + per-edge setbacks, server-side |
| `default_costs_by_use`, `zoning` (28 cols), `parcel_constraints` | live | Cost + regulation grounding |

**Cheap wiring bugs found:** the UI calls `get_roads_near_parcel` (doesn't exist —
`get_parcel_front_edge_with_roads` does) and table `site_plans` (doesn't exist —
`site_plan_models` does). Two 404s in every console are name mismatches.

## 3. What TestFit actually does well (the bar, stated precisely)

1. **Layouts read as intentional architecture**: buildings wrap parking garages
   (donut/wrap), podiums carry bars, cores and corridors are placed, units face out.
   Every object exists in *relation* to the others.
2. **Site systems first**: access from the real street, drive loops that work,
   garages fed by ramps, amenity placed — the skeleton comes before massing.
3. **Parking as a solved system**: surface/tuck-under/structured chosen by ratio and
   FAR pressure, with real stall/ramp/bay geometry.
4. **Real-time parametric co-creation** on top of all that (we have the loop; theirs
   moves *good* plans).
5. Instant scheme iteration, 3D, exports.

What TestFit **cannot** do: it knows nothing about the specific market. No comps, no
local pricing, no "what's actually being built within a mile," no parcel data, no
web collaboration. Its plans are rule-plausible, not evidence-grounded.

## 4. Strategy: don't imitate the rule engine — outflank it with evidence

**One generation core, server-side, candidate-based, grounded in 328k real
buildings.** The SF generator proved the pattern. We extend it to MF using the
architecture that already exists in the schema (`siteplanner_candidate`), the
archetype specs (`typology_spec`), and precedent (`buildings`).

The differentiated sentence we're building toward:
> "This plan is a 3-story garden-bar cluster because that is what the last 40
> projects within a mile of this parcel actually built — and at local pricing it
> yields 6.4% on cost."

TestFit structurally cannot say that sentence.

The client planner's role changes: **editor and viewer of server-generated plans**
(pins, drag re-solve, floorplates, KPIs all stay — they're good), no longer the
primary generator.

## 5. Milestones (each one a visible league-jump, with acceptance criteria)

**M0 — Rewire what exists (days).**
Fix the two name mismatches (front-edge fn, `site_plan_models`); retire
`hbuAnalysis.ts`'s hardcoded zoning map onto `fn_resolve_permitted_uses`; seed
`typology_spec` for the core archetypes (garden bar, townhome row, wrap, podium).
*Accept: zero 404s in console; HBU panel agrees with the context engine; saved
plans persist.*

**M1 — Site skeleton (the "driveways make no sense" killer).**
Server-side: access point from `get_parcel_front_edge_with_roads` → drive network
(loop or dead-end + hammerhead per fire code) → developable pads. Returned in
`canvas_frame`. *Accept: on the 5 test parcels, a reviewer can't tell the drive
network from a civil engineer's first sketch; drives always connect to the actual
street.*

**M2 — `fn_generate_mf_site_plan` v1 (garden-bar archetype).**
Mirror the SF generator: bars along pads from M1, surface parking courts *between*
bars (not strips against the bbox), sized by `typology_spec` ratios; persists
candidates to `siteplanner_candidate`; returns `canvas_frame`. Client renders it
exactly like the SF plan; drag/pin editing still works on top. *Accept: parcel
554963 (CF) produces a plan a multifamily developer would screenshot, in <1s.*

**M3 — Plan from precedent (the moat).**
Archetype + dimensions selected from the `buildings` evidence: query the built
form actually surrounding the parcel (stories, floorplate depth, coverage,
building count per acre) and instantiate the archetype that matches the local
pattern at the p75 underwrite target. Plan-basis line cites it: "…because 40
nearby projects built this." *Accept: switching between two different Nashville
submarkets visibly changes the archetype chosen for identical-sized parcels.*

**M4 — Structured parking + wrap/podium.**
Garage as a placeable building (ramp module, bay dims from spec); wrap the donut;
podium via `structured_parking_threshold_far` and `podium_levels`. *Accept: crank
target FAR past the threshold on a test parcel and watch the plan switch from
surface courts to a wrapped garage.*

**M5 — Money as the objective.**
Candidates ranked by yield-on-cost computed from `fn_local_pricing` +
`default_costs_by_use` (not an abstract score). Candidate tree in the scheme cards
(parent_candidate_id → explore/refine lineage). *Accept: the top-ranked scheme is
the one with the best defensible YoC, and the card says the number.*

**Throughout:** golden acceptance snapshots on the 5 brief parcels; every milestone
demo'd on parcel 669046 (the sliver) and 554963 (CF).

## 6. Kill list (stop spending here)

- Client-side SA as the primary generator (keep only as interactive refine until M2
  replaces it; delete after).
- `hbuAnalysis.ts`'s internal zoning mapping (M0 retires it).
- Any further polish on the client MF generator's parking/drives (M1/M2 replace).
- Remaining dead legacy components (delete opportunistically with M0).

## 7. Division of labor

- **Backend (SQL/PostGIS)**: M1/M2/M3 generator functions — same idiom as
  `fn_generate_sf_site_plan`. Can be developed as repo migrations and applied via
  the existing process (DB is currently ahead of repo; migrations are records).
- **Client (this repo)**: render + edit `canvas_frame` plans (mostly exists),
  candidate tree UI, M0 rewiring.
- The client engine remains for interactive edits between server solves.
