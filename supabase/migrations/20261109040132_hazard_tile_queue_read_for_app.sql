-- fn_generate_subdivision (not SECURITY DEFINER, executed as anon by the app and the DB
-- battery) reads public.hazard_tile_queue since the engine's 2026-11-09 release; the table
-- had RLS on with no grant or policy for anon, so every anonymous call failed with
-- "permission denied for table hazard_tile_queue" (2400 W Heiman St, cohort 669041).
-- Read access only: the queue holds tile boxes, offsets and ingest errors, nothing private.
grant select on public.hazard_tile_queue to anon, authenticated;
drop policy if exists hazard_tile_queue_read_app on public.hazard_tile_queue;
create policy hazard_tile_queue_read_app on public.hazard_tile_queue
  for select to anon, authenticated using (true);
