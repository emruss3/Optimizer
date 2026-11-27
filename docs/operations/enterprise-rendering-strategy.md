# Parcel Proforma · Enterprise live rendering strategy

**Standing direction.** The interactive browser view should look like a professional architectural rendering while remaining faithful to the selected scheme. Target 9/10, including during navigation, across product types. The Lanes photographs set the quality bar. They are not the default style or a requirement to recreate that project. A great 4K export does not satisfy the live requirement. Appearance must not change feasibility, quantities, placement or civil geometry.

## Ranked priorities

| Rank | Work | Why it matters |
| --- | --- | --- |
| 1 | Architecture and its connection to the ground | Roof silhouettes, window recesses, sills, trim, entries, stoops, garages and pad-to-grade transitions are the first cues that make a scene look built. |
| 2 | Street, parking and landscape | Connect walks and driveways to actual entries and access. Show curb profiles, paving seams and layered planting. Use correctly scaled cars on valid surfaces only. |
| 3 | Materials, daylight and cameras | Use material textures at real scale, varied roughness, reflective glazing, coherent shadows, calibrated exposure and practical street, aerial and entry framing. |
| 4 | Motion and renderer capability | Measure orbit, pan, zoom and selection. Change render technology only when measured limits, not poor assets, explain the quality gap. |
| 5 | Delivery | Keep presentation stills for outreach and decks. Make the live planning view stand on its own. |

The Lanes photos expose three different tests. Street views reveal facade depth and curbs. Courtyard views reveal planted edges, transitions and contact shadows. Aerials reveal roof construction and the relationship of buildings, streets and amenities. Test other products from analogous views without borrowing that project's architecture.

## One plan, several views

- Keep TypeScript for the application and shared scene. Retain the current browser renderer and Blender as the first comparison pair. Changing languages will not fix missing geometry or art direction.
- Consume the same versioned scheme in 2D, Review, Rendering and export. Preserve lot/building IDs, footprint, orientation, quantities, terrain, access and constraints. Use explicit GLB axis/unit conversion. Record scheme/asset hashes, renderer/build, camera, lighting and known per-renderer substitutions.
- Build one plan catalog, including actual plans beyond the initial user set. A plan revision links floorplans by level, elevations, renderings, footprint/dimensions, garage/entry orientation, 3D asset and compatible finishes. Styles are appearance choices within the plan workflow, not a competing plan catalog. Keep the selected lot and camera when inspecting media, changing a compatible option or returning to 2D. Label missing media and concept geometry. Do not pass off a generic asset as the selected plan.
- Author versioned, licensed kits for detached front-load, detached rear-load, attached/narrow-lot and multifamily. Expand from garden apartments to distinct wrap/podium assemblies. Match actual plan data when available. Keep illustrative objects out of compliance data. Do not invent streets, sidewalks, parking, water, grades, wings or amenities to improve a shot.
- Give Review a clear purpose and a one-step switch. Once validated, Rendering becomes the 3D entry while unresolved warnings remain accessible. Retain camera and selection through the switch.

## Delivery sequence

1. **Create repeatable comparisons.** Start with a ZIP that captures a PNG from the live viewport, its exact camera and the scene/job for Blender at the same resolution. This is a matched-camera comparison, not identical shading. The worker can use different material treatments, foliage and lighting. Record those differences. Freeze scheme, shot, time of day, asset revision and device, then retain street, entry and aerial captures plus a motion recording. Check projected anchors as well as the visible match and alignment to 2D.
2. **Finish a representative street section end to end.** Start with a known narrow-lot or rear-loaded plan as an informative case. Give it authored facade depth, correctly oriented glazing, entry/garage geometry, believable roofs and site connections. Add planting, curb and sidewalk detail, texture scale and calibrated daylight. Replace visibly artificial vehicles with approved licensed models and appropriate detail levels. If a car asset or legitimate placement is missing, omit it rather than rendering a stand-in. Change one layer at a time so the comparisons show which changes move the score.
3. **Prove transfer before wider rollout.** Freeze a matrix with a detached subdivision, an attached or narrow-lot rear-load site, a garden apartment community, and a structured-parking wrap or podium site. Include an unrelated held-out site per broad family and an uneven site. Include large parcels where navigation is already difficult. Introduce instanced geometry, multiple detail levels and progressive asset loading where measurement shows value. Prioritize nearby buildings and walking surfaces over props on constrained GPUs.
4. **Make the engine decision on evidence.** If authored assets look weak in browser and Blender, improve the assets and staging. If the offline views pass and live fails, isolate the effect (such as indirect light, contact shadows or reflections) and test a targeted WebGPU path against the existing browser path. Measure compatibility, stability and speed. Consider a streamed engine only after a bounded prototype proves a meaningful quality gain at acceptable input latency, session cost, time to first interaction and update reliability. Do not make a rewrite the default.
5. **Release when it passes live.** Use staging and a limited initial rollout. Keep Review and a fallback renderer/preset. Check the regular ZIP and hosted queue separately from the comparison path. Do not change default views, remove review tools or roll out across all sites on the strength of one hero shot.

## Release gates

- **Visual.** Two reviewers score architecture, ground connections, lighting/materials, entourage/context and quality in motion, equally weighted. A 9 is presentation-ready without visible placeholder cues. Require 9/10 per test case including street and aerial, with no category below 8. Score still exports separately. Use unretouched live captures and recordings.
- **Fidelity.** Redline changes against 2D and source data. No unexplained differences in scheme footprint, orientation, grade, topology, catalog identity, constraints or counts. Floating or disconnected entry/garage/site geometry, incorrect building assets and vehicles obstructing valid routes are blockers regardless of score. Anchors need to be present, accurate and visually useful.
- **Interaction.** Initial desktop goal is at least 30 median FPS and no more than 10% regression in p95 frame time during a repeatable orbit/pan/zoom run on controlled hardware. Record first interaction time, loaded bytes and device/browser. Test integrated and dedicated GPUs, mouse and touchpad, fit site, focus lot, mode switching, alternative switching and saved plan reopen. Establish lower-tier budgets from measurements.
- **Reproducibility.** Attach the frozen fixture list, captures, scores, build and device details. Publish open gaps. Document asset license and source. No solver or hosted-render regression.

## First increment · local smoke test

In Rendering, clear selection and turn off plan lines. Set the desired shot and use **4K Render → Export live comparison**. Unzip and run the included Blender command, replacing the script path with the path to this checkout's worker. Compare the browser and Blender PNGs. Read the worker report and check the live camera block has anchors within tolerance. Repeat with an orbit and a lens-shifted street view. Use the renders as controlled comparisons and the reference photographs as the visual standard. This increment creates measurement capability. It does not, by itself, raise the visual score.
