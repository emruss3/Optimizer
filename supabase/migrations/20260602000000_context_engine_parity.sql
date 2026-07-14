-- PARITY EXPORT — already applied to project okxrvetbzpoazrybhcqj (live).
-- The original context-engine migration was applied outside tracked history
-- (SQL editor), so this file is regenerated from the live catalog via
-- pg_get_functiondef / pg_get_viewdef on 2026-07-14. Functional parity
-- verified; byte-fidelity to the original script not guaranteed.
-- Owner: context-engine agent. Committed for source control and environment
-- parity. Do not reapply blindly.

CREATE OR REPLACE FUNCTION public.fn_resolve_permitted_uses(p_ogc_fid integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_aor text; v_cond text; v_all text;
BEGIN
  SELECT z.permitted_land_uses_as_of_right::text, z.permitted_land_uses_conditional::text, z.permitted_land_uses::text
    INTO v_aor, v_cond, v_all
  FROM public.parcels p JOIN public.zoning z ON z.zoning_id = p.zoning_id
  WHERE p.ogc_fid = p_ogc_fid LIMIT 1;

  IF v_all IS NULL THEN RETURN jsonb_build_object('error','no zoning use data'); END IF;

  RETURN jsonb_build_object(
    'as_of_right', jsonb_build_object(
      'single_family', v_aor ILIKE '%single_family_permitted%',
      'two_family',    v_aor ILIKE '%two_family_permitted%',
      'multi_family',  v_aor ILIKE '%multi_family_permitted%',
      'commercial',    v_aor ILIKE '%commercial_uses_permitted%',
      'industrial',    v_aor ILIKE '%industrial_uses_permitted%',
      'short_term_rental', v_aor ILIKE '%short_term_rentals_permitted%'),
    'conditional', jsonb_build_object(
      'single_family', v_cond ILIKE '%single_family_permitted%',
      'two_family',    v_cond ILIKE '%two_family_permitted%',
      'multi_family',  v_cond ILIKE '%multi_family_permitted%',
      'commercial',    v_cond ILIKE '%commercial_uses_permitted%',
      'industrial',    v_cond ILIKE '%industrial_uses_permitted%'),
    -- the feasible-use list the HBU optimizer should iterate over (as-of-right only = lowest risk)
    'feasible_uses_as_of_right', (
      SELECT jsonb_agg(u) FROM (
        SELECT u FROM (VALUES
          ('single_family', v_aor ILIKE '%single_family_permitted%'),
          ('two_family',    v_aor ILIKE '%two_family_permitted%'),
          ('multi_family',  v_aor ILIKE '%multi_family_permitted%'),
          ('commercial',    v_aor ILIKE '%commercial_uses_permitted%'),
          ('industrial',    v_aor ILIKE '%industrial_uses_permitted%')
        ) AS t(u, ok) WHERE ok
      ) x)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.fn_resolve_physical_context(p_ogc_fid integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_flood text; v_hi numeric; v_lo numeric; v_spread numeric;
  v_acres numeric; v_area_2274 numeric;
  flood_class text; flood_dev_impact text;
  slope_class text; slope_pct numeric; eff_dim numeric;
BEGIN
  SELECT fema_flood_zone, highest_parcel_elevation, lowest_parcel_elevation, deededacreage,
         ST_Area(ST_Transform(ST_MakeValid(wkb_geometry_4326),2274))
    INTO v_flood, v_hi, v_lo, v_acres, v_area_2274
  FROM public.parcels WHERE ogc_fid = p_ogc_fid;

  -- Flood classification
  flood_class := CASE
    WHEN v_flood IN ('V','VE') THEN 'coastal_high_hazard'
    WHEN v_flood IN ('A','AE','AH','AO','A99','AR') THEN 'sfha_100yr'
    WHEN v_flood IN ('X','X500','B','C') THEN 'minimal'
    WHEN v_flood IS NULL OR btrim(v_flood)='' THEN 'unknown'
    ELSE 'other' END;
  flood_dev_impact := CASE flood_class
    WHEN 'coastal_high_hazard' THEN 'severe: build prohibited/elevated, likely excluded'
    WHEN 'sfha_100yr' THEN 'major: floodplain regs, elevation required, partial exclusion'
    WHEN 'minimal' THEN 'none'
    ELSE 'verify' END;

  -- Slope: estimate grade as spread / effective horizontal run (sqrt of area as proxy run length)
  v_spread := GREATEST(COALESCE(v_hi,0) - COALESCE(v_lo,0), 0);
  eff_dim := sqrt(NULLIF(v_area_2274,0));
  slope_pct := CASE WHEN eff_dim > 0 THEN round((100.0 * v_spread / eff_dim)::numeric,1) ELSE NULL END;
  slope_class := CASE
    WHEN v_hi IS NULL OR v_lo IS NULL THEN 'unknown'
    WHEN slope_pct < 5  THEN 'flat'
    WHEN slope_pct < 10 THEN 'gentle'
    WHEN slope_pct < 20 THEN 'moderate'
    ELSE 'steep' END;

  RETURN jsonb_build_object(
    'flood', jsonb_build_object(
       'zone', v_flood, 'class', flood_class, 'dev_impact', flood_dev_impact,
       'source', CASE WHEN v_flood IS NOT NULL AND btrim(v_flood)<>'' THEN 'fema' ELSE 'missing' END),
    'slope', jsonb_build_object(
       'spread_ft', round(v_spread,1), 'grade_pct_est', slope_pct, 'class', slope_class,
       'source', CASE WHEN v_hi IS NOT NULL AND v_lo IS NOT NULL THEN 'elevation_estimate' ELSE 'missing' END),
    'developable', (flood_class IN ('minimal','unknown','other') AND slope_class <> 'steep')
  );
END $function$;

-- Sanitized zoning view (joins on zoning_id; sentinels cleaned)
CREATE OR REPLACE VIEW public.planner_zoning AS
 SELECT z.zoning_id,
    z.zoning AS base,
    z.zoning_type,
    z.zoning_subtype,
    fn_clean_zoning_num(z.max_far) AS far_max,
    fn_clean_zoning_num(z.max_building_height_ft) AS height_max_ft,
    fn_clean_zoning_num(z.max_density_du_per_acre) AS density_max_du_acre,
    fn_clean_zoning_num(z.min_lot_area_sq_ft) AS min_lot_area_sqft,
    fn_clean_zoning_num(z.min_lot_width_ft) AS min_lot_width_ft,
    fn_clean_zoning_num(z.max_impervious_coverage_pct) AS max_impervious_pct,
    fn_clean_zoning_num(z.min_open_space_pct) AS min_open_space_pct,
    jsonb_build_object('front', fn_clean_zoning_num(z.min_front_setback_ft), 'side', fn_clean_zoning_num(z.min_side_setback_ft), 'rear', fn_clean_zoning_num(z.min_rear_setback_ft)) AS setbacks,
    z.municipality_name
   FROM zoning z;
