# Built apartment layouts, Davidson County (26 Nov 2026)

`training.built_mf_site`: every parcel coded APARTMENT by the assessor, with its building footprints
(`public.buildings` via `building_parcel_join`) measured against the parcel and its streets (`fn_parcel_frontage` v2),
filled by `training.fn_built_mf_measure`. `angle_to_street`: 90 = long side parallel to the street, 0 = perpendicular.
`arch.py` sorts each site into a layout type; `summary.json` holds the medians shown on the "Built apartment patterns" page.
Buildings only: no parking, drives, year built or unit counts in this data.
