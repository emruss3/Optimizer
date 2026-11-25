# Structures in the 3D model (2026-11-23)

Owner review of 535 Main St in production, with the instruction that the fix
must hold for every plan type and not only this parcel:

1. The parking is not shown, and there is no way to see how a car gets in.
2. The building steps with the ground more than a civil or an architect would allow.
3. Windows look straight at each other.

## What was wrong

- The garage of a wrap was a flat paved outline on the ground. The bars that
  stand over it were drawn as five floors of homes, though the engine says two
  of those floors are parking.
- Each building got its own floor level from the ground under its own middle.
  The four bars of one wrap sat at four levels.
- Every wall got windows, whatever it faced.

## The rules now, and where they live

None of these is written for a parcel or for one generator. They read the plan.

| Rule | Applies to | Where |
|---|---|---|
| A plan's structured parking is drawn as a concrete structure as high as its parking levels, with its deck on top | Any plan that carries a garage outline | `ui/massingData.ts` |
| What the plan puts on the deck (a court, a pool house) is drawn on the deck | Same | `ui/massingData.ts` |
| A dark portal in a concrete frame stands at each garage entry the engine gives | Same | `ui/massingData.ts`, entries carried by `api/generateMfPlan.ts` |
| The parking levels of a building that stands over a garage are open concrete bays, with no windows and no lobby | Same | `ui/architecture/kit.ts`, both apartment styles |
| A garage, its buildings and what stands on its deck share one floor level. So do larger buildings that stand against each other | Apartments, amenity and other larger buildings | `ui/massingData.ts`, `render3d/terrain.ts` |
| No window on a wall that stands against another building, or looks at one within about 30 ft | Apartments, amenity and other larger buildings | `ui/architecture/index.ts` (`shutFor`) |
| No window within about 13 ft of an inside corner, where two wings would look into each other | Same | Same |

Houses and row homes are left out of the last three on purpose. A row steps
down a slope home by home, and a mews row faces its neighbour across a lane.

Heights still come from the story count, and the garage's deck height is the
same estimate as the parking levels of the buildings over it.

## Evidence

- `main-after-a.png`, `main-after-b.png`: 535 Main St from the saved engine
  answer, in the review view. Two open parking levels under three floors of
  homes, the building level, the court and pool house on the deck, a portal at
  each entry.
- `main-before-production-street.jpg`: the production street frame from the
  2026-11-23 audit package, before this change.
- Tests in `ui/massingData.test.ts`, "a parking structure in the model".
- The drawing gate passed all 65 checks.

## Limits

- The pictures are from the light renderer this machine falls back to. The full
  renderer was not inspected here.
- The 2D plan and the A-03 section do not yet mark the garage entries or label
  the parking levels. That is the next step.
- A plan that counts structured stalls but carries no garage outline still has
  nothing to draw. It should say so on the sheet.
- The garage's ramp and internal circulation are not modelled: the engine gives
  entry points, not a ramp.
