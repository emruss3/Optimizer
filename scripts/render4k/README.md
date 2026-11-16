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
| `site`, `scheme_sha256` | Parcel, scheme, drawing revision and hash of the layout and schedule. |
| `appearance` | Exterior style, renderer build, asset catalog and appearance hashes. |
| `quantities` | buildings, stories, units, stalls and gross area, as the scheme reports them |
| `glb` | file name, SHA-256 and size of the scene |
| `mesh_groups` | one entry per mesh: a stable id `owner__slot`, for example `building:mfgen-bldg-1__brick` |
| `bounds_ft`, `known` | the model's extent on three axes and the main building's top and spans |
| `cameras` | Street, aerial and entry when available. Position, target, focal length on a 36 mm wide sensor, lens shift, clipping, aspect and resolution. |
| `lighting` | sun azimuth and altitude for the date and hour, exposure, seed |
| `planting` | Tree and shrub IDs, positions, crown radii and the foreground assets included in the GLB. |
| `terrain` | the ground: survey source, zero elevation, grading assumed, each building's pad |
| `anchors` | building corners and where each camera puts them at 1920 by 1080 in the browser |
| `omitted` | what the live view draws that this file does not carry yet |

## The ground

Where the parcel has surveyed elevations (USGS 3DEP, a 20 ft grid over the
parcel and a 100 ft margin, NAVD88 feet), the scene stands on them. The job's
`terrain` block records the source, the elevation of the frame's zero height,
and what was assumed:

- **Existing ground** is the survey's own, interpolated. Past the surveyed
  margin there are no elevations: the edge is held and eased to one level.
- **Graded ground** is an assumption of the picture, not a grading plan. The
  paved area and the buildings stand on one even surface fitted to the existing
  ground, no steeper than 4%. Each building's pad is level on it. The graded
  ground meets the existing ground over 39 ft round the work. The block lists
  the slope before and after and the deepest cut and fill this implies.
- Roads, walks, lawns and kerbs are laid over the ground on one shared lattice,
  so a layer an inch above another stays an inch above it. Buildings and cars
  are raised whole. Trees, shrubs and the street camera stand on the ground.

A parcel with no survey renders on flat ground and `terrain` is null.

The grading lives in the shared model (`render3d/terrain`, `gradeSite`), so the
live 3D view stands on the same graded ground and the same pads. The live viewer and exports use the same 6 m lattice. The approach meshes
connect door and garage thresholds to the pavement and cut through the lawn
where the adjacent ground sits above those connections.

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
| `daylight` | Shared photographed materials and daylight HDR, with the foreground foliage and vehicle meshes from the viewer. The supplemental offline kit can supply additional distant foliage and lawn detail. |

The job names its preset. `--preset` overrides it.

## The render kit

`assets.json` pins a kit of CC0 assets from Poly Haven. Nothing is committed:

```sh
python scripts/render4k/fetch_assets.py          # about 500 MB into out/assets
```

`out/assets/assets.lock.json` records what arrived. The command-line renderer can use the kit when present. Pass `--assets` to
point to another folder. The hosted worker uses the checked-in, hash-pinned
viewer assets. The GLB carries the foreground foliage textures and detailed
vehicle meshes used in the full browser tier.

| Part | What the worker does with it |
| --- | --- |
| Materials | Each slot (`brick`, `siding`, `plaster`, `asphalt`, `concrete`, `grass`, `shingle`) takes the photographed surface at its true size, in the colour the model painted. `tint` in the manifest says how much of that colour carries. |
| Sky | The photographed sky lights the scene. It is turned so its sun stands on the job's sun bearing. The report gives the sky's sun height beside the job's, so pick a date and hour that match it. |
| Lawn | Scanned grass on the lawns within about 90 ft of a camera that stands on the ground, and only where no road, walk or building lies over it. Farther out the photographed lawn surface carries on alone. |
| Plants | A scanned tree for each tree in `planting.trees`, sized to its crown radius, and a scanned shrub for each in `planting.shrubs`. The job's seed fixes which one and which way it faces. |

Unmapped slots use the worker materials. Large parking scenes may use the
viewer’s simplified vehicle geometry to stay within its geometry budget.

## Cost on 4 CPU cores, no GPU

| Run | Size | Samples | Time |
| --- | --- | --- | --- |
| Gray pass, both cameras | 960 by 540 | 48 | 42 s |
| Daylight with the kit, both cameras | 960 by 540 | 64 | 2 min 44 s |
| Daylight with the kit and lawn, street only | 1920 by 1080 | 96 | 6 min 44 s |
| The same on graded ground | 1920 by 1080 | 12 | 2 min 21 s |
| The same on graded ground | 3840 by 2160 | 160 | 39 min |

Of the 12-sample run, about 20 s is loading and checking the scene, 50 s is
building the kit, lawn and plants, 20 s is the ray tracer's own preparation and
50 s is tracing. On this hardware no setting brings a still under two minutes.

## Run the workspace render service

Open **3D Massing → Rendering → Render 4K**. The workspace can always download
a scene ZIP with a manifest, GLB and Blender command. A configured worker adds
the render request, queue status, retry and authenticated file downloads. Results
keep the source revision and the same appearance, camera, lighting and asset
settings. A repeat request by the same account reuses its existing job.

Run Node 22.13 or newer with the project's dependencies on the render host.
Use a dedicated 4.5 LTS Blender install with an explicit patch version and
a persistent local volume for the queue and render files. Route the worker
through HTTPS and allow the app origin in the worker configuration.

```sh
export RENDER_APP_ORIGINS=https://optimizer-omega-three.vercel.app
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
export BLENDER_BIN=/opt/blender/blender
export BLENDER_VERSION=4.5.0
export RENDER_DRIVER_VERSION=YOUR_GPU_DRIVER_VERSION
export RENDER_DEVICE=OPTIX
export RENDER_DATA_DIR=/var/lib/parcel-proforma/render4k
node scripts/render4k/serve.mjs
```

Set `BLENDER_VERSION` to the patch installed on the host. Start the worker
as an unprivileged account with writes to the render volume and access to the
GPU. The sample configuration binds to loopback on port 8787. Set
`VITE_RENDER_SERVICE_URL` to the worker's HTTPS URL on the frontend. Point
the reverse proxy at the listener and permit up to 140 MiB per upload. The
worker checks the caller with Supabase Auth. Saved plans are checked through
the caller's row-level access. Unsaved schemes are stored under the requesting
account. The worker needs only the publishable or anon key.

A single worker processes one Blender job at a time. The default queue
holds 20 active jobs, with at most three per account, and the worker kills a
job after 30 minutes. Set `RENDER_MAX_QUEUE`, `RENDER_TIMEOUT_SECONDS` and
`RENDER_MAX_STORED_JOBS` for the volume and GPU. Completed renders and their
inputs stay on the volume. Reserve capacity for both before raising the
storage limit. Set `RENDER_EXR=1` to retain half-float linear masters.
`RENDER_SAMPLES` defaults to 256 and `RENDER_THREADS` to the host's
automatic CPU setting. The report records import and checks, scene preparation
and render time by view. A changed worker, driver, asset set or render setting
is included in the cache key.

`RENDER_TEST_MODE=1` is a loopback-only option for 480 × 270 integration
proofs. It permits a local auth stub and an explicitly pinned Blender 4.x
test install. The regular service renders 3840 × 2160 in both GPU and CPU mode.
