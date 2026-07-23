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

## PART 2 — THE COMPETITIVE LANDSCAPE
*(research briefs pending — filled in below)*

## PART 3 — THE RETHINK
*(synthesis pending Part 2)*
