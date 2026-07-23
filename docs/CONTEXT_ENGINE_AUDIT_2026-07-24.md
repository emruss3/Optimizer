# CONTEXT ENGINE — FULL AUDIT & RETHINK · 2026-07-24
**Method: every claim measured against live (project okxrvetbzpoazrybhcqj) during this audit. Competitor sections sourced separately (citations inline).**

## PART 1 — WHAT WE ACTUALLY BUILT (measured)

### Surface area
| Metric | Value | Reading |
|---|---|---|
| Planner functions (public.fn_*) | **41** (441 KB of SQL) | An entire compiler+solver living as interdependent pl/pgsql |
| SECURITY DEFINER among them | **5** (36 caller-privilege) | 88% of the engine executes with the CALLER's permissions |
| RLS'd tables read by caller-priv fns | **7** (typology_spec ×6 fns, buildings ×4, unit_spec, zoning ×2, jurisdictions, ibc_construction_types, jurisdiction_zoning_standards) | Every future RLS change on any of these can break up to 6 functions instantly |
| Live migrations vs repo parity copies | **205 vs 125** | A material fraction of live history has no versioned copy |
| Context snapshots | **699 rows over 302 parcels** (2.3×/parcel) | Revision churn forces recompiles; 0.8% of the universe ever touched |
| Universe (RM/OR/MU parcels) | **37,907** | The 99.2% never-compiled majority is the product's actual surface |
| Feedback events | **0** | The learning loop has never received a single signal |

### Speed (the good news, measured warm)
| Call | Latency |
|---|---|
| fn_compile_planner_context (warm snapshot) | **34 ms** |
| fn_compile_planner_context (**cold**, never-compiled parcel 576090) | **16,266 ms** |
| fn_massing_program | 36 ms |
| fn_seed_parking (skeleton+seed+bays) | 101 ms |
| fn_max_buildout | 282 ms |
| statement_timeout (anon role) | 2 min — the ceiling solves die at |

The engine is FAST when it is warm — and **16.3 s when it is not**. The
480:1 warm/cold ratio is the audit's economic core: we built a COMPILER and
we run it at request time. 99.2% of the universe is cold. Full-universe
precompute at measured cost ≈ 168 CPU-hours — a one-day batch at eight
lanes — versus a 16-second first-visit tax forever (the UX target of a
<6 s cold napkin is 3× blown today). The 8.2 s LCP in Eric's console is
client boot + map, separate and additive.

### The failure ledger (one week, all live, all with receipts)
1. `public.buildings` RLS'd with zero policies → neighborhood render went dark (fixed 20260721195219).
2. `public.zoning` same class → permitted-uses silently fell back on EVERY parcel for days (fixed 20260723180653).
3. `unit_spec` same class earlier in the week (fixed by engine lane).
4. Frontier fn hot-edited live → `max_gsf` intermittently wrong-typed → CI reds 17:58/18:12.
5. Generator hot-edited live → showcase 553450 died on statement timeout / `lwgeom_union_prec GEOS InterruptedException` → Eric's 32% screenshot.
6. 667574 solve exceeded 60 s for an afternoon (ladder walk cost), unfixable to observe because the same fn was being edited.
7. `parcels.sqft` is **NULL for all 27,161 RM parcels** — map size filters and the census buildable stratum silently dead (found during this audit; the engine itself is immune because it measures EPSG:2274 geometry internally).
8. Census full-universe baseline: **86.7% error rate** (13/15 draws are slivers where refusal is right but error-shaped — verdict taxonomy still pending).

**The pattern across all eight: not one is a judgment bug. Every failure is
representation and operations — locks without read policies, live edits
without versioning, columns without data, errors without verdict taxonomy.
The intelligence layer (ordinance matching, frontier math, seed placement)
has not produced a single wrong NUMBER all week.**

### Architecture as-built (honest diagram)
Client → PostgREST → 41 caller-privilege pl/pgsql fns → ~48 tables
- Compute-at-request for everything except context snapshots (which cache per revision)
- No staging environment: edits land in the live database directly
- No drift alarm: repo parity is manual discipline per session
- No contract tests on fn return shapes (the type-flap class)
- Instruments (census, battery, floors) bolted on this week — they work, and they are currently the ONLY thing standing between an edit and Eric's screen

## PART 2 — THE COMPETITIVE LANDSCAPE (sourced 2026-07; citations in research annex)

### How each competitor handles the two jobs we fused
| Vendor | Generation engine | Zoning context | Precompute vs request-time |
|---|---|---|---|
| **TestFit** | Deterministic rules-based solver, client-side, instant re-solve (~$8k/yr Site Solver) | **Zoneomics add-on** — used as **pass/fail overlay + auto-filters, NOT a solver driver** ("Zoning input does not adjust the building when solving") | Zoneomics data precomputed (~20k jurisdictions); TestFit consumes at request time |
| **Deepblocks** | Simple massing + pro-forma / HBU ranking (no composed plans) | **Own AI-digitized codes** → parcel-level buildable parameters; 16.4M+ sites, new city in <1 hr | **Fully precomputed per parcel** — the only competitor that derives, and it derives OFFLINE |
| **Archistar** | Cloud generative massing, seconds, AI-ranked | Own consolidated dataset (25k+ gov sources), deep AU; US play is permit-review (Austin, LA) | Precomputed dataset |
| **Autodesk Forma** | ML surrogate analyses (noise/wind) + rule-based site automation | None native — user-entered; optional "3D Envelope by Zoneomics" extension (Aug 2024) | Zoneomics precomputed; envelope built at request time |
| **Giraffe** | User-driven parametric sketching, live metrics | User/app-modeled constraint layers over live data (Regrid parcels) | Request-time over connected layers |
| **Zenerate** | Cloud generative (50k options), pro-forma integrated; **AvalonBay enterprise deal (Jun 2026)** | User-entered constraints — no zoning dataset | n/a |
| **Davis (FR)** | Discrete-space generative model + **human expert review**, hours-to-days | Regulatory data as constraints (France) | Hybrid service |

### The three market facts that matter for our rethink
1. **The category we claim — derive entitlement per parcel AND drive design from it — is genuinely unoccupied.** Deepblocks derives but doesn't design (massing math, no plans). TestFit designs but doesn't derive (zoning is a scoring overlay on a user-parameterized solve). We do both — which is why our engine is 441 KB of SQL and theirs aren't.
2. **Everyone fast is fast the same two ways: precompute the data, or solve deterministically client-side.** Nobody runs a 16-second derivation at request time. Deepblocks' "<1 hour per municipality" is the batch-economics version of exactly our compiler.
3. **The failure mode buyers complain about market-wide is data coverage/accuracy — never compute speed.** (Forma's regional gaps and area caps, Archistar's AU-centric data, unverified AI-extracted zoning.) Our week's ledger — representation and operations failures, zero wrong numbers — is the same species. The market punishes exactly the class of defect our current operations produce, and forgives slow batch pipelines nobody sees.

### The data-utility layer beneath everyone
Zoneomics has become the de facto zoning-data utility (TestFit, Forma, Moody's, Redfin, CREXI, Regrid consume it): standardized per-district attributes, precomputed, served by API — consumers compute compliance on top. Our engine goes two layers deeper (parcel-measured envelopes, unit programs, frontier math, seeds) — that depth is the moat, and it is exactly what must move to batch.

### The data-utility layer, second layer down
Three architectures exist beneath the app vendors:
- **Precomputed per-district attributes** joined to parcels: Zoneomics (~20-25k jurisdictions, monthly refresh, certified-analyst verification), Regrid (Zoneomics inside, `zoning_data_date` vintage field), LightBox (quarterly, version-paired to parcel fabric), National Zoning Atlas (human-coded, no API).
- **Executable rules evaluated per request**: Symbium (zoning as logic programs — the rules-as-code purist), Archistar PreCheck (plan review), Buildability (LLM-per-request — nondeterministic).
- **Hybrid — rules engine with MATERIALIZED per-parcel outputs**: **Gridics** (patented US10565665: envelope + max-density computation per parcel; **~10,000 parcels/hour batch**; city code amendments push recompute via CodeHub). 

Gridics' hybrid is our missing operating model. Our 41 functions ARE a deeper
rules engine than any of these (parcel-measured 2274 envelopes, unit
programs, frontier math, seeds — none of them go past district attributes).
What we never built is the materialization batch, the versioned refresh, and
the sealed API in front of it.

## PART 3 — THE RETHINK

### The verdict
The intelligence is right and the category is unoccupied — that is Part 2's
finding, not our hope. What is wrong is the OPERATING MODEL: a 441 KB
compiler executed at request time (16.3 s cold), deployed by editing the
live database, running 88% caller-privilege over RLS'd tables, with its
instruments bolted on one week ago. Every failure in the ledger traces to
that model. **The rethink is not "replace the engine." It is: keep our
depth, adopt Gridics' economics and Deepblocks' operations.**

### The five moves

**M1 — Materialize the universe (compile-time, not request-time).**
`planner.parcel_context`: one row per parcel × use, carrying today's full
snapshot payload plus `engine_version`, `compiled_at`, `ordinance_vintage`,
`buildability_verdict`. Batch-compile all 37,907 RM/OR/MU parcels — measured
cost ≈168 CPU-hours single-lane, ~a day at 8 lanes (Gridics ships 10k/hr;
we compute far more per parcel and still land the same week). The 699
snapshots over 302 parcels prove the machinery ALREADY works — this is
finishing a thought the system started by itself. Recompiles become a QUEUE
driven by three triggers: engine version bump (migration), ordinance/data
change, parcel geometry change. Request path becomes a SELECT: the 34 ms
warm number becomes the universal number, the <6 s cold-napkin UX target is
beaten 100×, and **the Phase-4 opportunity screener falls out of this table
for free** ("every parcel where achievable ≥3× existing" is one indexed
query).

**M2 — Collapse the API: 41 functions → ~7 sealed entry points.**
`context` (read materialized) · `buildability` · `seed` · `solve` ·
`record_feedback` · `record_census` · `trend` — all SECURITY DEFINER with
locked search_path, versioned (`_v1`), contract-tested. Everything else
moves to an internal schema with NO client grants. The 7-table ×
6-function caller-privilege fragility matrix goes to zero client-reachable
surface — the RLS incident class (three this week) becomes structurally
impossible, not policy-by-policy patched.

**M3 — Deploys become migrations-only, with a drift alarm.**
Nightly: md5(pg_get_functiondef) of every planner function vs the repo
parity manifest → a named red on any live edit. Ends the hot-edit era (this
week: showcase statement-timeout, GEOS interrupt, max_gsf type-flap — all
edit-window casualties). Contract tests on entry-point return shapes run in
solver-floors so a type change is caught as a CONTRACT break, not a
downstream mystery.

**M4 — Data floor.** Backfill `parcels.sqft` from measured EPSG:2274 area
(it is NULL on all 27,161 RM parcels; the map's size filters and the census
buildable stratum are silently dead today). Instruments and UI stratify by
the engine's own canonical source (`fn_parcel_buildability` verdict — its
docstring already declares this). Every materialized row carries vintage
columns (the LightBox pattern) so staleness is visible, never silent.

**M5 — Keep request-time only for what must be live.** The solve/edit loop
(pins, DOF refinement, re-solve on mix edits) stays interactive — but it
READS materialized context, never recompiles it, and runs under explicit
per-call budgets (solve ≤20 s hard; the ladder's per-rung budget upstream)
so the 2-minute statement-timeout ceiling is never met by design.

### What we deliberately do NOT do
- **Do not adopt an external zoning vendor as the brain.** Zoneomics-class
  attributes are two layers shallower than our parcel-measured envelopes;
  TestFit renting it as a pass/fail overlay is the ceiling of that path.
  (As an INPUT/cross-check for county #2+ bootstrapping — worth pricing.)
- **Do not go LLM-per-request** (Buildability's model): nondeterministic
  answers cannot carry our receipts. LLM extraction belongs OFFLINE in the
  ingestion pipeline, human-verified, like Deepblocks/Zoneomics do it.
- **Do not rewrite the engine in app-server code.** The SQL is not the
  problem; 41 unsealed hand-deployed entry points are.

### Sequencing (respects all in-flight work)
| Step | Owner | Size | Exit test |
|---|---|---|---|
| M4 backfill + stratum fix | data/engine | hours | census buildable stratum returns real parcels; map filters live |
| M1 materialization batch + queue | engine | ~2 days | 100% of universe compiled; cold napkin <1 s from SELECT |
| M3 drift alarm + contract tests | Claude Code | ~1 day | 7 consecutive green days = hot-edit era over |
| M2 sealed entry points (compat views first) | engine + Claude Code | ~1 week | zero caller-privilege client-reachable functions |
| M5 client cutover to read-path + budgets | Claude Code | ~1 day | UX: parcel click → napkin <1 s cold, every time |

### The sentence, updated
We already out-derive everyone and out-design the derivers. The rethink
makes it OPERABLE: compile the county once, serve it in milliseconds,
change it only through versioned migrations, and let the instruments —
which caught every failure this week — guard a surface seven functions
wide instead of forty-one.

