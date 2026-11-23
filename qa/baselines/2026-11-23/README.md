# Review baselines, 2026-11-23

Delivery 1 of the 2D and 3D design handoff (2026-11-22): freeze the five
review scenes before design work changes them.

Each scene has a manifest (`<parcel>.json`), its plan (`<parcel>_2d.png`) and
its 3D view (`<parcel>_3d.png`). `index.md` is the summary table.

## How to reproduce

```
node scripts/visual-battery/mock-supabase.mjs            # terminal 1
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=battery-gate-local-mock npx vite --port 5199 --strictPort   # terminal 2
ASSERT=1 ONLY_FID=675423,660125,553450,469303,672526 SHOTS_DIR=out node scripts/visual-battery/battery.mjs
node scripts/visual-battery/manifest.mjs out qa/baselines/<date> <commit>
```

## What these are, and are not

These are **fixture replays**: the app driven against saved engine answers.
They are not captures of the released planner, which this environment cannot
reach.

Three of the five replay the same revision the handoff audited in production:
Delk (316a0d36), Main St (82a80810) and Hickory Bend (b2b4a6b8).

Two do not, because the saved answers are older than the engine:

| Scene | Fixture | Production audit |
|---|---|---|
| 5525 Mt View Rd | 27 townhomes, mews, rev 409af080 | 30 townhomes, lane, rev dca61670 |
| 2600 W Heiman St | 1 building, 73 homes, 126 stalls, drive reaches the street, rev 4daa644f | 4 buildings plus E, 70 homes, 127 drawn stalls, drive does not reach the street, rev c1d84ac9 |

The handoff asks for the 27-home Mt View fixture to be kept apart from the
occupied review baseline. It is kept here as the historical fixture. A
production-matching baseline for both needs a fresh harvest of the live
engine answers.

## Not yet in the manifests

- The handoff's fixed comparison cameras. The battery opens 3D at its default camera.
- Aspect and hardware beyond the viewport and the renderer tier the view reports.
- The labelled failure and retry case, and the three-lot Delk first state.
