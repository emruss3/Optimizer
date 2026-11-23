# Engine handoff: the by-right planner fails in the browser on "DELETE requires a WHERE clause", and grading will fail next on UPDATE

From the app session, 2026-11-23. Read from the live database; nothing in the
database was changed.

## What users see

Production, 0 Osage St (675671) and, on first open, 2515 Finland St (665979):

> Generator error · no plan
> engine error: DELETE requires a WHERE clause

The pattern competition still answers for the same parcel (Osage: a two-lot
frontage plan). Choosing "View this plan" fails the same way, so no plan can be
put on the sheet.

## Cause

`public.fn_terrain_ensure(p_geom geometry, p_fetch boolean)` runs these two
statements on its temp tables, on every pass of its grid loop:

```
delete from _terrain_need;
delete from _terrain_probe;
```

The browser reaches the database through the `authenticator` role, whose
configuration is:

```
session_preload_libraries = safeupdate
```

`safeupdate` rejects any `DELETE` or `UPDATE` with no `WHERE`. It is loaded for
the session, so `SECURITY DEFINER` does not get round it. The owner role does
not load it, which is why the function passes when it is run from the SQL
editor or over the MCP channel and fails from the app.

## Who is affected

`fn_terrain_ensure` is called by `fn_parcel_topo_fetch`, `fn_plan_grading`,
`fn_terrain_fill` and `fn_terrain_request`. Those are called by:

| Function the browser calls | Effect |
|---|---|
| `fn_sf_v1_plan_app` | The by-right plan fails outright |
| `fn_parcel_topo` | Terrain for the sheet may fail |
| `fn_sf_v1_grading`, `fn_th_v3_grading` | Grading may fail |
| `fn_sf_v1_prefetch` | Prefetch may fail |

A parcel whose terrain is already cached may not reach the call, which fits
what the audit saw: Finland failed on first open and drew three lots later.
I did not confirm that from the function bodies.

## The fix

`safeupdate` rejects a bare `UPDATE` as well as a bare `DELETE`. A scan of
every function in `public` and `training` for either, with no `WHERE` in the
statement, finds four statements in two functions:

| Function | Statement |
|---|---|
| `fn_terrain_ensure` | `delete from _terrain_need;` |
| `fn_terrain_ensure` | `delete from _terrain_probe;` |
| `fn_plan_grading` | `update _gs set zd = …;` |
| `fn_plan_grading` | `update _gp set elev = …, below = …;` |

All four act on temp tables. Fix all four in one release: once terrain stops
failing, grading will reach the two updates and fail the same way.

- The deletes: `delete from _terrain_need where true;`, or `truncate`, which
  `safeupdate` does not block.
- The updates: add `where true`.

## Acceptance

Run every check **as `anon` or `authenticated` through PostgREST**, the way the
app calls. The SQL editor and the MCP channel run as the owner, do not load
`safeupdate`, and will pass whether or not the fix is right.

1. `fn_sf_v1_plan_app` for 675671 returns a plan or a real refusal, and no
   "DELETE requires a WHERE clause".
2. `fn_parcel_topo` on a parcel whose terrain is not cached returns terrain.
3. `fn_sf_v1_grading` and `fn_th_v3_grading` on a drawn plan return a grading
   result, and no "UPDATE requires a WHERE clause".
4. Record the release.

This is the second incident this month where a function passed as the owner
and failed for the browser role. The first was `fn_resolve_permitted_uses` on
2026-11-17. A test as the owner does not load `safeupdate` and does not apply
the browser's grants, so it cannot stand in for the anon test.

## What the app session changed, and did not

Not changed: any engine SQL. This is the engine session's lane.

Changed in the app: a failed run is no longer worded as a yield. The basis line
read "0 lots by right — engine error: DELETE requires a WHERE clause". It now
reads "No by-right result — the generator failed: …". The deep-search line no
longer says "The plan on the sheet was the best" when no plan is on the sheet.
