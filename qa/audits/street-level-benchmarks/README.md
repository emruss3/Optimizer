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

The next gate is a complete street scene using dimensioned facade and lobby
drawings, verified grade at the door and curb, and specific landscaping.
Review both a held-out rear-load housing site and a multifamily site with
actual entry information, before making any claim about photorealism at
parcel scale.

## Visual references

- The Lanes project reference: [308 Edith Circle](https://www.zillow.com/homedetails/308-Edith-Cir-Nashville-TN-37208/458739669_zpid/). The listing is not used as source dimensions for B2.
- The timber/glass relationship: [EOA's Standard Assembly](https://eoa-architects.com/project/standard-assembly-apartments/). This is Nashville precedent, not a source floor plan for Smith Springs. No reference photographs are included in the renderer or these previews.
