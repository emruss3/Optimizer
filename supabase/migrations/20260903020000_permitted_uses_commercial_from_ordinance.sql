-- Order-8 audit (2405 12th Ave S, CS): Regrid's per-polygon
-- permitted_land_uses_as_of_right flag read 'industrial_uses_permitted' only
-- for this CS polygon (sibling CS polygons carry the commercial token), so the
-- product declared a 12South retail lot industrial-only, suggested a house,
-- and never showed the FAR-0.6 allowable area the architect built to. The
-- ordinance table is authoritative for Nashville: a district with a
-- 'mixed_nonres' bulk row (CS, CL, MU*, OR*, ...) permits commercial use
-- as-of-right. Commercial is now TRUE when either the Regrid token OR the
-- ordinance row says so, with the basis published. Other uses unchanged.

CREATE OR REPLACE FUNCTION public.fn_resolve_permitted_uses(p_ogc_fid integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_aor text; v_cond text; v_all text; v_suggested text;
        v_base text; v_ord public.jurisdiction_zoning_standards%rowtype;
        v_commercial boolean; v_commercial_basis text;
BEGIN
  SELECT z.permitted_land_uses_as_of_right::text, z.permitted_land_uses_conditional::text, z.permitted_land_uses::text, pz.base
    INTO v_aor, v_cond, v_all, v_base
  FROM public.parcels p
  JOIN public.zoning z ON z.zoning_id = p.zoning_id
  LEFT JOIN public.planner_zoning pz ON pz.zoning_id = p.zoning_id
  WHERE p.ogc_fid = p_ogc_fid LIMIT 1;
  IF v_all IS NULL THEN RETURN jsonb_build_object('error','no zoning use data'); END IF;

  -- Ordinance-derived commercial permission (mixed_nonres bulk row exists for
  -- the district, -A/-NS variants resolved by fn_ordinance_standards).
  v_ord := public.fn_ordinance_standards(v_base, 'mixed_nonres');
  v_commercial := (v_aor ILIKE '%commercial_uses_permitted%') OR (v_ord.district IS NOT NULL);
  v_commercial_basis := CASE
    WHEN v_aor ILIKE '%commercial_uses_permitted%' THEN 'regrid_as_of_right_flag'
    WHEN v_ord.district IS NOT NULL THEN 'ordinance_mixed_nonres_row:' || v_ord.district
    ELSE 'not_permitted' END;

  -- intensity-ranked default: densest permitted use first (heuristic for "what to mass by default")
  v_suggested := CASE
    WHEN v_aor ILIKE '%multi_family_permitted%' THEN 'multi_family'
    WHEN v_commercial THEN 'commercial'
    WHEN v_aor ILIKE '%two_family_permitted%' THEN 'two_family'
    WHEN v_aor ILIKE '%industrial_uses_permitted%' THEN 'industrial'
    WHEN v_aor ILIKE '%single_family_permitted%' THEN 'single_family'
    ELSE NULL END;

  RETURN jsonb_build_object(
    'as_of_right', jsonb_build_object(
      'single_family', v_aor ILIKE '%single_family_permitted%',
      'two_family',    v_aor ILIKE '%two_family_permitted%',
      'multi_family',  v_aor ILIKE '%multi_family_permitted%',
      'commercial',    v_commercial,
      'industrial',    v_aor ILIKE '%industrial_uses_permitted%',
      'short_term_rental', v_aor ILIKE '%short_term_rentals_permitted%'),
    'as_of_right_basis', jsonb_build_object('commercial', v_commercial_basis),
    'suggested_primary_use', v_suggested,
    'suggested_primary_use_basis', 'highest_intensity_as_of_right_heuristic',
    'feasible_uses_as_of_right', (
      SELECT jsonb_agg(u) FROM (
        SELECT u FROM (VALUES
          ('single_family', v_aor ILIKE '%single_family_permitted%'),
          ('two_family',    v_aor ILIKE '%two_family_permitted%'),
          ('multi_family',  v_aor ILIKE '%multi_family_permitted%'),
          ('commercial',    v_commercial),
          ('industrial',    v_aor ILIKE '%industrial_uses_permitted%')
        ) AS t(u, ok) WHERE ok) x));
END $function$;
