-- REGRESSION FIX (2026-07-21): RLS was enabled on public.buildings with ZERO
-- policies — deny-all for anon/authenticated — which silently emptied the
-- buildings array of fn_planner_neighbors (NOT security definer; runs with
-- caller privileges) and blanked the neighborhood building render in the app.
-- Building footprints + ed_stories are public GIS/assessor display data:
-- restore SELECT for client roles. No write policies are added — writes stay
-- blocked under RLS, which is STRICTLY tighter than the pre-lockdown state
-- (open table grants).
create policy buildings_public_read
  on public.buildings
  for select
  to anon, authenticated
  using (true);
