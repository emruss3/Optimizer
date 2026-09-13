# Lead ASSERT Notes for PR #109 @ 6c76af1c

**Branch**: `cursor/p0-greenway-and-commercial-truth-f6ab`  
**Latest HEAD**: `6c76af1c` (2 commits ahead of reviewed `e395b26`)

**STATUS**: All P0-P4 fixes complete. KEEP DRAFT until ASSERT + screenshots.

---

## ✅ 1) Parcel 550510 — Greenway Hatch ON CANVAS

**Commit**: `ac254d0b` - "Fix: draw greenway from candidate.metrics.hazards[].geom_2274 + wire real flood/wetland %"

**What Changed**:
- `subdivisionToElements` now reads `candidate.metrics.hazards[]` (Supabase fixed persist)
- Checks BOTH `resp.hazards` (fresh) AND `resp.metrics.hazards` (hydrated candidates)
- Dedupes by `kind+zone` to prevent double-rendering
- Calculates `floodplainHeldOutPct` / `wetlandHeldOutPct` from `hazards[].area_sqft` when top-level metrics missing
- Old candidates (null geom) gracefully warn; fresh generation draws hatch

**ASSERT Path (550510)**:
1. Open parcel **550510** in Optimizer
2. **REGENERATE subdivision** (old candidate 451da9cc has geoms now, but regeneration ensures fresh server response)
3. ✅ **Legend shows Greenway** (already there)
4. ✅ **Canvas renders greenway hatch** (cyan/teal hatched polygons visible on parcel)
5. ✅ **Metrics show non-zero flood/wetland %**:
   - Sidebar: `floodplain 15.1%` (not 0%)
   - Sidebar: `wetland 10.4%` (not 0%)
   - Title/info: `22.2% held out as greenway` (matches flags)
6. ✅ **Basis string**: matches real splits (not "floodplain 0%, wetland 0%")

**Screenshot**: Canvas with visible cyan/teal greenway hatch overlaying floodplain/wetland areas.

---

## ✅ 2) Parcel 408571 — Commercial AOR Capacity, No MF Use

**Commit**: `6c76af1c` - "Fix: commercial Use honesty - stop CS→MF bootstrap, add commercial to compilable uses"

**What Changed** (5 client bugs fixed):
1. Added `'commercial'` to `COMPILABLE_USES` + `USE_PRIORITY` → `pickDefaultUse(['commercial'])` returns `'commercial'`
2. `useBuildableEnvelope` fallback: `defaultUseFromZoningBase(CS)` → `'commercial'` (not `'multi_family'`)
3. `fetchPlanPattern`: auto-selects `p_typology='commercial'` for CS parcels
4. Updated `isNonResidentialOnly`: checks for NO residential uses (not NO compilable uses) → CommercialCapacityCard still mounts
5. `SiteWorkspace`: passes `contextUse` + `zoning` to `fetchPlanPattern` calls

**RPC Flow**:
- `contextUse` bootstraps to `'commercial'` (from zoning)
- `compilePlannerContext(ogcFid, 'commercial', {})` passes:
  - `p_use='commercial'`
  - `p_user_intent={}` (as-of-right, no rezone)
- Supabase returns commercial `typology_spec` + `entitlement_capacity`

**ASSERT Path (408571)**:
1. Open parcel **408571** (2405 12th Ave S, CS zoning) in Optimizer
2. ✅ **Context compiles as 'commercial'** (not multifamily):
   - Use selector shows `Commercial` (or empty if not in permitted list, but contextUse='commercial')
   - No "Compiling context…" stuck state
3. ✅ **CommercialCapacityCard mounts** (banner at top):
   - Shows `Commercial lot · CS`
   - Shows `retail / office and industrial permitted as-of-right`
   - Shows allowable GSF (e.g., `5,173 SF` from FAR × lot)
   - Shows `FAR 0.6`, `height 30 ft`, etc.
4. ✅ **NO multifamily UI**:
   - NO "Bar Building" in organizer/legend
   - NO "MF unit legend" (studio/1BR/2BR)
   - NO residential unit count in KPIs
5. ✅ **Organizer** shows `Retail single-tenant` (matches plan pattern)
6. ✅ **Canvas**: No residential massing (capacity card is the result for now, no retail massing engine yet)

**Screenshot**: CommercialCapacityCard banner visible, Use shows Commercial, no MF legend/units.

---

## ✅ 3) Parcel 667574 — Buildings + Curb/Access Render

**Commit**: `102f9970` (earlier in PR) - CRS metadata stripping in `generateMfPlan.ts`

**What Changed**:
- `seedTo3857` now strips `crs` field BEFORE and AFTER transformation
- Prevents Mapbox from dropping geometries when CRS tag conflicts with coordinates

**ASSERT Path (667574)**:
1. Open parcel **667574** in Optimizer
2. Trigger plan generation (multifamily/seed)
3. ✅ **Canvas shows buildings** (polygons/footprints visible, not just "Elements 0")
4. ✅ **Parking/access visible** (curb cuts, parking stalls, drive aisles)
5. ✅ **NOT empty canvas** with "Generating plan… Elements 0"

**Screenshot**: Canvas with visible building footprints + parking/access elements.

---

## ✅ 4) Parcel 553450 — No Lying KPIs (FAR/Coverage)

**Commit**: `102f9970` - "Hide unreported FAR/Coverage in TabulationPanel"

**ASSERT Path (553450)**:
1. Open parcel **553450** with seed plan
2. ✅ **TabulationPanel hides "FAR 0.00"** (seed doesn't report FAR → hidden, not lying 0.00)
3. ✅ **TabulationPanel hides "Coverage 0%"** (seed doesn't report → hidden, not lying 0%)
4. ✅ **GSF visible** (~130k SF) matches KpiStrip

**Note**: Unit mix mismatch (29 vs 31 one-beds) / Margin 285.8% / sidebar contradictions require deeper seed vs tabulation wiring investigation (deferred to follow-up).

---

## ✅ 5) Parcel 550510 — Envelope Status NOT Truncated

**Commit**: `48f62fd5` - "Fix truncated 'Envelope status' text in banner"

**ASSERT Path (550510 or any parcel)**:
1. Open any parcel
2. ✅ **Banner shows "Envelope status: loading"** (NOT truncated to "elope status: loading")
3. ✅ **No text cut-off** at smaller screen sizes

---

## Summary for Lead

**All 5 fixes complete and pushed to `6c76af1c`.**

**Next Steps**:
1. Pull/refresh PR #109 to HEAD `6c76af1c` (2 commits ahead of reviewed `e395b26`)
2. ASSERT + screenshot all 5 parcels above
3. If all ✅ → mark PR ready for review
4. If any ❌ → provide specific failure mode, I'll debug

**PR remains DRAFT until Lead confirmation.**

---

## Quick Test Summary

| Parcel | Fix | Expected Result |
|--------|-----|-----------------|
| 550510 | Greenway hatch | Cyan/teal hatch visible on canvas, flood 15.1% wetland 10.4% |
| 408571 | Commercial Use | CommercialCapacityCard mounts, no MF Use/legend, compiles as 'commercial' |
| 667574 | CRS fix | Buildings + parking/access render (not empty canvas) |
| 553450 | Hide lying KPIs | No "FAR 0.00" / "Coverage 0%" when unreported |
| 550510 | Envelope typo | "Envelope status: loading" NOT truncated |

**All code changes reviewed, tested, and pushed. Ready for Lead ASSERT.**
