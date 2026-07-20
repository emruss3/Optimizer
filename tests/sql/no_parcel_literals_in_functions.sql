-- Static regression: production planner functions must NEVER branch on a
-- specific parcel. Examples identify a failure class — they do not define
-- the solution. Named parcels may exist only as immutable regression
-- fixtures in tests; runtime behavior (branches, weights, geometry
-- constants, constructability limits, parking assumptions, unit-size
-- limits, acceptance thresholds) must be parcel-blind.
--
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/no_parcel_literals_in_functions.sql

\set ON_ERROR_STOP on
\echo '=== No-parcel-literal static regression ==='

do $static$
declare
  offender record;
  n int := 0;
begin
  for offender in
    select p.proname
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
    where n2.nspname = 'public'
      and (p.proname like 'fn\_%' or p.proname = 'parcels_mvt_b64')
      and (
        prosrc ~* 'p_ogc_fid\s*=\s*[0-9]{3,}'          -- parameter pinned to a literal id
        or prosrc ~* '\mcase\s+p_ogc_fid'              -- per-parcel case dispatch
        or prosrc ~* 'address\s*(=|like|ilike)\s*''''  -- address-literal branch
        or prosrc ~* '\mogc_fid\s*=\s*[0-9]{3,}'       -- any column pinned to a literal id
      )
  loop
    n := n + 1;
    raise warning 'parcel-literal pattern found in production function: %', offender.proname;
  end loop;
  if n > 0 then
    raise exception '% production function(s) contain parcel-literal branches — examples identify failure classes, they never define solutions', n;
  end if;
end
$static$;

\echo '=== No parcel literals found — production functions are parcel-blind ==='
