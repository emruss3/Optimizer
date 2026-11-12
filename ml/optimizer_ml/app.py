"""Optimizer layout model on Modal.

Stage 0: a health endpoint only, so the path from GitHub to Modal is proven before the model is added.
Scheduled training and the generation endpoint arrive in later commits.
"""
import modal

app = modal.App("optimizer-layout-model")
image = modal.Image.debian_slim().pip_install("fastapi[standard]")

# Set by the training job once a model has passed the held-out test.
MODEL_VERSION = "none"


@app.function(image=image)
@modal.fastapi_endpoint()
def health():
    return {"status": "ok", "app": "optimizer-layout-model", "model_version": MODEL_VERSION}
