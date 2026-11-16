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
| `daylight` | A material for each slot, a clear sky, the sun for the job's date and hour, and a tree for each one in `planting.trees`. |

The job names its preset. `--preset` overrides it.

Material slots in the daylight preset: `brick` (modular brick with mortar joints),
`siding` (lap boards), `glass`, `asphalt`, `concrete`, `grass`, `shingle`,
`paint` (car bodies), `railing`. Any other slot takes the colour the model
painted on it. Each mesh is named `owner__slot`, so a slot can be given a
better material without touching the scene.

Trees are not in the GLB. The job lists where each stands and its crown
radius, and the worker grows it from one of five shapes. The job's seed fixes
which shape and which turn, so a revision renders the same trees every time.

## Cost on 4 CPU cores, no GPU

| Run | Size | Samples | Time |
| --- | --- | --- | --- |
| Gray pass, both cameras | 960 by 540 | 48 | 42 s |
| Daylight, both cameras | 960 by 540 | 64 | 1 min 43 s |

## Not yet

- Shrubs and hedges are not exported.
- No HDR sky file yet: the sky is Blender's own clear-sky model.
- No CI smoke job yet.
- "Render 4K" is not wired into the app. The export hook is dev only.
