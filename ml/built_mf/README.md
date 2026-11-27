# Built apartment layouts, Davidson County (26 Nov 2026)

`training.built_mf_site`: every parcel coded APARTMENT by the assessor, with its building footprints
(`public.buildings` via `building_parcel_join`) measured against the parcel and its streets (`fn_parcel_frontage` v2),
filled by `training.fn_built_mf_measure`. `angle_to_street`: 90 = long side parallel to the street, 0 = perpendicular.
`arch.py` sorts each site into a layout type; `summary.json` holds the medians shown on the "Built apartment patterns" page.
Buildings only: no parking, drives, year built or unit counts in this data.

## Built since 2010 (26 Nov 2026)
`training.built_mf_site.built_since_2010` / `dating`. Metro orthoimagery 2010 vs 2026 through the `imagery-sample` edge function
(`training.fn_built_mf_imagery`, `training.fn_built_mf_thumbs`). 549 sites checked by eye on side-by-side images (`dense.py` sheets,
`lab.py` labels); 416 screened as older (parcel established before 2005, improvement value < $170/sf, small 2010-vs-2026 colour change).
285 sites built since 2010. `bands_era.json`: layouts, stories, FAR, cover and inferred parking by location, 2010-on vs before.
Pixel colour alone did not separate new from old (towers, re-roofs, leaf-off trees), so the dating is by eye.
