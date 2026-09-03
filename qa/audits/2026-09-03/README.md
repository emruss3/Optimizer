# Subdivision sweep record — 2026-09-03

Companion data for `docs/OPTIMIZATION_AUDIT_2026-09-02.md` §10–§11 (Eric:
"Everything we do needs to help train decision making for multiple parcels,
not just a one off solve").

- `subdivision_sweep_v1_1.csv` — every eligible single-family /
  agricultural-residential parcel (4,111; land ≥ max(2 ac, 9 × district
  minimum lot), AR2a ≤ 100 ac) run through `fn_generate_subdivision` v1.1
  with FEMA floodplain and NWI wetlands held out: outline metrics (OBB,
  fill ratio), network, streets, lots, lot dimensions, buildable depth,
  courts, land split (ROW / alleys / lots / residual / hazard), gross
  density, access reading, refusal reason. Numbers only — the geometry is
  regenerated on demand. Source table: `public.subdivision_sweep`
  (re-runnable in batches via `fn_subdivision_sweep_next`).
- The MDHA v1.1 render lives beside the v1 one in `../2026-09-02/`
  (`mdha_subdivision_v1_1_hazards_screen.png`).
