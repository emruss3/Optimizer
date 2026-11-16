"""Render a render-job.json with Blender Cycles, headless.

    blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
        --python scripts/render4k/render_job.py -- out/meharry/render-job.json

Also runs under the `bpy` Python module (pinned: Blender 4.5 LTS):

    python scripts/render4k/render_job.py -- out/meharry/render-job.json --scale 0.25 --samples 32

The job file is in feet, in the plan's local frame (east, north, up). Blender
works in metres; this file converts once, here. The scene.glb beside the job
is in metres, y up, as the glTF format requires; Blender's importer turns it
to z up, which is the plan's frame again.

Before anything is rendered the scene is checked against the job: the file's
hash, the mesh list, the model's extent on all three axes, one known
dimension, and where each camera puts the job's anchor points. A failed check
stops the run with a non-zero exit code. Writes <camera>.png for each camera
and render-report.json (in feet and pixels) beside the job.
"""
import argparse
import hashlib
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

FT = 0.3048
PIN = (4, 5)
BOUNDS_TOL_FT = 0.05
PIXEL_TOL = 2.0          # at 1920 by 1080


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("job")
    p.add_argument("--scale", type=float, default=1.0, help="fraction of the job's resolution (a smoke run uses 0.125)")
    p.add_argument("--samples", type=int, default=256)
    p.add_argument("--cameras", default="", help="comma list of camera ids; default all")
    p.add_argument("--check-only", action="store_true", help="run the checks, render nothing")
    p.add_argument("--exr", action="store_true", help="also write a 32-bit EXR master")
    p.add_argument("--allow-version", action="store_true", help="run on a Blender other than the pinned 4.5 LTS")
    return p.parse_args(argv)


def m(v_ft):
    return Vector((v_ft[0] * FT, v_ft[1] * FT, v_ft[2] * FT))


def load_scene(job, job_dir, failures):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    glb = os.path.join(job_dir, job["glb"]["file"])
    with open(glb, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != job["glb"]["sha256"]:
        failures.append(f"scene.glb hash {digest[:12]} is not the job's {job['glb']['sha256'][:12]}")
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = {o.get("id") or o.name: o for o in bpy.context.scene.objects if o.type == "MESH"}
    want = {g["id"] for g in job["mesh_groups"]}
    missing, extra = sorted(want - set(meshes)), sorted(set(meshes) - want)
    if missing or extra:
        failures.append(f"mesh list differs: missing {missing[:5]}, unexpected {extra[:5]}")
    return meshes


def world_bounds(objs):
    lo, hi = Vector((1e30,) * 3), Vector((-1e30,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def check_geometry(job, meshes, report, failures):
    lo, hi = world_bounds(meshes.values())
    got = {"min": [round(v / FT, 3) for v in lo], "max": [round(v / FT, 3) for v in hi]}
    got["size"] = [round(got["max"][i] - got["min"][i], 3) for i in range(3)]
    want = job["bounds_ft"]
    worst = max(abs(got[k][i] - want[k][i]) for k in ("min", "max") for i in range(3))
    report["bounds_ft"] = {"job": want, "blender": got, "worst_difference_ft": round(worst, 4), "axes": ["east", "north", "up"]}
    if worst > BOUNDS_TOL_FT:
        failures.append(f"model extent differs from the job by {worst:.3f} ft")
    known = job.get("known")
    if known:
        own = [o for k, o in meshes.items() if k.startswith(known["mesh_prefix"])]
        if not own:
            failures.append(f"no mesh for {known['mesh_prefix']}")
        else:
            klo, khi = world_bounds(own)
            got = [round(khi.z / FT, 3), round((khi.x - klo.x) / FT, 3), round((khi.y - klo.y) / FT, 3)]
            want = [known["top_ft"], known["span_ft"][0], known["span_ft"][1]]
            report["known_dimensions"] = {"what": f"building {known['id']}: top, extent east, extent north", "job_ft": want, "blender_ft": got}
            if max(abs(a - b) for a, b in zip(got, want)) > BOUNDS_TOL_FT:
                failures.append(f"building {known['id']} measures {got} ft in Blender, {want} ft in the job")

def make_camera(spec):
    data = bpy.data.cameras.new(spec["id"])
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = spec["sensor_width_mm"]
    data.lens = spec["focal_length_mm"]
    data.shift_x = 0.0
    data.shift_y = spec["shift_y"]
    data.clip_start = spec["clip_ft"][0] * FT
    data.clip_end = spec["clip_ft"][1] * FT
    cam = bpy.data.objects.new(spec["id"], data)
    bpy.context.scene.collection.objects.link(cam)
    pos, target = m(spec["position_ft"]), m(spec["target_ft"])
    cam.location = pos
    cam.rotation_euler = (target - pos).to_track_quat("-Z", "Y").to_euler()
    return cam


def check_anchors(job, cams, report, failures):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1920, 1080, 100
    bpy.context.view_layer.update()
    out = {}
    for cid, cam in cams.items():
        worst, rows = 0.0, []
        for a in job["anchors"]:
            exp = a["expected_px"].get(cid)
            if exp is None:
                continue
            ndc = world_to_camera_view(scene, cam, m(a["position_ft"]))
            px = [ndc.x * 1920, (1 - ndc.y) * 1080]
            err = math.hypot(px[0] - exp[0], px[1] - exp[1])
            worst = max(worst, err)
            rows.append({"id": a["id"], "browser_px": exp, "blender_px": [round(px[0], 2), round(px[1], 2)], "error_px": round(err, 3)})
        out[cid] = {"points": len(rows), "worst_error_px": round(worst, 3), "tolerance_px": PIXEL_TOL, "rows": rows}
        if worst > PIXEL_TOL:
            failures.append(f"camera {cid}: an anchor lands {worst:.2f} px from where the browser puts it")
    report["camera_parity_at_1920x1080"] = out


def gray_pass(job, meshes):
    scene = bpy.context.scene
    gray = bpy.data.materials.new("gray")
    gray.use_nodes = True
    bsdf = gray.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.62, 0.62, 0.62, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    bpy.context.view_layer.material_override = gray

    light = job["lighting"]
    az, alt = math.radians(light["sun_azimuth_deg"]), math.radians(light["sun_altitude_deg"])
    to_sun = Vector((math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)))
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4.0
    sun.angle = math.radians(0.53)
    sun_obj = bpy.data.objects.new("sun", sun)
    sun_obj.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun_obj)

    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.78, 0.84, 0.92, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world


def setup_cycles(job, args):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    c = scene.cycles
    c.device = "CPU"
    c.samples = args.samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.01
    c.adaptive_min_samples = min(32, args.samples)
    c.use_denoising = True
    try:
        c.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        c.use_denoising = False
    c.seed = int(job["lighting"].get("seed", 1))
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = float(job["lighting"].get("exposure_ev", 0))
    scene.render.film_transparent = False


def render(job, cams, job_dir, args, report):
    scene = bpy.context.scene
    images = {}
    for cid, cam in cams.items():
        spec = next(c for c in job["cameras"] if c["id"] == cid)
        w, h = (max(16, int(round(v * args.scale))) for v in spec["resolution"])
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = w, h, 100
        scene.camera = cam
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGB"
        scene.render.image_settings.color_depth = "16"
        scene.render.filepath = os.path.join(job_dir, f"{cid}.png")
        bpy.ops.render.render(write_still=True)
        images[cid] = {"file": f"{cid}.png", "width": w, "height": h, "samples": args.samples}
        if args.exr:
            scene.render.image_settings.file_format = "OPEN_EXR"
            scene.render.image_settings.color_depth = "32"
            bpy.data.images["Render Result"].save_render(os.path.join(job_dir, f"{cid}.exr"))
            images[cid]["master"] = f"{cid}.exr"
    report["images"] = images


def main():
    args = parse_args()
    if bpy.app.version[:2] != PIN and not args.allow_version:
        print(f"render4k: needs Blender {PIN[0]}.{PIN[1]} LTS, this is {bpy.app.version_string}", file=sys.stderr)
        sys.exit(1)
    with open(args.job) as f:
        job = json.load(f)
    if job.get("schema_version") != 1 or job.get("units") != "ft":
        print("render4k: unknown job schema or units", file=sys.stderr)
        sys.exit(1)
    job_dir = os.path.dirname(os.path.abspath(args.job))
    failures = []
    report = {"schema_version": 1, "units": "ft", "blender": bpy.app.version_string, "site": job["site"], "glb_sha256": job["glb"]["sha256"], "preset": job["renderer"]["preset"]}

    meshes = load_scene(job, job_dir, failures)
    check_geometry(job, meshes, report, failures)
    only = [c for c in args.cameras.split(",") if c]
    cams = {c["id"]: make_camera(c) for c in job["cameras"] if not only or c["id"] in only}
    check_anchors(job, cams, report, failures)
    report["checks_passed"] = not failures
    report["failures"] = failures

    if not failures and not args.check_only:
        gray_pass(job, meshes)
        setup_cycles(job, args)
        render(job, cams, job_dir, args, report)

    with open(os.path.join(job_dir, "render-report.json"), "w") as f:
        json.dump(report, f, indent=2)
        f.write("\n")
    for line in failures:
        print("render4k: FAILED:", line, file=sys.stderr)
    print("render4k:", "checks passed" if not failures else f"{len(failures)} check(s) failed", "-", os.path.join(job_dir, "render-report.json"))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
