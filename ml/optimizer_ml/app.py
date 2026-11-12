"""Modal app for the Optimizer layout model: GPU training, and the API the database calls.

No secret lives here or in Modal. Every request that changes or costs anything carries a one-time code that the
database creates; before doing the work this app asks the database (edge function ml-gate) whether the code is good.
A code works once, for one purpose, for a short time.
"""
import json
import os
import re
import time
import traceback
import urllib.parse
import urllib.request

import modal

APP_NAME = "optimizer-layout-model"
GATE_URL = "https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/ml-gate"
VOL = "/vol"
MAX_TRAIN_MINUTES = 240      # cost guard: one run cannot ask for more training time than this
TRAIN_GPU = None             # set to "T4" once the Modal account has a payment method (Modal refuses GPU without one)
TRAIN_CPUS = 16              # cores for a training run while it is on CPU
MAX_TRIES = 16               # layouts per generate call

app = modal.App(APP_NAME)
image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]", "torch==2.5.1", "shapely==2.0.6")
vol = modal.Volume.from_name("optimizer-layout-model", create_if_missing=True)


def _clean(name):
    return re.sub(r"[^A-Za-z0-9_.-]", "", str(name or ""))[:80]


def _write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f)


def _read_json(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


@app.function(image=image, gpu=TRAIN_GPU, cpu=TRAIN_CPUS, memory=16384, timeout=6 * 3600, volumes={VOL: vol})
def train(run_id: str, dataset: str, minutes: float, cfg: dict):
    """Trains one model version on a dataset the database pushed, scores it, and leaves everything on the volume."""
    import torch

    from . import layout_model as lm

    if not torch.cuda.is_available():
        torch.set_num_threads(TRAIN_CPUS)
    out = f"{VOL}/runs/{run_id}"
    os.makedirs(out, exist_ok=True)
    state = {"run_id": run_id, "dataset": dataset, "status": "running", "started": time.time(), "minutes": minutes,
             "device": "gpu" if torch.cuda.is_available() else f"cpu x{TRAIN_CPUS}", "log": []}

    def log(msg):
        state["log"] = (state["log"] + [str(msg)[:2000]])[-30:]
        state["updated"] = time.time()
        _write_json(f"{out}/status.json", state)
        vol.commit()

    try:
        lines = []
        vol.reload()
        for name in sorted(os.listdir(f"{VOL}/data/{dataset}")):
            with open(f"{VOL}/data/{dataset}/{name}") as f:
                lines += f.read().split("\n")
        log(f"data lines: {len(lines)}")
        res = lm.train(minutes, lines, out_dir=out, cfg=cfg, log=log, eval_holdout=True)
        state.update(status="done", results=res)
    except Exception as e:
        state.update(status="failed", error=repr(e), trace=traceback.format_exc()[-3000:])
    state["finished"] = time.time()
    _write_json(f"{out}/status.json", state)
    vol.commit()
    return state["status"]


@app.function(image=image, volumes={VOL: vol}, timeout=900)
@modal.asgi_app()
@modal.concurrent(max_inputs=8)
def api():
    from fastapi import Body, FastAPI, Header, HTTPException

    from . import layout_model as lm

    web = FastAPI(title=APP_NAME)
    models = {}                                   # run_id -> (model, cfg, yield targets)
    seen = {"at": 0.0}

    def gate(nonce, purpose):
        ok = False
        if nonce:
            try:
                url = GATE_URL + "?" + urllib.parse.urlencode({"nonce": nonce, "purpose": purpose})
                with urllib.request.urlopen(url, timeout=20) as r:
                    ok = json.loads(r.read()).get("ok") is True
            except Exception:
                ok = False
        if not ok:
            raise HTTPException(status_code=401, detail="one-time code missing or refused")

    def refresh(force=False):
        if force or time.time() - seen["at"] > 30:
            try:
                vol.reload()
            except Exception:
                pass
            seen["at"] = time.time()

    def current_run():
        refresh()
        cur = _read_json(f"{VOL}/model/current.json")
        return cur.get("run_id") if cur else None

    def model_for(run_id):
        if run_id not in models:
            path = f"{VOL}/runs/{run_id}/layout_model_v1.pt"
            if not os.path.exists(path):
                refresh(force=True)
            if not os.path.exists(path):
                raise HTTPException(status_code=404, detail="no such model version")
            if len(models) >= 2:
                models.pop(next(iter(models)))
            models[run_id] = lm.load_model(path)
        return models[run_id]

    @web.get("/health")
    def health():
        return {"status": "ok", "app": APP_NAME, "model_version": current_run() or "none"}

    @web.post("/ingest")
    def ingest(body: dict = Body(...), x_ml_nonce: str = Header(None)):
        gate(x_ml_nonce, "ingest")
        dataset, name, text = _clean(body.get("dataset")), _clean(body.get("name")), body.get("text") or ""
        if not dataset or not name or not text:
            raise HTTPException(status_code=400, detail="dataset, name and text are required")
        os.makedirs(f"{VOL}/data/{dataset}", exist_ok=True)
        with open(f"{VOL}/data/{dataset}/{name}.txt", "w") as f:
            f.write(text)
        vol.commit()
        return {"dataset": dataset, "saved": name, "lines": text.count("\n") + 1}

    @web.post("/train")
    def train_start(body: dict = Body(...), x_ml_nonce: str = Header(None)):
        gate(x_ml_nonce, "train")
        run_id, dataset = _clean(body.get("run_id")), _clean(body.get("dataset"))
        refresh(force=True)
        if not run_id or not dataset or not os.path.isdir(f"{VOL}/data/{dataset}"):
            raise HTTPException(status_code=400, detail="run_id and a dataset that has been sent are required")
        if os.path.exists(f"{VOL}/runs/{run_id}/status.json"):
            raise HTTPException(status_code=409, detail="this run_id has already been used")
        minutes = max(1.0, min(float(body.get("minutes") or 30), MAX_TRAIN_MINUTES))
        call = train.spawn(run_id, dataset, minutes, body.get("cfg") or {})
        return {"run_id": run_id, "dataset": dataset, "minutes": minutes, "call_id": call.object_id}

    @web.post("/status")
    def status(body: dict = Body(...), x_ml_nonce: str = Header(None)):
        gate(x_ml_nonce, "status")
        refresh(force=True)
        st = _read_json(f"{VOL}/runs/{_clean(body.get('run_id'))}/status.json")
        return st or {"status": "unknown"}

    @web.post("/promote")
    def promote(body: dict = Body(...), x_ml_nonce: str = Header(None)):
        gate(x_ml_nonce, "promote")
        run_id = _clean(body.get("run_id"))
        refresh(force=True)
        if not os.path.exists(f"{VOL}/runs/{run_id}/layout_model_v1.pt"):
            raise HTTPException(status_code=404, detail="no such model version")
        _write_json(f"{VOL}/model/current.json", {"run_id": run_id, "promoted_at": time.time()})
        vol.commit()
        return {"model_version": run_id}

    @web.post("/generate")
    def generate(body: dict = Body(...), x_ml_nonce: str = Header(None)):
        gate(x_ml_nonce, "generate")
        t0 = time.time()
        run_id = _clean(body.get("run_id")) or current_run()
        if not run_id:
            return {"error": "no model version is live"}
        model, cfg, yt = model_for(run_id)
        s = lm.site_from_request(body["site"], cfg)
        if isinstance(s, str):
            return {"error": "site cannot be handled: " + s, "model_version": run_id}
        b = lm.canon(s)[0]
        P = lm.poly_of(b)
        layouts = []
        for t in range(max(1, min(int(body.get("tries") or 4), MAX_TRIES))):
            try:
                roads = lm.generate(model, s, cfg, yt[t % len(yt)])
            except Exception:
                continue

            def estimate(rd, width):               # an estimate only: the engine decides what counts
                try:
                    return lm.resolve(s, b, rd, cfg, width)[0]
                except Exception:
                    return None

            layouts.append({"kind": "model streets and lots" if cfg.get("lots", True) else "model streets", "roads": lm.roads_to_json(roads, s),
                            "lots_estimate": estimate(roads, s["w"] if cfg["strict_width"] else 0.0) if cfg.get("lots", True) else None})
            packed = lm.pack(s, cfg, roads, P)
            layouts.append({"kind": "model streets, module lots", "roads": lm.roads_to_json(packed, s),
                            "lots_estimate": estimate(packed, s["w"])})
        return {"model_version": run_id, "seconds": round(time.time() - t0, 1), "layouts": layouts}

    return web
