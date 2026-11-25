-- Indexes for find_planner_parcels (the exact-first parcel lookup, PR 215).
--
-- Recorded 2026-11-25. In production these three indexes were first created
-- outside a migration and left invalid and not ready (a concurrent build that
-- did not finish). They were rebuilt online one at a time with
-- REINDEX INDEX CONCURRENTLY, each started from a one-off pg_cron job so the
-- 2-minute statement limit of an interactive session could not cancel it,
-- while the training and terrain jobs kept running. All three are valid and
-- ready. This file records their definitions so a new database gets them; it
-- is a no-op where they already exist.
--
-- ANALYZE matters as much as the build. These are expression indexes, and
-- until the table is analysed PostgreSQL has no statistics for upper(address)
-- or planner_apn_key(...): it walked the whole table in ogc_fid order instead
-- (282,337 rows filtered, about 103,000 pages, 7.7 to 11.8 s). After ANALYZE
-- the exact lookup is a BitmapOr over the two B-trees: 10 pages, 2 to 3 ms.
-- Run ANALYZE after rebuilding any of them.
--
-- On a large live table build them with CREATE INDEX CONCURRENTLY, outside a
-- transaction and outside a statement limit, rather than through this file.

create extension if not exists pg_trgm with schema extensions;

create index if not exists parcels_planner_address_prefix
  on public.parcels using btree (upper((address)::text) text_pattern_ops);

create index if not exists parcels_planner_apn_prefix
  on public.parcels using btree (public.planner_apn_key((parcelnumb_no_formatting)::text, (parcelnumb)::text) text_pattern_ops);

create index if not exists parcels_planner_keys_trgm
  on public.parcels using gin (
    upper((address)::text) extensions.gin_trgm_ops,
    public.planner_apn_key((parcelnumb_no_formatting)::text, (parcelnumb)::text) extensions.gin_trgm_ops
  );

analyze public.parcels;
