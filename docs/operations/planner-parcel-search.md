# Roll out planner parcel search

Ship the database first. The new UI calls `find_planner_parcels` from the start page, toolbar, map fallback and command palette. Existing clients can keep using the table during rollout. The RPC executes with the caller's table permissions and row visibility. Only the selected parcel enters the existing geometry and zoning workflow.

## Build the indexes while imports can write

On an empty development database apply the migration normally. On a populated database run the following from the repository root with an operator connection and psql. This takes the exact index definitions from the migration, builds each in its own autocommit transaction, and stops at the first error. The two B-trees serve exact and short-prefix lookups. The two GIN indexes serve contains searches on addresses and normalized parcel numbers. Budget disk and monitor load during backfills.

```sh
migration=supabase/migrations/20261123010000_planner_parcel_search.sql
sed '/^create or replace function public.find_planner_parcels/,$d;
     s/^set local search_path/set search_path/;
     s/^create index if not exists/create index concurrently if not exists/' "$migration" > /tmp/planner-search-prebuild.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f /tmp/planner-search-prebuild.sql
```

Verify that the following returns four rows with both flags true. An interrupted concurrent build can leave an invalid index. Drop only the invalid index concurrently and rerun the prebuild before continuing.

```sql
select indexrelid::regclass, indisvalid, indisready
from pg_index
where indrelid = 'public.parcels'::regclass
  and indexrelid::regclass::text like '%parcels_planner_%';
```

Apply the migration through the project's migration runner and run `ANALYZE public.parcels;` after the index build. Verify the RPC using the same public client key and role as the app before shipping the UI.

## Verify from the user's entry point

1. Run `node scripts/check-planner-parcel-search.mjs` with the target's VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. It uses the November 23 field-audit addresses, checks address and APN identity, and reports serial and ten-at-once response times. Use the same location and network to compare builds. The proposed release target is 100% correct results and p95 below one second in each mode for results returned to the client. The 12-second request deadline is an error boundary.
2. Start with empty Recents. Type an address, replace it mid-search, retry after an offline failure, then pick the intended parcel. Repeat from the command palette with a formatted APN and a partial street name. Look for the exact parcel, cancellation of the superseded request, and separate error and no-match states. For shared street addresses, inspect the assessor number on each hit.
3. For each selected parcel record four separate elapsed times from the browser performance trace: results visible, selected geometry and zoning context loaded, 2D plan or explicit no-plan state visible, and first ready 3D frame. Keep the first failed stage and its error. Run 2031 Herman St twice in fresh sessions to isolate the zoning-context retry. Include the largest rendering fixture, 0 Martingale Dr, for the independent 3D wait.

If the UI needs rolling back, redeploy the prior frontend. The additive database migration remains compatible with it.
