# Visual QA — 2026-07-21 (live responses through the real client)

Battery run against **live server responses** (harvested ~15:00 UTC, post
massing-prior-relaxation-ladder / PR #75) replayed through the real client:
mapper → zero-overlap validator → render. Machine verdicts in `results.json`
(the `window.__planEvidence` hook: who solved, basis, violations, capture,
envelope source — all four parcels assert `envelopeSource: brief_2274_true`).

| Parcel | Address | What renders | Capture | Verdict |
|---|---|---|---|---|
| 553450 | 2600 W Heiman St (RM40) | **Server plan** — 5 bars × 4 floors, 164/132 stalls, score 0.921 | **98.3%** | ✅ floor 98 held. Consolidation to ≤3 buildings = GPT-2. |
| 488278 | 1710 Meharry Blvd (RM20) | **Server plan** — 2 bars × 2 floors (small-lot prior honored), 69/53 stalls | **83.1%** | ✅ floor 83 held |
| 667574 | 2622 W Heiman St (RM40) | Worker fallback + loud `SERVER-PLAN-REJECTED` | 54.2% (worker) | ⚠ server response carries a real defect: pool court × parking 22 m². NOTE: response is pre-ladder — the live solve now exceeds 60 s (4 timeouts today), also upstream. |
| 669046 | 1200 W H Davis Dr (RM40) | Worker fallback + loud `SERVER-PLAN-REJECTED` + landlocked banner | 64.9% (worker) | ⚠ ladder regression: infill bars overlap 1,289 m² (`infill_bar_added_from_residual_envelope` ×2); court greens/amenity dropped. Pre-ladder response was 98.5% with a 7,964 sf court. |

Files: `<fid>_2d.png` (plan view with KPI bar, headline, design context,
tabulation) and `<fid>_3d.png` (massing with sun study + neighbor context).

**Ritual**: re-run and commit a new dated folder on every solver-touching PR
(the PR battery gate uploads the same set as workflow artifacts automatically;
this folder is the human-browsable record).
