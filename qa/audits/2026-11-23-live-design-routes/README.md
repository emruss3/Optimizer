# Live Design P2 — access-break ground feet (2026-11-23)

Lead review on PR #187: `gapFt` must be **ground feet**, not raw EPSG:3857
metres ÷ 0.3048. At Nashville (~36.17°N) Mercator stretches ~1.24×, so a true
20.85 ft W Heiman gap was printing ~26 ft.

## Evidence

- `heiman-553450-a01-access-break.png` — tabloid A-01 for 2600 W Heiman St
  (553450). Red route-break label reads **21 ft short** (20.85 rounded) next
  to the plan; notes use the same `formatGapFt` rule.
- `heiman-553450-a01-access-break.svg` — source vector for that raster.

## How the picture was made

Could not drive the live planner UI for a production break in this session
(committed seed_v2 drive reaches the curb). Generated the tabloid A-01 from
the visual-battery fixture (`mock_store.json`,
`fn_generate_mf_site_plan_v2:553450:multifamily`), then forced a break at
**20.85 ground feet** from the curb along the access lane (same method as
exhibit-parity). `gapFt = scene.frame.distanceFt(fromProj, toProj)`. Rendered
with `renderSitePlanSheet`, rasterized with Playwright Chromium.

Measured on that sheet run:

| Quantity | Value |
| --- | --- |
| `gapFt` (ground) | 20.85 |
| Raw Mercator ÷ 0.3048 | ~25.85 ft (the old bug) |
| Printed label | 21 ft short |
| Frame `groundScale` / lat | 0.80643 / 36.17°N |
| Sheet scale | 1″ = 100′ |

Regenerate: `npx tsx scripts/_heiman-a01-break.mts`
