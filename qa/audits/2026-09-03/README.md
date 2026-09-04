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
- `subdivision_sweep_v1_2.csv` — the same population re-run through
  generator v1.2 (§12: streets stop at the greenway unless through-access is
  read; assumed access enters from the end with the least crossing; paired
  courts). Adds the greenway crossing taken and declined (ft), the developable
  land left unserved (sqft), the served length, and whether the plan stops at
  a greenway / picked its end on an assumption. Source table:
  `public.subdivision_sweep`; the v1.1 rows are kept in
  `public.subdivision_sweep_v1_1` for the A/B — a scratch snapshot made by
  hand (`create table … as select * from subdivision_sweep` before the
  re-run), not a migration; drop it when the comparison is no longer needed.
- `mdha_subdivision_v1_2_greenway_stop_screen.png` — 2400 W Heiman on v1.2:
  the spine enters from the 2518 W Heiman end, takes a 102-ft stream culvert
  and ends in a cul-de-sac at the AE floodplain (271-ft crossing declined);
  34 lots, 4 paired courts, 20.0% ROW. The v1 and v1.1 renders live in
  `../2026-09-02/`.
- `heiman_2600_mf_legibility_screen.png` — 2600 W Heiman (RM40, 553450)
  after §13: the "what is being built" headline above the plan, the building
  named by stories and units, parking bays labelled in stalls, the floor
  plate drawn as a double-loaded plan, the dev census line collapsed.
  Fixture mode (the committed 553450 response: 70 units on 4 stories).
