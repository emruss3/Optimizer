# PR #188 — Delk 675423 street comparison (lead evidence)

**Branch:** `cursor/housing-delk-cottage-6eb1`  
**Parcel:** 0 Delk Ave / ogc_fid **675423** (RS5)  
**Scheme:** `neighborhood:deep search` (5 lots, shared private drive)

## What was captured

Live UI screenshots from the housing branch against the visual-battery fixture
replay (mock Supabase on `:54321`, Vite on `:5199`). Not unit tests — real
canvas + 3D **Street** camera (`data-shot.shot === "street"`, eye-level).

| Label | File | Notes |
|---|---|---|
| Baseline / rev **316a0d36** | `675423_3d_street_baseline-fixture_316a0d36.png` | Deep-search pads **before** cottage apply. `meta-before.json`: `housingSelected=false`, revision `316a0d36`, shot `street`. |
| Cottage candidate | `675423_3d_street_cottage-candidate_abhp-1754-00010.png` | After selecting **ABHP 1754-00010**. `meta-after.json`: `housingSelected=true`, fit `3 placed · 2 open`, shot `street`. Scene revision still `316a0d36` (plan hash); picker + lot-4/5 reasons visible in the inspector. |
| 2D pre | `675423_2d_pre-cottage.png` | Five-lot plan before cottage. |
| 2D cottage | `675423_2d_cottage-selected.png` | Cottage selected; lots 4–5 unresolved reasons shown. |

Pinned battery baselines for the same revision (default camera, not street):
`qa/baselines/2026-11-23/675423_{2d,3d}.png` (rev `316a0d36`).

## Reproduce

```bash
node scripts/visual-battery/mock-supabase.mjs   # :54321
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=battery-gate-local-mock \
  npx vite --port 5199 --strictPort --host 127.0.0.1
node scripts/capture-delk-street-pr188.mjs
```

## Access notes (this pass)

- Housing preview URL was behind Vercel SSO; CLI/`vercel` logged out; Vercel MCP
  auth not available in this agent environment.
- Port 3000 already ran another agent’s `vercel-dev` (routes branch) — left alone.
- Capture used housing worktree + fixture replay (same Delk deep-search answers
  that pin production audit rev `316a0d36`).

## Lot-5 / lot-4 (fixture)

Applying the cottage leaves lots 4–5 unplaced with frontage/pie reasons
(asserted in `housing.test.ts`; visible in the 2D cottage screenshot).
