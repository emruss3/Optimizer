-- pg_prewarm: load the planner's parcel data into memory after a restart.
--
-- Applied 2026-11-24 with the MCP apply_migration tool, after the database
-- moved from Micro (280 MB cache) to Small (512 MB, about 1.5 GB counting
-- the operating system's cache). A restart empties the cache, and the
-- planner's first calls for a parcel then read the 1.1 GB parcels table from
-- disk. See docs/PARCEL_TILES.md, "First planner load".
create extension if not exists pg_prewarm with schema extensions;
