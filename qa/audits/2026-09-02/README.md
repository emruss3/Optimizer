# Optimization audit record — 2026-09-02

Companion data for `docs/OPTIMIZATION_AUDIT_2026-09-02.md` (Eric: "make sure
we're truly optimizing", benchmarked against two architect concept sheets for
the MDHA property at 2400 W Heiman St, ogc_fid 550510).

- `mdha_2400_w_heiman_our_lotfit.png` — our as-of-right lot fit on the MDHA
  parcel: 80 full-width strips (330 x 21 ft), negative buildable depth on all
  80. The architect's sheets show 102 / 69 lots on a 55-ft ROW with alleys.
- `mdha_2400_w_heiman_lotfit_payload.json` — the fn_generate_sf_site_plan
  payload + parcel outline (4326) behind that render.
- `mdha_subdivision_screen.png` (2026-09-03) — the same parcel drawn by
  `fn_generate_subdivision`: one 55-ft through-street on the long axis,
  double-loaded 80 x 75 lots with 20-ft rear alleys, 4 courts, 52 lots at R6
  (163 at the 25-ft SP scheme; 148 with a 10% amenity at the head). The
  pattern panel now says "generator follows this". Audit doc §9.
- `ten_parcel_prefix_rows.json` — the nine multifamily audit parcels BEFORE
  the fixes: frontier vs independent structured-parking ceiling vs seed vs
  deep search.
- `ten_parcel_postfix_rows.json` — the same after the two live migrations
  (ordinance -A fallback; advisory podium ceiling), plus the two floor parcels
  proving the frontier is byte-identical where nothing should have moved.
