-- 2026-11-04 · The pattern competition (fn_sf_v1_candidates) for the app.
--
-- fn_sf_v1_candidates(ogc_fid, opt) draws the grid, the neighborhood and the
-- loop grammar for a parcel and reports them side by side: `candidates`
-- (requested grammar, drawn pattern, lots, street ft, lots per 100 ft, open %,
-- connections, fails, notes, score per pattern), `best` (fewest failed tests,
-- then the most lots — a full plan), `structured` (the neighborhood plan — a
-- full plan), `lots_forgone_for_structure`, `scores`, `best_by_score`. The
-- handoff of 2026-11-03 (evening) makes it the call the product makes for
-- single-family: show both plans, the gap between them is the price of the
-- structure, and the owner decides.
--
-- Like fn_sf_v1_plan it calls helpers the anon role is not granted
-- (fn_site_inputs, the fn_th_v3_* family), so the app reaches it through this
-- SECURITY DEFINER wrapper, as it does the plan (20261103184636): owned by
-- postgres, search_path pinned, nothing else widened.
--
-- Timing: three plan runs, 3–5 s on 10–25 ac with the DEM cached; a heavy
-- parcel (70 ac in the fill scenario, ~14 s a run) cannot finish inside the
-- anon role's 20-s statement timeout, and the app says so instead of waiting.

CREATE OR REPLACE FUNCTION public.fn_sf_v1_candidates_app(p_ogc_fid integer, p_opt jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.fn_sf_v1_candidates(p_ogc_fid, coalesce(p_opt, '{}'::jsonb));
$function$;

GRANT EXECUTE ON FUNCTION public.fn_sf_v1_candidates_app(integer, jsonb) TO anon, authenticated, service_role;
