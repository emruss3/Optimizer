# Regrid built-form context v2

`planner_context_v2` turns Regrid parcel use and building geometry into explicit, versioned solver inputs. It replaces the previous approach where single-family and multifamily requests on the same parcel could reuse the same zoning-only comparison set.

## Source data

The resolver uses:

- `public.parcels.usecode` and `public.parcels.usedesc` to classify observed parcel use.
- `public.parcels.zoning_subtype`, lot area, and projected centroid for local matching.
- `public.building_parcel_join` for the authoritative parcel/building relationship.
- `public.buildings.geom`, footprint area, stories, gross area, and largest-building indicator.

It does not infer a building type from footprint shape alone.

## Selection hierarchy

For the requested planner typology, `fn_local_built_form_v2` selects the first comparison tier with enough evidence:

1. Exact use class and same zoning subtype.
2. Exact use class across nearby zoning subtypes.
3. Compatible use class and same zoning subtype.
4. Compatible use class across nearby zoning subtypes.
5. Same zoning subtype without a reliable use match.
6. All nearby buildings as the final fallback.

Each tier tests progressively wider subject-lot bands. The returned context records the chosen tier, lot band, sample size, confidence, use-class mix, source use descriptions, and fallback flags. Up to 100 deterministic closest/lot-similar building geometries are normalized for dimensional distributions.

## Geometry and program signals

The solver brief now receives distributions for:

- Largest building footprint
- Total parcel building footprint
- Building count per parcel
- Parcel coverage
- Stories
- Oriented building length
- Oriented building depth
- Aspect ratio
- Compactness
- Gross building area
- Up to 50 precedent parcel IDs for lineage

## Decisions that consume the context

The production multifamily generator uses Regrid evidence to choose or score:

- Building-bar depth from local median depth, with constructability clamps
- Building-bar length from local 75th-percentile length
- Floor count from local median-to-75th-percentile stories, capped by legal height and FAR
- Precedent fit from footprint, parcel coverage, and stories
- Candidate precedent lineage persisted with the generated scheme

The client worker already consumes the same context snapshot's footprint and story priors for its fallback layout initialization and floor cap.

Generator lineage is recorded as:

```text
context_version: planner_context_v2
generator_version: mf_context_v2_regrid_typology_v1
score_version: context_score_v2
```

## Verified decision sensitivity

On parcel `669046`, the same location now produces different context for different requested uses:

| Signal | Single-family context | Multifamily context |
|---|---:|---:|
| Exact type sample | 67 | 5 |
| Median footprint | 1,435 SF | 7,536 SF |
| Median depth | 31.1 ft | 99.8 ft |
| 75th-percentile length | 62.2 ft | 163.7 ft |
| Median stories | 1 | 2 |

An A/B database test changes only the context priors while holding parcel, seed, pins, zoning, and generator constant. The resulting bar count, floor count, and total footprint change, proving that context values affect geometry rather than only UI copy.

## Performance

Measured live execution after optimization:

- Multifamily sample on parcel `669046`: approximately 0.16 seconds
- Larger single-family sample on parcel `667899`: approximately 1.7 seconds

The browser caches an in-flight context compile by parcel, selected use, and normalized user intent. Identical server compiles are also hash- and ID-stable.

## Limitations

- Road frontage remains a disclosed placeholder, so absolute Regrid building orientation is not yet used to place site access or rotate buildings relative to a verified road edge.
- `internal_program_fit` is still the existing unmodeled fallback and must be replaced by the owned/open program-prior work.
- Sparse typologies may require a compatible-use or cross-zoning fallback; the solver brief exposes that reduction in confidence.
- Regrid evidence is a local prior, not a legal rule. Zoning, physical constraints, and hard geometry validation remain authoritative.
