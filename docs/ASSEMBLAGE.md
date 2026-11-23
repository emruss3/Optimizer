# Assemblage: combined sites (2026-11-17, RM added 2026-11-23)

Adjoining parcels can be combined into one site and planned as one.
Built in the app session at the owner's request ("Build the database
function here so it works"), as an exception to the lane rule.

## How it works

- `public.fn_assemble_parcels(p_fids integer[]) returns jsonb` makes the
  combined site and returns its id. The same set of parcels always returns
  the same id.
- A combined site is one of the engine's **virtual parcels**: a row in
  `training.virtual_parcel` with a negative id, `plat_key` null, the members
  in `exclude`. This is the mechanism the replay tests already use.
- **No row is added to `public.parcels`.** No real parcel's frontage,
  neighbours, sweeps, search results or map tiles change.
- Members are kept in `public.parcel_assemblage` (id, sorted member ids,
  zoning, creator). Row level security is on with no policies, so only the
  function reads or writes it.
- The app opens the planner on the negative id. From there it is the
  ordinary single-parcel flow.

Success:

```
{ "ogc_fid": -1, "address": "0 HAMILTON CHURCH RD + 1 more",
  "zoning": "RS10", "acres": 3.83, "member_fids": [315880, 674870] }
```

Refusals are verdicts with a plain `message`: `too_few`, `too_many`,
`not_found`, `mixed_zoning`, `district_not_supported`, `not_adjacent`,
`too_many_today`.

## Rules

| Rule | Value | Where |
|---|---|---|
| Parcels in one site | 2 to 12 | `fn_assemblage_params()` |
| New sites per signed-in user per day | 40 | `fn_assemblage_params()` |
| Touching tolerance | 2 ft | same as `fn_parcel_frontage` |
| Districts | R, RS and RM | `fn_assemblage_params()` |
| Zoning | one district for all members | mixed sets are refused |
| Who may call | signed-in users only | execute revoked from anon |

## Database changes (project okxrvetbzpoazrybhcqj)

Migrations `assemblage_v1_combined_site`,
`assemblage_v1_permitted_uses_keep_error_shape` and
`assemblage_v1_fix_permitted_uses_permission`, release
`g44_assemblage_v1`. Engine drift was empty before and after. The SQL is in
`supabase/migrations/20261123000000_assemblage.sql`. It is a final-state
snapshot under one name, not the live migration history: do not push it to
the live database.

Added on 2026-11-23 for RM and townhome sites (migrations
`assemblage_v2_context_for_combined_sites` and
`assemblage_v2_buildability_on_combined_outline`, release
`g45_assemblage_v2_rm`):

- `fn_compile_assemblage_context`: the planner context of a combined site.
  `fn_compile_planner_context` hands a combined site to it and runs every
  other id as before.
- `fn_parcel_buildability`: a combined site is measured on its own outline.
  It used to answer "unbuildable, 0 sq ft envelope".
- Definer helpers `fn_assemblage_members`, `fn_assemblage_lead`,
  `fn_assemblage_outline`.

### What the context of a combined site contains

| Part | Source |
|---|---|
| Setbacks, height, density, coverage, parking, permitted uses | the district, read from the largest member |
| Lot area, unit cap, impervious cap | the district caps times the combined area |
| Outline and buildable envelope | the combined outline, inset on every side by the largest setback |
| Flood, slope and hazard summary | the largest member only, flagged |
| Street frontage | not resolved, flagged; the app shows "Street access needs verification" |
| Max buildout and massing program | not computed, flagged |

Every one of these carries a `combined_site_*` flag in the context.

- New: `parcel_assemblage`, `parcel_assemblage_seq`,
  `fn_assemblage_params`, `fn_assemble_parcels` (SECURITY DEFINER, pinned
  search_path).
- `get_parcel_by_id`: one added branch returns the record of a combined
  site. Real parcels and replay sites answer as before.
- `fn_resolve_permitted_uses`: a combined site reads its district's uses
  from its largest member. Every other id answers as before.

## Incident on release (2026-11-17, about 15 minutes)

The first version of the `fn_resolve_permitted_uses` change read
`parcel_assemblage` directly. That function runs with the caller's rights
and the browser role cannot read the table, so **every signed-out call
failed** with "permission denied for table parcel_assemblage", for real
parcels too. Plan generation that goes through it failed with it. The
solver-floors run on PR 169 caught it. The lookup now goes through a
definer helper (`fn_assemblage_members`) and is reached only for a negative
id. The fix migration tests itself as the anon role, and the planner calls
were re-checked as anon afterwards.

Lesson: my release checks ran as the database owner. A change to a function
the browser calls has to be tested as `anon` before it is recorded.

## Measured

7412 Maroney Dr (315880) + 0 Hamilton Church Rd (674870), RS10:

| Site | Acres | Lots |
|---|---|---|
| 7412 Maroney Dr alone | 1.38 | 4 |
| 0 Hamilton Church Rd alone | 2.45 | 2 |
| Combined, default plan | 3.83 | 6 |
| Combined, best in the competition (neighborhood) | 3.83 | 7 |

The default plan varied between calls (5, 6 and 7 lots were all seen
before the terrain was cached). That is the engine's behaviour, not the
combine step.

Checked on the live database: every refusal code, the same-set-same-id
rule, a member's frontage before and after (137.5 ft both times), a replay
site's answers unchanged, anon cannot execute.

The combined site is in the test battery as parcel `-1`
(`scripts/visual-battery`). Evidence: `qa/audits/2026-11-17-assemblage`.

## Measured on RM (2026-11-23)

2937 + 2939 Brick Church Pike (486359 + 663343), RM15, same owner:

| Site | Acres | Townhomes |
|---|---|---|
| 2937 Brick Church Pike alone | 1.99 | 20 |
| 2939 Brick Church Pike alone | 2.04 | 30 |
| Combined (site `-3`), mews | 4.03 | 53 |

The district cap on the combined site is 60 homes. Every call was re-run as
the signed-out role. The site is in the test battery as parcel `-3`.

A first RM test pair (site `-2`, 5836B Monroe Xing + 1013 Halifax Ln) turned
out to be homeowners-association common land with other owners' lots inside
it. It drew 37 homes against 13 and 29 apart. It is a poor example and is
left in the table; nothing is deleted without the owner's say.

## Not done yet

1. **Apartments on a combined site.** `fn_generate_mf_site_plan_v2` answers
   `planner_max_buildout_required`, because max buildout and the massing
   program read `public.parcels`. The app shows that on the apartment card
   and runs the townhome comparison.
2. **Street frontage, neighbours and plan pattern** (`fn_parcel_frontage`,
   `fn_planner_neighbors`, `fn_plan_pattern`) do not answer for a combined
   site. The engines read the real edges through `fn_site_inputs`; the app
   has no neighbour layer and marks access as needing verification.
3. **Hazard summary** in the context is the largest member's, not the whole
   site's. The engines hold flood and wetland on the real combined outline.
4. **Other districts** (MUL, MUG, OR, SP and the rest) are refused as
   `district_not_supported`. **Mixed zoning** is refused.
5. **Sign-in.** Creating a combined site needs a signed-in user.
6. **Common land.** Nothing stops a user combining HOA common-area parcels
   (site `-2`). The engine may refuse or under-plan them.
7. `fn_resolve_permitted_uses` has no pinned search_path (existing lint).

## Functions not to use

`get_assemblage_geometry` (two overloads the browser cannot tell apart),
`calculate_unified_constraints` (80% times 1.15, not a measured envelope),
`optimize_yield_scenarios`, `optimize_assemblage_massing`.
