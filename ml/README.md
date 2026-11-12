# Optimizer layout model

The generative layout model for Optimizer: trained on Modal (GPU, billed by the second), served from Modal, checked by the rule engine in Supabase.
Strategy: `strategy/strategy-ai-layer-2026-11-11.md` in the claude.ai Project.

## What is here

| Path | What |
|---|---|
| `optimizer_ml/app.py` | The Modal app. Today: a health endpoint only, to prove the deployment path. Training and generation are added in later commits |
| `../.github/workflows/ml-deploy.yml` | Deploys the app to Modal when anything under `ml/` changes |

## How it deploys

A push that touches `ml/` runs `modal deploy -m optimizer_ml.app` from this folder, using two repository secrets:
`MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`. Nothing else in the repo is built or changed by that workflow.

## Rules

- A new model version goes live only if it produces more code-clean lots than the live one on the held-out sites.
- The app never depends on the model: if the endpoint is slow or down, the rule engine's plan is shown.
- No credentials in this folder. The database connection is a Modal secret.
