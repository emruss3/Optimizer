-- Already applied to project okxrvetbzpoazrybhcqj via MCP on 2026-07-13.
-- Committed for source control and environment parity. Do not reapply blindly.

revoke execute on function public.fn_record_planner_feedback(uuid, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.fn_record_planner_feedback(uuid, text, uuid, jsonb, uuid) to authenticated, service_role;
