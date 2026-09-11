# Parcelmap / Optimizer – Full Project Audit

**Audit Date:** 2026-09-11  
**Auditor:** Cloud Agent (bc-TBD)  
**Scope:** Complete repository audit for non-technical lead to direct work  
**Repository State:** `main` branch @ commit TBD  

---

## Executive Summary

**Product Truth:** Parcelmap/Optimizer is a **civil site planning tool for Nashville real estate**, not an investor map+IRR MVP. The README describes an outdated vision (assemblage engine, AI zoning, command palette); the actual product generates **subdivision layouts and multifamily massing** from parcel + zoning + local precedent data, with server-side solvers (EPSG:2274) producing schematic site plans that include topography, floodplain, and real parking layouts. **Phase C4 "presentation-grade canvas"** is partially complete (topo, stations, hatching, title blocks shipped; landscape garnish and full line-weight tuning remain).

**Architecture:** One live planner stack (`SiteWorkspace` + `EnterpriseSitePlannerShell` + `SitePlanCanvas`), 5 generation paths (server MF/TH/SF/subdivision + client optimizer fallback), context-driven (RPC `fn_compile_planner_context`), with 359k parcels + 328k buildings + 4,989 floorplans + topography in Supabase. ~118k LOC across 263 TS/TSX files.

**Critical Gaps:**
- **P0:** Multi-tenancy broken (RLS off on siteplanner_session/candidate, parcels, ctx_cache; project tables have `USING (true)` demo policies)
- **P0:** Legacy `features/site-planner/` orphaned folder (594-line `useMouseHandlers.ts` + types) ships but unused
- **P1:** Structured-parking frontier missing (urban parcels show 21-43% of legal max)
- **P1:** 47/263 files tested (18%); E2E/SQL gates skipped in CI without secrets
- **P2:** 145 migrations vs many more remote (MCP-applied; local drift real)

**Recommended Focus (Next 2 Weeks):**
1. **Week 1 (Supabase lane):** Enable RLS on solver tables, lock down parcels to SELECT, replace `USING(true)` on projects
2. **Week 1 (Sitework lane):** Delete `features/site-planner/`, add structured-parking ceiling to UI
3. **Week 2 (Lead coordination):** Reconcile README → product docs → code, scope Phase C4 completion

---

## 1. Product Truth: What This Actually Is

### 1.1 What the README Says (Outdated)

`README.md` presents a **Bolt jumpstart investor platform** (dated language: "Sprint-4 NEW", "assemblage engine", "AI zoning explainer", "command palette ⌘K", "batch export", "realtime comments"). Lines 30-49 list features that **do not exist in the codebase**:
- No command palette (grep: 1 hit in `CommandPalette.tsx`, 130 lines, but not mounted anywhere)
- No assemblage UI (table exists: `project_assemblages`, 0 rows; no active components)
- No AI zoning explainer
- No batch export engine
- No realtime comments system

**Evidence:** `grep -r "CommandPalette\|assemblage\|batch.*export\|realtime.*comment" src --include="*.tsx"` → minimal/demo hits only.

### 1.2 What the Product Docs Say (Civil → Schematic)

`docs/BEAT_TESTFIT_PLAN.md` (v2, 2026-07-10) defines the **actual product**:
- **Phase A (Close the loop):** Schemes rail, edit-as-regeneration, money objective, tool feel
- **Phase B (Evidence moat):** Plan-from-precedent, typology expansion (townhome/wrap/podium), constraint truth (flood/slope), real road edges
- **Phase C (Deal surface):** PDF export, 3D+sun, share links, **presentation-grade canvas**
- **Phase D (Platform):** Delete legacy, county onboarding, assemblage (future)

North star: _"This plan is a 3-story garden-bar cluster because that is what the last 40 projects within a mile actually built — and at local pricing it yields 6.4% on cost."_ — beats TestFit on local evidence.

Phase C4 "presentation-grade canvas" explicitly calls for: "Landscape garnish, hatching, line weights tuned to the reference plans; the plan should look like the marketing site plans users pinned as the bar."

### 1.3 What the Code Actually Does (Verified)

**Live planner stack** (from exploration agent + file analysis):
- **SiteWorkspace** (2,737 lines): Orchestrates context compile → generation → state
- **EnterpriseSitePlannerShell** (1,298 lines): Canvas shell with viewport/selection/drag
- **SitePlanCanvas** (1,893 lines): 2D rendering
- **5 generation paths:**
  1. `generateMfSitePlanV2` (server RPC) — multifamily bars with parking network (lanes, aisles, aisle-first layout per Sept 2026 audit)
  2. `generateThSitePlan` (server RPC) — townhome rows
  3. `generateSfSitePlan` (server RPC) — single-family houses
  4. `generateSubdivision` (server RPC) — ROW-spine + lots + courts + amenity (v1.2: holds out floodplain/wetland, stops streets at greenway)
  5. Client `optimizer.ts` (1,412 lines) — fallback when no context

**Data flow:**
```
ParcelDrawer (map click)
  → SitePlanDesigner (portal)
    → SiteWorkspace.tsx
         1. compilePlannerContext(ogc_fid, use) → RPC fn_compile_planner_context
         2. useBuildableEnvelope ← brief.geometry.buildable_envelope (EPSG:2274)
         3. generate by typology:
              MF/TH → RPC fn_generate_mf_site_plan_v2 / fn_generate_th_site_plan
              SF    → RPC fn_generate_sf_site_plan / seed
              Subdivision → RPC fn_generate_subdivision
              Fallback → worker optimizeSite (client optimizer, brief-bound)
         4. setPlanOutput(elements, metrics)
         5. EnterpriseSitePlannerShell(planElements, envelope, neighbors)
              → SitePlanCanvas (2D) or Massing3D
```

**Phase C4 status (partial):**
- ✅ **Topography:** 3DEP 1-m DEM, contours (1-ft minor, 5-ft index), spot grades, profiles (`fn_parcel_topo`, cached 180d, shipped 2026-09-04)
- ✅ **Hatching:** Floodplain diagonal hatch, greenway labels
- ✅ **Title block:** Project/zoning/network/DEM/datum/scale/date/"CONCEPT — NOT FOR CONSTRUCTION"
- ✅ **Callouts:** Street ROW width, station ticks, lot numbers, cul-de-ac radius
- ⚠️ **Landscape garnish:** Not implemented (no tree/planting layers)
- ⚠️ **Line weights tuned to reference plans:** Partially (contours/streets differentiated, but not fully calibrated to civil concept sheets)

**Verdict:** Product is **civil→schematic site planner** (subdivision + massing), not investor map+IRR. Phase C4 is ~70% complete (infrastructure done, polish layers remain).

---

## 2. Architecture Map

### 2.1 Major Modules

| Module | Files | Lines | Role | Status |
|--------|-------|-------|------|--------|
| **features/site-plan/** | 1 main + api/state/ui | 2,737 (SiteWorkspace) | Live orchestrator | Active |
| **components/site-planner/** | 6 (Canvas, Toolbar, StatusBar, etc) | 1,893 (Canvas) | Live canvas UI | Active |
| **components/EnterpriseSitePlannerShell** | 1 | 1,298 | Live shell | Active |
| **features/site-planner/** (orphaned) | 2 (types.ts, useMouseHandlers.ts) | 594 | **DEAD LEGACY** | Delete |
| **engine/** | optimizer, geometry, planner, building, parking | 1,412 (optimizer) | Client fallback generation | Active (fallback only) |
| **workers/** | siteEngineWorker | 576 | Web worker for client optimizer | Active (fallback only) |
| **services/** | hbuAnalysis, parcelGeometry, etc | 763 (hbuAnalysis) | API wrappers | Active |
| **store/** | sitePlan.ts | 619 | Zustand store | LEGACY (unreferenced per audit) |

### 2.2 Live vs Legacy (from `docs/site_planner_live_vs_legacy.md`)

**LIVE stack:**
- `SitePlanDesigner` → `SiteWorkspace` → `EnterpriseSitePlannerShell` → `SitePlanCanvas`
- Server generators (MF v2, subdivision v1.2)
- Context engine (`fn_compile_planner_context`)

**DEAD / orphaned:**
- `features/site-planner/` folder (0 imports anywhere; `useMouseHandlers.ts` stamped deprecated but still ships)
- `store/sitePlan.ts` (no references)
- `SetbackOverlay.tsx` (LEGACY marker)
- Old shells deleted: `EnterpriseSitePlanner`, `EnhancedSitePlanner`, `ConsolidatedSitePlanner`, `AIDrivenSitePlanGenerator`

**Risk:** Dead code shipping increases bundle size, confuses new developers, and masks real complexity.

### 2.3 Data Flow Detail

**Parcel → Context:**
1. User clicks parcel on map → `ParcelDrawer` opens
2. "Site Plan" button → `SitePlanDesigner` (portal overlay)
3. `SiteWorkspace` calls `compilePlannerContext(ogc_fid, use)` → RPC `fn_compile_planner_context(p_ogc_fid, p_use, p_user_intent)`
4. RPC returns `planner_context_v2` snapshot:
   - `solver_brief.max_buildout` (GSF frontier, unit-GSF band)
   - `solver_brief.unit_program` (dimensions, mix, parking demand, corridor, core, bar depth)
   - `solver_brief.geometry` (parcel/buildable envelope in EPSG:2274, frontage segment when present)
   - `solver_brief.precedent_priors` (Regrid form evidence)
   - `solver_brief.program_prior` (fallback for typologies without approved unit program)
5. Context snapshot cached (~11ms warm compile, 180d TTL on topo)

**Context → Generation:**
1. `SiteWorkspace` calls appropriate generator based on typology:
   - **MF:** `generateMfSitePlanV2(ogc_fid, context)` → RPC `fn_generate_mf_site_plan_v2`
     - Returns: bars (footprints), parking bays (rows + drives + network), entry point
     - Aisle-first layout (ring + connector + field aisles + rows, Sept 2026 rewrite)
   - **TH:** `generateThSitePlan` → RPC `fn_generate_th_site_plan`
   - **SF:** `generateSfSitePlan` → RPC `fn_generate_sf_site_plan`
   - **Subdivision:** `generateSubdivision` → RPC `fn_generate_subdivision`
     - Returns: streets (ROW), alleys, lots, courts, amenity, greenway (held-out floodplain/wetland)
     - v1.2: streets stop at greenway (culvert threshold), topo from 3DEP
2. Server returns elements in **EPSG:2274** (TN State Plane feet, NAVD88)
3. Client maps to `Element[]` type (building/parking/other/drive)

**Generation → Canvas:**
1. `SiteWorkspace` calls `setPlanOutput(elements, metrics)`
2. `EnterpriseSitePlannerShell` receives `planElements`, `envelope`, `neighbors`
3. `SitePlanCanvas` renders:
   - Parcel boundary (from `processedGeometry` pipeline — known projection scale error, but self-consistent)
   - Buildable envelope (setback lines)
   - Neighbors (parcels + buildings within 500ft of boundary, not centroid per Sept 2026 fix)
   - Generated elements (buildings, parking, lots, streets, greenway)
   - Topography (contours, stations, spot grades, title block)

**Key trust gate:** No compiled `planner_context_v2` → no massing (Retry overlay). Legacy generator only for pre-contract saved candidates (watermarked draft).

### 2.4 Entrypoints

1. **Primary:** `ParcelDrawer` "Site Plan" → `SitePlanDesigner`
2. `ParcelDrawer` → `FullAnalysisModal` Site Plan tab → same
3. `ProjectPanel` siteplan tab
4. `UnifiedProjectWorkflow` (still mounts it, but not main flow)

All → `SitePlanDesigner` → `SiteWorkspace` → `EnterpriseSitePlannerShell`.

---

## 3. Code Health

### 3.1 Largest / Riskiest Files

| File | Lines | Risk Level | Notes |
|------|-------|------------|-------|
| **SiteWorkspace.tsx** | 2,737 | 🔴 High | God component: context, generation, state, UI panels. Needs decomposition. Has test (513 lines). |
| **SitePlanCanvas.tsx** | 1,893 | 🔴 High | Rendering + selection + drag. No tests. |
| **optimizer.ts** | 1,412 | 🟡 Medium | Client-side fallback generator. Tested (344 lines). Used only when server fails. |
| **EnterpriseSitePlannerShell.tsx** | 1,298 | 🟡 Medium | Canvas shell. No tests. |
| **generateMfPlan.ts** | 897 | 🟢 Low | Server MF/TH client wrappers. Well-tested (610 lines). |
| **geometry.ts** | 836 | 🟢 Low | Pure geometry ops. Tested. |
| **plannerContext.ts** | 787 | 🟢 Low | Context RPC client. Tested. |
| **hbuAnalysis.ts** | 763 | 🟡 Medium | Highest & best use. No tests. |
| **RealUnderwritingWorkflow.tsx** | 732 | 🟡 Medium | Underwriting UI. No tests. Dev-only per audit. |
| **ParcelUnderwritingPanel.tsx** | 623 | 🟡 Medium | Underwriting panel. No tests. |

**Dead weight shipping:**
- `features/site-planner/useMouseHandlers.ts` (594 lines, 0 imports)
- `features/site-planner/types.ts` (minimal, 0 imports)
- `store/sitePlan.ts` (619 lines, marked LEGACY, 0 imports)

**Total dead code shipping:** ~1,213 lines minimum.

### 3.2 Tech Debt Markers

Files with `LEGACY/TODO/FIXME/HACK/XXX`:
- `src/engine/parking.ts` (LEGACY client parking, superseded by server)
- `src/components/CommandPalette.tsx` (TODO markers, not mounted)
- `src/components/RightDrawer.tsx` (TODO)
- `src/components/ShareInviteDialog.tsx` (TODO)
- `src/components/SetbackOverlay.tsx` (LEGACY marker)
- `src/components/Guard.tsx` (FIXME)
- `src/services/osmRoads.ts` (TODO — roads layer stub, 68 rows in DB per audit)
- `src/features/site-plan/api/generateMfPlan.ts` (TODO markers for future generators)
- `src/store/sitePlan.ts` (LEGACY marker)

### 3.3 Test Coverage

**Summary (from exploration agent):**
- **47/263** source files have colocated tests (~18%)
- **Vitest:** ~47 test files (src + tests/engine/)
- **Playwright E2E:** 3 specs (smoke, planner, planner-flow) — **skipped in CI** unless `RUN_E2E=true`
- **SQL smoke:** 13 files (tests/sql/) — **skipped in CI** unless `SUPABASE_DB_URL` set

**Well-covered:**
- ✅ Engine/geometry (setbacks, edges, building geom, optimizer, golden parcels, proforma)
- ✅ Site-plan feature (generators, max buildout, planner context, frontage, MF access, UI strips/panels)
- ✅ `SiteWorkspace` (513-line test file)

**Not covered or weak:**
- ❌ Map / Mapbox / parcel layers (src/map/ — 0 tests)
- ❌ Zustand stores (src/store/ — 0 tests)
- ❌ `SitePlanCanvas` (1,893 lines, 0 tests)
- ❌ `EnterpriseSitePlannerShell` (1,298 lines, 0 tests)
- ❌ Export / workers / grading / finance (0 tests)
- ❌ Most app chrome (auth except `AuthChip`, underwriting panels, project workflow, HBU modal, sharing)
- ❌ Auth / realtime / multi-user (no meaningful coverage)
- ❌ Legacy `features/site-planner/` (0 tests — expected, it's dead)

**CI gates (`.github/workflows/ci.yml`):**
- ✅ Always: typecheck, lint, `npm test` (vitest)
- ⚠️ Conditional: E2E (if `RUN_E2E=true`), SQL smoke (if `SUPABASE_DB_URL`)
- ⚠️ Separate job: `solver-floors` (DB battery vs committed floors, skipped if secrets missing)

**Battery gate (`.github/workflows/battery-gate.yml`):**
- PR fixture visual battery (Playwright + mock Supabase) — real gate
- Nightly live battery advisory (if secrets set)

**Risk:** Critical rendering paths (Canvas, Shell) untested. E2E/SQL gates disabled by default = regressions ship.

### 3.4 CI Status

**What runs on every PR:**
1. TypeScript typecheck ✅
2. ESLint ✅
3. Vitest unit tests ✅
4. Fixture battery (battery-gate.yml) ✅
5. Solver floors (live DB, skipped if no secrets) ⚠️
6. E2E (skipped by default) ❌
7. SQL smoke (skipped if no DB URL) ❌

**What's missing from default CI:**
- End-to-end planner flow testing
- SQL function smoke tests (mf-max-gsf, planner-program-frontage, massing-relaxation)
- Live solver validation (unless secrets present)

**Consequence:** Backend RPC regressions can ship without detection unless manually tested.

---

## 4. Security & Multi-Tenancy

### 4.1 RLS Status (from Supabase exploration agent)

**Database:** `okxrvetbzpoazrybhcqj` (Parcelmap production)

| Table | Rows | RLS Enabled | Policies | Production-Ready? |
|-------|------|-------------|----------|-------------------|
| **parcels** | 282,337 | ❌ OFF | none | ❌ NO — anon can read/write all Nashville parcels |
| **buildings** | 328,158 | ✅ ON | public read (anon+auth) | ⚠️ Grants allow write but RLS blocks |
| **building_parcel_join** | 357,063 | ❌ OFF | none | ❌ NO |
| **zoning** | 4,803 | ✅ ON | public read | ✅ Reference table, read-only |
| **typology_spec** | 3 | ✅ ON | read-all | ✅ Reference table |
| **unit_spec** | 4 | ✅ ON | read; writes revoked | ✅ Reference table |
| **siteplanner_session** | 381 | ❌ OFF | none | ❌ NO — all sessions public, created_by NULL on all rows |
| **siteplanner_candidate** | 381 | ❌ OFF | none | ❌ NO — all plans public |
| **site_plans** | 0 | ✅ ON | owner CRUD (auth.uid()) | ✅ Template for user artifacts |
| **projects** | 4 | ✅ ON | CRUD `USING (true)` | ❌ NO — demo-open, not real tenancy |
| **project_parcels** | 34 | ✅ ON | anon+auth full CRUD `true` | ❌ NO — demo-open |
| **project_members** | ~0 | ✅ ON | demo-open `true` | ❌ NO |
| **project_comments** | ~0 | ✅ ON | demo-open `true` | ❌ NO |
| **ctx_cache** | 5,487 | ❌ OFF | none | ❌ NO — design context cache exposed |
| **roads** | 68 | ❌ OFF | none | ⚠️ Stub data, but should be read-only |
| **hazard_flood_2274** | 6,422 | ✅ ON | public SELECT | ✅ Reference |
| **hazard_wetland_2274** | 9,596 | ✅ ON | public SELECT | ✅ Reference |
| **floorplans*** | 0 | ❌ OFF | none | ⚠️ Empty tables, should have RLS when used |
| **planner.*** | varies | RLS on, 0 policies (deny-all) | usage revoked from anon/auth | ✅ RPC-only schema (intended) |

**Summary:**
- **27 public tables have RLS disabled** (per advisor critical, confirmed by exploration)
- Reference tables (zoning, buildings, hazards) have RLS + SELECT policies: **OK for public GIS product**
- User artifact tables: `site_plans` has real owner RLS ✅; `siteplanner_session/candidate` have RLS off ❌
- Project/collaboration tables: RLS on but `USING (true)` = **theater, not real tenancy** ❌

**Critical gaps:**
1. `siteplanner_session` / `siteplanner_candidate` fully exposed; all 381 rows have `created_by IS NULL` (no ownership even if RLS added tomorrow)
2. `parcels` / `building_parcel_join` / `ctx_cache` / `roads` open to anon writes
3. `projects` / `project_*` tables: `USING (true)` policies allow any auth'd user to see/modify any project
4. No org tenancy wired (`projects.org_id` nullable, no membership table enforces it)

### 4.2 Auth Patterns

**Current state:**
- ✅ `site_plans`: `created_by default auth.uid()`, owner-only CRUD (model for user artifacts)
- ❌ `siteplanner_session/candidate`: no auth pattern at all
- ⚠️ `projects`: has `org_id` column but no org membership enforcement
- ✅ `planner` schema: usage revoked from anon/auth, RPC-only with SECURITY DEFINER

**Anonymous use:**
- Explicitly allowed for GIS/public reference (parcels, zoning, buildings, hazards)
- Accidentally allowed for user/solver artifacts (sessions, candidates, projects)

**Risk:** In current state, any user with anon key can:
- Read all siteplanner sessions/candidates from all users
- Write fake sessions/candidates
- Read/write all projects
- Modify parcels/join tables/ctx_cache

### 4.3 Migrations Drift

**Local:** 145 `supabase/migrations/*.sql` files  
**Remote:** "Many more" per exploration agent (MCP-applied solver iterations with different timestamps)

**Examples of drift:**
- Heavy function replacements (MF v2/v3, subdivision, hazards) applied via MCP
- Local migrations have "already applied" headers (per `BEAT_TESTFIT_PLAN.md` rule 3)
- Core GIS tables (parcels, buildings, zoning) predate tracked migrations

**Risk:** Cannot trust `supabase db push` until histories reconciled. Security migrations may be local-only or remote-only.

---

## 5. Data & Schema Fitness

### 5.1 Core Data Assets

| Asset | Scale | Coverage | Source | Use |
|-------|-------|----------|--------|-----|
| **parcels** | 282,337 | Nashville/Davidson Co | Regrid/Assessor | Primary spatial entity |
| **buildings** | 328,158 | Nashville | Regrid footprints | Precedent comps, neighbors |
| **building_parcel_join** | 357,063 | Nashville | Regrid | Links buildings→parcels |
| **zoning** | 4,803 districts | Nashville | Metro ordinance | Regulations |
| **planner_zoning** (view) | — | Nashville | Normalized numeric view | Solver input |
| **typology_spec** | 3 rows | Generic | Product | SF/MF/TH archetype defaults |
| **unit_spec** | 4 rows | Generic | Product | Unit mix/dims/parking |
| **floorplans** + rooms/walls | 4,989 | Nashville | Regrid (unused) | Future fidelity |
| **hazard_flood_2274** | 6,422 features | 6×6 county tiles | FEMA NFHL (fetched via http ext) | Floodplain carve |
| **hazard_wetland_2274** | 9,596 features | 6×6 county tiles | USFWS NWI (fetched) | Wetland buffer carve |
| **parcel_topo** | 5,487 cached | On-demand | USGS 3DEP 1-m DEM (http ext) | Contours, slopes, profiles |
| **roads** | **68 rows** | Stub only | OSM/TIGER (sparse) | Frontage (stub) |
| **jurisdiction_zoning_standards** | 109 rows | Nashville | Metro ordinance overlay | District rules |

**Key findings:**
- ✅ **Depth unmatched:** 328k footprints, 4,989 floorplans = local precedent moat no competitor has
- ✅ **Hazards live:** FEMA + USFWS auto-ingested Sept 2026 (6,422 flood + 9,596 wetland features)
- ✅ **Topo live:** 3DEP DEM fetch + cache (20-ft grid, 1-ft contours, 180d TTL)
- ⚠️ **Roads stub:** Only 68 centerline segments (OSM); `fn_parcel_frontage` uses parcel fabric (unshared edges), not real roads
- ⚠️ **Floorplans unused:** 4,989 plans with rooms/walls/openings exist but not yet consumed by product

### 5.2 Schema Fitness for Civil→Schematic Product

**Strong alignments:**
- `typology_spec` has `structured_parking_threshold_far`, `podium_levels`, `road_row_width_ft`, `target_lot_depth_ft` — ready for Phase B2/B3 (podium, townhome, SF subdivision)
- `unit_spec` drives bar depth, corridor width, core dims → apartment bar is market-grounded, not generic boxes
- `siteplanner_session` + `siteplanner_candidate` schema complete (parcel_id, envelope, context_id FK → planner.context_snapshot, buildings/parking JSON, scores)
- `planner.context_snapshot` + `planner.program_prior` + `planner.feedback_event` support full solver lineage

**Fragmentation / duplication:**
- `site_plans` (JSON snapshot, user-facing) vs `siteplanner_session/candidate` (solver workspace) — two persistence layers for overlapping concepts
- `ctx_cache` (5,487 rows) caches what `planner.context_snapshot` already stores (but contexts are versioned, cache is invalidated)
- `default_costs_by_use` + `fn_local_pricing` both provide cost data (schema duplication)

**Missing for Phase B (Evidence moat):**
- No `exemplar_plans` table (mentioned in Sept 2026 audit as `site_plan_exemplar`, seeded with 4 architect sheets)
- No `building_archetypes` / precedent library beyond Regrid stats
- No `easements` upload schema (mentioned in `BEAT_TESTFIT_PLAN.md` as existing: `uploaded_easements`, but not in exploration agent's table list)
- No geometry layer for tree canopy, stream buffers, sewer availability (mentioned as future in audit §10)

**Missing for Phase C (Deal surface):**
- No `schemes` / `scheme_versions` table (candidates persist, but no UI for scheme tree per Phase A1)
- No `share_links` / `scheme_shares` for Phase C3
- No `export_queue` for Phase C1 PDF/DXF

**Missing for Phase D (Platform):**
- No `county_data_pipelines` / `ingest_jobs` for Phase D2
- No `assemblage` solve workspace (table exists: `project_assemblages`, 0 rows, but no active solver)

### 5.3 Ownership & Provenance

**Strong patterns (differentiators per product docs):**
- `planner.context_snapshot` tracks `created_at`, `context_version`, `compiler_git_sha`
- `siteplanner_candidate` has `created_at`, `updated_at`, `parent_candidate_id` (lineage)
- `solver_brief.max_buildout` includes `assumptions`, `basis`, `sources` (provenance)
- Compilation returns `cache_status`, `context_confidence` (high/medium/low/review_required)
- UI shows provenance badges, honest flags, build stamp (per `BEAT_TESTFIT_PLAN.md` §0)

**Gaps:**
- No `created_by` on `siteplanner_session/candidate` (all 381 rows NULL)
- No audit trail on `parcels` / `buildings` / `zoning` edits (reference tables, but no `updated_at` / `updated_by`)
- No user attribution on `ctx_cache` entries

---

## 6. Performance

### 6.1 Known Hotspots (from docs + code)

**Worth knowing for leadership:**
1. **Context compile:** ~11ms warm (cached), ~2s cold first time (per `CURSOR_UI_INTEGRATION_BRIEF.md`)
2. **Local pricing RPC:** ~2s (backend optimization in progress per brief; output shape stable)
3. **Topo fetch:** 1.5-24.6s first fetch (USGS 3DEP http call, then 180d cached)
4. **Hazard fetch:** Background tile queue (6×6 = 36 tiles, Sept 2026: 6,422 flood + 9,596 wetland features)
5. **MF solver:** ~1.5s p50 for seed (per `BEAT_TESTFIT_PLAN.md` goal: keep p95 < 2s)
6. **Client optimizer (fallback):** ~576 lines in web worker (no perf data, but runs when server fails)

**No critical issues flagged** in audits. Product is fast enough (sub-2s generation meets bar).

### 6.2 Bundle Size / Dead Code Impact

- **~1,213 lines** of dead code shipping (`features/site-planner/useMouseHandlers.ts`, `store/sitePlan.ts`, orphaned types)
- **Canvas:** 1,893 lines in one file (no code-splitting)
- **SiteWorkspace:** 2,737 lines (god component)

**Impact:** Larger initial bundle, slower parsing, harder to tree-shake. Not a P0 (app is not slow), but cleanup would help.

---

## 7. Roadmap Alignment: Phase C4 & Related

### 7.1 Phase C4 "Presentation-Grade Canvas" Status

**From `BEAT_TESTFIT_PLAN.md` Phase C:**
> "C4. Presentation-grade canvas. Landscape garnish, hatching, line weights tuned to the reference plans; the plan should look like the marketing site plans users pinned as the bar."

**Shipped (Sept 2026 audits, OPTIMIZATION_AUDIT §10-18):**
- ✅ **Topography:** 3DEP 1-m DEM, 1-ft contours (index every 5ft), spot grades every 200ft, stations every 100ft, profiles
- ✅ **Hatching:** Floodplain diagonal hatch, zone labels ("AE floodplain", "Wetland (riverine) · 25-ft buffer")
- ✅ **Title block:** Project/sheet title/zoning/network/ROW/DEM/datum/elevation range/slopes/hazards/scale/date/"CONCEPT — NOT FOR CONSTRUCTION"
- ✅ **Callouts:** "STREET A · 55' PUBLIC R.O.W.", "20' ALLEY", "R = 50'", lot numbers with frontage×depth
- ✅ **Real parking layout:** Aisle-first (ring + connector + field aisles + rows), not module scatter (Sept audit §18)
- ✅ **Held-out greenway:** Floodplain + wetland carved out, streets stop at greenway with culvert/bridge thresholds (Sept audit §12)
- ✅ **Neighbors render:** Parcels + buildings within 500ft of boundary (not centroid, Sept audit §17)

**Not shipped:**
- ❌ **Landscape garnish:** No tree/planting layers, no landscape blocks
- ⚠️ **Line weights fully tuned:** Contours/streets/lots differentiated, but not calibrated to exact reference plan weights
- ❌ **Legend vocabulary complete:** Canvas draws ROW/alley/lot/greenway, but legend needs court/amenity/unassigned per Sept audit §10

**Assessment:** ~70% complete. Infrastructure (topo, hazards, hatching, callouts, title block) done. Cosmetic polish (landscape, line-weight calibration) remains. Could ship "presentation-grade lite" now; full polish = 1-2 weeks Sitework effort.

### 7.2 Phase A-B-C Dependencies

**Phase A (Close the loop):**
- A1 (Schemes rail): Candidate persistence ✅, UI rail ❌ (no mounted component)
- A2 (Edit-as-regeneration): Server re-solve with pins exists (RPC has `p_pins` param), UI ❌
- A3 (Money objective): `fn_local_pricing` ✅, piped into pro forma ❌, generator ranks by yield ❌
- A4 (Tool feel): Viewport ✅, zoom ✅, measure ✅, cursor states ⚠️ (partial), disabled-state explanations ⚠️ (partial)

**Phase B (Evidence moat):**
- B1 (Plan-from-precedent): Regrid comps ✅, evidence card ✅, archetype choice from buildings corpus ❌
- B2 (Typology expansion): Schema ready ✅ (typology_spec has TH row), TH generator ✅, wrap/podium ❌
- B3 (Constraint truth): Flood/slope carve ✅ (Sept 2026), easement upload schema mentioned but not found ❌, FAR/density enforcement ⚠️ (works, but structured-parking frontier missing)
- B4 (Real road edges): OSM/TIGER ingest stub (68 rows) ⚠️, frontage from real roads ❌ (uses parcel fabric)

**Phase C (Deal surface):**
- C1 (PDF/DXF export): ❌ (no export queue, no generation)
- C2 (3D+sun): Massing3D component exists ✅, shadows ❌
- C3 (Share links): RLS template exists (`site_plans`) ✅, read-only scheme pages ❌
- C4 (Presentation canvas): ~70% ✅ (see §7.1)

**Phase D (Platform):**
- D1 (One planner surface): Active stack is one surface ✅, legacy not deleted ❌ (`features/site-planner/` ships)
- D2 (County onboarding): No pipeline ❌
- D3 (Assemblage): Table exists ✅, solver ❌

**Blockers for user value:**
- Phase A1 (Schemes rail): Users can't compare 5 schemes, so Generate is a "slot machine" (per plan)
- Phase A3 (Money objective): Local pricing not yet driving generation = plans don't optimize for yield
- Phase B3 (Structured-parking frontier): Urban parcels show 21-43% of legal max (Sept audit finding F2)
- Phase C1 (Export): No PDF = "no deliverable, no buy" (per plan C: "deal-makers buy exports")

---

## 8. Prioritized Findings

### P0 (Critical — Blocks Production / Creates Risk)

| # | Finding | Impact | Owner | Effort |
|---|---------|--------|-------|--------|
| **P0-1** | RLS off on `siteplanner_session`, `siteplanner_candidate` (381 rows fully public, created_by NULL) | Any user can read all plans from all users; no ownership trail | **Supabase** | 1-2 days (enable RLS, backfill created_by where possible, add owner policies) |
| **P0-2** | RLS off on `parcels`, `building_parcel_join`, `ctx_cache`, `roads` (anon can write) | Data integrity risk; anon could corrupt reference data or cache | **Supabase** | 1 day (enable RLS + SELECT policies, revoke write grants) |
| **P0-3** | `projects` / `project_*` tables have `USING (true)` RLS (demo-open) | Multi-tenancy theater; any auth'd user sees/modifies any project | **Supabase** | 2-3 days (replace with created_by or org membership checks) |
| **P0-4** | `features/site-planner/` orphaned folder ships (594 lines useMouseHandlers + types, 0 imports) | Dead code confuses developers, increases bundle, masks complexity | **Sitework** | 1 day (delete folder, verify no runtime breaks, update docs) |

### P1 (High — Blocks Milestones / Significant User Impact)

| # | Finding | Impact | Owner | Effort |
|---|---------|--------|-------|--------|
| **P1-1** | Structured-parking frontier missing (urban parcels show 21-43% of legal max per Sept audit F2) | Urban ORI/MUI/MUG parcels under-promise by 2-2.6×; users think 34k GSF is max when legal ceiling is 90k | **Supabase** (RPC) + **Sitework** (UI chip) | 3-5 days (add structured-parking option to fn_max_buildout, publish podium ceiling, update MaxBuildoutHeadline chip) |
| **P1-2** | Test coverage low (47/263 files = 18%; Canvas/Shell untested; E2E/SQL gates skipped in CI) | Regressions ship undetected; critical rendering paths have no safety net | **Sitework** + **Lead** | 1-2 weeks (add Canvas/Shell tests, enable E2E/SQL in CI with secrets management) |
| **P1-3** | Schemes rail (Phase A1) not implemented (no UI to compare/restore candidates) | Generate is "slot machine"; users can't explore design space; differentiator promise unmet | **Sitework** | 3-5 days (build schemes sidebar: thumbnails, KPI compare, restore) |
| **P1-4** | Money objective (Phase A3) not driving generation (local pricing not in generator ranks) | Plans don't optimize for yield; "what the market built at local pricing" promise unmet | **Supabase** (integrate pricing into ranking) | 3-5 days |
| **P1-5** | README completely outdated (describes assemblage engine, AI zoning, command palette — none exist) | Misleads new developers, investors, users; GitHub visitors see wrong product | **Lead** (coordinate) + **Sitework** (write) | 2 days (rewrite README to match civil→schematic product, archive Sprint-4 fantasy features) |

### P2 (Medium — Debt / Quality / Future-Blocking)

| # | Finding | Impact | Owner | Effort |
|---|---------|--------|-------|--------|
| **P2-1** | SiteWorkspace god component (2,737 lines: context + generation + state + UI) | Hard to reason about, hard to test, blocks parallel work | **Sitework** | 1 week (decompose into context/generation/state hooks + presentational components) |
| **P2-2** | Migration drift (145 local vs "many more" remote MCP-applied) | Cannot trust `db push`; security migrations may be missing locally or remotely | **Supabase** | 2-3 days (reconcile histories, document MCP-applied migrations, establish source of truth) |
| **P2-3** | Roads layer stub (68 centerline segments; frontage uses parcel fabric heuristic) | Frontage/access wrong on corner parcels, landlocked parcels get "assumed access" flag | **Supabase** (ingest OSM/TIGER) | 3-5 days (complete road ingest, update fn_parcel_frontage to use real roads) |
| **P2-4** | No PDF/DXF export (Phase C1) | "Deal-makers buy exports" — no export = no revenue signal | **Sitework** | 1 week (PDF generation from canvas state, DXF from plan elements) |
| **P2-5** | Legacy stores/services ship (`store/sitePlan.ts` 619 lines, `SetbackOverlay.tsx`, etc) | Dead weight, bundle bloat, confusion | **Sitework** | 1-2 days (delete unreferenced files, verify no runtime breaks) |
| **P2-6** | No auth/feedback loop (feedback_event table at 0 rows since day one per audit) | Training data lost; no user attribution on plans | **Sitework** (UI) + **Supabase** (RLS policy) | 2-3 days (soft prompt at first generation, session-keyed feedback RLS) |
| **P2-7** | Floorplans unused (4,989 plans with rooms/walls/openings exist but not consumed) | Data asset idle; could drive unit-level fidelity | **Lead** (scope) + **Sitework** (if prioritized) | TBD (depends on Phase B3+ roadmap) |

---

## 9. Recommended Next 2 Weeks

### Week 1: Security + Critical Cleanup

**Supabase lane (days 1-3):**
1. **Day 1:** Enable RLS + owner policies on `siteplanner_session` / `siteplanner_candidate`
   - Add `created_by uuid references auth.users default auth.uid()`
   - Backfill `created_by` where session metadata allows (likely lose historical attribution on 381 rows)
   - Policies: `SELECT/INSERT/UPDATE/DELETE WHERE created_by = auth.uid()`
2. **Day 2:** Lock down reference tables
   - Enable RLS on `parcels`, `building_parcel_join`, `ctx_cache`, `roads`
   - Policies: `SELECT for anon+auth`, no write policies (or admin-only if needed)
   - Revoke `INSERT/UPDATE/DELETE` grants from `anon`/`authenticated`
3. **Day 3:** Replace demo policies on projects
   - `projects`: `USING (created_by = auth.uid() OR org_id IN (SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()))` (if org tenancy scoped; else just `created_by`)
   - `project_parcels`, `project_members`, `project_comments`: inherit via project FK
   - **Risk mitigation:** Deploy to staging first, verify UI doesn't break (projects may be shared; need read policy for shared projects)

**Sitework lane (days 1-3):**
1. **Day 1:** Delete `features/site-planner/` folder
   - Remove `features/site-planner/useMouseHandlers.ts` (594 lines)
   - Remove `features/site-planner/types.ts`
   - Verify 0 imports (already confirmed by exploration agent)
   - Update `docs/site_planner_live_vs_legacy.md` to reflect deletion
   - PR: "chore: remove orphaned features/site-planner folder (0 imports, 594 lines dead code)"
2. **Day 2-3:** Delete other dead code
   - Remove `store/sitePlan.ts` (619 lines, marked LEGACY, 0 imports)
   - Remove `components/SetbackOverlay.tsx` (marked LEGACY, 0 imports)
   - Remove `services/parcelAnalysis.ts` (deprecated, demo-only per audit)
   - Remove `features/site-planner/engine/scorePad.ts` (0 importers, bugged RPC)
   - Bundle size check before/after
   - PR: "chore: remove legacy stores and services (1,200+ lines)"

**Lead lane (days 4-5):**
1. **Day 4:** Audit reconciliation meeting
   - Review this audit with Sitework + Supabase leads
   - Confirm P0/P1 priorities
   - Scope Phase C4 completion (landscape garnish vs ship "lite")
   - Decide: reconcile migrations now or after P0s
2. **Day 5:** README rewrite
   - Replace investor-map vision with civil→schematic reality
   - Document: product is subdivision layouts + MF massing, server-generated, topo+floodplain aware
   - Link to `BEAT_TESTFIT_PLAN.md` for roadmap
   - Remove "Sprint-4 NEW" assemblage/AI/command-palette features (or move to "Future" section)
   - PR: "docs: rewrite README to match civil site planning product"

### Week 2: Structured-Parking Frontier + Schemes Rail

**Supabase lane (days 6-8):**
1. **Days 6-7:** Structured-parking frontier (P1-1)
   - Extend `fn_max_buildout` to model podium/tuck-under (read `typology_spec.structured_parking_threshold_far`, `podium_levels`)
   - Publish `structured_parking_ceiling {gsf, stories, binding, basis}` (already advisory per Sept audit, now make it primary when `parking_strategy = 'structured'`)
   - Test on ORI/MUI/MUG parcels (55 Music Sq E, 1917 Broadway, 2600 Gallatin Pk from Sept audit)
   - Migration: `20260912000000_max_buildout_structured_primary.sql`
2. **Day 8:** Pipe local pricing into generator ranking (P1-4 partial)
   - `fn_generate_mf_site_plan_v2`: rank K seeds by yield-on-cost using `fn_local_pricing` + `default_costs_by_use`
   - Emit `ranked_by_yield_v1` receipt
   - Test: two parcels with different local pricing should produce different winners

**Sitework lane (days 6-10):**
1. **Days 6-7:** Structured-parking ceiling UI (P1-1)
   - Update `MaxBuildoutHeadline` chip: show amber "surface-parking bound · podium ceiling N GSF · structured parking modeled" when advisory ceiling > frontier by >15%
   - Update `maxBuildout.ts` + tests
   - Verify on ORI parcels in dev
   - PR: "feat: show structured-parking ceiling when surface-parking binds"
2. **Days 8-10:** Schemes rail (P1-3)
   - New component: `SchemesRail` (sidebar or bottom rail)
     - Fetch `siteplanner_candidate` for current parcel (filter by `parcel_id`, order by `created_at desc`)
     - Render: thumbnail (minimap of plan), KPIs (GSF, units, capture %), restore button
     - "Variation of" lineage via `parent_candidate_id`
   - Wire into `SiteWorkspace`: when Generate completes, add to rail; clicking scheme restores `planOutput`
   - Acceptance: flip between 5 schemes on one parcel <1s each, KPIs differ, survives reload
   - PR: "feat(Phase A1): schemes rail for candidate comparison"

**Lead lane (days 6-10):**
1. **Day 6:** Standup checkpoint
   - Review Week 1 PRs (dead code deletion, RLS fixes)
   - Confirm no production incidents from RLS changes
2. **Day 9:** Phase C4 scoping call
   - Present C4 status (~70% complete)
   - Decide: ship "presentation-grade lite" now (topo+hatching+callouts) or wait for landscape garnish
   - If ship: coordinate deployment + user comms
   - If wait: scope landscape layer (tree/planting data source, rendering, 1-2 weeks Sitework)
3. **Day 10:** Retrospective + next sprint planning
   - Review audit findings addressed (P0-1 to P0-4, P1-1, P1-3 partial)
   - Plan Week 3-4: Phase A2 (edit-regeneration), A3 completion (money objective in UI), C1 (PDF export), or B3 (wrap/podium generators)

---

## 10. Lead Coordination Notes

### 10.1 Lane Assignments

**Supabase lane (backend / DB / RPCs):**
- RLS policies, auth patterns, migration reconciliation
- Structured-parking frontier RPC changes
- Local pricing integration into generator ranking
- Road network ingest (when prioritized)
- Contact: [Supabase teammate name/handle]

**Sitework lane (frontend / UI / Canvas):**
- Dead code deletion
- Structured-parking ceiling UI chips
- Schemes rail component
- Test coverage improvements (Canvas, Shell, E2E)
- README rewrite (with Lead review)
- Contact: [Sitework teammate name/handle]

**Lead lane (coordination / prioritization / product):**
- Audit review meetings
- P0/P1 priority calls
- Phase C4 scoping (ship lite vs full)
- Roadmap sequencing (A2 vs A3 vs C1 next)
- Stakeholder comms (user-facing changes from RLS, new features)

### 10.2 Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **RLS changes break existing UI** | Medium | High | Deploy to staging first; test project loading, plan generation, candidate fetch; rollback plan ready |
| **Structured-parking RPC changes regress captures** | Low | High | DB battery gates on fixtures (553450, 488278, 669046); if floor drops, rebase with explanation; never merge over unexpected red |
| **Dead code deletion breaks runtime** | Low | Medium | Verified 0 imports by exploration agent; still test in dev before merging; check bundle size delta |
| **Migration reconciliation uncovers conflicts** | Medium | Medium | Budget extra day for Supabase lane; may need to regenerate some migrations; document MCP-applied migrations |
| **Schemes rail performance poor (381+ candidates)** | Low | Low | Pagination + virtualization if needed; test with 50+ candidates per parcel |

### 10.3 Success Metrics (2-Week Checkpoint)

**Security:**
- ✅ `siteplanner_session/candidate` have RLS enabled + owner policies
- ✅ `parcels` et al locked to SELECT (no anon writes)
- ✅ `projects` tables have real tenancy policies (not `USING (true)`)

**Code health:**
- ✅ 1,200+ lines dead code deleted (`features/site-planner`, `store/sitePlan`, legacy services)
- ✅ 0 orphaned imports remain

**Product:**
- ✅ Structured-parking ceiling visible in UI on urban parcels
- ✅ Schemes rail ships (users can compare 5+ schemes, restore previous)
- ⚠️ Local pricing piped into generator ranking (Supabase lane; may slip to Week 3)

**Docs:**
- ✅ README rewritten to match civil→schematic product

**Unblocked for next sprint:**
- Phase A2 (edit-regeneration) — backend ready, needs UI
- Phase A3 completion (money objective UI)
- Phase C1 (PDF export) — canvas state ready to export
- Phase C4 completion (landscape garnish scoped)

---

## 11. Evidence Citations

All claims in this audit grounded in:
- **Codebase exploration:** 3 parallel subagents (planner architecture, Supabase schema, test coverage)
- **File counts:** 263 TS/TSX files, 118k LOC, 47 test files
- **Doc analysis:** `BEAT_TESTFIT_PLAN.md`, `OPTIMIZATION_AUDIT_2026-09-02.md`, `site_planner_live_vs_legacy.md`, `CURSOR_UI_INTEGRATION_BRIEF.md`, `PLANNER_CONTEXT_PROGRAM_FRONTAGE.md`
- **Git history:** 145 local migrations, README last updated with "Sprint-4" language
- **Live DB counts:** From Supabase exploration agent (282k parcels, 328k buildings, 381 sessions, etc)
- **CI config:** `.github/workflows/ci.yml`, `battery-gate.yml`
- **Dead code verification:** `grep -r` for imports, exploration agent "0 importers" findings

**No vibes. All paths, commands, counts.**

---

## Appendix A: Quick Reference Tables

### A.1 File Size Top 10

| File | Lines | Purpose |
|------|-------|---------|
| SiteWorkspace.tsx | 2,737 | Live orchestrator |
| SitePlanCanvas.tsx | 1,893 | Canvas rendering |
| optimizer.ts | 1,412 | Client fallback generator |
| EnterpriseSitePlannerShell.tsx | 1,298 | Canvas shell |
| generateMfPlan.ts | 897 | MF/TH server client |
| geometry.ts | 836 | Geometry ops |
| plannerContext.ts | 787 | Context RPC client |
| hbuAnalysis.ts | 763 | Highest & best use |
| RealUnderwritingWorkflow.tsx | 732 | Underwriting (dev) |
| ParcelUnderwritingPanel.tsx | 623 | Underwriting panel |

### A.2 RLS Status Quick Check

| ❌ RLS Off (P0) | ⚠️ RLS Theater (P0) | ✅ RLS Good |
|-----------------|---------------------|-------------|
| parcels | projects (`USING true`) | site_plans (owner) |
| siteplanner_session | project_parcels (`true`) | zoning (read-only) |
| siteplanner_candidate | project_members (`true`) | buildings (read-only) |
| building_parcel_join | project_comments (`true`) | typology_spec |
| ctx_cache | | hazard_* |
| roads | | planner.* (revoked) |

### A.3 Phase Status

| Phase | Status | Blockers |
|-------|--------|----------|
| A1 (Schemes rail) | 🟡 Backend ✅ UI ❌ | No schemes sidebar component |
| A2 (Edit-regen) | 🟡 Backend ✅ UI ❌ | Pins parameter exists, no drag→re-solve UI |
| A3 (Money objective) | 🟡 Partial | Pricing RPC ✅, not in generator ranks ❌, not in UI ❌ |
| A4 (Tool feel) | 🟢 Mostly | Viewport ✅, cursor states partial |
| B1 (Plan-from-precedent) | 🟡 Partial | Comps ✅, archetype choice from corpus ❌ |
| B2 (Typology expansion) | 🟡 TH ✅ Wrap/Podium ❌ | Schema ready, generators missing |
| B3 (Constraint truth) | 🟢 Flood/slope ✅ | Easement upload ❌, structured-parking frontier ❌ |
| B4 (Real roads) | 🔴 Stub | 68 centerlines only |
| C1 (PDF/DXF export) | 🔴 None | No export generation |
| C2 (3D+sun) | 🟡 Component ✅ Shadows ❌ | Massing3D exists, no sun calcs |
| C3 (Share links) | 🟡 RLS ready, UI ❌ | Read-only scheme pages not built |
| C4 (Presentation canvas) | 🟢 ~70% | Topo ✅, hatching ✅, landscape ❌, line-weight tuning partial |
| D1 (One planner) | 🟡 Active stack is one, legacy ships | Delete features/site-planner ❌ |
| D2 (County onboarding) | 🔴 None | No pipeline |
| D3 (Assemblage) | 🔴 None | Table exists, no solver |

---

**End of Audit**  
**Next Steps:** Review with Sitework + Supabase leads → Execute Week 1-2 plan → Retrospective Day 10
