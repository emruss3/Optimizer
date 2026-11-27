Surface textures for the rendered site model. The sources are CC0. Images are
reduced to 512 px. Neutral base-color maps preserve the authored finish tint.
The normal maps use OpenGL convention. Roughness textures are data, not sRGB.

| File | Poly Haven asset |
|---|---|
| brick | red_brick_03 |
| asphalt | asphalt_02 |
| grass | sparse_grass |
| plaster | white_plaster_02 |
| shingle | grey_roof_01 |
| concrete | concrete_pavement |
| wood | oak_wood_planks |

The paved-block concrete above remains in the review view.
The Rendering view and shared-asset Cycles worker use these additional finishes:

| Files | Source | What the scan supplies |
|---|---|---|
| `cast-concrete*` | [Rough Concrete](https://polyhaven.com/a/rough_concrete), Poly Haven | Continuous aggregate without fake paver joints. Model geometry still supplies joints where they are actually drawn. |
| `lap-cladding*` | [Wood Siding 009](https://ambientcg.com/a/WoodSiding009), ambientCG | Horizontal lap and grain at a 6-inch course. Color and relief are softened as a painted-finish proxy. |

These derive from the 1K color, OpenGL normal and roughness downloads. Color is
desaturated and re-centered to preserve the model's finish colors, and roughness
is re-centered to the intended finish. The same packed maps, repeat dimensions,
strengths and hashes are locked in `src/features/site-plan/render3d/siteAssets.json`.
The shared renderer checks that lock. Run a v3 scene pack with the matching
renderer checkout. If you operate a hosted worker, release the app and worker
on the same catalog version.

`daylight.hdr` is a 1K derivative of [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) by Greg Zaal and Jarod Guest (CC0). The solar hotspot is capped. The app supplies the directional sun at the selected study time.

`/models/site/sedan.glb` and `/models/site/suv.glb` are from the [Innerscene sedan](https://www.innerscene.com/tools/library/3d-parts/sedan-car-42109739) and [Innerscene SUV](https://www.innerscene.com/tools/library/3d-parts/suv-dc972cab) models (CC0).
