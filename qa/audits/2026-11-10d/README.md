# Batch 6 and the batch-5 re-run · engine g21 · 2026-11-10

The owner asked for 20 more parcels and the last 40 again, and whether the
engine is getting better.

## What was run

- 20 new parcels drawn at random: vacant R, RS and RM land, land value of
  $5,000 or more, ordered by `md5(ogc_fid || ':batch6')`, four from each
  size band (1 to 2.5, 2.5 to 6, 6 to 15, 15 to 60 ac) and four RM. The 110
  parcels already in the cohort were excluded, with the same owner-name
  exclusions as batch 5. One draw was skipped as utility-owned (8036 Old
  Charlotte Pike). RM parcels with holes or a townhome corporation as owner
  were skipped, as in batch 5.
- The 40 parcels of batch 5.
- The engine changed twice while this ran: `sf_v1_engine_g21` at 22:25 UTC
  and `sf_v1_g21_time_budgets` at 22:42. Every plan, competition and
  multifamily answer was harvested again between 22:43 and 22:50 with
  `engine_release` = `g21` before and after. The first pass is not used.
- The 20 new parcels were driven through the app on the g21 answers. The
  sheets are here as `<fid>.png`.

## Scoreboard

| Same 40 parcels | g18 mid-patch | g19 | g21 |
|---|---|---|---|
| Plans, of 21 | 14 | 16 | 17 |
| Refusals, of 19 | 18 | 18 | 18 |
| Usable lots against the target midpoint | 78% | 86% | 88% |

| 20 new parcels | g21 |
|---|---|
| Plans, of 11 | 8 |
| Refusals, of 9 | 7 |

All 60 at g21: plans 25 of 32, refusals 25 of 28. The run is
`scripts/engine-cohort/runs/2026-11-10_g21.json`. The other 70 parcels were
not run here; the engine side reports plans 24 of 39 and refusals 31 of 31
on them at g20 with its own scorer.

Two passes are not real. 1055 Old Dickerson Pike passes at 8 lots on a lane
the engine's own rule blocks. 0 Pennington Bend Rd passes at 6 lots with
driveways on Briley Pkwy. Without them the 40 read 16 of 21, the same as
g19, and the new 20 read 7 of 11.

## What changed on the 40 since g19

| Parcel | g19 | g21 | Result |
|---|---|---|---|
| 332543 1055 Old Dickerson Pike | 7 on a lane | 8 on a lane; the default is 6 estate lots | pass, not real |
| 677102 0 Dickerson Pike | 45 | 47 | still under 50 |
| 664765 2825 Knight Dr | 17, failing grade | 10 frontage lots, passing | still under 20 |
| 679197 0 Old Clarksville Pike | 17 by the competition | 17 by default | pass, as before |

The other 36 answers are the same.

## Where the lots are lost

The detail and the asks are in `ENGINE_HANDOFF.md`, ranked.

1. The street grade test reads raw ground one station at a time. It throws
   out 155 lots of street plans on four parcels and leaves 110.
2. Streets loaded on one side and lots at twice the minimum.
3. Multifamily: the access check is off unless asked for, parking fills the
   site (237 stalls for 17 homes), and apartments are drawn where attached
   homes fit.
4. Frontage counted on Briley Pkwy.

## App

No error on any of the 20 sheets under g21. One fix: the engine now sends
the unplanned land as a note of its own, so the panel said it twice. The
note is no longer repeated when the panel's own line is shown.

## For the owner

- The cut and fill a street may need before the plan is refused.
- The access rule on multifamily, still open.
- On RM at 9 per acre or under, attached homes ahead of apartments on a tie.
- 0 Wright Ave needs a person to look at the street.
