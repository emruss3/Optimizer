# Street-level 3D benchmarks

This is a first exterior-to-interior detail pass, not a photoreal release.
The model carries the floors, wall returns, recesses, furniture, finishes and
small lights as geometry. They are visible through the existing openings in
both browser 3D and the exact-model Cycles scene. Plan quantities, exterior
envelopes, opening locations and pedestrian and garage approach anchors do not
change. These are **presentation pockets**, not a furnished floor plan, a
designed lobby, a fire or accessibility analysis, or a grade/civil deliverable.

| Case | Source geometry | What it tests |
| --- | --- | --- |
| West Heiman B2 | Dimensioned rear-load catalog concept placed through the normal buildable-plan path on a controlled QA lot with front and rear links | A real catalog opening sees a room-sized recess derived from named source rooms. The two approaches and building envelopes are kept. This is not the as-built lot, permit drawing or full The Lanes site. |
| 0 Smith Springs Rd | Recorded parcel and multifamily solver fixture 670533 | Existing glazed entry sees a deep, timber-lined lobby pocket with the seat out of the door centerline. The fixture keeps 3 stories, 42 units and 113 stalls. The render does not establish that the site has a valid curb cut. |
| Structured wrap guard | Synthetic garage-overlap fixture. The recorded 535 Main scheme has two parking levels beneath the housing. | The implementation must not dress a garage bay as a lobby. This pass does not establish an architectural lobby for 535 Main. |

The rectangle of a lobby pocket must stay inside the building ring and
outside all courtyard holes. A concavity, a shallow shell, a low detail
tier, a garage or a blind wall uses the existing treatment without inventing
space behind the facade. The housing pocket stays within its named source
room. Fixtures sit physically behind their panes, not on a background image.
The product keeps its existing navigation behavior; 2D and feasibility
checks are unchanged.

## Evidence

Same saved geometry, scene digest, source quantities, building model bounds,
approach anchors, light and controlled camera were checked before and after on
both positive cases. The comparison shows raw browser viewport captures and
1440 × 810 path-traced previews from exports of the same scene. The camera is a
controlled front detail view, not a pass of the app's public arrival camera.
The fixtures use flat ground for this isolated view check. No production
deployment, AI repaint or survey is implied.

## Photographed materials pass

[`Material_Comparison.jpg`](Material_Comparison.jpg) compares browser and
Cycles images using the same two benchmark scenes and camera positions. Photo
normal and roughness maps replace drawn lap siding and the paver material used
on site concrete. The walk no longer has the photo's false rectangular paver
grid. The siding has a consistent 6-inch exposure and softer variation across
boards. The browser requested the new maps successfully. Geometry buffers,
quantities, approach locations, camera and sun are unchanged. The photos are
material inputs, not image-to-image edits. The alternate turf scan looked
flatter in the same browser view, so it did not ship.

### What would make the next pass look like a photograph?

| Priority | Build | Acceptance test |
| --- | --- | --- |
| 1 | Use site-specific context. Start from a reference set of owned or licensed ground-level photos and dimensioned elevation/grade data. Use a confirmed rear-load view at The Lanes and a real multifamily arrival such as DELUX WeHo as separate benchmarks. Model the actual curb, walk, driveway and foundation interface. | Match camera pose against the reference. Compare the height of the curb and door, roofline, garage and street connection, and the position and scale of visible neighbors. Keep unsurveyed details illustrative. |
| 2 | Build architectural details that change the silhouette or catch light. Author roof edges and returns, window relief and trim, recessed entrances, real garage-door panels, and separate durable finishes for entries and service sides. | Walk around the model at eye height. Distinguish designs by massing and openings from street, side and rear regardless of the selected material palette. Geometry is checked against its source elevations. |
| 3 | Fix flat planting and glass. Select climate-appropriate groundcover, shrubs and tree forms per site. Mix plant heights and age. Light actual rooms and lobbies behind clear glazing, separate direct sun from warm practical fixtures, and test dark and backlit angles. | On a dusk or overcast comparison, interior light reaches adjacent surfaces without lighting the exterior through walls. Plant coverage stops at hardscape and never hides the route to a door or garage. |
| 4 | Keep live interaction and 4K stills separate, with one authoritative model and explicit material versions. Stream display-ready assets as the user approaches, and let Cycles spend more samples and cost for the same saved camera. | Both views pass plan-geometry and camera checks. Compare against the actual photo, not just the earlier render, while tracking time to meaningful first frame on the full-parcel benchmark. |

A material scan can get a wall right. It cannot fix generic buildings and
an empty horizon, derive a real landscape from a parcel outline, or establish
that a cut/fill assumption or driveway is correct. Reuse the controlled views
above as regression fixtures, and require a new held-out parcel for each
broader improvement.

## Visual references

- The Lanes project reference: [308 Edith Circle](https://www.zillow.com/homedetails/308-Edith-Cir-Nashville-TN-37208/458739669_zpid/). The listing is not used as source dimensions for B2.
- The timber/glass relationship: [EOA's Standard Assembly](https://eoa-architects.com/project/standard-assembly-apartments/). This is Nashville precedent, not a source floor plan for Smith Springs. No reference photographs are included in the renderer or these previews.
