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
    p.add_argument("--preset", default="", choices=["", "gray-pass", "daylight"], help="default: the job's own")
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


# ---------------------------------------------------------------------------
# Daylight preset: a material for each slot, a sun and a sky.
# Sizes inside the materials are in metres, Blender's unit; none is reported.

def _nodes(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    return mat, nt, nt.nodes.get("Principled BSDF")


def _tint(nt):
    """The colour the model painted on the piece."""
    n = nt.nodes.new("ShaderNodeVertexColor")
    n.layer_name = "Color"
    return n.outputs["Color"]


def _wall_coords(nt, scale_u=1.0, scale_v=1.0):
    """Coordinates that run along a wall and up it, whatever way the wall faces."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    tangent = nt.nodes.new("ShaderNodeVectorMath"); tangent.operation = "CROSS_PRODUCT"
    tangent.inputs[0].default_value = (0, 0, 1)
    nt.links.new(geo.outputs["Normal"], tangent.inputs[1])
    along = nt.nodes.new("ShaderNodeVectorMath"); along.operation = "DOT_PRODUCT"
    nt.links.new(geo.outputs["Position"], along.inputs[0])
    nt.links.new(tangent.outputs["Vector"], along.inputs[1])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    u = nt.nodes.new("ShaderNodeMath"); u.operation = "MULTIPLY"; u.inputs[1].default_value = scale_u
    v = nt.nodes.new("ShaderNodeMath"); v.operation = "MULTIPLY"; v.inputs[1].default_value = scale_v
    nt.links.new(along.outputs["Value"], u.inputs[0])
    nt.links.new(sep.outputs["Z"], v.inputs[0])
    nt.links.new(u.outputs[0], comb.inputs["X"])
    nt.links.new(v.outputs[0], comb.inputs["Y"])
    return comb.outputs[0]


def _mix(nt, a, b, fac):
    n = nt.nodes.new("ShaderNodeMix"); n.data_type = "RGBA"; n.blend_type = "MULTIPLY"
    n.inputs["Factor"].default_value = fac
    nt.links.new(a, n.inputs["A"])
    if isinstance(b, tuple):
        n.inputs["B"].default_value = b
    else:
        nt.links.new(b, n.inputs["B"])
    return n.outputs["Result"]


def _bump(nt, bsdf, height, strength, distance=0.01):
    n = nt.nodes.new("ShaderNodeBump")
    n.inputs["Strength"].default_value = strength
    n.inputs["Distance"].default_value = distance
    nt.links.new(height, n.inputs["Height"])
    nt.links.new(n.outputs["Normal"], bsdf.inputs["Normal"])


def _noise(nt, scale, detail=6.0):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nt.links.new(geo.outputs["Position"], n.inputs["Vector"])
    return n


def slot_material(slot):
    mat, nt, bsdf = _nodes(f"slot:{slot}")
    tint = _tint(nt)
    link = nt.links.new
    if slot == "brick":
        # a modular brick, 8 by 2 1/4 inches with a 3/8 inch joint
        tex = nt.nodes.new("ShaderNodeTexBrick")
        link(_wall_coords(nt), tex.inputs["Vector"])
        tex.inputs["Scale"].default_value = 1.0
        tex.inputs["Brick Width"].default_value = 0.2125
        tex.inputs["Row Height"].default_value = 0.0667
        tex.inputs["Mortar Size"].default_value = 0.0095
        tex.inputs["Mortar Smooth"].default_value = 0.2
        tex.inputs["Bias"].default_value = -0.2
        tex.inputs["Color1"].default_value = (0.62, 0.5, 0.46, 1)
        tex.inputs["Color2"].default_value = (0.44, 0.33, 0.3, 1)
        tex.inputs["Mortar"].default_value = (0.95, 0.93, 0.9, 1)
        tex.offset = 0.5
        link(_mix(nt, tint, tex.outputs["Color"], 1.0), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.88
        inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
        link(tex.outputs["Fac"], inv.inputs[1])
        _bump(nt, bsdf, inv.outputs[0], 0.9, 0.006)
    elif slot == "siding":
        # lap siding, 6 inch exposure
        wave = nt.nodes.new("ShaderNodeMath"); wave.operation = "FRACT"
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        link(_wall_coords(nt, 1.0, 1 / 0.1524), sep.inputs[0])
        link(sep.outputs["Y"], wave.inputs[0])
        link(tint, bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.6
        _bump(nt, bsdf, wave.outputs[0], 1.0, 0.012)
    elif slot == "glass":
        bsdf.inputs["Base Color"].default_value = (0.012, 0.018, 0.024, 1)
        bsdf.inputs["Roughness"].default_value = 0.02
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["IOR"].default_value = 1.52
        bsdf.inputs["Coat Weight"].default_value = 1.0
        bsdf.inputs["Coat Roughness"].default_value = 0.0
        bsdf.inputs["Specular IOR Level"].default_value = 1.0
    elif slot == "asphalt":
        fine, broad = _noise(nt, 40.0), _noise(nt, 0.35, 3.0)
        link(_mix(nt, _mix(nt, tint, broad.outputs["Fac"], 0.35), fine.outputs["Fac"], 0.25), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.92
        _bump(nt, bsdf, fine.outputs["Fac"], 0.25, 0.004)
    elif slot == "concrete":
        fine, broad = _noise(nt, 18.0), _noise(nt, 0.6, 3.0)
        link(_mix(nt, _mix(nt, tint, broad.outputs["Fac"], 0.2), fine.outputs["Fac"], 0.12), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.8
        _bump(nt, bsdf, fine.outputs["Fac"], 0.15, 0.003)
    elif slot == "grass":
        fine, broad = _noise(nt, 25.0, 8.0), _noise(nt, 0.25, 4.0)
        link(_mix(nt, _mix(nt, tint, broad.outputs["Fac"], 0.5), fine.outputs["Fac"], 0.45), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.95
        _bump(nt, bsdf, fine.outputs["Fac"], 0.6, 0.03)
    elif slot == "shingle":
        wave = nt.nodes.new("ShaderNodeMath"); wave.operation = "FRACT"
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        link(_wall_coords(nt, 1.0, 1 / 0.14), sep.inputs[0])
        link(sep.outputs["Y"], wave.inputs[0])
        fine = _noise(nt, 30.0)
        link(_mix(nt, tint, fine.outputs["Fac"], 0.35), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.9
        _bump(nt, bsdf, wave.outputs[0], 0.8, 0.01)
    elif slot == "paint":
        link(tint, bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.35
        bsdf.inputs["Metallic"].default_value = 0.4
        bsdf.inputs["Coat Weight"].default_value = 1.0
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    elif slot in ("railing", "metal"):
        link(tint, bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.4
        bsdf.inputs["Metallic"].default_value = 0.8
    else:
        link(tint, bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.75
    return mat


def grow_trees(job):
    """A tree for each one in the job: a trunk and a crown of leaf clumps.

    Seeded by the job, so a tree is the same tree in every render of a revision.
    """
    import random
    trees = job.get("planting", {}).get("trees", [])
    if not trees:
        return 0
    rng = random.Random(int(job["lighting"].get("seed", 1)))
    bark, nt, bsdf = _nodes("tree:bark")
    bsdf.inputs["Base Color"].default_value = (0.09, 0.065, 0.045, 1)
    bsdf.inputs["Roughness"].default_value = 0.95
    leaf, nt, bsdf = _nodes("tree:leaf")
    fine, broad = _noise(nt, 3.0, 8.0), _noise(nt, 0.4, 2.0)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.035, 0.085, 0.02, 1)
    ramp.color_ramp.elements[1].color = (0.13, 0.22, 0.05, 1)
    mixn = nt.nodes.new("ShaderNodeMath"); mixn.operation = "ADD"; mixn.use_clamp = True
    half = nt.nodes.new("ShaderNodeMath"); half.operation = "MULTIPLY"; half.inputs[1].default_value = 0.5
    nt.links.new(fine.outputs["Fac"], half.inputs[0])
    nt.links.new(half.outputs[0], mixn.inputs[0])
    half2 = nt.nodes.new("ShaderNodeMath"); half2.operation = "MULTIPLY"; half2.inputs[1].default_value = 0.5
    nt.links.new(broad.outputs["Fac"], half2.inputs[0])
    nt.links.new(half2.outputs[0], mixn.inputs[1])
    nt.links.new(mixn.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Subsurface Weight"].default_value = 0.0
    _bump(nt, bsdf, fine.outputs["Fac"], 1.0, 0.25)

    # a few tree shapes at a crown radius of one metre; every tree in the job is one of them, scaled and turned
    import bmesh
    from mathutils import noise, Matrix
    variants = []
    for v in range(5):
        bm = bmesh.new()
        height = rng.uniform(2.3, 2.9)
        clear = height - 1.75
        made = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.085, radius2=0.04, depth=clear + 0.6,
                                     matrix=Matrix.Translation((0, 0, (clear + 0.6) / 2)))
        trunk_faces = {f for vert in made["verts"] for f in vert.link_faces}
        for k in range(7):
            ang, rad = rng.uniform(0, math.tau), (0 if k == 0 else rng.uniform(0.0, 0.55))
            centre = Vector((rad * math.cos(ang), rad * math.sin(ang), clear + rng.uniform(0.75, 1.35) * (1.25 if k == 0 else 1)))
            size, squash = rng.uniform(0.5, 0.72), rng.uniform(0.72, 0.9)
            ball = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=size, matrix=Matrix.Translation(centre) @ Matrix.Diagonal((1, 1, squash, 1)))
            for vert in ball["verts"]:
                out = (vert.co - centre).normalized()
                vert.co += out * size * 0.42 * noise.noise(vert.co * 2.2 + Vector((v * 7.0, k * 3.0, 0)))
        mesh = bpy.data.meshes.new(f"tree:shape{v}")
        mesh.materials.append(bark)
        mesh.materials.append(leaf)
        for f in bm.faces:
            f.material_index = 0 if f in trunk_faces else 1
            f.smooth = f not in trunk_faces
        bm.to_mesh(mesh)
        bm.free()
        variants.append(mesh)

    coll = bpy.data.collections.new("planting")
    bpy.context.scene.collection.children.link(coll)
    for t in trees:
        r = max(1.2, t["crown_radius_ft"] * FT)
        obj = bpy.data.objects.new(t["id"], rng.choice(variants))
        obj.location = (t["position_ft"][0] * FT, t["position_ft"][1] * FT, 0)
        obj.scale = (r, r, r * rng.uniform(0.92, 1.08))
        obj.rotation_euler = (0, 0, rng.uniform(0, math.tau))
        coll.objects.link(obj)
    return len(trees)


def daylight_pass(job, meshes):
    scene = bpy.context.scene
    made = {}
    for obj in meshes.values():
        slot = obj.get("slot") or obj.name.rsplit("__", 1)[-1]
        if slot not in made:
            made[slot] = slot_material(slot)
        obj.data.materials.clear()
        obj.data.materials.append(made[slot])

    light = job["lighting"]
    az, alt = math.radians(light["sun_azimuth_deg"]), math.radians(light["sun_altitude_deg"])
    to_sun = Vector((math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)))
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 5.5
    sun.color = (1.0, 0.96, 0.9)
    sun.angle = math.radians(0.53)
    sun_obj = bpy.data.objects.new("sun", sun)
    sun_obj.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun_obj)

    # a clear sky without its own sun disc: the lamp above is the sun, so the two cannot disagree
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    nt = world.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "NISHITA"
    except TypeError:
        sky.sky_type = "HOSEK_WILKIE"
    if sky.sky_type == "NISHITA":
        sky.sun_disc = False
        sky.sun_elevation = max(alt, math.radians(2))
        sky.sun_rotation = az
        sky.air_density, sky.dust_density, sky.ozone_density = 1.0, 1.0, 1.0
    bg = nt.nodes.get("Background")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.22
    scene.world = world
    return sorted(made)


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
        preset = args.preset or job["renderer"]["preset"]
        report["preset"] = preset
        if preset == "daylight":
            report["material_slots"] = daylight_pass(job, meshes)
            report["trees_grown"] = grow_trees(job)
        else:
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
