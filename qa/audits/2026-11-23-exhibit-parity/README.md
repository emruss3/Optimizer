# The decision figures on paper (2026-11-23)

Audit package 2026-11-23, first delivery, PR 3: parking facts disappeared when
an exhibit left the app.

## What the sheet printed before

- 535 Main St A-01: 238 stalls. Not the 226 required, not the structured
  ceiling the 54.8% is measured against, not the 2 + 3 stack. One warning,
  "The drawn features do not add up to the scheme schedule", with no figures.
- 2600 W Heiman A-01: 127 stalls. Not the 20 reported or the 122 required.

## What it prints now

A typed schedule (`api/exhibitSchedule.ts`) builds the rows. The sheet prints
them directly under the headline numbers, where every sheet size has room.

| Row | Example | Printed when |
|---|---|---|
| Parking | 238 supplied · 226 required · 1.82 per home | The plan has stalls |
| Parking, when the drawing and the engine's summary differ | 127 drawn · 20 reported · 122 required | The two counts disagree |
| Floor area | 232,425 of 423,765 GSF structured-parking ceiling (54.8%) | The ceiling is known |
| Program | 2 parking levels + 3 residential | The plan carries a garage |
| Street access | Unresolved: no drive reaches the street | No drive reaches the parcel line |
| Context | Not verified | The massing context was not verified |

The warning now names the count that disagrees. On Main St it reads: "The
buildings' own counts total 129 homes; the scheme reports 131."

That 129 against 131 is a real disagreement in the plan, not a drawing fault:
the engine's unit mix sums to 129 while its headline says 131. It is reported
here and left for the engine session.

## Evidence

- `main-a01-before-production.jpg`: the production sheet from the audit package.
- `main-a01-after.png`: the same scheme (rev 82a80810) from the saved answer.
- `heiman-a01-forced-break.png`: the W Heiman sheet with the street break and
  the Street access row. The break is forced in the browser, as in PR 176. The
  committed W Heiman answer is the older one-building plan, so its counts are
  126 and 126 and it cannot show 127, 20 and 122. A unit test covers that case.

## Limits

- On the 16:9 slide the legend now shows one row. The decision figures took its
  room. The 11 x 17 sheet has room for both.
- The surface-parking comparison (199,950 GSF) is not printed. It describes a
  different parking arrangement.
- The A-03 section still labels floors generically.
- Only the slide size was captured here.
