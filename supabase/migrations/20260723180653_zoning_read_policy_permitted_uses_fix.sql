-- REGRESSION FIX (2026-07-23): public.zoning was RLS-enabled with ZERO
-- policies (deny-all for client roles). fn_resolve_permitted_uses runs with
-- CALLER privileges and reads it — anon calls saw zero rows and returned
-- {"error":"no zoning use data"}, sending every parcel to the client's
-- zoning-base fallback (the persistent console warning). Same class as the
-- buildings incident. Zoning use rules are public ordinance data: restore
-- SELECT for client roles; writes stay blocked under RLS.
create policy zoning_public_read
  on public.zoning
  for select
  to anon, authenticated
  using (true);
