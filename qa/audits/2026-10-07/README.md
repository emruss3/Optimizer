# 2026-10-07 · The Texas wrap, from The Caroline (101 Cool Springs Blvd)

Eric sent the full development-plan set for The Caroline in Franklin
(Kimley-Horn C0.0–C5.0 / L1.0, 906 Studio A1.0–A4.0, resubmittal 3/7/2024) as
"an example set of plans for a Texas wrap multifamily product". This folder
holds the renders of what the app now draws from that organization. The
reading of the set, the pattern rule, the generator and what is still open
are in `docs/OPTIMIZATION_AUDIT_2026-09-02.md` §19.

## What the Caroline does, in one line each

- One block to the setbacks (303 × 243 ft, 57% of 2.9 ac), the rest an L of
  private drives, the landscape frontage and the buffers; no curb cut on
  the arterial.
- A 2-level garage in the middle (314 stalls, ~380 SF per stall per level),
  18 visitor stalls outside parallel to the drives, garage entries off the
  side drive and the rear easement.
- Four double-loaded bars ring the courtyard on the deck; pool and patio in
  the ring, club / fitness / lobby / leasing and the commercial at the
  street corner; liner units face the drives at the garage levels.
- 190 units (12 / 66 / 22% studio / 1BR / 2BR), 6 stories (2 + 4), Type VA
  over Type IA, 1.72 stalls per unit.

## The renders

| file | what it shows |
|---|---|
| `wrap_seven_parcels.png` | `fn_generate_wrap_site_plan` on seven structured-regime parcels, straight from the database (blue bars, grey garage outline, green court, amber pool deck, grey drives, red frontage, red dot = curb cut). Six get a plan; 1200 18th Ave S (a 160-ft strip) is refused and the pattern layer never asks there. |
| `469303_535_main_st_2d.png` | The app on 535 Main St (MUG-A, 3.24 ac, corner): the served plan is the wrap — four bars named by their place in the ring, the garage as a dashed structured deck ("Garage · 2 lvl · 238 stalls"), the court and the pool deck on it, the side drive from the Main St curb and the rear drive along the block. "How to organize this site: Texas wrap … generator follows this". |
| `469303_535_main_st_3d.png` | The same plan massed: the ring of five-story bars round the court. |
| `393306_house_after_canvas_fix.png` | 303 E Palestine Ave's house, which the canvas had been refusing to draw since 2026-09-04 (`corridorLine` used without an import — every building without a unit mix, the SF house and any amenity pad, hit the error boundary). Found because the wrap's pool deck took the same path; fixed in this change. |

## The numbers (535 Main St)

| | |
|---|---|
| block | 323 × 280 ft, 64% of the site; court 188 × 145 |
| stories | 5 = 2 garage + 3 residential |
| units | 131 at ~1,550 GSF (the frontier's GSF-max program), 40 per acre |
| GSF | 232,425 = 54.8% of the 423,765 structured ceiling, 116% of the 199,950 surface frontier |
| stalls | 238 built (185 per level, the top level partial) for 226 required, 1.8 per unit |
| access | side drive + rear drive, right side; the garage entered off the side drive near the rear corner and off the rear drive |

The Caroline, for scale: 72,070 SF per floor on 2.9 ac, 190 units, 332 stalls.

## Gate

535 Main St is a battery parcel now (`scripts/visual-battery`): `mode:
server-plan`, `requirePlanPattern: wrap_garage_courtyard`,
`requirePatternAligned`, `requireAccess`, utilization floor 110% of the
surface frontier. The fixture battery passes on all eight parcels with the
fixtures in this change; the battery now also fails a parcel whose canvas
shows the planner error boundary.
