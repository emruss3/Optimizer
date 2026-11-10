# The engine cohort

Eric, 2026-11-09: "If we aren't getting better each time we do this, we need
to re-focus." Random draws measure the land as much as the engine, and each
batch sent the engine ten asks. This is the fixed measure instead.

`cohort.json` holds every parcel from the audit batches (batches 1–5,
2026-11-04 to 2026-11-10: 110 parcels, 92 R/RS and 18 RM; batch 5 added 40
on 2026-11-10) with what a civil
engineer or developer would draw on it — the **target**:

- `kind: "refuse"` — nothing new belongs: 0 lots, skipped, or the parcel as
  one house (50 parcels: floodplain, landlocked, hillside, too small);
- `kind: "plan"` — something should be drawn: the lot range `lots: [lo, hi]`,
  the `product` (`lots`, `attached`, or `any` on RM land), `noStreet` when a
  new public street does not belong (frontage, flag or estate lots, a shared
  drive), `altRefuse` when a zero with the reason is also acceptable.

`why` is the one-line judgment from the batch write-up (`audit`), `judged` the
likelihood it scored there. The targets are judgments, not ordinance; change
one when the write-up it came from is wrong, and say so in the commit.

## The number

```
node scripts/engine-cohort/score.mjs --store <store.json> --engine g15 --out runs/2026-11-09_g15.json
node scripts/engine-cohort/score.mjs --store <store.json> --engine g16 --out runs/<date>_g16.json --baseline runs/2026-11-09_g15.json
```

prints two counts — **plans where a civil would draw one** (of the `plan`
parcels) and **refusals where nothing belongs** (of the `refuse` parcels) —
then one line per parcel, and with `--baseline` the parcels whose answer
changed (`FIXED`, `BROKE`, or `changed` with the same verdict). The first
count is the one that has to go up before the next random batch is drawn;
the second is already near full and must not go down.

The answer scored is what the app puts on the sheet by default: on R / RS the
by-right plan, replaced by the competition's best only by the app's auto-best
rule (more lots and buildable, or the same lots with less street or fewer
fails); on RM the layout choice (the neighborhood's best when it places more
homes than the apartments, is buildable and drawable; otherwise the
apartments). A plan passes when its lots are in the range, it has no code
fails (quality flags — `open.unassigned`, `cost.street_ft_per_lot`,
`yield.vs_arithmetic`, `access.private_drive_length` — do not count), the
product matches, and it lays no new public street where none belongs.

## Baseline

g15, 2026-11-09 (`runs/2026-11-09_g15.json`): plans 18 of 40 (45%), refusals
25 of 30 (83%). Of the 22 plan misses, 14 are the land behind the first tier
(a remainder lot, a public street that fails to reach one or two lots, or
nothing where estate lots on a drive fit), 4 are hillside streets over 10%,
4 are apartments where the product is attached. Of the 5 refusal misses, 3
are the multifamily run drawing on landlocked land, 2 are by-right plans on
land that scored a zero in an earlier release (Dry Fork Rd, Old Hickory Blvd
R40).

g16, 2026-11-10 (`runs/2026-11-10_g16.json`, write-up and ranked sheets in
`qa/audits/2026-11-10/`): plans 19 of 40, refusals 26 of 30. Fixed: 605
Harpeth Ln (the parcel as one lot with a driveway), 0 Old Hickory Blvd R40
(refuses, landlocked). One raised error (8192 Charlotte Pike, division by
zero in `fn_sf_v1_strip`). The 21 plan misses split 14 / 3 / 4 the same way;
the 4 refusal misses are the three multifamily draws on landlocked land and
Dry Fork Rd.

Scorer changes with that run (the g15 baseline scores the same under them):
`best_requested` came back null on every parcel, so the best plan's grammar
is worked out from `best_pattern` and `best_lots` the way the app now does;
an answer with `status: 'error'` is a miss that carries the engine's
message; one lot with no fails passes a target whose range starts at one.

g17, 2026-11-10 (`runs/2026-11-10_g17.json`, write-up in
`qa/audits/2026-11-10b/`; the engine changed with no migration recorded, so
the name is this repository's): plans 24 of 40, refusals 26 of 30. Fixed:
3345 Pugh Rd, 7695 Old Charlotte Pike and 0 Neelys Bend Rd (estate lots on a
shared private drive), 0 Clovernook Dr (the remainder lotted again), 8192
Charlotte Pike (no error). The 16 plan misses: 9 under-yield behind the
first tier, 3 hillside, 4 apartments where the product is attached.

Scorer change with that run (g16 scores the same under it): the same-lots
rule compares what each plan builds, public street plus private drive
(`metrics.drive_ft`), since a shared drive reports `street_ft: 0`.

g18, 2026-11-10 (`runs/2026-11-10_g18.json`, write-up in
`qa/audits/2026-11-10c/`; again no migration recorded): all 110. Plans 37
of 60, refusals 46 of 50. The original 70: plans 23 of 39, refusals 28 of
31 (g17 under today's targets: 23 and 26). The 40 new parcels of batch 5:
plans 14 of 21, refusals 18 of 19. The competition on 1716 Red Jacket Dr
did not return in 58 s and is recorded as an error.

Target change with that run: 0 Longwood Pl (681024) is a refusal. It is a
co-op's common land round five other owners' lots and the engine now
refuses it for that reason.

Scorer change with that run (g16 and g17 score the same under it): on RM
land a by-right side skipped for a reason other than the flood hazard area
leaves the apartments on the sheet, as the app does, so they are the answer
scored.

g19, 2026-11-10 (`runs/2026-11-10_g19.json`; migration `sf_v1_engine_g19`,
`fn_sf_v1_params()->>'engine_release'` names the release from g18 on):
plans 39 of 60, refusals 46 of 50. Fixed since g18: 0 Currey Rd and
0 Hunters Ln, by a lane down one side of a deep narrow strip. Nothing that
passed fell. The reply to the engine side with the asks that stand is
`qa/audits/2026-11-10c/APP_REPLY.md`.

Proposed and not applied (the owner's call; see that reply, §4): lower
targets for 1019 Hitt Ln, 8282 Charlotte Pike, 0 Newsom Station Rd,
0 Campbell Rd and 0 Old Hickory Blvd R15, where the engine measured that no
lane holds grade into the land. They would read 44 of 60 on g19.

## Running it

Live, as the app's anonymous role (the owner, or CI with the battery secrets):

```
BATTERY_SUPABASE_URL=… BATTERY_SUPABASE_ANON_KEY=… node scripts/engine-cohort/run.mjs --engine g16 --baseline runs/2026-11-09_g15.json
```

writes `runs/<date>_g16.store.json` (the raw answers) and `runs/<date>_g16.json`
(the scoreboard). Through a SQL console (the audit harness, where the REST
role is not reachable): `node scripts/engine-cohort/harvest-sql.mjs` prints
the statements; each returns one row whose `t` column is the store JSON for
its parcels; merge them and score with `score.mjs --store`.

Terrain: every cohort parcel has its DEM cached (`parcel_topo`), so a run does
not depend on USGS 3DEP; a plan that says "terrain unavailable" in its notes
was drawn without it and should be re-run.

`runs/` keeps one scoreboard per engine release; the store files are large and
stay out of git (`.gitignore`).
