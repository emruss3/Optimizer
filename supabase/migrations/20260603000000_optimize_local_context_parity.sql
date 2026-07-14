-- PARITY EXPORT — already applied to project okxrvetbzpoazrybhcqj (live).
-- Original migration applied outside tracked history; regenerated from the
-- live catalog via pg_get_functiondef on 2026-07-14. Functional parity
-- verified; byte-fidelity to the original script not guaranteed.
-- Owner: context-engine agent. Do not reapply blindly.
--
-- Dynamic local comps: built-form and pricing distributions among
-- recently-sold comparable nearby parcels (centroid radius + zoning subtype
-- + adaptive lot-size band). All measurement in EPSG:2274 precomputed
-- columns; building link via building_parcel_join (never a spatial join).

CREATE OR REPLACE FUNCTION public.fn_local_built_form(p_ogc_fid integer, p_radius_ft numeric DEFAULT 2640, p_since date DEFAULT '2019-01-01'::date, p_min_comps integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_subtype text; v_c geometry; v_lot numeric;
  v_band numeric; v_n int := 0; v_band_used numeric := 999; v_widened boolean := false;
  rec jsonb;
BEGIN
  SELECT z.zoning_subtype, p.centroid_2274, p.lot_sqft_2274
    INTO v_subtype, v_c, v_lot
  FROM public.parcels p JOIN public.planner_zoning z ON z.zoning_id=p.zoning_id
  WHERE p.ogc_fid=p_ogc_fid;
  IF v_c IS NULL THEN RETURN jsonb_build_object('error','no parcel/zoning/centroid_2274'); END IF;

  CREATE TEMP TABLE IF NOT EXISTS _comps(lot numeric, fp numeric, stories numeric) ON COMMIT DROP;
  TRUNCATE _comps;
  INSERT INTO _comps
  SELECT c.lot_sqft_2274, b.ed_bldg_footprint_sqft, NULLIF(b.ed_stories,'')::numeric
  FROM public.parcels c
  JOIN public.planner_zoning z2 ON z2.zoning_id=c.zoning_id
  JOIN public.building_parcel_join j ON j.ll_uuid=c.ll_uuid::text
  JOIN public.buildings b ON b.ed_bld_uuid=j.ed_bld_uuid AND b.ed_largest IN ('1','1.0')
  WHERE z2.zoning_subtype=v_subtype AND c.saledate>=p_since AND c.ogc_fid<>p_ogc_fid
    AND ST_DWithin(c.centroid_2274, v_c, p_radius_ft)
    AND b.ed_bldg_footprint_sqft > 0;

  FOREACH v_band IN ARRAY ARRAY[0.5,1.0,2.0,999]::numeric[] LOOP
    SELECT count(*) INTO v_n FROM _comps
    WHERE lot BETWEEN v_lot*(1-LEAST(v_band,0.99)) AND v_lot*(1+v_band);
    v_band_used := v_band;
    EXIT WHEN v_n >= p_min_comps;
    v_widened := true;
  END LOOP;

  SELECT jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'zoning_subtype', v_subtype,
    'subject_lot_sqft', round(v_lot,0), 'n_comps', v_n,
    'radius_ft', p_radius_ft, 'since', p_since,
    'lot_band_used', CASE WHEN v_band_used>=999 THEN 'any' ELSE '+/-'||round(v_band_used*100)||'%' END,
    'distribution', jsonb_build_object(
      'footprint_sqft', jsonb_build_object(
        'p25', round(percentile_cont(0.25) WITHIN GROUP (ORDER BY fp)::numeric,0),
        'p50', round(percentile_cont(0.50) WITHIN GROUP (ORDER BY fp)::numeric,0),
        'p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY fp)::numeric,0),
        'p90', round(percentile_cont(0.90) WITHIN GROUP (ORDER BY fp)::numeric,0)),
      'stories', jsonb_build_object(
        'p50', round(percentile_cont(0.50) WITHIN GROUP (ORDER BY stories)::numeric,1),
        'p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY stories)::numeric,1),
        'p90', round(percentile_cont(0.90) WITHIN GROUP (ORDER BY stories)::numeric,1))),
    'underwrite_target', jsonb_build_object(
      'footprint_sqft_p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY fp)::numeric,0),
      'footprint_sqft_p90', round(percentile_cont(0.90) WITHIN GROUP (ORDER BY fp)::numeric,0),
      'stories_p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY stories)::numeric,1)),
    'confidence', CASE WHEN v_n>=p_min_comps AND NOT v_widened THEN 'high'
                       WHEN v_n>=p_min_comps THEN 'medium'
                       WHEN v_n>=5 THEN 'low' ELSE 'insufficient' END)
  INTO rec
  FROM _comps
  WHERE lot BETWEEN v_lot*(1-LEAST(v_band_used,0.99)) AND v_lot*(1+v_band_used);
  RETURN rec;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_local_pricing(p_ogc_fid integer, p_radius_ft numeric DEFAULT 2640, p_since date DEFAULT '2019-01-01'::date, p_min_comps integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_subtype text; v_c geometry; v_lot numeric;
  v_band numeric; v_n int := 0; v_band_used numeric := 999; v_widened boolean := false; rec jsonb;
BEGIN
  SELECT z.zoning_subtype, p.centroid_2274, p.lot_sqft_2274 INTO v_subtype, v_c, v_lot
  FROM public.parcels p JOIN public.planner_zoning z ON z.zoning_id=p.zoning_id WHERE p.ogc_fid=p_ogc_fid;
  IF v_c IS NULL THEN RETURN jsonb_build_object('error','no parcel/centroid'); END IF;

  CREATE TEMP TABLE IF NOT EXISTS _pcomps(sp numeric, lot numeric, fp numeric) ON COMMIT DROP;
  TRUNCATE _pcomps;
  INSERT INTO _pcomps
  SELECT c.saleprice, c.lot_sqft_2274, b.ed_bldg_footprint_sqft
  FROM public.parcels c
  JOIN public.planner_zoning z2 ON z2.zoning_id=c.zoning_id
  JOIN public.building_parcel_join j ON j.ll_uuid=c.ll_uuid::text
  JOIN public.buildings b ON b.ed_bld_uuid=j.ed_bld_uuid AND b.ed_largest IN ('1','1.0')
  WHERE z2.zoning_subtype=v_subtype AND c.saledate>=p_since AND c.saleprice>1000 AND c.ogc_fid<>p_ogc_fid
    AND ST_DWithin(c.centroid_2274, v_c, p_radius_ft)
    AND b.ed_bldg_footprint_sqft>200;

  FOREACH v_band IN ARRAY ARRAY[0.5,1.0,2.0,999]::numeric[] LOOP
    SELECT count(*) INTO v_n FROM _pcomps
    WHERE lot BETWEEN v_lot*(1-LEAST(v_band,0.99)) AND v_lot*(1+v_band);
    v_band_used := v_band;
    EXIT WHEN v_n >= p_min_comps;
    v_widened := true;
  END LOOP;

  SELECT jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'zoning_subtype', v_subtype, 'n_comps', v_n,
    'lot_band_used', CASE WHEN v_band_used>=999 THEN 'any' ELSE '+/-'||round(v_band_used*100)||'%' END,
    'price_per_building_sf', jsonb_build_object(
      'p25', round(percentile_cont(0.25) WITHIN GROUP (ORDER BY sp/NULLIF(fp,0))::numeric,0),
      'p50', round(percentile_cont(0.50) WITHIN GROUP (ORDER BY sp/NULLIF(fp,0))::numeric,0),
      'p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY sp/NULLIF(fp,0))::numeric,0),
      'p90', round(percentile_cont(0.90) WITHIN GROUP (ORDER BY sp/NULLIF(fp,0))::numeric,0)),
    'price_per_lot_sf', jsonb_build_object(
      'p50', round(percentile_cont(0.50) WITHIN GROUP (ORDER BY sp/NULLIF(lot,0))::numeric,1),
      'p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY sp/NULLIF(lot,0))::numeric,1)),
    'sale_price', jsonb_build_object(
      'p50', round(percentile_cont(0.50) WITHIN GROUP (ORDER BY sp)::numeric,0),
      'p75', round(percentile_cont(0.75) WITHIN GROUP (ORDER BY sp)::numeric,0),
      'p90', round(percentile_cont(0.90) WITHIN GROUP (ORDER BY sp)::numeric,0)),
    'confidence', CASE WHEN v_n>=p_min_comps AND NOT v_widened THEN 'high'
                       WHEN v_n>=p_min_comps THEN 'medium'
                       WHEN v_n>=5 THEN 'low' ELSE 'insufficient' END)
  INTO rec
  FROM _pcomps
  WHERE lot BETWEEN v_lot*(1-LEAST(v_band_used,0.99)) AND v_lot*(1+v_band_used);
  RETURN rec;
END $function$;
