# Optimizer layout model

The generative layout model for the Optimizer site-plan engines: given a site outline, a lot module and the roads
that already exist beside the site, it writes the new streets and the lots along every street. The rule engine in
Supabase checks every layout before a plan is shown; the model never decides what counts.

| Part | Where | What it does |
|---|---|---|
| `optimizer_ml/layout_model.py` | this folder | Layout format, the model (PyTorch), generation, and `resolve()` (bands to lots that count) |
| `optimizer_ml/app.py` | Modal app `optimizer-layout-model` | GPU training job and the API the database calls |
| `.github/workflows/ml-deploy.yml` | GitHub Actions | Any push under `ml/` deploys the app to Modal |
| `training.fn_ml_*` | Supabase | Sends training data, starts a run, reads its status, asks for layouts |
| edge function `ml-gate` | Supabase | Tells the model service whether a one-time code is good |

## No password, key or token for the database

The model service holds no database credential. The database starts every exchange: it signs a one-time code
(`training.fn_ml_code`), sends it with the request, and the service asks `ml-gate` whether the code is good before it
does anything. A code works once, for one purpose, for a few minutes. The signing key is generated inside the database
and never leaves it. The only secrets in the whole setup are the two Modal deploy values in this repo's Actions secrets.

## API (all but `/health` need a one-time code in the `x-ml-nonce` header)

| Route | Purpose |
|---|---|
| `GET /health` | Service status and the live model version |
| `POST /ingest` | Store one chunk of training data under a dataset name |
| `POST /train` | Start a GPU training run on a dataset (capped at 240 minutes) |
| `POST /status` | Progress and test scores of a run |
| `POST /promote` | Make a trained version the live one |
| `POST /generate` | Layouts for one site: model streets with model lots, and the same streets with module lots |

## Rules

- Nothing is called AI unless the model makes the decision, and every result is reported against a control with no
  model and the same number of tries.
- Held-out subdivisions are scored in aggregate only and never tuned on.
- A new version goes live only if it yields more code-clean lots on held-out sites than the version before it.
