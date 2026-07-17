-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.
--
-- Cold-cache planner-context compiles were exceeding the API statement
-- timeout (seen live: fn_compile_planner_context → 500 "canceling statement
-- due to statement timeout" through the app roles, while the same compile
-- runs in ~1.3 s warm). The client now retries once (warm buffers), and the
-- role timeouts get headroom for the genuinely cold first hit:
--   anon          12s → 20s
--   authenticated 15s → 20s
-- Infrastructure-level setting only; no functions are modified. Settings
-- apply on the next PostgREST connection (SET ROLE re-reads role config).

ALTER ROLE anon SET statement_timeout = '20s';
ALTER ROLE authenticated SET statement_timeout = '20s';
NOTIFY pgrst, 'reload config';
