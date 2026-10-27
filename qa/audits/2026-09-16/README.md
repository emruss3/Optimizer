# Ten-parcel check — the app as served, 2026-09-16

Eric: "check 10 parcels, take pictures of the outcome." The real client,
driven headlessly (Playwright) in fixture mode: the seven committed battery
fixtures plus fixture sets pulled live for 319 Anderson Ln (685407), 3820
Murfreesboro Pike (316555), 3717 Clare Ave (664598), 4678 Lickton Pike
(667934) and 468 Ponder Pl (659461). Every plan shown is the server's own
output; nothing is drawn client-side.

- `ten_parcels_pages_A_subdivisions.png` — the page for the five
  single-family parcels: 2400 W Heiman (34 lots on the spine, greenway held
  out, cul-de-sac at the floodplain), 319 Anderson Ln (28 lots, ladder),
  3820 Murfreesboro Pike (39 lots, ladder with two cross streets), 3717
  Clare Ave (11 lots, spine) and 4678 Lickton Pike, which blocks.
- `ten_parcels_pages_B_multifamily_retail.png` — 2600 and 2622 W Heiman,
  1200 W H Davis and 468 Ponder Pl (aisle-first parking, 100% of the placed
  need on each), and 2405 12th Ave S (the commercial capacity card,
  5,173 SF allowable).
- `ten_parcels_plans_zoomed.png` — the canvas zoomed in on each plan.
- `lickton_4678_blocked_screen.png` — the blocked page on its own.

## What the pictures show that the numbers did not

1. **4678 Lickton Pike (R15, 48.5 ac) blocks.** The banner reads
   `"single family" is not permitted as-of-right`, but R15 permits it and
   `fn_resolve_permitted_uses` says so. The real gate is the context
   engine's parcel-level flood flag (`physical_context_not_developable`,
   FEMA AE anywhere on the parcel → `developable: false`,
   `generation_allowed: false`). The subdivision generator itself solves
   this parcel with 70 lots, holding out the 7.9% that is floodplain and
   wetland from real geometry (v1.1). Two defects: the gate contradicts the
   hazard carve on a tract that is 92% dry, and the banner names the wrong
   reason. The sweep counted the parcel as solved because it calls the
   generator directly.
2. **2405 12th Ave S shows two states at once.** The capacity card is right
   (retail / office permitted, 5,173 SF at FAR 0.6), but under it the
   use selector defaults to single family and raises a red
   "generation blocked" banner for a use nobody chose, with the header stuck
   on "Generating plan…". On a commercial lot the default use should be the
   permitted one and the blocked banner should not appear.
3. **The pattern panel over-claims on one parcel.** 468 Ponder Pl reads
   "Perpendicular bars framing courts to the street · generator follows
   this" while the seed draws a single S-form bar; 2600 / 2622 W Heiman
   say "generator: not yet" for the same pattern, which is the honest line.
4. **The R6 / R8 subdivision pages carry a "Two Family" context chip** over
   single-family lots (the default use resolves to the highest intensity
   permitted). Not wrong for a duplex district, but the chip and the
   neighbourhood panel should say the same thing.

Fixture-mode caveats: parcels without a committed `fn_parcel_topo` fixture
(2622 W Heiman, 1200 W H Davis, 2405 12th Ave) read "contours: not
available" here and would fetch USGS 3DEP live; the temporary store used
for the five extra parcels was not committed.
