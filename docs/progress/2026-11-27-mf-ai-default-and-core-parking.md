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
