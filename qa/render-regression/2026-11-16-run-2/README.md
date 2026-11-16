# Render regression, run 2, 16 November 2026

All 16 parcels on main at ba35d19 plus this change, compared with the baseline run.

**14 of 16 pass.** No row moved against the baseline on ground, street view, model time or cut.

| Fails | Why |
| --- | --- |
| 5525 Mt View Rd | No street view of a scheme that has buildings: 27 townhomes, and the camera finds no clear place to stand |
| 0 Smith Springs Rd | The model took 3,231 ms to build, over the 2,500 ms limit |

## What a row fails on

- the 3D view does not open, or reports an error
- the model takes over 2,500 ms to build at the full tier
- a scheme with buildings has no street view
- nothing is drawn and the view does not say so

## What changed since the baseline

- Three parcels have no building in the plan: Hickory Bend (refused, the floodplain leaves no
  buildable piece), Martingale (opens on a plan with no lots) and 2400 W Heiman (lots and streets,
  no houses). All three now say so in the view. See `672526-drone.jpg`.
- Mt View: the lane meets the street, and the paths along the rows stop at the last door instead of
  in the lawn. See `660125-drone.jpg`.
- The baseline labelled Hickory Bend as "9 lots" and Martingale as "147 lots". Those were the
  figures of other answers in the fixture store, not of the plan the workspace opens with. The set
  now says what each parcel is.

## Still open from the baseline, not touched here

- One graded surface implies 15 to 19 ft of cut or fill at Mt View, Smith Springs, Bowfield and W Heiman.
- Large sites are too far away to read from the drone view, and show a striped ground.
- The street view for houses stands too close to one house.
- The limits above do not catch any of those three: they need eyes, or a measure not written yet.
