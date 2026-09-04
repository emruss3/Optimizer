-- fn_generate_subdivision runs as its caller (the app's anon/authenticated
-- role), so the v1.2 helper it calls must be executable by that role — the
-- same way fn_subdiv_world is. The v1.2 migration revoked it, and every plan
-- in the app failed with "permission denied for function fn_subdiv_serve"
-- (Eric, 2026-09-04). Pure geometry, no table access: safe to grant.
grant execute on function public.fn_subdiv_serve(geometry, numeric[], numeric[], boolean, numeric, numeric, numeric, numeric, numeric) to anon, authenticated;
