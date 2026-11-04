-- 2026-11-04 · The townhome engine (th_v3) for the app: the layout choice on
-- multifamily land.
--
-- The owner (2026-11-04): where a traditional multifamily design makes more
-- sense the sheet defaults to it, with an option to switch to a neighborhood
-- layout. On RM land the neighborhood's best plan is usually the townhome
-- candidate of fn_sf_v1_candidates, and that candidate carries metrics only:
-- its drawing is the call named in plan.full_plan_call,
-- fn_generate_th_site_plan_v3(ogc_fid, 'aor').
--
-- The engine runs a resumable search that it keeps in training.th_v3_run
-- (the competition has usually just run it, so the drawing returns in ~1 s)
-- and reads helpers the anon role is not granted, so the app reaches it
-- through this SECURITY DEFINER wrapper, as it does the plan and the
-- competition (20261103100000, 20261104100000): owned by postgres,
-- search_path pinned, as of right only ('aor'), and the search budget kept
-- inside the anon role's 20-s statement timeout. A search that has not
-- finished inside its budget answers with its status and "call again to
-- continue the search"; the app calls again.

CREATE OR REPLACE FUNCTION public.fn_generate_th_site_plan_v3_app(p_ogc_fid integer, p_budget_ms integer DEFAULT 12000)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.fn_generate_th_site_plan_v3(p_ogc_fid, 'aor', least(greatest(coalesce(p_budget_ms, 12000), 1000), 15000));
$function$;

GRANT EXECUTE ON FUNCTION public.fn_generate_th_site_plan_v3_app(integer, integer) TO anon, authenticated, service_role;
