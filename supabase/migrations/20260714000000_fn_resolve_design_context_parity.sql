-- PARITY EXPORT — already applied to project okxrvetbzpoazrybhcqj (live).
-- Exported verbatim from the live catalog via pg_get_functiondef on
-- 2026-07-14. Owner: context-engine agent. Committed for source control and
-- environment parity. Do not reapply blindly.
--
-- THE keystone resolver. Provenance priority: ordinance > zoning >
-- typology_default; ordinance applies to Metro Nashville parcels only
-- (satellite cities flagged, Regrid fallback); emits source_conflicts when
-- ordinance and Regrid disagree; infers regime (parking-structure axis) and
-- parking strategy from FAR vs structured_parking_threshold_far.

CREATE OR REPLACE FUNCTION public.fn_resolve_design_context(p_ogc_fid integer, p_typology text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  ts public.typology_spec%ROWTYPE;
  ord public.jurisdiction_zoning_standards;
  v_use_class text; v_muni text; is_metro boolean;
  z_far numeric; z_height numeric; z_density numeric;
  z_front numeric; z_side numeric; z_rear numeric; z_base text; z_subtype text;
  z_lotw numeric; z_isr numeric; z_open numeric; z_minlot numeric;
  r_front numeric; r_side numeric; r_rear numeric; src_front text; src_side text; src_rear text;
  r_far numeric; src_far text; r_height numeric; src_height text; r_density numeric; src_density text;
  r_minlot numeric; src_minlot text; r_isr numeric; src_isr text;
  conflicts jsonb := '[]'::jsonb;
  v_regime text; phys jsonb; flood_class text; slope_class text; is_sp boolean;
BEGIN
  SELECT * INTO ts FROM public.typology_spec WHERE typology=p_typology;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','unknown typology: '||p_typology); END IF;

  v_use_class := CASE p_typology
    WHEN 'single_family' THEN 'sf_two_family'
    WHEN 'multifamily' THEN 'multifamily_nonres'
    ELSE 'mixed_nonres' END;

  SELECT pz.far_max,pz.height_max_ft,pz.density_max_du_acre,pz.base,pz.zoning_subtype,
         (pz.setbacks->>'front')::numeric,(pz.setbacks->>'side')::numeric,(pz.setbacks->>'rear')::numeric,
         pz.min_lot_width_ft, pz.max_impervious_pct, pz.min_open_space_pct, pz.min_lot_area_sqft,
         pz.municipality_name
    INTO z_far,z_height,z_density,z_base,z_subtype,z_front,z_side,z_rear,z_lotw,z_isr,z_open,z_minlot,v_muni
  FROM public.parcels p LEFT JOIN public.planner_zoning pz ON pz.zoning_id=p.zoning_id
  WHERE p.ogc_fid=p_ogc_fid;

  is_sp := upper(coalesce(z_base,'')) = 'SP';
  is_metro := coalesce(v_muni,'Nashville') = 'Nashville';

  IF is_metro THEN
    ord := public.fn_ordinance_standards(z_base, v_use_class);
    IF ord.district IS NULL AND v_use_class <> 'mixed_nonres' THEN
      ord := public.fn_ordinance_standards(z_base, 'mixed_nonres');
    END IF;
  END IF;  -- satellite cities: ord stays null -> Regrid/typology fallback + flag

  r_front := COALESCE(ord.front_setback_ft, z_front, ts.default_front_setback_ft);
  src_front := CASE WHEN ord.front_setback_ft IS NOT NULL THEN 'ordinance'
                    WHEN z_front IS NOT NULL THEN 'zoning' ELSE 'typology_default' END;
  r_side := COALESCE(ord.side_setback_ft, z_side, ts.default_side_setback_ft);
  src_side := CASE WHEN ord.side_setback_ft IS NOT NULL THEN 'ordinance'
                   WHEN z_side IS NOT NULL THEN 'zoning' ELSE 'typology_default' END;
  r_rear := COALESCE(ord.rear_setback_ft, z_rear, ts.default_rear_setback_ft);
  src_rear := CASE WHEN ord.rear_setback_ft IS NOT NULL THEN 'ordinance'
                   WHEN z_rear IS NOT NULL THEN 'zoning' ELSE 'typology_default' END;
  IF ord.rear_setback_ft IS NOT NULL AND z_rear IS NOT NULL AND ord.rear_setback_ft <> z_rear THEN
    conflicts := conflicts || jsonb_build_object('field','rear_setback','ordinance',ord.rear_setback_ft,'regrid',z_rear);
  END IF;

  r_far := COALESCE(ord.max_far, z_far);
  src_far := CASE WHEN ord.max_far IS NOT NULL THEN 'ordinance'
                  WHEN z_far IS NOT NULL THEN 'zoning' ELSE 'missing' END;
  IF ord.max_far IS NOT NULL AND z_far IS NOT NULL AND abs(ord.max_far - z_far) > 0.01 THEN
    conflicts := conflicts || jsonb_build_object('field','far','ordinance',ord.max_far,'regrid',z_far);
  END IF;

  r_height := COALESCE(ord.max_height_ft, z_height);
  src_height := CASE WHEN ord.max_height_ft IS NOT NULL THEN 'ordinance'
                     WHEN z_height IS NOT NULL THEN 'zoning' ELSE 'missing' END;
  r_density := COALESCE(ord.max_density_du_acre, z_density);
  src_density := CASE WHEN ord.max_density_du_acre IS NOT NULL THEN 'ordinance'
                      WHEN z_density IS NOT NULL THEN 'zoning' ELSE 'missing' END;
  r_minlot := COALESCE(ord.min_lot_area_sqft, z_minlot);
  src_minlot := CASE WHEN ord.min_lot_area_sqft IS NOT NULL THEN 'ordinance'
                     WHEN z_minlot IS NOT NULL THEN 'zoning' ELSE 'missing' END;
  r_isr := COALESCE(ord.max_isr, z_isr);
  src_isr := CASE WHEN ord.max_isr IS NOT NULL THEN 'ordinance'
                  WHEN z_isr IS NOT NULL THEN 'zoning' ELSE 'missing' END;

  phys := public.fn_resolve_physical_context(p_ogc_fid);
  flood_class := phys->'flood'->>'class'; slope_class := phys->'slope'->>'class';

  IF ts.vertical_capable AND r_far IS NOT NULL AND r_far >= ts.structured_parking_threshold_far THEN v_regime:='vertical';
  ELSIF ts.vertical_capable AND r_far IS NULL THEN v_regime:='horizontal_pending';
  ELSE v_regime:='horizontal'; END IF;

  RETURN jsonb_build_object(
    'parcel_ogc_fid',p_ogc_fid,'typology',p_typology,'regime',v_regime,
    'parking_strategy',CASE WHEN v_regime='vertical' THEN 'structured' ELSE 'surface' END,
    'zoning_base',z_base,'zoning_subtype',z_subtype,
    'municipality', v_muni,
    'ordinance_matched', (ord.district IS NOT NULL),
    'ordinance_use_class', ord.use_class,
    'setbacks',jsonb_build_object(
      'front',jsonb_build_object('value',r_front,'source',src_front),
      'side', jsonb_build_object('value',r_side ,'source',src_side),
      'rear', jsonb_build_object('value',r_rear ,'source',src_rear)),
    'far_max',jsonb_build_object('value',r_far,'source',src_far),
    'height_max_ft',jsonb_build_object('value',r_height,'source',src_height),
    'max_height_stories', ord.max_height_stories,
    'density_max_du_acre',jsonb_build_object('value',r_density,'source',src_density),
    'min_lot_area_sqft', jsonb_build_object('value', r_minlot, 'source', src_minlot),
    'min_lot_width_ft', jsonb_build_object('value', z_lotw,
        'source', CASE WHEN z_lotw IS NOT NULL THEN 'zoning' ELSE 'missing' END),
    'max_isr', jsonb_build_object('value', r_isr, 'source', src_isr),
    'min_open_space_pct', jsonb_build_object('value', z_open,
        'source', CASE WHEN z_open IS NOT NULL THEN 'zoning' ELSE 'missing' END),
    'source_conflicts', conflicts,
    'permitted_uses', public.fn_resolve_permitted_uses(p_ogc_fid),
    'physical', phys,
    'parking',jsonb_build_object('ratio',ts.surface_parking_ratio,'basis',ts.parking_basis,
      'stall_w_ft',ts.stall_w_ft,'stall_d_ft',ts.stall_d_ft,'drive_aisle_ft',ts.drive_aisle_ft),
    'developable',(phys->>'developable')::boolean,
    'flags', (
      CASE WHEN NOT is_metro THEN jsonb_build_array('satellite_city_ordinance_not_loaded') ELSE '[]'::jsonb END
      || CASE WHEN is_sp THEN jsonb_build_array('sp_district_site_specific_standards') ELSE '[]'::jsonb END
      || CASE WHEN jsonb_array_length(conflicts)>0 THEN jsonb_build_array('ordinance_regrid_conflict_check_overlays') ELSE '[]'::jsonb END
      || CASE WHEN flood_class IN ('sfha_100yr','coastal_high_hazard') THEN jsonb_build_array('flood_constrained') ELSE '[]'::jsonb END
      || CASE WHEN slope_class='steep' THEN jsonb_build_array('steep_slope') ELSE '[]'::jsonb END
      || CASE WHEN src_front='typology_default' THEN jsonb_build_array('front_setback_estimated') ELSE '[]'::jsonb END),
    'confidence', CASE
      WHEN is_sp THEN 'review_required'
      WHEN NOT is_metro THEN 'medium'
      WHEN flood_class IN ('sfha_100yr','coastal_high_hazard') OR slope_class='steep' THEN 'review_required'
      WHEN jsonb_array_length(conflicts)>0 THEN 'medium'
      WHEN src_front='ordinance' AND src_rear='ordinance' THEN 'high'
      WHEN src_rear IN ('ordinance','zoning') THEN 'medium' ELSE 'low' END);
END $function$;
