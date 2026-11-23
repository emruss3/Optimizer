# A floor that needs a use: the section through a wrap (2026-11-23)

Layout comparison review, 535 Main St: the A-03 section labelled five generic
levels on both buildings it cut. Only the rear wing has parking under its
homes. Nothing showed the garage, the court or where the cut runs.

## What the section draws now

| Item | Rule |
|---|---|
| Parking levels | A building that stands over a garage labels its lower stories "Parking P1", "Parking P2", in a grey fill. The count is the building's stories less the residential levels the engine reports |
| Homes | Levels above read "Residential". A liner building with no parking reads Residential from the ground |
| The garage | Where the cut crosses the plan's garage outline, the structure is drawn to the height of its parking levels, with its level lines |
| The court | The stretch of deck no building stands on is named "Court on the garage deck", with its estimated height above grade |
| The cut on the plan | Sheet A-01 marks the same line as a chain line with an A at each end |

A plan with no garage keeps the section it had: levels are numbered and carry
no use, since nothing on the plan says otherwise. A test holds that.

Heights are still estimates from story counts and say so. The deck height is
the top of the parking levels by the same estimate (24 ft for two levels).

## Evidence

- `main-a03-before-production.jpg`: production section from the audit package.
- `main-a03-after.png`: the same scheme, rev 82a80810, from the saved answer.
- `main-a01-cut-line.png`: the site plan with the A to A line.
- Tests in `scene/scene.test.ts`, "section through a wrap".
- The local drawing gate passed all 65 checks.

## Also in this change: PR 182 review points

- A land price typed as "1.2M" or "850k" is read as such. Anything else shows
  a hint and is not read as a price.
- The Compare panel resets when the parcel changes.
- A townhome layout's floor area reads "Unknown · upper bound 49,600 GSF"
  instead of plain "Unknown".
- The Land per home row says it is not a ranking: it leaves out revenue and
  home size.

## Limits

- The cut runs through the first tagged building at right angles to its long
  wall. It is not yet chosen to pass through the most informative parts.
- No ramp is drawn. The engine gives garage entry points, not a ramp.
- Garage entries are not yet marked on the 2D plan.
