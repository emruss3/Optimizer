-- Tighten roads table security - restrict to authenticated users only
-- Move any sample inserts to dev seed files

-- Revoke anonymous access to roads table
revoke all on table public.roads from anon;

-- Grant select access to authenticated users only
grant select on table public.roads to authenticated;

-- Ensure spatial index exists for performance
create index if not exists idx_roads_geom on public.roads using gist (geom);

-- Note: Any INSERT seed rows for roads should be moved to a dev-only script
-- like supabase/seed/dev_roads.sql and not run in production
