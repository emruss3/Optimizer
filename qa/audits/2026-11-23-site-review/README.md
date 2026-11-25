# Site-review brief, first PR: Compare beside the two yields (2026-11-23)

The brief asks for the two layout options of a parcel to sit next to a clear
Compare action, with the production plan kept on screen.

## What was built

The Layout panel already shows the apartment option and the neighborhood
option with the homes each places. Under them there is now a button, "Compare
73 against 16 homes". It opens a table in the same panel.

| Row | Rule |
|---|---|
| Homes | Each option's own count |
| Land per home | The land price the reviewer types, divided by homes. Shown only when a price is entered |
| Parking | The same row the exported sheet prints, for the layout on the sheet. The other layout reads "Unknown" |
| Floor area | Same |

Under the table: one sentence a reviewer can repeat, and a "Not known" line
that names each missing figure and how to get it.

The land price is the reviewer's assumption. It lives in the panel, is labelled
as an assumption, and is not saved with the plan.

No option borrows the other's drawing or figures. A figure the app does not
have reads "Unknown", never zero.

## Evidence

Both from saved engine answers, with $1,200,000 typed as the land price.

- `mt-view-compare.png`: 24 apartments against 27 townhomes. $50,000 against
  $44,444 a home. The brief's $40,000 figure is for the 30-home production
  plan; the saved Mt View answer has 27. A unit test covers 30 against 24.
- `w-heiman-compare.png`: 73 apartments against 16 townhomes, a connected site.
  The apartment side carries its parking and floor-area rows.

## Limits

- The Layout panel sits in the inspector. At 1536 px wide the inspector opens
  collapsed, so the two yields and Compare are one click away, not on screen.
  The brief wants them visible together. That is a layout decision for the
  header and inspector, which the brief says to evaluate before adopting.
- The comparison covers the two layout kinds of one parcel. It does not yet
  extend the saved-scheme comparison dialog across product types.
- The comparison is not on the partner sheet.
