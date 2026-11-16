# render4k: offline stills from the same scene the app draws

Final stills are path traced in Blender Cycles. The interactive view stays in
three.js. Both work from one scene: the app writes it out, the worker reads it.

## Units

Every number in `render-job.json` and `render-report.json` is in **feet**, in
the plan's local frame (east, north, up), or in pixels. The one exception is
`scene.glb`: the glTF format requires metres with y up, and the job file says
so. The worker converts once.

## Run

```sh
# 1. Write the scene (needs the app running in dev mode on :5199)
node scripts/render4k/export-job.cjs out/meharry 488278 "1710 Meharry Blvd" RM20

# 2. Check and render (pinned to Blender 4.5 LTS)
blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python scripts/render4k/render_job.py -- out/meharry/render-job.json

# without a Blender install: pip install bpy==4.5.* (Python 3.11), then
python scripts/render4k/render_job.py -- out/meharry/render-job.json --scale 0.25 --samples 48
```

Options after the job path: `--scale` (fraction of the job's resolution),
`--samples`, `--cameras street,drone`, `--check-only`, `--exr`.

## What the job file holds

| Field | Meaning |
| --- | --- |
| `site` | parcel, scheme and drawing revision |
| `quantities` | buildings, stories, units, stalls and gross area, as the scheme reports them |
| `glb` | file name, SHA-256 and size of the scene |
| `mesh_groups` | one entry per mesh: a stable id `owner__slot`, for example `building:mfgen-bldg-1__brick` |
| `bounds_ft`, `known` | the model's extent on three axes and the main building's top and spans |
| `cameras` | `street` and `drone`: position, target, focal length on a 36 mm wide sensor, lens shift, clipping, aspect, resolution |
| `lighting` | sun azimuth and altitude for the date and hour, exposure, seed |
| `planting` | every standing tree: position and crown radius |
| `anchors` | building corners and where each camera puts them at 1920 by 1080 in the browser |
| `omitted` | what the live view draws that this file does not carry yet |

## Checks before any pixel is rendered

The worker stops with a non-zero exit code when one fails.

1. The GLB's hash is the job's.
2. The mesh list is the job's.
3. The model's extent matches on east, north and up, within 0.05 ft. The three lengths differ, so a swapped or mirrored axis fails.
4. The main building's top and its east and north spans match, within 0.05 ft.
5. Each camera puts every anchor within 2 px of where the browser puts it at 1920 by 1080.

## Presets

| Preset | What it is |
| --- | --- |
| `gray-pass` | One gray material, a sun and a flat sky. Proves geometry, coordinates and cameras. |
| `daylight` | With the render kit: photographed materials, a photographed sky and scanned plants. Without it: simple built-in materials, a clear sky and stand-in trees. |

The job names its preset. `--preset` overrides it.

## The render kit

`assets.json` pins a kit of CC0 assets from Poly Haven. Nothing is committed:

```sh
python scripts/render4k/fetch_assets.py          # about 500 MB into out/assets
```

`out/assets/assets.lock.json` records what arrived. The worker uses the kit
when it is there (`--assets` names another folder).

| Part | What the worker does with it |
| --- | --- |
| Materials | Each slot (`brick`, `siding`, `plaster`, `asphalt`, `concrete`, `grass`, `shingle`) takes the photographed surface at its true size, in the colour the model painted. `tint` in the manifest says how much of that colour carries. |
| Sky | The photographed sky lights the scene. It is turned so its sun stands on the job's sun bearing. The report gives the sky's sun height beside the job's, so pick a date and hour that match it. |
| Plants | A scanned tree for each tree in `planting.trees`, sized to its crown radius, and a scanned shrub for each in `planting.shrubs`. The job's seed fixes which one and which way it faces. |

Slots with no photographed surface yet (`glass`, `paint`, `plain`, `panel`,
`railing`, `wood`) use the built-in materials. Cars are still the model's own
simple shapes: the kit has no car models.

## Cost on 4 CPU cores, no GPU

| Run | Size | Samples | Time |
| --- | --- | --- | --- |
| Gray pass, both cameras | 960 by 540 | 48 | 42 s |
| Daylight with the kit, both cameras | 960 by 540 | 64 | 2 min 44 s |
| Daylight with the kit, street only | 1920 by 1080 | 96 | about 5 min |

## Not yet

- No real car models.
- No CI smoke job yet.
- "Render 4K" is not wired into the app. The export hook is dev only.
