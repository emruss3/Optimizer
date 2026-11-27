# Apartment default = design-model pick; core parking finding (2026-11-27)

Owner, 2026-11-27: "we should be replacing our default model with all of this work. Continue going."

## 1. Default apartment plan now includes the design model (g56)

`public.fn_mf_ai_design(fid, n)` builds a set of candidates:
- the engine's own plan;
- 6 plans from design model `mfgen_1126b`.

The pick rule is in `training.ai_config 'mf_ai_default'`:
- keep plans within 2% of the most homes;
- then take the fewest failed design checks;
- ties go to the engine.

The winner is re-solved with persistence and cached in `training.mf_ai_design_cache`, keyed by parcel, context, model version and engine md5. `fn_generate_mf_site_plan_v2` returns the cached model pick for a fresh default request (no pins or parent, seed 1). The lookup adds about 20 ms.

The app runs the pick in the background after a default renders, through `engine-long`. If the model wins, it redraws the default as an undoable step.

Measured on the 14 review parcels (SQL checks):

| | Engine default | With model pick |
|---|---|---|
| Parcels where the model won | – | 7 |
| Failed checks, total | 30 | 24 |
| Homes, total | 627 | 638 |

Time per parcel with the model warm: 4.4–22 s.

## 2. Drive weld buffers (g55)

- The 0.05 ft weld buffers in `fn_mf_solve_core` now use mitre joins (`fn_mf_drive_buf_style`, GUC `mf.drive_buffer_style`).
- Default plans: identical homes and checks, 2–30% faster.
- Model plans on 489018:
  - Drive vertices: 32k–66k → 90–230.
  - Time per plan: 4.5–15.7 s → 0.9–1.4 s.
  - Payload: 3.8–7.2 MB → 34–68 KB.
- Also fixed: an SRID crash in `fn_mf_design_checks` when no green space sat near a building.

## 3. Finding: core sites are capped by a surface-parking assumption

**What the engine does**
- `fn_max_buildout` caps homes with `frontier_basis: surface_parking`, using the `unit_spec` market ratio (1.28–1.73 per unit).
- Its `structured_parking_ceiling` is computed but only advisory.

**What the code says**
- Nashville removed parking minimums in the UZO in November 2022, with the old minimums becoming maximums.
- DTC has had no minimums since 2010.
- All 16 core test parcels and the 7 review parcels within 2.5 mi are in the UZO.

**What gets built**
New core sites since 2010:
- 61% are block buildings;
- an estimated 72% could not fit their parking on the ground;
- median 4 stories, FAR 1.93.

**Test set:** 16 core parcels (within 2.5 mi, 0.6–3 ac, two per zone), in `training.mf_core_wrap_test`.

| 8 parcels zoned MUG, MUG-A, MUI-A, ORI | Homes |
|---|---|
| Today's default plans | 293 |
| Built-stock median FAR 1.93 (1,000 GSF/unit, 85% net) | about 581 |
| `structured_parking_ceiling` | about 1,033 |

- CS (FAR 0.6) and RM20/RM40 (density) parcels gain little or nothing.
- The wrap generator refused 15 of 16 (`wrap_block_too_small`).

**Next:** a podium drafter for UZO and core parcels where FAR and height bind before density:
- parking at a market ratio inside the UZO;
- parameters in `ai_config` with sources;
- compete under the same pick rule;
- show before and after first.

## 4. Podium drafter v1 (built, not yet wired into the default)

`public.fn_generate_podium_site_plan(fid, typ, seed, ctx)` draws residential bars over a one-level concrete podium that holds the garage, with courtyards on the podium deck.

Inputs from the planner solver brief:
- envelope, front setback, building coverage, FAR, density, stories, construction type (e.g. 5 over 1);
- bar depth, average unit size, market parking ratio.

Drafter parameters are in `training.ai_config 'mf_podium'`, each with its source. Three are assumptions to confirm: ground-floor garage share 0.75, at most 1 level below grade, 45-ft minimum courtyard.

Inside the UZO there is no legal parking minimum. Parking goes toward the market ratio and the shortfall is flagged, but it does not cap homes. Outside the UZO, garage capacity caps homes.

Results on the 16 core test parcels (`training.mf_core_wrap_test`):

| Parcel | Zoning | Today: homes / failed checks | Podium: homes / failed checks |
|---|---|---|---|
| 411573 | MUG | 22 / 1 | 57 / 0 |
| 696187 | MUG | 59 / 2 | 134 / 0 |
| 408219 | MUG-A | 50 / 2 | 77 / 1 (fire reach) |
| 664082 | MUG-A | 23 / 1 | 49 / 0 |
| 409518 | MUI-A | 37 / 1 | 120 / 0 (parking 108 of a 167 market target) |
| 676755 | MUI-A | 34 / 1 | 105 / 0 (99 of 146) |
| 668663 | ORI | 39 / 3 | 72 / 0 |
| 598004 | RM40 | 17 / 1 | 25 / 0 |
| 660290 | RM40 | 28 / 4 | 45 / 0 |
| 428668 | MUL-A | 11 / 1 | 21 / 1 |
| 689145 | MUL-A | 14 / 1 | 25 / 1 |
| 410796 | ORI | 29 / 1 | 31 / 2 |
| 487796 | RM20 | 13 / 1 | 13 / 0 |
| 665592 | RM20 | 13 / 1 | 13 / 0 |
| 408061 | CS | 60 / 2 | 43 / 3 |
| 686982 | CS | 22 / 2 | 14 / 1 |

Before and after drawings: `2026-11-27-podium-before-after.png`.

**Known limits of v1**
- Bars around widened courtyards can drop below double-loaded depth. Homes are counted by floor area, so those bars overstate efficiency somewhat.
- Fire reach fails where rear corners sit more than 150 ft from the street. No rear fire lane is drawn.
- The podium deck counts as green.
- No retail or lobby program is drawn.
- Garage ramps are not drawn; they are inside the 370 sf/stall allowance.

## 5. Live wiring and drive fix (later on 27 Nov)

**Podium in the default.** Owner go-ahead; assumptions confirmed and recorded in `training.ai_config 'mf_podium'`.
- `fn_mf_ai_design` adds a podium candidate when the parcel is in the UZO and its brief says `parking.strategy = 'structured'`.
- The same pick rule applies. A winning podium is saved through `fn_mf_persist_plan`.
- 16 core parcels: podium won 7, model 6, engine 3. Homes 471 → 849; failed checks 25 → 14.
- App (PR #235): buildings draw over their garage; stalls read "N in a garage (structured parking)".

**Drive reaches the street (g57).**
- The curb throat now tests distance to a street frontage, not to any property line.
- When the straight line hits a building, it reroutes along the frontage.
- 32 test parcels: drives missing the street 4 → 0; failed checks 62 → 58; homes 1,234 → 1,226. At 568738 the driveway takes parking: 65 → 52 homes.

**Ground-floor clubhouse (PR #235).** An enclosed clubhouse inside a residential footprint is drawn as that building's ground floor, not as a second building.

Function snapshot: `supabase/engine_snapshots/2026-11-27_mf_g57_podium_live.sql`.
