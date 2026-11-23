# openParcelDrawer parcel fetch 503 (build d17af11)

**Verdict: infrastructure — not a #199 regression. No app fix.**

## Report

Production build `d17af11` (#199 just landed, ~2026-11-23 23:05 UTC):

- `Failed to load resource: 503`
- `openParcelDrawer: could not fetch the parcel row, opening on the id`
- `[planner] build d17af11 · 2026-11-23 23:05 UTC`
- `Uncaught message channel closed (likely extension)` — unrelated browser-extension noise

## Root cause

`App.tsx` `openParcelDrawer` calls `supabase.rpc('get_parcel_by_id', …)`. That hits PostgREST on project **Parcelmap** (`okxrvetbzpoazrybhcqj`).

Reproduced from this environment against live PostgREST (anon key, same path as the browser):

| Probe | Result |
| --- | --- |
| `https://optimizer-omega-three.vercel.app/` | **200** — static app healthy; bundle contains `d17af11` |
| `GET /rest/v1/` (gateway only) | **401** in ~60–120 ms — edge up |
| `POST /rest/v1/rpc/get_parcel_by_id` | hangs, then **503** after ~35 s |
| `GET /rest/v1/zoning?select=zoning&limit=1` | same hang / timeout |

Eventual RPC body:

```json
{"code":"PGRST002","details":null,"hint":null,"message":"Could not query the database for the schema cache. Retrying."}
```

Headers: `sb-project-ref: okxrvetbzpoazrybhcqj`, `x-envoy-attempt-count: 6`, `x-envoy-upstream-service-time: ~34767`.

`PGRST002` means PostgREST cannot talk to Postgres for its schema cache. MCP `get_project` still reports `ACTIVE_HEALTHY`, but advisors and unified logs also time out / error — DB path is stuck even if the project row looks fine.

Console warn is the existing fallback in `src/App.tsx` (fetch fails → open drawer on id only). Expected when the RPC 503s; not a new code path.

## Why not #199

Merge `d17af119` (#199) only touches MF parking access:

- `src/features/site-plan/api/mfAccess.ts` (+ tests)
- `accessFinding.ts` / `exhibitSchedule.ts` (+ tests)
- KPI/headline wiring in `SiteWorkspace.tsx`

No changes to `App.tsx`, `CommandPalette`, `supabase` client, or `get_parcel_by_id`. Timing coincidence with the deploy banner.

## Next step

1. On Supabase dashboard for `okxrvetbzpoazrybhcqj` (Parcelmap): check Postgres health, connection saturation, recent restarts; if PostgREST stays on `PGRST002`, restart the API / clear schema cache after DB is reachable again.
2. Re-probe: `POST …/rpc/get_parcel_by_id` with a known `p_ogc_fid` should return **200** in under a few seconds (not 503 / PGRST002).
3. Then re-open a parcel in production — drawer should load geometry without the warn. No app deploy required for this incident.
