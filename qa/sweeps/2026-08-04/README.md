# Order-7 sweep — dispatcher fixes + re-verification (2026-08-04)

Eric: "Every parcel should be 95%+ run 20 random parcels. Fix any issues you
find. The only situation where you aren't maxing out FAR is single family
home (one home allowed on a lot)."

## Fixed this round (live migrations, repo parity in supabase/migrations/)

All three are DISPATCHER math in `fn_generate_mf_site_plan_v2`; the seed
core (`fn_seed_parking`) was deliberately not touched:

1. **Zero-stall degenerates** (`20260804030000`): a seed with NO parking
   against a real requirement no longer ships a full-mass single-"unit"
   plan claiming 99%+ — it routes to the search core (real parking) or
   surfaces the search core's honest refusal.
2. **Unit-band integrity** (`20260804030000`): the parking-limited walk
   never leaves the hard average-unit band again (was reporting
   1,863–53,000 sqft "units"). Mass and capture stay; the shortfall reads
   loud (`parking_limited`, `pct_of_placed_need`, honest
   `stalls_required`). 2611 W Heiman: 24 illegal units → 29 @ ~1,542.
3. **Serve the better of the two** (`20260804033000`): "capture < 55 →
   search core" assumed the search core does better; parcel 320129
   disproved it (seed 48.5% vs search 11.6%). The branch now compares.

Also client-side: the legacy mapper can never crash on an object-shaped
`parking` again (Eric's 2026-08-04 console: a stale pre-#89 build threw in
`mfPlanToElements` and silently fell back to the worker's 43% corner plan —
current main renders 2611 W Heiman natively at 99.3%).

## Where the board stands against the 95% bar

- **Same-20 (draw sweep-2026-07-28), after fixes:** 10/20 ≥95 · 2 honest
  refusals (were fake 99.7%/100.1%) · 8 sub-95 plans.
- **Fresh-20 (draw sweep-2026-08-04):** 8/20 ≥95 · 2 refusals · 4 plans
  OVER 100% (107.6 / 104.5 / 103.9 / 101.7 — "over-105 extinct" is false)
  · every sub-95 seed verified stories = at_stories, i.e. **footprint
  deficit**, not program math.

## Remaining gap — all seed-core placement (engine lane)

1. **Footprint deficits**, worst on 1-story impervious-bound parcels:
   320129 places 64,668 of 133,300 sqft (48.5%) · 649608 101,846 of
   184,450 (55.2%) · 670172 92,076 of 162,750 (56.6%) · plus 72.6 / 78.4 /
   83.8 / 87.1 / 90.8 / 92.6 / 93.1 / 94.2. The bar packer leaves yard
   unclaimed the frontier says is legal.
2. **Under-parking at honest requirements** (unmasked by fix 2): 316458
   places 12 stalls vs 82 required · 680980 9 vs 69 · 411853 16 vs 75 ·
   684037 108 vs 218. The parking seed does not scale with the true
   program. (Its opposite also appears: 320129 172 vs 63.)
3. **`seed_unplaceable` / no-regime classes** → legacy fallback (multi-bar,
   63–79%) or refusal: 398460, 412421, 696525 (15 bars), 426535, 659666,
   597497, 679082, 597177.
4. **Frontier disagreement**: five over-100 captures up to 107.6%.
5. **Spine centerline under the bar** (~1,600 sqft) persists on most seed
   plans.

Rerun: `node scripts/qa-sweep/analyze.mjs <harvest.json> <outlines.json>
<outPrefix>` — see script header for harvest SQL.
