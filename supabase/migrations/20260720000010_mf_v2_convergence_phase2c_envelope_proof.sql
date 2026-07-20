-- Convergence phase 2c: the classifier must price land by ELIGIBILITY, not
-- just budget. Bars may only stand inside the directional envelope; the
-- impervious budget alone overstated capacity (2611 W Heiman: 37.5% open
-- space lives in setback strips OUTSIDE the envelope). The proof now
-- measures remaining footprint-eligible envelope land, and when stories are
-- maxed and that land cannot host the missing floorplate even as an upper
-- bound, the result is PROVEN constrained ('buildable_envelope_exhausted')
-- instead of indefinitely 'incomplete'. proof_basis names the basis.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> 'c2c3f52c9c5e22196f3793a3cf791209' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected c2c3f52c9c5e22196f3793a3cf791209', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $k1o$  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;
  open_after numeric;$k1o$, $k1n$  depth_used numeric; yoff numeric; slab geometry; spiece record; tries integer;
  open_after numeric; fp_eligible numeric;$k1n$);
  v_new := replace(v_new, $k2o$  IF gsf_capture >= 0.85 THEN
    opt_status := 'feasible';
  ELSIF resid_impervious IS NOT NULL AND min_land_needed > resid_impervious + 1 THEN
    -- Even the OPTIMISTIC bill for the missing GSF exceeds the remaining
    -- impervious budget: the shortfall is a property of the lot, not an
    -- unfinished search.
    opt_status := 'feasible_demonstrably_constrained';
  ELSE
    opt_status := 'feasible_optimization_incomplete';
  END IF;
  opt_proof := jsonb_build_object(
    'binding_constraint', COALESCE(yield_clamp_reason,'none'),$k2o$, $k2n$  -- Footprint-eligible land: impervious budget alone overstates capacity —
  -- bars may only stand inside the directional envelope. Measure what is
  -- actually left there (upper bound: no shape filter, pieces >= 1000 sqft).
  SELECT ST_UnaryUnion(ST_Collect(bg)) INTO bars_u FROM unnest(bars_arr) AS bg;
  fp_eligible := COALESCE((SELECT SUM(ST_Area(g)) FROM (
    SELECT (ST_Dump(ST_CollectionExtract(ST_Difference(rot,
      ST_UnaryUnion(ST_Collect(ARRAY[
        CASE WHEN bars_u IS NULL THEN NULL ELSE ST_Buffer(bars_u,12) END,
        CASE WHEN pins_rot IS NULL THEN NULL ELSE ST_Buffer(pins_rot,12) END,
        CASE WHEN drives IS NULL THEN NULL ELSE ST_Buffer(drives,2) END,
        CASE WHEN parks IS NULL THEN NULL ELSE ST_Buffer(parks,1) END
      ]))),3))).geom AS g) q WHERE ST_Area(g) >= 1000), 0);
  IF gsf_capture >= 0.85 THEN
    opt_status := 'feasible';
  ELSIF resid_impervious IS NOT NULL AND min_land_needed > resid_impervious + 1 THEN
    -- Even the OPTIMISTIC bill for the missing GSF exceeds the remaining
    -- impervious budget: the shortfall is a property of the lot, not an
    -- unfinished search.
    opt_status := 'feasible_demonstrably_constrained';
  ELSIF resid_stories = 0 AND fp_eligible + 1 < gap_gsf/GREATEST(floors,1) THEN
    -- Stories are maxed and the remaining footprint-eligible envelope
    -- cannot host the missing floorplate even as an upper bound: proven
    -- constrained by the buildable envelope itself.
    opt_status := 'feasible_demonstrably_constrained';
  ELSE
    opt_status := 'feasible_optimization_incomplete';
  END IF;
  opt_proof := jsonb_build_object(
    'proof_basis', CASE
      WHEN gsf_capture >= 0.85 THEN 'capture_at_or_above_85'
      WHEN resid_impervious IS NOT NULL AND min_land_needed > resid_impervious + 1 THEN 'impervious_budget_exceeded'
      WHEN resid_stories = 0 AND fp_eligible + 1 < gap_gsf/GREATEST(floors,1) THEN 'buildable_envelope_exhausted'
      ELSE 'search_incomplete' END,
    'remaining_footprint_eligible_sqft', round(fp_eligible),
    'binding_constraint', COALESCE(yield_clamp_reason,'none'),$k2n$);

  IF md5(v_new) <> '3a9938e55acd3b5e743f00dcb0e9c028' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 3a9938e55acd3b5e743f00dcb0e9c028', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
