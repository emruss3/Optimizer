-- P1-4 phase B: fn_generate_mf_site_plan_v2 becomes the REGIME DISPATCHER.
-- The 7-arg contract, generator_version, and every response field are
-- unchanged; the body now delegates to fn_mf_solve_core and, when the
-- surface solve is refused or lands below the envelope (incomplete /
-- demonstrably constrained), runs ONE more complete real solve in the
-- tuck-under regime and returns the argmax by achieved GSF (surface keeps
-- ties; a challenger must win by 2% + 1 sqft). This is the honest
-- configuration sweep P1-3 proved necessary: complete solves compared by
-- real results — never proxies. Receipts land in
-- metrics.regime_comparison (both GSFs, both errors, chosen, basis).
-- Pinned edits keep the fast single-solve surface path (regime continuity
-- for pinned iteration arrives with intent consumption, P1-2). With
-- p_persist=true both compared solves persist — the losing scheme remains
-- in the rail as an honest alternative.
-- Measured at cutover: 558613 converts from planner_parking_infeasible to
-- 227,760 GSF / 147u / 100% capture feasible (tuck); 408769/627065 keep
-- their better surface solves; 385519 (1-story cap) keeps surface via the
-- structured planner_regime_infeasible refusal of the challenger.

DO $mig$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';
  IF md5(v_src) <> '096a1dba2466e39a1563ff86b10127dd' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 096a1dba2466e39a1563ff86b10127dd', md5(v_src);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_mf_solve_core'
      AND md5(p.prosrc) = '0554f68b3e74bcdf789a4a6a9b1f0c98'
  ) THEN
    RAISE EXCEPTION 'fn_mf_solve_core worker missing or wrong version — apply mf_v2_solve_core_worker first';
  END IF;
END
$mig$;

CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)
 RETURNS jsonb LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $fnbody$
DECLARE
  r_surface jsonb;
  r_tuck jsonb;
  s_gfa numeric;
  t_gfa numeric;
  s_status text;
  receipts jsonb;
BEGIN
  -- Pinned edits keep the fast single-solve path: regime continuity for
  -- pinned iteration arrives with intent consumption (P1-2).
  IF p_pins IS NOT NULL AND jsonb_typeof(p_pins) = 'array' AND jsonb_array_length(p_pins) > 0 THEN
    RETURN public.fn_mf_solve_core(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id, 'surface');
  END IF;

  r_surface := public.fn_mf_solve_core(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id, 'surface');
  s_status := COALESCE(r_surface#>>'{metrics,optimization_status}', '');

  -- REGIME COMPARISON (P1-4): one more COMPLETE real solve, never a proxy
  -- (P1-3 falsification stands). Only when the surface solve is refused or
  -- provably below the envelope; a feasible surface solve is final.
  IF (r_surface ? 'error') OR s_status IN ('feasible_optimization_incomplete','feasible_demonstrably_constrained') THEN
    r_tuck := public.fn_mf_solve_core(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id, 'tuck_under');
    s_gfa := CASE WHEN r_surface ? 'error' THEN -1 ELSE COALESCE((r_surface#>>'{metrics,gfa_sqft}')::numeric, -1) END;
    t_gfa := CASE WHEN r_tuck ? 'error' THEN -1 ELSE COALESCE((r_tuck#>>'{metrics,gfa_sqft}')::numeric, -1) END;
    receipts := jsonb_build_object(
      'surface_gsf', CASE WHEN s_gfa < 0 THEN NULL ELSE s_gfa END,
      'surface_error', r_surface->>'error',
      'tuck_under_gsf', CASE WHEN t_gfa < 0 THEN NULL ELSE t_gfa END,
      'tuck_under_error', r_tuck->>'error',
      'chosen', CASE WHEN t_gfa > s_gfa * 1.02 + 1 THEN 'tuck_under' ELSE 'surface' END,
      'basis', 'complete_real_solves_argmax_gsf');
    IF t_gfa > s_gfa * 1.02 + 1 THEN
      RETURN jsonb_set(r_tuck, '{metrics,regime_comparison}', receipts, true);
    END IF;
    IF NOT (r_surface ? 'error') THEN
      RETURN jsonb_set(r_surface, '{metrics,regime_comparison}', receipts, true);
    END IF;
    RETURN r_surface;
  END IF;

  RETURN r_surface;
END
$fnbody$;
