# Visual QA battery — and the pre-merge Battery Gate

Screenshots 4 reference parcels (2600 W Heiman 553450 · 2622 W Heiman
667574 · 1200 W H Davis 669046 · 1710 Meharry 488278) in 2D + 3D by
driving the real app headlessly (Playwright + Chromium), and — in ASSERT
mode — machine-checks each parcel against `expectations.json` so the
battery can gate merges (audit 2026-07-21, Ordered Path item 2).

## The gate (`.github/workflows/battery-gate.yml`)

Every PR runs **fixture mode**: `fixtures/mock_store.json` (committed REAL
server responses) is replayed through the real client — mapper →
zero-overlap validator → render — and the job fails if any parcel violates
its expectation:

- `"mode": "server-plan"` — the SERVER plan must render (lineage
  `solvedBy: server`, no `server-plan-rejected` violation) with capture ≥
  `minCapturePct`. **Floors only ratchet UP** — yesterday's numbers are the
  floor.
- `"mode": "honest-refusal"` — the committed response is known-defective
  (geometry): the gate asserts the rejection machinery fires LOUDLY
  (`server-plan-rejected` violation present) and the worker fallback
  renders. Flip the parcel to `server-plan` the moment the server output is
  fixed.
- `"mode": "subdivision"` (2026-09-03) — a subdivision-pattern parcel must
  render the NEIGHBOURHOOD the server drew (`fn_generate_subdivision`:
  through-streets on the long axis, rear alleys, whole lots, courts) with
  `subdivisionLots ≥ minLots` (floors ratchet UP), the expected `network`
  (`spine` / `ladder` / `grid`), ROW at or under `maxPctRow` of the land,
  the neighbourhood panel in the DOM, and no geometry-gate rejection.

**The ritual**: a PR that changes server behavior must refresh the fixtures
(below) and raise the floors in the same PR. A solver improvement that
can't clear its own previous numbers doesn't merge.

Nightly, **live mode** runs the same battery against the real backend
(fixtures can't see a solver regression) plus one random cohort parcel
(advisory) — enabled by the `BATTERY_SUPABASE_URL` /
`BATTERY_SUPABASE_ANON_KEY` repo secrets; it no-ops until they exist.

Evidence comes from a dev-only hook (`window.__planEvidence` in
`SiteWorkspace`): who solved the plan, the basis line, violation codes,
and capture — not pixel scraping. Screenshots + `results.json` upload as
workflow artifacts either way.

## Refreshing fixtures

For each battery parcel, store the RPC responses under keys
`rpc:<fn>:<ogc_fid>:<p_use|p_typology|''>` in
`fixtures/mock_store.json`. The functions the app calls:
`fn_compile_planner_context` (`multi_family`, `single_family`,
`two_family`), `fn_generate_mf_site_plan_v2` (`multifamily`),
`fn_massing_program`, `fn_max_buildout`, `fn_parcel_frontage`,
`fn_planner_neighbors`, `fn_mf_money`, `fn_resolve_permitted_uses`,
`fn_list_mf_candidates`, `get_parcel_by_id`, `fn_seed_parking`
(`multifamily`), `fn_plan_pattern` (`multifamily`), and — for the
sf-suggestion parcel — `fn_parcel_buildability`, `fn_generate_sf_seed`,
`fn_generate_sf_site_plan`; for the subdivision parcel
`fn_generate_subdivision` (key suffix empty: the default scheme passes only
`p_ogc_fid`). `fn_plan_pattern` and `fn_generate_subdivision` are one
vintage: the pattern's alignment verdict describes that generator, and the
pattern's `calibration` block is a snapshot of `subdivision_sweep` — harvest
all three after a sweep, never separately.

**Same-vintage rule (2026-07-28 lesson):** `fn_generate_mf_site_plan_v2`
and `fn_max_buildout` must be harvested TOGETHER — capture is
plan.gsf / max_buildout.max_gsf, and a stale denominator against a fresh
numerator red-flagged three parcels for a frontier drift that wasn't a
client regression. With database access:

```sql
select jsonb_build_object(
  'compile', public.fn_compile_planner_context(<fid>, 'multi_family', null),
  'massing', public.fn_massing_program(<fid>, 'multifamily'),
  'solve',   public.fn_generate_mf_site_plan_v2(<fid>, 'multifamily', 1, null, null, false,
             (public.fn_compile_planner_context(<fid>, 'multi_family', null)->>'context_id')::uuid)
);
```

then merge into the store JSON and update `expectations.json` (ratchet up).
Unknown RPCs 404 and log to `mock_misses.log` (recorder mode) — run the
battery once and harvest whatever it reports missing.

## Why a mock Supabase endpoint

The CI/agent sandbox blocks egress to supabase.co, so `mock-supabase.mjs`
serves the committed real responses. The pixels show genuine solver output
rendered by the genuine client; only the transport is synthetic. Table
reads return `[]`; auth returns no session.

## Run locally

1. `node scripts/visual-battery/mock-supabase.mjs &` (defaults to the
   committed fixtures; `MOCK_STORE=...` to point elsewhere)
2. `.env.local`: `VITE_SUPABASE_URL=http://localhost:54321`, any anon key.
3. `npx vite --port 5199 &`
4. `ASSERT=1 node scripts/visual-battery/battery.mjs`
   (`CHROMIUM_PATH=/opt/pw-browsers/chromium` in the agent sandbox;
   `SHOTS_DIR=...` to redirect output; `ONE_PARCEL=1` for iteration;
   `ALL_CONSOLE=1` for full console capture)

Outputs: screenshots, `console_errors.json`, and `results.json` (the gate
verdict per parcel).
