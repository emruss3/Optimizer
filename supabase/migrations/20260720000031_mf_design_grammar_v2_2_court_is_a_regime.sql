-- DESIGN GRAMMAR v2.2: the COURT IS A REGIME, never an in-band mutation.
-- Two live iterations proved the in-solver court keeps colliding with the
-- placement machinery (full-width severing; end-window stranding a bar;
-- clipped-empty courts burning the attempt). Same lesson as the P1-3
-- orientation falsification: alternatives are honest only as COMPLETE
-- solves compared by results. The court grammar now activates only under
-- p_regime = 'courtyard'; 'surface' returns to byte-baseline behavior
-- and 'tuck_under' stays courtless. The dispatcher (next migration)
-- runs the courtyard leg and selects it only when it actually placed a
-- court and kept >= 93% of the surface GSF — the design-value policy,
-- stated in receipts.

DO $mig$
DECLARE
  v_new text;
BEGIN
  SELECT prosrc INTO v_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_mf_solve_core';

  IF md5(v_new) <> '88f16323c35edeff3f6668adb0dce25e' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 88f16323c35edeff3f6668adb0dce25e', md5(v_new);
  END IF;

  v_new := replace(v_new, $r1o$    use_court := (NOT court_used) AND n_bars > 0
                 AND avail_h >= 2*bar_depth + 2*drive_gap + 6
                 AND (bxmax - bxmin) >= 300;
$r1o$, $r1n$    use_court := p_regime = 'courtyard' AND (NOT court_used) AND n_bars > 0
                 AND avail_h >= 2*bar_depth + 2*drive_gap + 6
                 AND (bxmax - bxmin) >= 300;
$r1n$);

  IF md5(v_new) <> 'a620dce84b068e290c17995a0855514d' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected a620dce84b068e290c17995a0855514d', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_mf_solve_core(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid, p_regime text)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
