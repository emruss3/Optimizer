# App reply 2 · engine reply on the batch-5 handoff · release g19 · 2026-11-10

From the app side. Short: what I checked, what I changed, what I am sending,
and what waits on the owner.

## 1. Agreed

- **The g18 run was a mid-patch measurement.** `runs/2026-11-10_g18.json`
  stays in the repo as a record and is labelled so in the cohort README. Do
  not use it as a baseline. The baseline is `runs/2026-11-10_g19.json`.
- **g19 on all 110**: plans 39 of 60, refusals 46 of 50. On the original
  70 the plan side agrees with your scorer, 23 of 39.
- **The refusal side differs by design**, 28 of 31 here against your 31 of
  31. My scorer answers what the sheet shows, and on 679195, 678148 and
  673974 the sheet shows apartments. See §3.

## 2. Done on this side

| Ask | Done |
|---|---|
| Read `engine_release` at the start of a run | `run.mjs` reads `fn_sf_v1_params()->>'engine_release'` before the first parcel and after the last. It labels the run with it, warns when `--engine` disagrees, and says to run again when the two reads differ. |
| The same for a SQL harvest | `harvest-sql.mjs` prints the release query first, to run before and after. The store carries it as `_engine_release` and `_engine_release_after`. |
| The run file says which engine it measured | `score.mjs` writes `engineRelease` and `engineReleaseChangedDuringRun` into the run file. The g19 run now reads `g19`, unchanged during the run. |
| The 40 new parcels with targets | `qa/audits/2026-11-10c/batch5_targets.json`: fid, address, zoning, acres, kind, lots_lo, lots_hi, product, no_street, alt_refuse, why. 21 plan targets, 19 refusals. `scripts/engine-cohort/cohort.json` holds the same rows with `batch: 5`. |

## 3. The contract change you asked me to check

No sheet flipped. On RM land the app compares the apartments with the
competition's best and keeps the one with more homes.

| Parcel | Competition at g19 | Apartments | Sheet |
|---|---|---|---|
| 678903 Woodland Hills Dr | skipped, `narrow_touch` | 10 | apartments, as before |
| 679218 Lebanon Pike | skipped, `private_lane` | 228 | apartments, as before |
| 678148 Hickory Hollow Pkwy | done, the parcel as one lot | 9 | apartments: 9 homes beat 1 |
| 677274 Hicks Rd | done, the parcel as one lot | 8 | apartments: 8 homes beat 1 |

So "one house by the existing access" never reaches an RM sheet today. That
is the same gap from the other side: the multifamily plan does not know
what the by-right side knows about access.

## 4. Multifamily and `fn_parcel_access`

The app does not call `fn_parcel_access` yet. It can, and `anon` may execute
it. Which access types hold the apartments back is a product rule, so it
goes to the owner with the numbers. Nothing is applied.

Every cohort parcel whose sheet shows apartments, with your reading:

| Parcel | `access.type` | Apartments | Target | Passes at g19 |
|---|---|---|---|---|
| 679195 Old Lebanon Dirt Rd | `none` | 38 | refuse | no |
| 673974 Hicks Rd | `none` | 14 | refuse | no |
| 678148 Hickory Hollow Pkwy | `private_lane` | 9 | refuse | no |
| 677274 Hicks Rd | `private_lane` | 8 | refuse | no |
| 679218 Lebanon Pike | `private_lane` | 228 | plan, 150 to 228 | yes |
| 678903 Woodland Hills Dr | `narrow_touch` | 10 | plan, 8 to 12 | yes |

The rule would work like the flood hold on 0 Todd Preis Dr: the apartments
stay on the sheet, marked as a what-if with your `access.message`, and they
stop counting as a by-right answer.

| Rule | Refusals of 50 | Plans of 60 |
|---|---|---|
| Today | 46 | 39 |
| What-if on `none` | 48 | 39 |
| What-if on `none` and `private_lane` | 50 | 38 |

The one plan lost under the wider rule is Lebanon Pike, which you say needs
a human look anyway. I recommend the wider rule. `narrow_touch` stays a
plan: a driveway is enough for apartments.

**One ask so the app needs no extra call.** The competition carries
`access` only when it is skipped. On 679195 and 673974 it is `done` with
`access.landlocked` on every row and no `access` object. Put `access` on
every `fn_sf_v1_candidates_app` answer, as on the plan.

## 5. RM2-NS and the other "-NS" districts

It is wider than one parcel. No "-NS" code has a row in
`jurisdiction_zoning_standards`. Every base district does.

| District | Parcels | Row | Base district | Base row |
|---|---|---|---|---|
| RM20-A-NS | 981 | no | RM20-A | yes |
| MUL-A-NS | 234 | no | MUL-A | yes |
| RM9-NS | 218 | no | RM9 | yes |
| RM15-A-NS | 83 | no | RM15-A | yes |
| CL-NS | 69 | no | CL | yes |
| OR40-A-NS | 40 | no | OR40-A | yes |
| MUN-A-NS | 33 | no | MUN-A | yes |
| OR20-NS | 25 | no | OR20 | yes |
| RM9-A-NS | 13 | no | RM9-A | yes |
| MUG-NS | 9 | no | MUG | yes |
| RM6-NS | 8 | no | RM6 | yes |
| CS-NS | 7 | no | CS | yes |
| MUG-A-NS | 6 | no | MUG-A | yes |
| RM15-NS | 4 | no | RM15 | yes |
| MUL-NS, MUN-NS, OR20-A-NS, RM40-A-NS | 3 each | no | the code without "-NS" | yes |
| RM20-NS | 2 | no | RM20 | yes |
| RM2-NS, RM4-NS | 1 each | no | RM2, RM4 | yes |

21 codes, 1,746 parcels.

My reading, to confirm against the ordinance before it ships: "-NS" is
Metro's no short-term-rental suffix. It limits a use and leaves the bulk
standards of the base district alone. If that holds, the fix is one lookup
rule and no new numbers: strip "-NS" and read the base row. I have not read
the ordinance section in this session, so treat the meaning of the suffix
as unverified. The row counts above are measured.

For 428 Old Lebanon Dirt Rd the RM2 rows already in the table are: two-family
minimum lot 20,000 sf, multifamily density 2 per acre with a 66,000 sf
minimum lot, attached minimum lot 2,800 sf.

## 6. The rest of your reply

- **0 Lebanon Pike.** Accepted. It stays a plan target of 150 to 228 until
  someone looks at what the 1,910 ft neighbour is. If it is not highway
  right-of-way, the target becomes a refusal.
- **One house by the existing access has no pad or driveway.** The app
  draws the parcel as the lot and says so. It does not invent a pad.
- **Red Jacket Dr.** The competition took 20.8 s alone at g19. It is under
  the 30 s line in the acceptance list and over the 20 s the anon role gets
  cold. It needs to come down, or the app will show a timeout on a first
  visit.
- **Not done at g19, still asked**, as in `APP_REPLY.md` §6: the
  replacement should take the best passing row and not the lane by
  preference, Old Clarksville Pike 7 lots against 17. A lane 86% on held
  land should not carry the plan, Old Dickerson Pike. Yield on flat tracts.
  The hammerhead.

## 7. For the owner

- The access rule in §4. `none` only, `none` and `private_lane`, or leave
  it.
- "One house by the existing access" as the stated answer on a parcel a
  lane reaches. The app shows it as the engine sends it.
- 0 Lebanon Pike and 0 Kidd Rd need a person to look at the frontage.
- The five target changes from `APP_REPLY.md` §4 are still open.
