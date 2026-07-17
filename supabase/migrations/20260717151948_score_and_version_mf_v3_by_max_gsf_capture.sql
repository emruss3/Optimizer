-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.

do $patch$
declare
  d text;
  old text;
  new text;
begin
  d := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  old := $old$
  sc_yield := CASE
    WHEN units_max IS NOT NULL AND units_max > 0 THEN LEAST(1, units::numeric / units_max)
    WHEN max_far IS NOT NULL AND max_far > 0 THEN LEAST(1, gfa / (max_far * parcel_area))
    ELSE 0.5 END;
  sc_park := CASE WHEN req_stalls > 0 THEN LEAST(1, n_stalls::numeric / req_stalls) ELSE 1 END;
  far_achieved := gfa / NULLIF(parcel_area, 0);
  sc_zone := CASE WHEN max_far IS NOT NULL AND max_far > 0
    THEN LEAST(1, far_achieved / max_far) ELSE LEAST(1, COALESCE(tot_fp / NULLIF(cov_cap_sqft,0), 0.5)) END;
$old$;
  new := $new$
  gsf_capture := LEAST(1,gfa/NULLIF(target_gsf,0));
  sc_yield := gsf_capture;
  sc_park := 1; -- parking is a hard rejection gate above
  far_achieved := gfa/NULLIF(parcel_area,0);
  IF gsf_capture<0.85 AND yield_clamp_reason IS NULL THEN
    sc_zone := power(gsf_capture/0.85,2)*0.35;
    flags := flags || to_jsonb('gsf_capture_below_85_without_clamp'::text);
  ELSIF gsf_capture<0.85 THEN
    sc_zone := power(gsf_capture/0.85,2)*0.60;
    flags := flags || to_jsonb(('gsf_capture_below_85_clamped_by_'||yield_clamp_reason)::text);
  ELSE
    sc_zone := gsf_capture;
  END IF;
$new$;
  if position(old in d)=0 then raise exception 'v3 GSF score marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
    'parking_compliance', round(sc_park, 3),
    'zoning_utilization', round(sc_zone, 3),
    'precedent_fit', round(sc_prec, 3),
$old$;
  new := $new$
    'parking_compliance', round(sc_park, 3),
    'zoning_utilization', round(sc_zone, 3),
    'gsf_capture', round(gsf_capture,3),
    'target_max_gsf', round(target_gsf),
    'achieved_gsf', round(gfa),
    'yield_clamp_reason', yield_clamp_reason,
    'precedent_fit', round(sc_prec, 3),
$new$;
  if position(old in d)=0 then raise exception 'v3 score component marker not found'; end if;
  d := replace(d,old,new);

  old := $old$COALESCE((w->>'financial_return')::numeric, 0.2)$old$;
  new := $new$COALESCE((w->>'financial_return')::numeric, 0.15)$new$;
  d := replace(d,old,new);
  old := $old$COALESCE((w->>'unit_or_program_yield')::numeric, 0.15)$old$;
  new := $new$COALESCE((w->>'unit_or_program_yield')::numeric, 0.05)$new$;
  d := replace(d,old,new);
  old := $old$COALESCE((w->>'parking_compliance')::numeric, 0.15)$old$;
  new := $new$COALESCE((w->>'parking_compliance')::numeric, 0.05)$new$;
  d := replace(d,old,new);
  old := $old$COALESCE((w->>'zoning_utilization')::numeric, 0.10)$old$;
  new := $new$COALESCE((w->>'zoning_utilization')::numeric, 0.55)$new$;
  d := replace(d,old,new);
  old := $old$COALESCE((w->>'precedent_fit')::numeric, 0.15)$old$;
  new := $new$COALESCE((w->>'precedent_fit')::numeric, 0.05)$new$;
  d := replace(d,old,new);
  old := $old$COALESCE((w->>'internal_program_fit')::numeric, 0.10)$old$;
  new := $new$COALESCE((w->>'internal_program_fit')::numeric, 0.05)$new$;
  d := replace(d,old,new);
  old := $old$COALESCE((w->>'circulation_quality')::numeric, 0.10)$old$;
  new := $new$COALESCE((w->>'circulation_quality')::numeric, 0.07)$new$;
  d := replace(d,old,new);
  old := $old$COALESCE((w->>'open_space_quality')::numeric, 0.05)$old$;
  new := $new$COALESCE((w->>'open_space_quality')::numeric, 0.03)$new$;
  d := replace(d,old,new);

  old := $old$
  basis := format('Context %s · %s precedents (%s) · %s bars × %s floors · %s stalls (%s/unit) · access: frontage heuristic pending road upgrade',
                  COALESCE(ctx_version, 'v?'), n_prec, prec_conf, n_bars, floors, n_stalls, ratio);
$old$;
  new := $new$
  basis := format('Max GSF %s · achieved %s (%s%%) · %s bars × %s floors · %s units @ %s GSF/unit · %s/%s stalls · clamp: %s · binding: %s · access connected',
                  round(target_gsf),round(gfa),round(gsf_capture*100,1),n_bars,floors,units,
                  round(actual_unit_gsf),n_stalls,req_stalls,COALESCE(yield_clamp_reason,'none'),
                  COALESCE(mb->>'binding_constraint','unknown'));
$new$;
  if position(old in d)=0 then raise exception 'v3 plan basis marker not found'; end if;
  d := replace(d,old,new);

  d := replace(d,$old$'mf_context_v2_regrid_typology_v1'$old$,$new$'mf_max_gsf_v1'$new$);
  d := replace(d,$old$'mf_context_v2'$old$,$new$'mf_max_gsf_v1'$new$);
  d := replace(d,$old$'context_score_v2'$old$,$new$'context_score_gsf_v1'$new$);

  old := $old$
                'units_est', units, 'stalls', n_stalls, 'stalls_required', req_stalls,
                'coverage_pct', round(tot_fp / parcel_area * 100, 1),
$old$;
  new := $new$
                'units_est', units,
                'target_max_gsf', round(target_gsf),
                'gsf_capture_pct', round(gsf_capture*100,1),
                'avg_unit_gsf', round(actual_unit_gsf),
                'binding_constraint', mb->>'binding_constraint',
                'yield_clamp_reason', yield_clamp_reason,
                'stalls', n_stalls, 'stalls_required', req_stalls,
                'coverage_pct', round(tot_fp / parcel_area * 100, 1),
$new$;
  if position(old in d)=0 then raise exception 'v3 persisted metrics marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
      'units_est', units, 'stalls', n_stalls, 'stalls_required', req_stalls,
      'parking_ratio_provided', CASE WHEN units > 0 THEN round(n_stalls::numeric / units, 2) ELSE NULL END,
$old$;
  new := $new$
      'units_est', units,
      'target_max_gsf', round(target_gsf),
      'gsf_capture_pct', round(gsf_capture*100,1),
      'avg_unit_gsf', round(actual_unit_gsf),
      'binding_constraint', mb->>'binding_constraint',
      'yield_clamp_reason', yield_clamp_reason,
      'hard_constraints_passed', true,
      'drive_components', drive_components,
      'parking_max_distance_ft', 250,
      'stalls', n_stalls, 'stalls_required', req_stalls,
      'parking_ratio_provided', CASE WHEN units > 0 THEN round(n_stalls::numeric / units, 2) ELSE NULL END,
$new$;
  if position(old in d)=0 then raise exception 'v3 return metrics marker not found'; end if;
  d := replace(d,old,new);

  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. Zoning utilization is achieved GSF divided by the context max-GSF frontier and is the dominant objective. Parking and access are hard gates; Regrid precedents shape form only.';
