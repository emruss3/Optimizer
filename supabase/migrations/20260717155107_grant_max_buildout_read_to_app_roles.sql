-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.
-- The current frontend reads this read-only frontier directly while the same
-- payload is also composed into planner_context_v2.

revoke all on function public.fn_max_buildout(integer,text) from public;
grant execute on function public.fn_max_buildout(integer,text) to anon,authenticated,service_role;

comment on function public.fn_max_buildout(integer,text) is
  'Read-only max-GSF development frontier used by the composed planner context and current frontend headline. Browser roles may execute; source tables remain protected behind the function contract.';

notify pgrst,'reload schema';
