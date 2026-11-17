# Assemblage: combined sites (2026-11-17)

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
| Districts | R and RS | `fn_assemblage_params()` |
| Zoning | one district for all members | mixed sets are refused |
| Who may call | signed-in users only | execute revoked from anon |

## Database changes (project okxrvetbzpoazrybhcqj)

Migrations `assemblage_v1_combined_site` and
`assemblage_v1_permitted_uses_keep_error_shape`, release
`g44_assemblage_v1`. Engine drift was empty before and after.

- New: `parcel_assemblage`, `parcel_assemblage_seq`,
  `fn_assemblage_params`, `fn_assemble_parcels` (SECURITY DEFINER, pinned
  search_path).
- `get_parcel_by_id`: one added branch returns the record of a combined
  site. Real parcels and replay sites answer as before.
- `fn_resolve_permitted_uses`: a combined site reads its district's uses
  from its largest member. Every other id answers as before.

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

## Not done yet

1. **RM, townhome and apartment sites.** `fn_compile_planner_context` and
   the functions under it read `public.parcels` and refuse a negative id.
   The app needs that context for anything but R and RS, so those
   districts are refused as `district_not_supported`.
2. **Massing context on R and RS.** For the same reason the planner shows
   "A combined site has no massing context yet" and draws the by-right
   plan from the district standards.
3. **Frontage, neighbours and plan pattern** (`fn_parcel_frontage`,
   `fn_planner_neighbors`, `fn_plan_pattern`) do not answer for a combined
   site. The app degrades: no neighbour layer, edges guessed. The
   subdivision engine itself reads the real edges through
   `fn_site_inputs`.
4. **Sign-in.** The function needs a signed-in user. Signed out, the app
   asks for a sign-in.
5. **Mixed zoning** is refused, not planned.

## Functions not to use

`get_assemblage_geometry` (two overloads the browser cannot tell apart),
`calculate_unified_constraints` (80% times 1.15, not a measured envelope),
`optimize_yield_scenarios`, `optimize_assemblage_massing`.
