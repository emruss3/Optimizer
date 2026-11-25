"""Download the render kit named in assets.json into a local cache.

    python scripts/render4k/fetch_assets.py [cache_dir]      (default: out/assets)

The kit is photographed materials, a photographed sky and scanned plants from
Poly Haven, all CC0. Nothing is committed to the repository: the manifest pins
what to fetch, and assets.lock.json in the cache records what arrived (file,
size, md5 as published). A file already in the cache with the right size is
not fetched again.
"""
import hashlib
import json
import os
import sys
import urllib.request

API = "https://api.polyhaven.com"
AGENT = "render-kit-fetch/1.0"
HERE = os.path.dirname(os.path.abspath(__file__))


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def fetch(url, path, size, md5, lock):
    rel = os.path.relpath(path, lock["_root"])
    if not (os.path.exists(path) and (not size or os.path.getsize(path) == size)):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = get(url)
        if md5 and hashlib.md5(data).hexdigest() != md5:
            raise SystemExit(f"fetch_assets: {rel} arrived damaged (md5 differs)")
        with open(path + ".part", "wb") as f:
            f.write(data)
        os.replace(path + ".part", path)
        print(f"  fetched {rel} ({len(data) // 1024} KB)")
    lock["files"][rel] = {"bytes": os.path.getsize(path), "md5": md5}


def texture(asset, res, root, lock):
    files = json.loads(get(f"{API}/files/{asset}"))
    info = json.loads(get(f"{API}/info/{asset}"))
    out = {"id": asset, "size_m": [d / 1000 for d in info.get("dimensions", [1000, 1000])][:2], "maps": {}}
    for key, name in (("Diffuse", "diff"), ("nor_gl", "nor"), ("Rough", "rough")):
        f = files[key][res]["jpg"]
        path = os.path.join(root, "materials", asset, f"{name}.jpg")
        fetch(f["url"], path, f.get("size"), f.get("md5"), lock)
        out["maps"][name] = os.path.relpath(path, root)
    return out


def model(asset, res, root, lock, kind):
    files = json.loads(get(f"{API}/files/{asset}"))
    g = files["gltf"][res]["gltf"]
    base = os.path.join(root, kind, asset)
    main = os.path.join(base, f"{asset}.gltf")
    fetch(g["url"], main, g.get("size"), g.get("md5"), lock)
    for rel, inc in g.get("include", {}).items():
        fetch(inc["url"], os.path.join(base, rel), inc.get("size"), inc.get("md5"), lock)
    return {"id": asset, "file": os.path.relpath(main, root)}


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "out/assets")
    with open(os.path.join(HERE, "assets.json")) as f:
        kit = json.load(f)
    lock = {"_root": root, "version": kit["version"], "source": kit["source"], "files": {}}
    print(f"render kit {kit['version']} into {root}")
    sky = kit["sky"]
    f = json.loads(get(f"{API}/files/{sky['id']}"))["hdri"][sky["res"]]["hdr"]
    path = os.path.join(root, "sky", f"{sky['id']}.hdr")
    fetch(f["url"], path, f.get("size"), f.get("md5"), lock)
    lock["sky"] = {"id": sky["id"], "file": os.path.relpath(path, root)}
    lock["materials"] = {slot: {**texture(m["id"], m["res"], root, lock), "tint": m.get("tint", 1.0)} for slot, m in kit["materials"].items()}
    lock["trees"] = [{**model(t["id"], t["res"], root, lock, "trees"), "weight": t.get("weight", 1)} for t in kit["trees"]]
    lock["shrubs"] = [model(t["id"], t["res"], root, lock, "shrubs") for t in kit["shrubs"]]
    lock["grass"] = [model(t["id"], t["res"], root, lock, "grass") for t in kit.get("grass", [])]
    del lock["_root"]
    with open(os.path.join(root, "assets.lock.json"), "w") as f:
        json.dump(lock, f, indent=2)
        f.write("\n")
    total = sum(v["bytes"] for v in lock["files"].values())
    print(f"kit ready: {len(lock['files'])} files, {total // (1024 * 1024)} MB")


if __name__ == "__main__":
    main()
