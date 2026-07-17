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

  old := '  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; obj jsonb; w jsonb;';
  new := '  bres jsonb; brief jsonb; hc jsonb; pk jsonb; pri jsonb; prog jsonb; obj jsonb; w jsonb; mb jsonb; ent jsonb;';
  if position(old in d)=0 then raise exception 'declaration marker 1 missing'; end if;
  d := replace(d,old,new);

  old := '  ctx_version text; ctx_hash text; prog_version text;';
  new := E'  ctx_version text; ctx_hash text; prog_version text;\n  target_gsf numeric; target_fp numeric; target_stories integer; target_unit_gsf numeric; target_units integer; max_unit_gsf numeric;';
  if position(old in d)=0 then raise exception 'declaration marker 2 missing'; end if;
  d := replace(d,old,new);

  old := '  max_far numeric; max_h numeric; max_den numeric; max_cov numeric; min_open numeric;';
  new := E'  max_far numeric; max_h numeric; max_den numeric; max_cov numeric; min_open numeric;\n  max_impervious_pct numeric; max_impervious_sqft numeric; actual_impervious numeric;';
  if position(old in d)=0 then raise exception 'declaration marker 3 missing'; end if;
  d := replace(d,old,new);

  old := '  avg_unit numeric; boundary geometry; seg_a geometry; seg_b geometry;';
  new := E'  avg_unit numeric; actual_unit_gsf numeric; boundary geometry; seg_a geometry; seg_b geometry;\n  max_gsf_by_parking numeric; excess_area numeric; last_area numeric; shrink_len numeric; last_bar geometry;';
  if position(old in d)=0 then raise exception 'declaration marker 4 missing'; end if;
  d := replace(d,old,new);

  old := '  units integer; req_stalls integer; units_max integer;';
  new := E'  units integer; req_stalls integer; units_max integer;\n  parking_units_cap integer; program_min_units integer; drive_components integer; stranded_count integer := 0; remote_parking_count integer := 0;';
  if position(old in d)=0 then raise exception 'declaration marker 5 missing'; end if;
  d := replace(d,old,new);

  old := '  parcel_area numeric; flags jsonb := ''[]''::jsonb;';
  new := E'  parcel_area numeric; flags jsonb := ''[]''::jsonb;\n  yield_clamp_reason text; gsf_capture numeric;';
  if position(old in d)=0 then raise exception 'declaration marker 6 missing'; end if;
  d := replace(d,old,new);

  old := $old$
  prog_version := brief->>'program_prior_version';
  flags := COALESCE(brief->'flags', '[]'::jsonb);
$old$;
  new := $new$
  prog_version := brief->>'program_prior_version';
  flags := COALESCE(brief->'flags', '[]'::jsonb);
  mb := brief->'max_buildout';
  ent := brief->'entitlement_capacity';
  IF mb IS NULL OR mb ? 'error' OR nullif(mb->>'max_gsf','') IS NULL THEN
    RETURN jsonb_build_object('error','planner_max_buildout_required');
  END IF;
  target_gsf := (mb->>'max_gsf')::numeric;
  target_stories := GREATEST(1,(mb->>'at_stories')::integer);
  target_unit_gsf := GREATEST(1,COALESCE((mb->>'at_unit_gsf')::numeric,1550));
  target_units := GREATEST(1,COALESCE((mb->>'units_at_max')::integer,ceil(target_gsf/target_unit_gsf)::integer));
  max_unit_gsf := GREATEST(target_unit_gsf,target_gsf/target_units);
  flags := flags || to_jsonb('max_gsf_target_from_context'::text);
$new$;
  if position(old in d)=0 then raise exception 'max-buildout load marker missing'; end if;
  d := replace(d,old,new);

  old := $old$
  max_far := (hc->>'max_far')::numeric;
  max_h   := (hc->>'max_height_ft')::numeric;
  max_den := (hc->>'max_density_du_acre')::numeric;
  max_cov := (hc->>'max_coverage_pct')::numeric;
  min_open := (hc->>'min_open_space_pct')::numeric;
$old$;
  new := $new$
  max_far := (hc->>'max_far')::numeric;
  max_h   := (hc->>'max_height_ft')::numeric;
  max_den := (hc->>'max_density_du_acre')::numeric;
  max_cov := COALESCE((hc->>'max_building_coverage_pct')::numeric,(hc->>'max_coverage_pct')::numeric);
  max_impervious_pct := (hc->>'max_impervious_pct')::numeric;
  max_impervious_sqft := (hc->>'max_impervious_sqft')::numeric;
  min_open := (hc->>'min_open_space_pct')::numeric;
$new$;
  if position(old in d)=0 then raise exception 'hard-constraint marker missing'; end if;
  d := replace(d,old,new);

  old := $old$
  SELECT COALESCE(max_floorplate_depth_ft, 65), COALESCE(floor_to_floor_ft, 10)
    INTO bar_depth, f2f FROM public.typology_spec WHERE typology = p_typology;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no typology_spec row for ' || p_typology);
  END IF;
  IF p50depth IS NOT NULL AND n_prec >= 5 THEN
    bar_depth := p50depth;
    flags := flags || to_jsonb('bar_depth_from_regrid_geometry_p50'::text);
  END IF;
  bar_depth := LEAST(GREATEST(bar_depth, 45), 72);
  IF p75length IS NOT NULL AND n_prec >= 5 THEN
    p90fp := p75length * bar_depth;
    flags := flags || to_jsonb('bar_length_target_from_regrid_geometry_p75'::text);
  END IF;

  -- Stories: precedent p50–p75 midpoint, min 2 for MF viability, capped by height
  IF p50s IS NOT NULL AND p75s IS NOT NULL AND n_prec >= 5 THEN
    floors := GREATEST(2, round((p50s + p75s) / 2.0)::int);
    flags := flags || to_jsonb('stories_from_precedent_p50_p75'::text);
  ELSE
    floors := 3;
    flags := flags || to_jsonb('stories_fallback_typology_default'::text);
  END IF;
  IF max_h IS NOT NULL THEN
    floors := LEAST(floors, GREATEST(1, floor(max_h / f2f)::int));
  END IF;
$old$;
  new := $new$
  -- Whole-building OBB depth is not a bar-depth prior. Use an interim U.S.
  -- double-loaded program depth until the per-type unit/core spec lands.
  SELECT LEAST(COALESCE(max_floorplate_depth_ft,65),65),
         COALESCE(floor_height_ft,floor_to_floor_ft,11)
    INTO bar_depth,f2f
  FROM public.typology_spec
  WHERE typology=p_typology;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','no typology_spec row for '||p_typology);
  END IF;
  bar_depth := LEAST(GREATEST(bar_depth,45),65);
  flags := flags || to_jsonb('bar_depth_from_typology_program_spec'::text);
  IF p75length IS NOT NULL AND n_prec >= 5 THEN
    p90fp := p75length*bar_depth;
    flags := flags || to_jsonb('bar_length_target_from_regrid_geometry_p75'::text);
  END IF;

  -- Max-buildout stories drive quantity. Precedent stories remain form evidence.
  floors := target_stories;
  IF max_h IS NOT NULL THEN
    floors := LEAST(floors,GREATEST(1,floor(max_h/f2f)::integer));
  END IF;
  flags := flags || to_jsonb('stories_from_max_gsf_frontier'::text);
$new$;
  if position(old in d)=0 then raise exception 'form-prior marker missing'; end if;
  d := replace(d,old,new);

  old := $old$
  cov_cap_sqft := CASE WHEN max_cov IS NOT NULL THEN parcel_area * max_cov / 100.0 ELSE NULL END;
  units_max := CASE WHEN max_den IS NOT NULL THEN floor(max_den * parcel_area / 43560.0)::int ELSE NULL END;
$old$;
  new := $new$
  target_fp := target_gsf/GREATEST(floors,1);
  cov_cap_sqft := CASE WHEN max_cov IS NOT NULL THEN parcel_area*max_cov/100.0 ELSE NULL END;
  IF cov_cap_sqft IS NULL THEN
    cov_cap_sqft := target_fp;
  ELSE
    IF cov_cap_sqft<target_fp THEN
      yield_clamp_reason := 'building_coverage';
      flags := flags || to_jsonb('gsf_target_clamped_by_building_coverage'::text);
    END IF;
    cov_cap_sqft := LEAST(cov_cap_sqft,target_fp);
  END IF;
  max_impervious_sqft := COALESCE(max_impervious_sqft,
    CASE WHEN max_impervious_pct IS NOT NULL THEN parcel_area*max_impervious_pct/100.0 END);
  units_max := CASE WHEN max_den IS NOT NULL THEN floor(max_den*parcel_area/43560.0)::integer ELSE NULL END;
$new$;
  if position(old in d)=0 then raise exception 'target-footprint marker missing'; end if;
  d := replace(d,old,new);

  if position('  use_court := true;' in d)=0 then raise exception 'court-mode marker missing'; end if;
  d := replace(d,'  use_court := true;','  use_court := false; -- every inter-bar gap is a connected parking street');
  d := replace(d,'    use_court := NOT use_court;','    use_court := false;');

  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Staged max-GSF MF solver: context frontier controls stories and footprint; Regrid OBB depth is excluded from bar depth; inter-bar gaps prioritize connected parking streets.';
