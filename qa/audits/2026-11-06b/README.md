# The eleven, re-run after the engine's g13 reply — 2026-11-06

The engine answered the 2026-11-06 handoff (`qa/audits/2026-11-06/`) with
release g13. It changed these things:

- land steeper than 25% is held out as hillside;
- a shared private drive competes on estate districts (minimum lot of
  20,000 SF and up);
- `access.landlocked` is a code fail;
- the townhome engine trims its drawing to the density cap;
- a flood skip returns its hold geometry;
- terrain failures are cached and reported as unknown;
- the competition says `why` when no pattern draws a lot.

It also suggested a rule for when the app should put the competition's best
on the sheet.

This folder covers the app side of g13 and a re-run of the eleven test
parcels the handoff named. Three more lots were run to exercise the new
behaviors:

- 6404 Eatons Creek Rd: a shared private drive.
- 0 Hickory Bend Dr: a flood skip.
- 0 Union Hill Rd: the equal-lots rule.

**How it was run.** Every engine answer was pulled live on 2026-11-06. The
DEM was cached for every parcel, so all answers are graded with terrain:
plans took 0.1–6.5 s and competitions 0.6–12.1 s. The app was then driven on
those answers and screenshotted. Three things were not re-pulled:

- **The multifamily plans.** Their generator did not change in g13, and
  re-running it would save another plan to the database, so the
  2026-11-06 multifamily answers stand.
- **The parcel facts and design contexts.** These were also unchanged and
  were reused.

## What changed, parcel by parcel

"Likelihood" means the same thing as last time. A competent civil engineer
or developer, given the parcel, lands on substantially the same answer: the
same product, a yield within about 20%, and the same street concept. The
score is for what the app puts on the sheet by default.

| # | Lot | Before g13 | Now | Likelihood |
|---|---|---|---|---|
| 1 | **6247 Mt View Rd** (RS10, 6.9 ac) | 15 lots on a T street, all tests pass | the same; the competition agrees (loop best, buildable) | 70% → **70%** |
| 2 | **0 Dry Fork Rd** (RS40, 31 ac, 37% slope) | 16 lots on a loop at 63% street grade | **0 lots**: 25.0 ac held out as hillside, no 40,000-SF lot fits on the rest; offers the one house | 5% → **70%** |
| 3 | **6404 Eatons Creek Rd** (R40, 9.0 ac) — new | — | **5 estate lots on a shared private drive**, all tests pass, put on the sheet over the default's 3 frontage lots | **60%** |
| 4 | 0 Swiss Ave (RM15, 4.1 ac) | 36 townhomes (the apartment plan failed a 14-SF overlap check) | unchanged; the note now says the neighborhood took the sheet *because the apartment plan did not draw* | 55% → 55% |
| 5 | 1430 Neelys Bend Rd (RS80, 8.4 ac) | 0 lots (7.2 ac flood hold) | unchanged; under the fill scenario still 0 ("7.74 ac buildable") | 50% → 50% |
| 6 | 0 Hart Ln (R10, 35 ac, 17% slope) | 89 lots, streets at 25.4% | **73 lots** on a loop (3.1 ac of hillside held out); streets still 25.4%, 2,600 ft over the limit | 40% → 45% |
| 7 | 0 Campbell Rd (RS80, 17.8 ac, 27% slope) | 0 lots; the competition's 4 lots fail | 0 lots, now with the reason: 11.8 ac held out as hillside, no 80,000-SF lot fits | 20% → 40% |
| 8 | 0 Union Hill Rd (RS40, 7.6 ac) | 3 lots on a 699-ft cul-de-sac through a wetland buffer | **3 lots on a 384-ft street, no fails**: the competition's neighborhood plan, on the sheet by the equal-lots rule | 15% → 35% |
| 9 | 0 Old Lebanon Dirt Rd (RM9, 4.9 ac, landlocked) | 38 apartments, access assumed by easement | unchanged; the neighborhood side (10 grid lots) now fails `access.landlocked` | 35% → 35% |
| 10 | 0 Westcap Rd (R15, 10.5 ac, 20% slope) | 13 lots, T street at 28.8% | **9 lots** (2.6 ac of hillside held out); the T street still climbs at 28.8% and crosses 729 ft of wetland | 20% → 25% |
| 11 | 0 Smith Springs Rd (RM6, 7.0 ac) | 42 apartments in one bar; the townhome search timed out | apartments unchanged; the townhome option now draws: **42 townhomes, trimmed from 62** to the density cap, still failing `alley.street_to_street` | 20% → 20% |
| 12 | 0 Hickory Hollow Pkwy (RM20, 1.7 ac, 54 ft wide, landlocked) | "Refused: fits a house" above a drawn 9-unit building; best = 9 frontage lots | the frontage lots are gone (the neighborhood's 8 lots fail `access.landlocked`); the refused-but-drawn building is unchanged | 5% → 5% |

The four flood skips from the last batch now draw why they skipped. The sheet
used to be blank beside "Skipped"; it now hatches the hold, and the panel says
how much it takes:

| Lot | Hold drawn | Likelihood |
|---|---|---|
| 5014 Buena Vista Pike (RS15) | 0.86 ac, the whole site | 85% → 90% |
| 0 Larkin Springs Rd (RS10) | 23.06 ac, the whole site | 80% → 85% |
| 0 Gulch St (RS7.5) | 2.40 ac, the whole site | 70% → 75% |
| 0 Hickory Bend Dr (RS10) | 5.24 ac, the whole site | 60% → 65% |

**Net.** Of the twelve, the top three are now plausible as drawn or as
answered. Last time only one of the eleven was. The terrain holds turned two
of the worst answers into honest ones:

- **Dry Fork:** 16 impossible lots became a clear zero.
- **Campbell:** a zero that now gives its reason.

The equal-lots rule fixed the visible half of Union Hill. Three things still
decide the bottom half:

- streets are not laid out by grade (Hart Ln, Westcap);
- the estate grammar does not fire where it is needed (Union Hill, Campbell,
  Neelys Bend);
- the multifamily generator: product fit, overlaps, and access (Smith
  Springs, Swiss Ave, Hickory Hollow, Old Lebanon).

## Lot by lot

### 6247 Mt View Rd (666092) — unchanged, still the best layout

15 lots on a T street, 1,076 ft of street. The street grade passes at 11.6%,
with 100 ft over the limit, which is within the engine's allowance. The
competition's three grammars agree on the pattern:

| Grammar | Lots | Street | Fails |
|---|---|---|---|
| Loop (T street) | 15 | 1,076 ft | none |
| Neighborhood | 12 | — | none |
| Grid | 10 | — | the grade |

Nothing for a civil to argue with at concept level.

### 0 Dry Fork Rd (679540) — from the worst answer to a right one

The engine now holds the 25.0 ac steeper than 25% out of the layout. On the
remaining ground no 40,000-SF lot fits beside a new street, and every grammar
draws 0, including the drive. The app shows:

- the engine's reason under the competition;
- the DEM's numbers: 37% mean slope, 77% max, 287 ft of fall;
- a caveat that no longer claims the engine ignores terrain. It now says the
  steep land is held out and streets are not yet laid out by grade.

A civil looking at this ground says "no subdivision; maybe one or two homes
on the flatter top". The app says 0 new lots and offers the one house.

Two things keep it from 85%:

- **The reason contradicts itself.** It reads "no lot … fits …: 31.19 ac
  buildable". 31.19 ac is the site before the 25.0-ac hold; the real
  remainder is about 6.2 ac. Reported to the engine.
- **The hold is not drawn.** The sheet shows the parcel and contours but no
  hatch on the 25.0 ac, because a 0-lot answer carries no geometry.

Picture: `679540_dry_fork_panel.png`.

### 6404 Eatons Creek Rd (661661) — new: the shared private drive

R40, 9.0 ac, gentle ground (5.6% mean slope). The competition's best is the
new drive grammar: 5 lots of 40,000 SF and up on a shared private drive, every
test passing. The drive is 857 ft long, a 16-ft lane in a 24-ft access
easement. The default (loop) grammar draws 3 frontage lots that fail
`open.unassigned`. By the rule (more lots and buildable) the drive takes the
sheet, and the panel says why.

The app labels it as what it is:

- the band is an **access easement**;
- the sheet reads "SHARED PRIVATE DRIVE · 24' ACCESS EASEMENT";
- the basis line says "no new public street";
- the panel gives the drive's length and the jurisdiction's cap of 6 lots.

A developer on 9 rural acres would very likely land on 4–6 estate lots off a
private drive or flag poles, so the product and yield are right. The drive
itself is long for 5 lots, though. It meets the road at three points, so it
passes the 750-ft dead-end cap (the cap is applied as a dead-end limit, not to
the drive's total length). Whether Metro reads the cap that way is asked of the
engine.

Picture: `661661_eatons_creek_shared_drive.png`.

### 0 Swiss Ave (679911) — unchanged

The 60-apartment plan (`mf_max_gsf_v1`) still fails the app's overlap check:
the amenity building overlaps the drive by 14 SF. The re-solve returns the same
plan, so the townhome engine's 36 homes on a street take the sheet.

The note on the layout panel used to say the neighborhood went on the sheet
"because it places more homes". It now says "because the multifamily plan did
not draw", which is the truth.

### 1430 Neelys Bend Rd (395417) — unchanged

| Scenario | Ground | Lots |
|---|---|---|
| By right | the flood hold takes 7.16 ac; 1.8 ac are left | 0 |
| Fill scenario | 7.74 ac buildable | 0 (still) |

The estate gap is the same as last time: no 80,000-SF lot is placed beside a
new street or on a drive. The engine did not reach the handoff's "2–3 lots
under fill".

### 0 Hart Ln (680596) — closer on yield, still not buildable as drawn

The engine holds 3.1 ac of hillside out, and the loop now draws 73 lots, in
the 60–75 band a civil would expect. But the streets are still drawn as if
the ground were flat:

- 25.4% grade, 2,600 ft over the 10% limit;
- every grammar fails the grade (grid 71, neighborhood 46, loop 73).

The competition took 12.1 s. The engine's verdict says not buildable as drawn.

Picture: `680596_hart_ln.png`.

### 0 Campbell Rd (680202) — a zero with its reason

The engine holds 11.8 ac of the 17.8 ac out as hillside, and no
80,000-SF lot fits on the rest. Every grammar draws 0, including the drive.
Last time the app showed a zero next to a 4-lot alternative that needed
3,859 ft of street. Now it shows a zero and why.

A developer would still try one or two estate lots off the frontage of the
roughly 6 non-steep acres. That is why this is 40% and not higher. The same
"17.80 ac buildable" wording issue as Dry Fork applies.

Picture: `680202_campbell.png`.

### 0 Union Hill Rd (680001) — the equal-lots rule

The default (loop) grammar draws 3 lots on a 699-ft single street with a
bulb. That street crosses 76 ft of wetland buffer and fails
`cost.street_ft_per_lot`. The neighborhood grammar draws the same 3 lots on
384 ft and fails nothing. Under the engine's suggested rule the app now
sheets the neighborhood plan and says:

> The neighborhood grammar draws the same 3 lots as the default (loop) grammar on 384 ft of new street against 699 ft, failing no test to its 1, so the sheet shows it. It is still by right.

"Show the default answer (3 lots)" puts the loop plan back.

It is still a public street with a turnaround bulb at each end, for 3 rural
lots. A civil would serve these from a shared drive or flag poles. The drive
grammar ran and drew nothing ("no lot of 40000 sf fits …: 7.25 ac
buildable"), so the handoff's "3 lots with no public street" is not met.

Pictures: `680001_union_hill_same_lots.png` (now) and
`680001_union_hill_default_loop.png` (the default it replaced).

### 0 Old Lebanon Dirt Rd (679195) — unchanged where it matters

The multifamily plan (38 apartments, "access via easement assumed") is
unchanged. The neighborhood side moved: the grid's and the neighborhood's 10
lots now fail `access.landlocked`, and the townhomes (28) still fail the
dead-end tests. The apartments stay the default.

**A money bug the re-run surfaced.** The KPI strip shows a **1,882.7%
margin**. `fn_mf_money` prices the for-sale units at **$5,227/SF** "from 19
local sales". Other parcels show the same pattern:

| Parcel | Price per SF |
|---|---|
| Swiss Ave | $6,704 |
| Smith Springs | $2,752 |
| 2622 W Heiman | $1,112 |
| 2600 W Heiman | $1,069 |
| Hickory Hollow | $187 (a plausible figure) |

The sales $/SF is several times the market on most parcels. Reported to the
engine; the app shows the server's number as given.

### 0 Westcap Rd (679820) — fewer lots, same street

The engine holds 2.6 ac of hillside out (hatched, as natural land rather than
"unassigned") and draws 9 lots, down from 13. The T street still runs up the
slope:

- 28.8% grade, 700 ft over the limit;
- 729 ft of the street lies in wetland.

The handoff's "8+ lots that pass" is not met.

Picture: `679820_westcap.png`.

### 0 Smith Springs Rd (670533) — the townhome engine now finishes

With the competition's townhome budget at 8 s (the engine's advice), the
search finishes: the whole competition took 4.8 s, against 22.8 s before. The
townhome row is a v3 plan of 42 homes. Its drawing carries the engine's note:
"62 homes drawn; trimmed to the district density cap of 42 (the 20 furthest
from the street removed)". The app shows that note under the townhome facts.

It fails `alley.street_to_street`, so it is not buildable, and the grid's 26
lots remain the neighborhood's best. The apartments (42, one 3-story bar,
2.7 stalls per unit) stay the default. Product fit on low-density RM is still
the engine's open item.

Picture: `670533_smith_springs_townhomes_trimmed.png`.

### 0 Hickory Hollow Pkwy (678148) — half fixed

The neighborhood's best is no longer 9 "frontage lots, no new street" on a
lot with no street. It is 8 lots that fail `access.landlocked`, which the
panel marks "fails a code test". The page still contradicts itself, though.
It shows "Refused: 54.0 ft max width < 67.3 ft required" above a drawn
4-story, 9-unit building at a −28% margin: the multifamily generator still
ignores the buildability refusal (engine item 3, open).

### The four flood skips

`fn_sf_v1_site_app` now returns the hold on a skip. The app draws it ("Flood
hazard area · held out") and says how much it takes. All four are entirely in
the SFHA. Picture: `672526_hickory_bend_hold.png`.

## What the app changed for g13

- **Auto-best, the engine's rule.** The competition's best takes the sheet
  when it is buildable and draws at least the default's lots, or when it draws
  the same lots. The default stays whenever it draws strictly more. Never a
  one-lot best (the lot of record) and never the townhome candidate (metrics
  only). The panel names the case and offers the way back:
  - "the default draws no lots";
  - "the same 3 lots … on 384 ft against 699 ft";
  - "5 lots to the default's 3 and fails no code test".
- **The shared private drive.** It is drawn and labelled as an access easement
  and a private lane, not a public street: the sheet label, the title block
  ("5.2% easement"), the panel's Land and Private drive rows, and a sentence
  with the drive's length, lane, easement and lot cap. "View this plan" on a
  drive row sends the drive section the competition uses: `pattern: 'drive'`
  alone falls back to frontage lots.
- **Competition rows.** A row that ran and drew nothing ("no lot of … fits")
  reads as a reason, not an error. A test the drive section switches off
  (a limit of 1e9) reads "no limit here".
- **`why`.** It is shown under the competition, one reason per line, without
  the grammar's own settings. On multifamily land, the "no neighborhood"
  sentence carries the first reason.
- **Flood skips.** The site layers are fetched and the hold is drawn, with the
  acres in words.
- **The townhome trim note,** shown under the townhome facts.
- **Townhome budget.** The RM competition passes `th_budget_ms: 8000`.
- **Terrain wording.** Where the plan says land was held out as hillside, the
  app no longer says the engine ignores terrain. Streets are still not laid
  out by grade, and the caveat says so.

## For the engine

Each acceptance item from the handoff, checked against this run:

| Item | Status |
|---|---|
| Hart Ln passes `street.grade_max` | not met |
| Westcap: 8+ lots that pass | not met |
| Dry Fork: a clear "too steep" | met in substance; wording issue below |
| Union Hill: 3 lots, no public street | not met |
| Campbell: 2–4 lots or a reason | met (a reason) |
| Neelys Bend under fill: 2–3 lots | not met |
| Frontage only on a mapped street | met |
| Landlocked flagged | met on the lot grammars; the multifamily generator still assumes an easement |
| th_v3 trimmed to the cap | met |
| Hold on skip | met |
| Competition under 20 s | met (4.8 s on Smith Springs) |

New asks:

1. The "ac buildable" in the no-lot reason counts the site before the
   hillside hold. Dry Fork reads 31.19 ac with 25.0 ac held out; Campbell
   reads 17.80 ac with 11.8 held out.
2. Return the hillside hold as geometry on a 0-lot answer, as the flood hold
   now is on a skip.
3. Make `pattern: 'drive'` self-contained. Today the app copies the drive
   section from `fn_sf_v1_params()`.
4. Is the 750-ft cap on a private drive's dead end or on its length? The
   Eatons Creek drive is 857 ft with three connections.
5. Flag lots, for the estate cases the drive does not reach.
6. `fn_mf_money`'s sales $/SF runs $1,069–$6,704 on most parcels. It gives a
   1,882.7% margin on Old Lebanon.

The paste-ready version is in the session's engine handoff.

## Pictures

- `680001_union_hill_same_lots.png` and `680001_union_hill_default_loop.png`:
  the equal-lots rule.
- `661661_eatons_creek_shared_drive.png`: the shared private drive.
- `672526_hickory_bend_hold.png`: a flood skip with its hold drawn.
- `679540_dry_fork_panel.png`: the hillside zero.
- `680202_campbell.png`: the hillside zero, sheet view.
- `680596_hart_ln.png` and `679820_westcap.png`: hillside held out, streets
  still over the grade limit.
- `670533_smith_springs_townhomes_trimmed.png`: the townhome engine's 42,
  trimmed from 62.
