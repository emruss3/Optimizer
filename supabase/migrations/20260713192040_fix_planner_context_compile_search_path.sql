-- Already applied to project okxrvetbzpoazrybhcqj via MCP on 2026-07-13.
-- Committed for source control and environment parity. Do not reapply blindly.

alter function public.fn_compile_planner_context(integer, text, jsonb)
  set search_path = pg_catalog, public, extensions;
