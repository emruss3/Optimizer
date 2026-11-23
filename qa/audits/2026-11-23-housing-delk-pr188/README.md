# PR #188 housing Delk — lead-review follow-up notes

Commit: `3a6645c0` on `cursor/housing-delk-cottage-6eb1`

## Lot 5 unresolved reason (fixture geometry)

`src/features/site-plan/api/__fixtures__/delk-675423.json` has `lot_kinds[4] === 'pie'`.
Applying `DELK_COTTAGE_ID` via `applyHousingDesign` leaves lot index 4 unplaced with a
reason matching `/pie lot|frontage|resolve/i` (asserted in `housing.test.ts`).

## Live street comparison vs rev 316a0d36

Not captured in this agent pass (vercel-dev / workspace was on another PR branch;
no PR-comment write tool). Parent should open Delk 675423 on the housing preview,
select the cottage, and drop canvas + 3D shots here + a PR comment.

Prior Delk five-lot baseline shots (pre-housing catalogue): `../2026-11-23-audit-p0/delk-five-lots-2d.png`, `delk-five-lots-3d.png`.
