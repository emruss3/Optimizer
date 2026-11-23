# Live Design Priority 2 — Draw the routes (plan)

Branch: `cursor/live-design-routes-6eb1` · Off `main` after P1 (#185) wrap closeout.  
Source: Live Design handoff 2026-11-23 §2.

## Goal

Every dwelling and counted bay has a reachable vehicle (and pedestrian) route
or a named break with endpoints, width, and evidence. Verified parking supply
is the sum of reachable spaces. Orange access graphics stay in Review and
toggle off in Rendering.

## Start files

| Area | Files |
| --- | --- |
| Access geometry | `api/mfAccess.ts`, `api/accessFinding.ts`, `api/parcelFrontage.ts` |
| Scene / plan | `scene/buildScene.ts`, `SiteWorkspace.tsx` (routeBreak annotations) |
| 3D / street | `ui/massingData.ts`, `render3d/streetDetails.ts` |
| Tests | `api/mfAccess.test.ts`, `api/accessFinding.test.ts`, landscape sheet route-break |

Reuse the existing `accessBreak` / `data-role="route-break"` marker and plan
identity already shown on W Heiman. Keep the solver floor as an independent
diagnostic while investigating what fits.

## Vertical slices (order)

1. **Measure the break** — `accessBreak` returns `gapFt` (and keeps endpoints).
   Sheet / canvas copy names the gap. Acceptance: W Heiman ~21 ft short of
   frontage on A-01 graphic scale.
2. **Typed route segments** — curb cut → private drive → aisle → bay/portal →
   stall, each with stable ID, access type, width, endpoints, evidence source.
   Derive paint, 3D, section xref, and reachability from the same segments.
3. **Recompute reachability** — when a connection fits within allowed ground,
   place it and recount served bays; otherwise keep the design conditional and
   offer the feasible alternative if supported. Preserve the six-uncounted-bays
   explanation and validate from features.
4. **Pedestrian routes** — public approach or parking → sidewalk → porch/lobby
   threshold (Delk pad-to-door; Mt View door vs garage edge).
5. **Three plan scales** — site fit / block / detail; select unresolved item →
   zoom both endpoints in 2D and open the same location in 3D.

## Acceptance cases

| Site | Prove |
| --- | --- |
| **2600 W Heiman (553450)** | Gap from drive end to mapped frontage ≈ **20.85 ft** on tabloid A-01 graphic scale. Every bay either reachable or named break. Six uncounted bays explained from features. |
| **0 Delk Ave (675423)** | Garage-free cottage: designated parking pad connected to the lane, walk to front door. Garage-served contrast: door position, approach, maneuvering. |
| **5525 Mt View (660125)** | Per unit: which edge fronts, which drive/alley serves the garage, which green the door addresses. Guest bays reachable or named. |

Done when a reviewer can trace a garage, a garage-free home, a lobby, one guest
bay, and a failed access in both directions; proximity to an unrelated drive
cannot mark a bay served.

## First slice in this branch

`accessBreak` returns `gap3857` / `gapFt` alongside `from` / `to`. `gapFt` is
**ground feet** via `scene.frame.distanceFt` (not raw Mercator ÷ 0.3048). A
Nashville-latitude unit test pins ~20.85 ft within 0.5 ft. Sheet / canvas /
notes share `formatGapFt`. QA raster: `heiman-553450-a01-access-break.png`.
