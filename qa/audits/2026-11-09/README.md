# Twenty more lots, ranked by how likely a civil engineer or developer lands on the same layout — 2026-11-09

Eric: "run 20 more scenarios." Same recipe as the 2026-11-06 batch, against the
engine's g14 release (2026-11-08) and the app changes it asked for.

## The draw

- **16 by-right lots:** vacant R / RS parcels of 1–60 ac, four per size band
  (1–2.5, 2.5–6, 6–15, 15–60 ac), by a fixed hash with a new salt. Every parcel
  used in an earlier batch or battery (78 ids) is excluded, as are the
  non-sites: associations ("Assoc.", "Assn.", "Owners Ass…", "H.O.A."),
  owners-in-common, co-ops, churches, public and institutional owners,
  conservation owners, and lots appraised under $5,000. LLC and Inc. owners
  stay in: that is who holds development land.
- **4 RM lots** (1.5–8 ac) by the same hash. The draw skipped two associations
  and a university before settling on four.

**Terrain.** USGS 3DEP refused 8 of the first 20 fetches
(`usgs_3dep_unavailable`) and one call died on the engine's 12-s HTTP timeout
(that one raised an exception instead of returning an error; noted for the
engine). The failures were retried straight through `fn_parcel_topo_fetch`,
which bypasses the engine's 10-minute failure cache, until 19 of 20 had
terrain. The twentieth, 0 Robinson Rd, is skipped for floodplain by right, so
its missing terrain changes nothing. **All answers below are graded with
terrain.**

**Timings** (warm terrain): by-right plans 0.1–1.0 s; competitions 0.3–3.8 s on
R / RS, 4.8–10.4 s on RM with the townhome search at 8 s; the townhome
engine's own call 0.1–6.5 s. The multifamily context compile is the slow one:
4.6–7.0 s per parcel.

## What g14 changed, and what the app did with it

The engine (2026-11-08) fixed the four asks from the last round: the no-lot
reason now counts land after the holds ("5.64 ac buildable after the holds
(site 31.19 ac, of which 25.0 ac held as hillside)") and every plan carries
`buildable_after_holds_ac`; the hillside hold comes back as geometry
(`hillside_wkt`, `hillside_ac`), 0-lot answers included; `pattern: 'drive'`
is self-contained; `fn_mf_money` prices by the comps' total floor area. The
750-ft private-drive figure became its own test,
`access.private_drive_length`, kept as a quality flag.

The app, in this PR:

- hatches the hillside hold (tan) beside the flood hold (blue), on 0-lot
  answers too, and says "The hillside hold takes 3.35 ac out (steeper than
  25%, hatched tan on the sheet); 0.65 ac are left after every hold";
- counts the hillside toward "% held out" in the title block;
- drops its copy of the drive's params section (`pattern: 'drive'` alone);
- files `access.private_drive_length` with the quality flags, as the engine
  does, so a flagged drive is not shown as failing code;
- keys the held-out land in the legend (flood, hillside, wetland, deep fill)
  when it is on the sheet;
- says "1 home", not "1 homes", on the layout panel.

## The ranking

"Likelihood" means: a competent civil engineer or developer, given the same
parcel, lands on substantially the same answer — the same product, a yield
within about 20%, and the same street concept. It scores the answer the app
puts on the sheet by default.

| # | Lot | What the app shows by default | Likelihood | Why |
|---|---|---|---|---|
| 1 | 4819 Fairmeade Ct (RS40, 1.25 ac) | No new lots; offers the one house | **90%** | 54,450 SF cannot make two 40,000-SF lots, and 0.48 ac is over 25% slope besides. |
| 2 | 0 Penn Meade Way (RS10, 6.6 ac) | Skipped: floodplain, and landlocked | **90%** | 6.04 ac in the SFHA, no street edge, appraised at $9,600. A remnant. |
| 3 | 0 Hillwood Blvd (RS40, 2.85 ac) | 2 frontage lots, no new street, all pass | **85%** | Two 62,000-SF estate lots off the boulevard, a $1.1 M vacant lot in Hillwood. Exactly what gets built. |
| 4 | 54 Park Crescent Cir (R15, 1.52 ac) | No new lots; offers the one house | **85%** | 1.23 of 1.52 ac is over 25% slope; a $675k cul-de-sac lot carries one house. |
| 5 | 4255 Brick Church Pike (R20, 4.09 ac mapped) | No new lots; offers the one house | **80%** | 1.13 ac flood hold plus 3.35 ac of hillside leave 0.65 ac. 28% mean slope. |
| 6 | **1014 Antioch Pike (R8, 2.8 ac)** | **8 lots on a 206-ft cul-de-sac street**, all pass | **75%** | The arithmetic says 9; the cul-de-sac stem with pie lots round the bulb is the standard infill answer. |
| 7 | 1422 Campbell Rd (R20, 17.3 ac) | No new lots | **75%** | Landlocked, 30% mean slope, 12.5 ac over 25%. Nothing a developer would buy for lots. |
| 8 | 0 Robinson Rd (R10, 31 ac) | Skipped: floodplain (fill scenario: 23 lots on a loop) | **70%** | All 31 ac in the SFHA. By right the answer is a flood study first; the fill scenario is the "after". |
| 9 | **0 Hills Ln (R10, 6.62 ac mapped)** | **17 lots on one new street** (the grid grammar, from the competition), all pass | **70%** | The default's 14 frontage lots are one tap away; the grid's 17 on 1,188 ft matches the arithmetic (17). A civil would draw the street. |
| 10 | 0 Old Hickory Blvd (R40, 3.21 ac) | No new lots | **70%** | Landlocked; one 40,000-SF module does not fit beside any street that could be built. One house by easement. |
| 11 | 0 Hickory Hollow Pkwy (RM20, 1.95 ac mapped) | 29 townhomes on a mews (the neighborhood took the sheet over 26 apartments) | **60%** | A 90-ft-wide strip: two rows along a mews is the plausible product; 29 is the top of the range. |
| 12 | 0 Old Hydes Ferry Pike (RS20, 1.37 ac) | 1 frontage lot | **55%** | 59,677 SF could make two 20,000-SF lots if the frontage allows; the engine finds room for one. |
| 13 | 0 Old Hickory Blvd (RS20, 5.27 ac) | 2 lots on a 359-ft public cul-de-sac (the grid, from the competition) | **45%** | 2.4 ac flood hold and 0.55 ac hillside leave 2.03 ac. Two lots, yes; a public street for them, no. |
| 14 | 4525 Cato Rd (RS15, 2.14 ac) | No new lots | **40%** | 1.7 ac buildable, 15% slope, nothing held out. Two frontage lots look possible; the competition's 2 lots on a street fail the grade. |
| 15 | 0 Nashboro Blvd (RM6, 1.66 ac) | 9 apartments in one 3-story bar, 101 stalls (tie with 9 townhomes; apartments stay) | **30%** | The count is right (the density cap). The product is not: on RM6 at 1.7 ac a developer builds 9 townhomes, and nobody paves 101 stalls for 9 units. |
| 16 | 0 Walker Ln (RS20, 5.5 ac) | 3 lots on a 970-ft through street at 10.5% grade (2 fails) | **25%** | A street connecting three roads for 3 lots; the arithmetic says 7. A civil draws a 500-ft cul-de-sac for 5–7. |
| 17 | 7695 Old Charlotte Pike (R80, 45.9 ac) | No new lots | **25%** | 18.8 ac of hillside held out leaves 21.4 ac on a bench between the ridge and the creek; the engine finds no street into it. A developer runs a drive along the bench for 6–10 estate lots. |
| 18 | 0 Cedarstone Way (RM9, 3.37 ac) | 30 apartments in two bars, 112 stalls (over 8 townhomes) | **20%** | The owner is a townhome builder finishing Cedarstone Way. The apartment plan is 3.7 stalls per unit at a −96% margin. |
| 19 | 0 Hicks Rd (RM4, 4.07 ac mapped) | 14 apartments, access by easement assumed | **15%** | Landlocked and 28% slope. The townhome row failed in the competition (a v2 fallback) while the townhome engine itself draws 16. |
| 20 | 0 Blevins Rd (RS20, 31.8 ac) | 4 lots on a 4,499-ft loop at 49% grade, 5 fails | **5%** | Landlocked mountain land, 30.6% mean slope, 20.9 ac over 25%; 3,352 ft of the street crosses wetland buffer. The right answer is 0, said plainly. |

**The count.** Nine of twenty answers are "no new lots", "one house" or
"skipped"; seven of those nine are what a civil would say (Cato Rd and Old
Charlotte Pike are the two under-calls). Of the eleven drawn layouts, three
are what a civil would plausibly draw (Hillwood, Antioch Pike, Hills Ln) and a
fourth is close (Hickory Hollow Pkwy's townhomes). Last batch it was one of
ten. The hillside hold did that: it turned the mountain lots from absurd loops
into honest zeros.

**What still decides the bottom of the table:**

1. **The estate grammar on long or deep tracts.** Old Charlotte Pike (21 ac
   buildable, 0 lots), Walker Ln (3 on a through street, 7 by arithmetic), Old
   Hickory Blvd RS20 (a public cul-de-sac for 2). Flag lots and a drive along
   the usable land would fix all three.
2. **A loop on a landlocked mountain.** Blevins Rd should stop at the access
   fail and the slope, not draw 4,499 ft of street.
3. **Multifamily product and parking on small RM.** Nashboro Blvd (101 stalls
   for 9 units), Cedarstone Way (112 for 30): the max-GSF generator fills the
   site with stalls and books a −71% / −96% margin. On RM6 and RM9 under 4 ac
   the product is townhomes.
4. **Landlocked RM.** Hicks Rd: the competition's townhome row fell back to v2
   and refused, while th_v3 draws 16 homes; the app only draws the townhome
   engine's plan when the competition names it best.

## Lot by lot

### 1 · 4819 Fairmeade Ct (661591) — RS40, 1.25 ac
- 0 new lots: "no lot of 40000 sf (140 x 290 ft) fits … 0.77 ac buildable after the holds (site 1.25 ac, of which 0.5 ac held as hillside)". Every grammar draws 0; the drive too.
- Right. One house on a 1.25-ac lot of record.

### 2 · 0 Penn Meade Way (677281) — RS10, 6.6 ac, appraised $9,600
- Skipped: "floodplain leaves no buildable piece; the parcel is also landlocked (no edge touches a mapped street or vacant land)". The hold (6.04 ac) is drawn on the sheet. The fill scenario skips too, for the access.
- Right, and a candidate for the non-site filter (a $9,600 floodway remnant).

### 3 · 0 Hillwood Blvd (679618) — RS40, 2.85 ac, flat, appraised $1.14 M
- 2 frontage lots, no new street, all 10 tests pass; the competition agrees (the grid's 1 lot on 571 ft is the only alternative).
- Right: two estate lots off Hillwood Blvd. Picture: none needed; the plan is two lots side by side.

### 4 · 54 Park Crescent Cir (659921) — R15, 1.52 ac, 20% slope
- 0 new lots; 1.23 ac hatched as hillside, 0.29 ac left. The panel's caveat now reads "the engine holds the land steeper than 25% out as hillside and finds no lot on the rest; it does not yet lay streets out by grade."
- Right. Picture: `659921_park_crescent_hillside_zero.png` (the new hatch).

### 5 · 4255 Brick Church Pike (686430) — R20, 7 ac deeded, 4.09 ac mapped site
- 0 new lots: 1.13 ac flood hold, 3.35 ac hillside, 0.65 ac left. Both holds hatched; the one house on offer. Added to the battery.
- Right.

### 6 · 1014 Antioch Pike (667638) — R8, 2.8 ac
- 8 lots at 65 × 125 ft on a 206-ft cul-de-sac street, 7.4% grade, all 11 tests pass; 0.54 ac of wetland buffer and the flood hold held out at the back. The competition: loop 8 (best), neighborhood 7, grid 4.
- The one layout of the batch a civil would sign as drawn. Picture: `667638_antioch_pike_8_lots.png`.

### 7 · 1422 Campbell Rd (665951) — R20, 17.3 ac, landlocked, 30% slope
- 0 lots; 12.47 ac hillside, 4.83 ac left; "landlocked: … access is assumed through adjoining vacant land". The competition's grid draws 3 lots on 2,697 ft that fail `access.landlocked` and the grade; the verdict says so.
- Right.

### 8 · 0 Robinson Rd (680785) — R10, 29.4 ac deeded, 31.07 ac mapped
- Skipped: the whole site is in the SFHA (31.07 ac held). The hold is drawn. The fill scenario (floodway only) draws 23 lots on a loop, 16.97 ac site after a 14.11-ac floodway hold, one cost flag.
- Right by right. USGS refused this parcel's terrain four times; the skip does not need it.

### 9 · 0 Hills Ln (680391) — R10, 7.8 ac deeded, 6.62 ac mapped, 4% slope
- Default: 14 frontage lots along Hills Ln, no new street. Competition: the grid's 17 lots at 70 × 145 ft on 1,188 ft of one new street, no fails, buildable. By the engine's rule (more lots and buildable) the grid takes the sheet; the panel says "The grid grammar draws 17 lots to the default (loop) grammar's 14 and fails no code test, so the sheet shows it", with the 14 one tap away.
- A civil would draw the street. Added to the battery (the `more_lots` case with house lots). Picture: `680391_hills_ln_grid_17.png`.

### 10 · 0 Old Hickory Blvd (673175) — R40, 3.21 ac, landlocked
- 0 lots. The competition's 2 lots fail `access.landlocked`; the "No street frontage — access via easement assumed" banner shows.
- Right: one house by easement.

### 11 · 0 Hickory Hollow Pkwy (673710) — RM20, 1.95 ac mapped, 90 ft wide
- The seed generator: 26 apartments in two 4-story structures. The townhome engine: 29 homes on a mews, every required test passing, 10 of 8 guest stalls. The neighborhood took the sheet by itself (29 > 26); the switch back works.
- Plausible: a 90-ft strip takes two rows of 20-ft townhomes along a mews; 29 at 12.2 / ac is the top of the range. Picture: `673710_hickory_hollow_pkwy_29_townhomes.png`.

### 12 · 0 Old Hydes Ferry Pike (679683) — RS20, 1.37 ac
- 1 frontage lot (the parcel itself, 100 × 200 module); "no new street fits". All tests pass.
- 59,677 SF is 2.98 lots of 20,000 SF; whether two frontage lots fit depends on the frontage width, which the answer does not say. Under-call or right; 55%.

### 13 · 0 Old Hickory Blvd (673844) — RS20, 5.27 ac mapped
- Default: 0 lots (2.4 ac flood hold, 0.55 ac hillside, 2.03 ac left). Competition: the grid's 2 lots on a 359-ft public cul-de-sac, flagged `cost.street_ft_per_lot` ("buildable by the tests, but the street is not paying for itself"); by the default-empty rule it took the sheet.
- Two lots, yes; a public street with a bulb for two lots, no. A shared drive. Picture: `673844_old_hickory_blvd_grid_2.png`.

### 14 · 4525 Cato Rd (661303) — RS15, 2.14 ac, 15% slope
- 0 lots: "no lot of 15000 sf (85 x 180 ft) fits … 1.70 ac buildable after the holds"; "no new street reaches lots inside the site". Competition: the grid's 2 lots on 337 ft fail the grade.
- Likely an under-call: 1.7 ac of buildable ground on a road should carry two 15,000-SF frontage lots. The frontage grammar found none; asked of the engine.

### 15 · 0 Nashboro Blvd (670783) — RM6, 1.66 ac
- The max-GSF generator: 9 apartments in one 3-story L-shaped bar, 13,931 GSF, **101 stalls for 16 required**, a −71% margin at $78/SF (37 sales). The townhome engine: 9 homes on a mews (16 drawn, trimmed to the cap of 9), all tests passing. Tie: "Both place 9 homes, the most the district's density allows; apartments stay the default."
- The count is right. The product is wrong: nine townhomes is the development; the apartment plan is a parking lot with a building in it. The tie rule is the owner's; the parking is the engine's. Picture: `670783_nashboro_blvd_101_stalls.png`.

### 16 · 0 Walker Ln (676829) — RS20, 5.5 ac, 9.6% slope
- 3 lots at 100 × 200 ft (avg 54,155 SF) on a 970-ft single street that connects three roads, 10.5% grade (200 ft over), 2 fails. Competition: the grid and neighborhood draw 4 and fail the same two; the shared drive draws 2 on 1,017 ft and is flagged by the new `access.private_drive_length` test. The best (the drive, buildable by code) draws fewer lots than the default, so the default stays.
- A civil draws a ~500-ft cul-de-sac for 5–7 lots (the arithmetic says 7). The through-street for three is not a plan anyone builds. Picture: `676829_walker_ln_through_street.png`.

### 17 · 7695 Old Charlotte Pike (692464) — R80, 49.8 ac deeded, 45.9 ac mapped
- 0 lots: 3.75 ac flood hold, 18.81 ac hillside, 21.41 ac left; "no new street reaches into the site from the frontage". Both holds and the wetland buffer are hatched. Competition: the grid's 3 lots on 6,087 ft of street fail dead end, block and grade.
- The usable land is a long bench between the ridge and the creek; a developer runs a private drive along it for 6–10 two-acre lots. Under-call. Picture: `692464_old_charlotte_pike_hillside_hold.png`.

### 18 · 0 Cedarstone Way (676422) — RM9, 3.37 ac, 17.6% slope, Cedarstone Homes LLC
- The max-GSF generator: 30 apartments in two 3-story bars, 46,464 GSF, 112 stalls for 52 required (3.7 per unit), −96% margin at **$11/SF from 8 sales** (the one pricing figure in the batch that is still wrong). The townhome engine: 8 homes on a street, all passing. Apartments stay (30 > 8).
- The owner builds townhomes on this street; the density allows 30. The townhome engine's 8 is the under-call and the apartment plan's parking is the over-call. Picture: `676422_cedarstone_way_apartments.png`.

### 19 · 0 Hicks Rd (673974) — RM4, 4.07 ac mapped, landlocked, 28% slope
- The seed generator: 14 apartments, 25 stalls, "access via easement assumed", −33% margin. Competition (10.4 s): the grid's 1 lot fails `access.landlocked`; the townhome row failed with `th_v2_requires_verified_street_frontage`. Called directly, the townhome engine draws 16 homes (41, trimmed to the cap) that fail `access.second_connection`.
- Landlocked and steep: a handful of homes by easement at most. The competition's townhome row should carry v3's answer and its fails, not v2's refusal (asked of the engine).

### 20 · 0 Blevins Rd (670893) — RS20, 31.8 ac, landlocked, 30.6% slope
- 4 lots on a 4,499-ft loop with a cross street, 49.1% grade (2,900 ft over), 3,352 ft of street through wetland buffer, 20.93 ac of hillside hatched round it; 5 fails. The competition's grid draws 10 that fail access and grade.
- The engine should stop here. Landlocked plus a hillside hold over half the site is a zero with a reason, not a loop. Picture: `670893_blevins_rd_loop_on_a_mountain.png`.

## Fixed in the app with this batch

See "What g14 changed, and what the app did with it" above. Tests: the hillside
hatch, the held-pct fold, the quality flag, the self-contained drive, the panel
line; two battery parcels (Brick Church Pike, Hills Ln) with judges for the
hillside layer and its line.

## For the engine, in order of how often it decided the answer

1. **Flag lots and a drive along the usable land**, sized to the depth left
   after the holds: Old Charlotte Pike (21 ac buildable, 0 lots), Walker Ln,
   Old Hickory Blvd RS20, and from the last batch Union Hill, Campbell, Neelys
   Bend. This is the same item as before; it is now the most frequent cause of
   a wrong answer.
2. **Stop drawing on a landlocked hillside.** Blevins Rd: when
   `access.landlocked` fails and the hillside hold takes more than half the
   site, return 0 with the reason instead of a 4,499-ft loop at 49% grade.
3. **mf_max_gsf_v1 parking.** 101 stalls for 9 units (Nashboro Blvd), 112 for
   30 (Cedarstone Way). Cap stalls near the requirement; at or below 9 du/ac
   prefer attached product at the density cap (item 5c, still open).
4. **The competition's townhome row on a landlocked RM lot** (Hicks Rd) fell
   back to v2 and refused while th_v3 draws 16 homes that fail
   `access.second_connection`. Carry v3's answer and its fails in the row.
5. **Frontage lots on Cato Rd.** 1.7 ac buildable on a road, 15% slope,
   nothing held out, and no frontage lot placed. Why?
6. **fn_mf_money on Cedarstone Way:** $11/SF from 8 sales.
7. **USGS.** The 12-s timeout raised ("Operation timed out after 12002
   milliseconds") instead of returning `{error: 'timeout'}`; the app would
   see an RPC error. And 8 of 20 first fetches failed this morning.
8. **Townhome under-yield on Cedarstone Way** (8 homes where the density
   allows 30 and the owner builds townhomes).

## Re-test the same evening: the engine moved (g15)

Eric: "test the parcels you just ran. Are we getting the results you
wanted?" Re-running all twenty live a few hours later found the engine on a
newer release: an **estate grammar** ("estate lots (flag lots behind the
frontage)": a rear tier of flag lots on poles, taking the plan when it yields
more lots than the street and frontage plans), **0 lots with a stated reason
on landlocked hillsides** ("landlocked, and 20.9 of the 31.80 ac is steeper
than 25%: no plan is drawn"), a **"single" row** in the competition, and the
**townhome row carrying th_v3's answer** on a landlocked RM lot. Four of the
handoff's asks, landed before the handoff was read. The app on main handled
the new shape; this round adds the pattern's phrase, the grammar's name, and
one rule fix: a competition request that fell back to the very plan the
default drew (the grid on Hillwood Blvd came back as the same three flag
lots) no longer "takes the sheet" from itself — the same lots switch only on
less street or fewer fails.

What changed, and the ranking as the app shows it now:

| # | Lot | Was (g14, this morning) | Now (g15) | Likelihood |
|---|---|---|---|---|
| 1 | 4819 Fairmeade Ct | 0 new lots | 1 estate lot (the parcel; the lot may include the hillside, the pad stays off it) | 90% |
| 2 | 0 Penn Meade Way | skipped | skipped | 90% |
| 3 | 0 Hillwood Blvd | 2 frontage lots | **3 estate lots** (flag lots behind the frontage), 41,387 SF each, all pass | 85% |
| 4 | 54 Park Crescent Cir | 0 lots | 0 lots | 85% |
| 5 | 4255 Brick Church Pike | 0 lots | 1 estate lot (one house) | 80% |
| 6 | 1422 Campbell Rd | 0 lots | 0 lots, now with the reason and an `access.landlocked` fail | 80% |
| 7 | **0 Blevins Rd** | 4 lots on a 4,499-ft loop at 49% grade | **0 lots**: "landlocked, and 20.9 of the 31.80 ac is steeper than 25%: no plan is drawn" | 5% → **80%** |
| 8 | 1014 Antioch Pike | 8 lots | 7 lots on a 223-ft cul-de-sac, all pass | 75% |
| 9 | 0 Old Hydes Ferry Pike | 1 frontage lot | **2 estate lots** | 55% → 75% |
| 10 | 0 Robinson Rd | skipped | skipped | 70% |
| 11 | 0 Hills Ln | 17 (grid, from the competition) | 17 (unchanged) | 70% |
| 12 | 4525 Cato Rd | 0 lots | **2 lots on a 225-ft single street**, all pass | 40% → 65% |
| 13 | 0 Old Hickory Blvd (RS20) | 2 lots on a public cul-de-sac (grid) | 4 lots on a 337-ft single street, all pass | 45% → 60% |
| 14 | 0 Hickory Hollow Pkwy | 29 townhomes | 29 townhomes | 60% |
| 15 | 0 Old Hickory Blvd (R40) | 0 lots (landlocked) | 2 lots on a 217-ft street that fails `access.landlocked` — a plan on a parcel with no access, flagged | 70% → 55% |
| 16 | 7695 Old Charlotte Pike | 0 lots | 8 lots on a 3,169-ft single street through the bench: dead end, block and grade fail, 1,871 ft in wetland buffer | 25% → 35% |
| 17 | 0 Nashboro Blvd | 9 apartments (tie) | unchanged | 30% |
| 18 | 0 Walker Ln | 3 lots, 2 fails | 2 lots on an 890-ft single street, 2 flags; the drive draws 3 on 1,059 ft (flagged) | 25% |
| 19 | 0 Cedarstone Way | 30 apartments | unchanged | 20% |
| 20 | 0 Hicks Rd | 14 apartments; townhome row refused (v2) | 14 apartments; the townhome row now carries th_v3's 16 that fail `access.second_connection`, and the panel says so | 15% → 20% |

Now **eight of twenty** are zero / one house / skipped and all eight are
right; of the twelve drawn, five are what a civil would draw (Hillwood's
three flag lots, Antioch Pike, Hills Ln, Cato Rd, Old Hickory Blvd RS20) and
one is close. What remains: the long-tract estate problem (Old Charlotte
Pike's 8 lots on 3,169 ft of failing street where a drive along the bench
would do), Walker Ln's under-yield, a street drawn on a landlocked R40 lot
instead of a zero with the reason, and the multifamily product and parking
on Nashboro Blvd and Cedarstone Way.

Pictures from the re-test: `679618_hillwood_blvd_3_flag_lots_g15.png`,
`692464_old_charlotte_pike_8_lots_g15.png`, `670893_blevins_rd_zero_g15.png`,
`673844_old_hickory_blvd_4_lots_g15.png`. The battery's two new parcels were
re-captured against g15 (Brick Church Pike is now 1 estate lot with both
holds hatched; Hills Ln is unchanged).

## Pictures

- `680391_hills_ln_grid_17.png`: the competition's grid on the sheet at more lots.
- `667638_antioch_pike_8_lots.png`: the batch's best layout.
- `692464_old_charlotte_pike_hillside_hold.png`, `659921_park_crescent_hillside_zero.png`: the hillside hold hatched.
- `686430_brick_church_pike_holds_legend.png`: the flood hold, the hillside hold and the wetland buffer on one 0-lot sheet, keyed in the legend.
- `673844_old_hickory_blvd_grid_2.png`: a public cul-de-sac for two lots.
- `676829_walker_ln_through_street.png`, `670893_blevins_rd_loop_on_a_mountain.png`: the streets a civil would not draw.
- `670783_nashboro_blvd_101_stalls.png`, `676422_cedarstone_way_apartments.png`: the multifamily parking problem.
- `673710_hickory_hollow_pkwy_29_townhomes.png`: the townhome engine's mews.
