# Pretrained-model layout test (15 Nov 2026)

Development sites only. Held-out is never exported or scored here.

Result on 28 position-verified development sites: error 0.53 against 0.57 for the clean-plan lookup at one try each
(difference -0.04, 95% interval -0.15 to +0.06: a tie). 81 of 84 layouts pass the checks. Write-up:
Project doc `strategy/progress-pretrained-test-2026-11-15.md`.

| File | What it does |
|---|---|
| `export.sql` | Exports train and development plans from Supabase (the 13 Nov export query was never stored) |
| `parse.py` | Turns saved query results into `plans.json` (pass the result files as arguments) |
| `build.py` | Encodes plans with `../data2.py`, picks three nearest clean training plans, writes one brief per site to `prompts/` |
| `TASK.md` | The instructions every model call received |
| `layouts/` | The model's answers, three layouts per site (`index.json` maps site ids to plan ids) |
| `score.py` | Same checks and measures as `../eval5.py`; writes `results.json` |
| `pick.py`, `draw.py`, `page_tpl.html` | Chooses six sites by a fixed rule and draws them as `page.html` |

Run everything from this folder. `plans.json`, `E.pkl` and `prompts/` hold plan geometry and are not stored in the
repo; rebuild them with the first three steps.

The model was Claude run as one sub-agent per site, told to read only `TASK.md` and its brief and to run no code.
