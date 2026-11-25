# Render output audit and scope to a 10

16 November 2026. 1710 Meharry Blvd, parcel 488278, revision de87f8d2, main at ea4fa98.
Every image here was made today from that build. A 10 means a person glancing at the
street still takes it for a photograph of a finished building.

## Are we making material improvements?

Yes on the things that can be pointed at. Slower on the overall "looks real" score.

| Output | Start of the Blender work | Now | What moved it |
| --- | --- | --- | --- |
| Blender street still | 5.5 | 7.5 | Sun on the right side, photographed sky, brick, lap siding, real grass, graded ground, recessed openings |
| Blender drone still | 5.5 | 6.5 | Surveyed and graded ground, kit materials. Held back by the lawn |
| Live viewer, street | 6.5 | 7 | Same graded ground as Blender, belt course, window heads and sills, brick recesses |
| Live viewer, drone | 6.5 | 7 | Same graded ground |
| A-02 aerial sheet | 5.5 | 7 | White parcel line, graded ground, labelled assumptions |
| A-03 section sheet | 6 | 6 | Unchanged. Now the odd one out: it still draws flat ground |

The last two rounds, facade depth and recessed openings, were worth about a quarter of a
point each. The large gains left need things code alone does not supply: real car models,
regional trees, and a way to render in seconds.

## What each output looks like today

### Blender street still, 1920 by 1080 (`blender-street.jpg`): 7.5

Works: photographed sky and daylight. Lap siding reads. The brick ground story has real
recessed openings with brick jambs. Belt course and cornice draw the lines a built facade
has. The building sits level on its pad and the street rises past it.

Gives it away:
1. **Foundation shrubs are missing.** The report says 120 were placed. None show at the wall. Not traced yet.
2. **The car is a low-polygon box.**
3. **Glass is flat black.** No sky reflection, no room behind it.
4. **Scanned grass covers only the right foreground.** The verge on the building side is pale and bare.
5. **A pale wedge of bare graded bank** at far left, against the neighbour.
6. **The neighbour is a white box** with dark squares for windows.
7. **The entry is a thin canopy on two posts.** No storefront, no signage, no lights.
8. **Nothing on the street:** no lamps, signs, hydrants, people.
9. **The horizon is flat land with sparse dry-climate trees.**
10. **Siding is near white and uniform.** No panel joints, corner boards or weathering.

### Blender drone still, 1920 by 1080 (`blender-drone.jpg`): 6.5

Works: the ground has shape. The pad is level and the parking sits on one graded
surface. No layers poke through each other. Parking stripes and cars read at this distance.

Gives it away:
1. **The lawn shows its texture repeating** as a grid of squares across the whole view.
2. **The scanned-grass zone is a darker patch** at lower right with a visible edge.
3. **Trees are small, sparse and the wrong species** for Nashville.
4. **Two neighbour roofs are wrong:** one is a stepped pyramid, one has a dark triangle.
5. **No sidewalk on the site side of the street,** no kerb islands in the parking, no crosswalks.
6. **Flat roof is one grey plane** with three boxes. No parapet shadow, drains or screens.

### Live viewer, street (`live-street.jpg`): 7

Works: instant. Belt course, window depth, brick recesses and the foundation shrubs all
show. The grading assumption is labelled in the hint line.

Gives it away: painted sky, stylised trees, the boxy car, flat even light with no
contact shadow under eaves and sills, a hard dark shadow band across the road.

### Live viewer, drone (`live-drone.jpg`): 7

Works: fuller and greener than the Blender drone. Neighbours have walls, windows and
pitched roofs. Graded ground matches Blender.

Gives it away: tree crowns read as cut-outs up close. Lawn is one flat green.

### A-02 aerial sheet (`sheet-a02.jpg`): 7

Works: the site is unmistakable, the figures are the scheme's own, the assumptions are stated.

Found in this audit and fixed in the same change: the note ran off the right edge once
the grading sentence was added. It now wraps and stays clear of the sheet number.

### A-03 section sheet (`sheet-a03.jpg`): 6

It still draws level ground and says "the plan carries no grade", while the 3D view and
A-02 now stand on surveyed, graded ground. The three should agree.

It also carries a content finding that is not a rendering matter: Building A is estimated
at 44 ft against a 30 ft limit in the record at this cut.

## Where the two renderers disagree

They are meant to be one scene. The ground, cameras, sun and building now match. These do not:

| Part | Live viewer | Blender |
| --- | --- | --- |
| Trees | Larger crowns, denser | Smaller, sparser, different species |
| Neighbours | Walls, windows, roofs | Plain solids, two wrong roofs |
| Foundation shrubs | Shown | Missing |
| Lawn | One green | Tiled texture plus a scanned patch |
| Sky and light | Painted sky, simple light | Photographed sky, traced light |
| Sun | 21 March, 4:30 pm | 21 June, 9 am, chosen to match the photographed sky |

## Scope to a 10

Ordered by what moves the picture most for the effort. Each item says how it is known to be done.

### A. Defects found in this audit (do first)

| # | Item | Done when |
| --- | --- | --- |
| A1 | Foundation shrubs missing in Blender | Shrubs visible at the wall in the street still, count in the report matches what is seen |
| A2 | Lawn texture tiles visibly from the air | No repeat visible in the drone still at 1920 wide |
| A3 | Scanned-grass zone has a visible edge and a different tone | No edge visible from the drone or the street camera |
| A4 | Two neighbour roofs wrong in Blender | Neighbour roofs match the live viewer |
| A5 | A-03 section draws flat ground | Section shows the same existing and graded ground line as the 3D view, labelled as assumed |
| A6 | Brick skin overruns inside corners; overlapping openings double-draw | An L-shaped building shows clean corners; no flicker at a door next to a window |
| A7 | The two renderers use different sun defaults | One default date and hour, stated in both |

Expected after A: Blender street 8, drone 7.5.

### B. Facade and glass

| # | Item | Done when |
| --- | --- | --- |
| B1 | Glass reflects the sky and has depth behind it | Windows show sky reflection at a glancing angle and varied rooms, blinds and curtains head-on |
| B2 | A real entry | Storefront glazing, a canopy with depth, door hardware, address numbers, two wall lights |
| B3 | Siding detail | Corner boards, panel joints at floor lines, trim at window surrounds |
| B4 | Roof | Parapet with coping and shadow, mechanical screens, roof drains, flashing at the mansard |
| B5 | Balconies | Slab edge with drip, real guard with top rail and pickets, door behind |

Expected after B: Blender street 8.5, live street 7.5.

### C. Real assets (needs a decision from the owner)

| # | Item | Done when | Needs |
| --- | --- | --- | --- |
| C1 | Real car models | Parked cars read as real makes at street distance | A licensed pack, or one more asset site opened |
| C2 | Regional trees | Oak, maple, redbud, crape myrtle in three sizes, in both renderers | Same |
| C3 | Street furniture | Lamps, signs, hydrant, bins, bike rack, bench where a street would have them | Poly Haven covers part of this now |
| C4 | People | A few at the entry and on the sidewalk, labelled as illustration | A licensed pack |

Expected after C: Blender street 9, drone 8.5.

### D. Ground and surroundings

| # | Item | Done when |
| --- | --- | --- |
| D1 | Sidewalk, kerb and gutter on the site frontage; kerb islands in the parking; crosswalk at the drive | Visible in both stills |
| D2 | Pavement wear: patches, tyre tracks, oil spots at stalls, a darker wheel path | Asphalt no longer reads as one even tone |
| D3 | Retaining wall or planted bank where the grading shows more than 3 ft | The bare wedge at far left is gone |
| D4 | Neighbours with walls, windows and roofs in Blender | Matches the live viewer |
| D5 | Ground beyond the 100 ft survey margin | Needs wider elevations from the database. Engine lane |
| D6 | A horizon: distant tree line, haze, overhead lines on the street | No flat empty land at the horizon |

Expected after D: Blender street 9.5, drone 9.

### E. Light, lens and finish

| # | Item | Done when |
| --- | --- | --- |
| E1 | Sky set: morning, golden hour, overcast, each with its own sun height | The sun in the job always matches the sky used |
| E2 | Lens: slight depth of field, vignette, bloom on bright edges | Subtle, and off by default for sheets |
| E3 | One colour grade for all stills | Street and drone of one scheme look like one shoot |
| E4 | Contact shadows and ambient shading in the live viewer | Eaves, sills and the foot of walls are grounded |

Expected after E: 10 on the Blender street still.

### F. Speed and production (the constraint that shapes all of the above)

Measured today on 4 CPU cores, no GPU: 2 min 21 s for a 1920 by 1080 still at 12 samples,
of which about 90 s is fixed work before any pixel is traced. 39 min for 3840 by 2160.

| # | Item | Done when | Needs |
| --- | --- | --- | --- |
| F1 | The live viewer is the instant output and carries the same assets | Viewer uses the kit's materials and sky; opening the view stays under one second | Nothing |
| F2 | Blender on a GPU, kept warm with the scene loaded | A 4K still in under 30 s, measured | A GPU render machine |
| F3 | "Render 4K" in the app with a queue and a cache keyed by scene revision | A second request for the same revision returns at once | F2 |
| F4 | CI smoke job for the render worker; pinned asset checksums; a cap on grass count | Green in CI | Nothing |
| F5 | Lighter plant models for the viewer | 727 trees orbit smoothly | Nothing |

## Recommended order

1. A, all of it. These are defects, and A1 to A4 are visible in every still.
2. B1 and B2. Glass and the entry are what the eye goes to on a facade.
3. F1. It is the only route to "seconds" available today.
4. C, once a car and tree source is chosen.
5. D, then E.
6. F2 and F3 when there is a GPU machine.

## Decisions for the owner

1. **Cars and trees:** buy one licensed pack, or allow one more asset site for this environment.
2. **GPU render machine:** needed for Blender stills in seconds. Without it the live viewer is the fast output.
3. **Building height on Meharry:** the section reports 44 ft against a 30 ft limit. That is a plan question, not a rendering one.

## How these were made

- Live viewer and sheets: local app against the fixture store, full quality tier.
- Blender: `scripts/render4k`, daylight preset with the kit, half size, 64 samples, both cameras in 12 min.
- Blender pre-render checks passed: model extent 0.000 ft, both cameras 0.006 px.
- Scores are one reviewer's judgement, not a measurement.
