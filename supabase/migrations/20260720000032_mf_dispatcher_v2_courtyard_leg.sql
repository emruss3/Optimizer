-- DISPATCHER v2 (design grammar v2.2): three complete solves, one honest
-- choice. Surface first (byte-baseline). On sites that can host a court
-- (>= 2 bars and >= 60k sqft of parcel), a COURTYARD leg runs; it is
-- selected only when it actually placed a designed court AND kept >= 93%
-- of the surface GSF — the design-value policy, named in the receipts.
-- The tuck-under challenge then runs as before when the chosen scheme is
-- refused or below the envelope. Pinned edits keep the fast single-solve
-- path. All compared legs persist under p_persist (the schemes rail).

DO $mig$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';
  IF md5(v_src) <> '29db678da4f2d396efbc84af359b5503' THEN
    RAISE EXCEPTION 'dispatcher pre-image md5 % unexpected', md5(v_src);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_mf_solve_core'
      AND md5(p.prosrc) = 'a620dce84b068e290c17995a0855514d'
  ) THEN
    RAISE EXCEPTION 'fn_mf_solve_core is not at the regime-gated version — apply mf_design_grammar_v2_2 first';
  END IF;
END
$mig$;

CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)
 RETURNS jsonb LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $fnbody$
DECLARE
  r_surface jsonb;
  r_court jsonb;
  r_tuck jsonb;
  r_best jsonb;
  s_gfa numeric;
  c_gfa numeric;
  t_gfa numeric;
  b_gfa numeric;
  b_status text;
  receipts jsonb;
BEGIN
  -- Pinned edits keep the fast single-solve path: regime continuity for
  -- pinned iteration arrives with intent consumption (P1-2).
  IF p_pins IS NOT NULL AND jsonb_typeof(p_pins) = 'array' AND jsonb_array_length(p_pins) > 0 THEN
    RETURN public.fn_mf_solve_core(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id, 'surface');
  END IF;

  r_surface := public.fn_mf_solve_core(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id, 'surface');
  r_best := r_surface;
  s_gfa := CASE WHEN r_surface ? 'error' THEN -1 ELSE COALESCE((r_surface#>>'{metrics,gfa_sqft}')::numeric, -1) END;

  -- COURTYARD LEG (design grammar v2.2): a complete alternative solve on
  -- sites that can host it. Selected only when it actually placed the
  -- designed court AND kept >= 93% of the surface GSF — design value has
  -- a named price cap, never a silent trade.
  IF s_gfa > 0
     AND COALESCE((r_surface#>>'{metrics,bars}')::int, 0) >= 2
     AND COALESCE((r_surface#>>'{metrics,parcel_sqft}')::numeric, 0) >= 60000 THEN
    r_court := public.fn_mf_solve_core(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id, 'courtyard');
    c_gfa := CASE WHEN r_court ? 'error' THEN -1 ELSE COALESCE((r_court#>>'{metrics,gfa_sqft}')::numeric, -1) END;
    IF c_gfa > 0
       AND (r_court->'flags') ? 'designed_central_court_v1'
       AND c_gfa >= s_gfa * 0.93 THEN
      receipts := jsonb_build_object(
        'surface_gsf', s_gfa,
        'courtyard_gsf', c_gfa,
        'chosen', 'courtyard',
        'design_policy', 'court_selected_within_7pct_of_surface_gsf',
        'basis', 'complete_real_solves');
      r_best := jsonb_set(r_court, '{metrics,regime_comparison}', receipts, true);
    ELSIF c_gfa > 0 THEN
      receipts := jsonb_build_object(
        'surface_gsf', s_gfa,
        'courtyard_gsf', c_gfa,
        'courtyard_court_placed', (r_court->'flags') ? 'designed_central_court_v1',
        'chosen', 'surface',
        'design_policy', 'court_selected_within_7pct_of_surface_gsf',
        'basis', 'complete_real_solves');
      r_best := jsonb_set(r_surface, '{metrics,regime_comparison}', receipts, true);
    END IF;
  END IF;

  b_gfa := CASE WHEN r_best ? 'error' THEN -1 ELSE COALESCE((r_best#>>'{metrics,gfa_sqft}')::numeric, -1) END;
  b_status := COALESCE(r_best#>>'{metrics,optimization_status}', '');

  -- TUCK-UNDER CHALLENGE (P1-4): one more complete real solve when the
  -- chosen scheme is refused or provably below the envelope.
  IF (r_best ? 'error') OR b_status IN ('feasible_optimization_incomplete','feasible_demonstrably_constrained') THEN
    r_tuck := public.fn_mf_solve_core(p_ogc_fid, p_typology, p_seed, p_pins, p_parent, p_persist, p_context_id, 'tuck_under');
    t_gfa := CASE WHEN r_tuck ? 'error' THEN -1 ELSE COALESCE((r_tuck#>>'{metrics,gfa_sqft}')::numeric, -1) END;
    receipts := COALESCE(r_best#>'{metrics,regime_comparison}', jsonb_build_object('basis', 'complete_real_solves'))
      || jsonb_build_object(
        'tuck_under_gsf', CASE WHEN t_gfa < 0 THEN NULL ELSE t_gfa END,
        'tuck_under_error', r_tuck->>'error');
    IF t_gfa > b_gfa * 1.02 + 1 THEN
      receipts := receipts || jsonb_build_object('chosen', 'tuck_under');
      RETURN jsonb_set(r_tuck, '{metrics,regime_comparison}', receipts, true);
    END IF;
    IF NOT (r_best ? 'error') THEN
      RETURN jsonb_set(r_best, '{metrics,regime_comparison}', receipts, true);
    END IF;
    RETURN r_best;
  END IF;

  RETURN r_best;
END
$fnbody$;
