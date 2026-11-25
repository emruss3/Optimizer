# UI/UX audit of November 13, 2026: what has shipped

The audit's twenty findings, and where each stands. Captures in this folder
are from the local fixture run.

| Finding | Status |
|---|---|
| 01 Navigation that goes nowhere | Done (PR 149) |
| 02 Demo projects, stub commands | Done (PR 149). A real project list is not built: the app has no project list query. |
| 03 Filters that do not apply | Zoning only (PR 149). Applied districts show as chips on the map, each removable, with Clear all. No results count: the map does not report one. |
| 04 Results against the schedule | Done (PR 149) |
| 05 First visit | Search and the sample come first; the tour is optional. Product name not decided. |
| 06 Search | One search box on Start, in the header and on the map fallback; the palette and the assemblage use the same search function. A timeout and Try again. |
| 07 Parcel drawer | Leads with Feasibility; deeded and mapped area labelled; assessor record in a group. |
| 08 Assemblage | Starts with the parcel it was opened from; add by search; Escape closes; named controls. Still a dialog, not a tray beside the map. |
| 09 One deal workspace | Placeholder Financial tab removed. The workspace itself is not built. |
| 10 Resume a revision | Renamed to "Reopen last parcel", with a line saying it does not restore the exact drawing. Routes and revision restore need saved revisions with stored drawings. |
| 11 Guest save | Sign-in offered in the planner. Save version asks for a name, with one offered. No link to the saved version yet. |
| 12 Compare stored revisions | A scheme with no drawing reads "Metrics only · drawing not saved". Differences are neutral except the margin. Comparing stored drawings needs the engine. |
| 13 Underwrite while loading | Results marks stale figures. Explicit target revision not built. |
| 14 Chrome around the plan | First pass: the headline is one line and the planner's header row is shorter. At 1280 × 800 the canvas is 439 px tall, from 401. One header for parcel, scheme and save state is not built. |
| 15 Review and Present | Review shows camera and selection only; sun, style and Photoreal sit in Rendering and Present under an Illustration tag. Section is a button beside Plan and 3D. |
| 16 Status wording | "Checks passed" in place of "Code compliant"; the status opens the checks; tabs are Schedule and Checks; the Checks badge counts only what asks something of the user. The basis line's engine wording is unchanged. |
| 17 Phone layout | At 390 and 430 px nothing runs off the side: figures, view switch, Export and the plan actions wrap. The canvas title block and legend still cover part of a small plan. |
| 18 Keyboard and dialogs | Assemblage and Full Analysis close on Escape and name their close controls. No shared dialog pattern and no keyboard list of buildings yet. |
| 19 Export | "Save PDF · A-01" and "Save PDF · all N sheets"; PNG and SVG under More formats; a line listing each sheet as ready, rendering on export, or left out and why. |
| 20 Recovery states | Search timeout and Try again (PR 150); guest save (PR 149). Not standardised elsewhere. |

- `first_visit.png`: Open the app lands on search and the sample, no tour.
- `drawer.png`: the parcel drawer.
- `assemblage.png`: the assemblage opened from 1710 Meharry Blvd.

- `phone-390-before.png`, `phone-390-after.png`: the planner at 390 px.
- `plan-1280x800.png`: the plan at 1280 × 800.
- `review-3d.png`: the 3D Review view without the illustration controls.
- `plan-1024x768.png`, `plan-1440x900.png`: the plan at two more widths.
- `header-search.png`: the header's search field with its results under it.
