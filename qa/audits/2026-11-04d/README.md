# The layout choice on multifamily land — 2026-11-04

Eric, on RM routing: "If a traditional multifamily design makes more sense,
we should default to that with an option to switch to a neighborhood layout."

## What the app does now

On RM / MUL / SP land the sheet still opens on the multifamily plan. Right
after it, the app runs the pattern competition (the grid, the neighborhood,
the loop grammar and the townhome engine). A **Layout** panel at the top of
the left rail puts the two layouts side by side, with the homes each places:

- **Multifamily**: the apartment plan (or townhome rows, if that product is
  picked).
- **Neighborhood**: the competition's best plan, either townhomes from the
  townhome engine or house lots on a street pattern.

**The one with more homes is the default.** A tie stays multifamily. The
neighborhood replaces the multifamily plan by itself only when it places more
homes **and** the engine calls it buildable **and** the sheet can draw it. The
panel then says why and offers "Show the multifamily plan". Either switch is
one tap. Under the two options, every neighborhood plan in the competition is
listed and can be drawn.

The townhome plan is new on the sheet:
- 20 × 40-ft homes drawn as attached party-wall dwellings, with the alleys,
  courtyards, guest parking, stormwater and held-out land;
- the KPI strip reads townhomes and homes per acre;
- the title block reads "27 townhomes · mews · by right";
- the panel lists the engine's figures and tests.

The engine plans footprints, not floor area, so the sheet claims none. The 3D
view assumes three stories and says so.

## Measured live

| parcel | multifamily | neighborhood's best | default |
|---|---|---|---|
| 2622 W Heiman (RM40, 3.26 ac) | 89 apartments | 32 townhomes (mews) | multifamily |
| 2600 W Heiman (RM40, 2.77 ac) | 73 apartments | 16 townhomes | multifamily |
| 1200 W H Davis (RM40, 2.37 ac) | 57 apartments | 12 frontage house lots* | multifamily |
| 1710 Meharry (RM20, 1.76 ac) | 30 apartments | 24 townhomes | multifamily |
| **5525 Mt View Rd (RM15, 2.14 ac)** | 24 apartments | **27 townhomes**, every required test passing | **neighborhood** |
| 407 Old Hickory Blvd (RM4, 2.13 ac) | 8 apartments | 8 townhomes (both at the density cap) | multifamily (tie) |
| 0 Hicks Rd (RM4, 3.77 ac) | 15 apartments | none: "no street entry reachable from the frontage" | multifamily |

\* The townhome engine draws 19 there, but they fail two required tests
(`alley.street_to_street`, `home.front_addresses_public_space`), so the
competition ranks the 12 lots first.

Apartments win on dense RM land, as you expected. The neighborhood wins where
apartments don't reach the density limit and townhomes do better (Mt View Rd).

## Pictures

- `layout_choice_overview.png`: the four below, side by side.
- `layout_2622_w_heiman_multifamily.png`: the default, apartments, with the
  Layout panel.
- `layout_2622_w_heiman_neighborhood.png`: one tap to the 32 townhomes.
- `layout_5525_mt_view_rd_neighborhood_default.png`: the neighborhood on the
  sheet by itself (27 against 24).
- `layout_1200_w_h_davis_neighborhood.png`: a house-lot neighborhood on RM
  land.

## Engine-side, seen on the way

1. The competition caps the townhome candidate's count at the density limit,
   but not its drawing. A parcel where the engine places more townhomes than
   density allows would draw more homes than the row claims. The panel flags
   it in red when it happens.
2. `fn_sf_v1_candidates` returns before the townhome engine runs when the grid
   plan is skipped. Landlocked RM land (0 Woodland Hills Dr) therefore gets no
   neighborhood option, even where townhomes might fit.
3. A cold competition on a 3-acre RM9 parcel (0 Cedarstone Way) took about
   30 s, over the app's 20-s limit. The panel says the neighborhood plans are
   unavailable and the multifamily plan stands; a retry continues the
   engine's saved search.
4. The v2 townhome engine (the fallback when v3 places nothing) has no app
   entry point yet. Its candidates are listed but not drawable, and never the
   default.
