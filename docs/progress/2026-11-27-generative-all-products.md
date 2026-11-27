# Generative model on all three products (2026-11-27)

Owner, 2026-11-27: "We need all of these to be on a generative ai model. We can use the context / design guidance as well to help."

In every product the model proposes and a fixed rule or the engine's own ranking picks. A model plan is shown only when it wins.

## Neighborhoods (subdivision deep search)

- Street-layout model `g2` (trained 16 Nov on recorded Davidson County subdivisions) is promoted. The deep search asks it on every run and adds its layouts to the queue.
- Test on 28 cohort parcels, model arm against no-model arm; 24 finished:

| | Lots |
|---|---|
| Search without the model | 121 |
| Search with the model | 124 (2 parcels gained, none lower) |
| Model layouts alone (57 tries) | 105 |
| Fitted precedents alone (114 tries) | 112 |
| Rule patterns alone | 90 |

- Not asked on 5 parcels (no lot module from the first plan). 4 large parcels unfinished.
- The model overfits (about 855 training sites; validation loss rises after 1,000 steps). More measured plats is the lever.

## Townhomes

**Data.** `training.built_th_site`: 830 attached-home projects from `training.attached_project_metrics`, each with its outline, building rows (`public.buildings`) and homes per row. Dated by the median Metro parcel-established date of the unit parcels (`training.metro_parcel_attr`, RESIDENTIAL CONDO and ZERO LOT LINE). 377 built since 2010; 326 usable (2–60 buildings, 40 acres or less).

**Model.** `mfgen_1127a`: the site-plan model trained on SP plans, built apartments and the 326 built townhome projects (dataset `sp_built_th_1127`, 850 lines). Validation loss on held-back SP plans 2.024, against 2.195 for `mfgen_1126b`.

**Path.** `public.fn_th_ai_design(fid, mode)`:
1. asks the model for 6 proposals with the engine's best home count as the target;
2. `training.fn_thgen_opts` turns each into townhome engine options (frame the rows follow, where drives or the street enter along the frontage, cross bands, edge rows);
3. quick layouts for up to 18 options, full layout and evaluation for the best 2;
4. the engine's own ranking (`fn_th_v3_rank`) picks among its plans and the model's.

Settings in `training.ai_config 'th_ai_default'`.

**Result on the 50 townhome cohort parcels (mode sp, attached); 49 ran:**

| | |
|---|---|
| Parcels where the engine drew a plan | 39 |
| Parcels where a model option drew homes | 35 |
| Model plan picked | 6 |
| of those, more homes at the same code fails | 4 (+2, +2, +18, +4 homes) |
| of those, fewer homes but fewer code fails | 2 (79 → 47 and 200 → 177 homes) |
| Homes, engine only → with picks | 2,850 → 2,821 |
| Seconds per parcel | 25 average, 69 maximum |

No random-options control at equal tries has been run for townhomes yet.

**App.** After a townhome plan renders, the app runs `fn_th_ai_design` once per parcel per session through `engine-long` (v2). A new model pick redraws the plan.

## Apartments

Unchanged: `mfgen_1126b` proposals compete with the engine and podium plans (see the 26–27 Nov notes). `mfgen_1127a` has not been tested on apartments.

## Not done

- Zoning limits and planning principles as model inputs. Today the models take location, product, unit target and the buildable envelope.
- A random-options control for townhomes at equal tries.
- `mfgen_1127a` tested on the apartment review set.
