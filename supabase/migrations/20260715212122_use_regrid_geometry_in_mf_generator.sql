-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

do $patch_generator$
declare
  v_definition text;
begin
  v_definition:=pg_get_functiondef('public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure);

  if position('p50s numeric; p75s numeric; p90fp numeric; p75fp numeric; n_prec integer; prec_conf text;' in v_definition)=0 then
    raise exception 'MF generator declaration marker not found';
  end if;
  v_definition:=replace(v_definition,
    'p50s numeric; p75s numeric; p90fp numeric; p75fp numeric; n_prec integer; prec_conf text;',
    E'p50s numeric; p75s numeric; p90fp numeric; p75fp numeric; n_prec integer; prec_conf text;\n  p50depth numeric; p75length numeric; p75coverage numeric;');

  if position('(pri#>>''{footprint_sqft,p90}'')::numeric);' in v_definition)=0 then
    raise exception 'MF generator precedent extraction marker not found';
  end if;
  v_definition:=replace(v_definition,
    '(pri#>>''{footprint_sqft,p90}'')::numeric);',
    E'(pri#>>''{footprint_sqft,p90}'')::numeric);\n  p50depth := (pri#>>''{depth_ft,p50}'')::numeric;\n  p75length := COALESCE((pri#>>''{underwrite_target,length_ft_p75}'')::numeric,(pri#>>''{length_ft,p75}'')::numeric);\n  p75coverage := COALESCE((pri#>>''{underwrite_target,coverage_pct_p75}'')::numeric,(pri#>>''{coverage_pct,p75}'')::numeric);');

  if position('bar_depth := LEAST(GREATEST(bar_depth, 45), 68);' in v_definition)=0 then
    raise exception 'MF generator bar depth marker not found';
  end if;
  v_definition:=replace(v_definition,
    'bar_depth := LEAST(GREATEST(bar_depth, 45), 68);',
    E'IF p50depth IS NOT NULL AND n_prec >= 5 THEN\n    bar_depth := p50depth;\n    flags := flags || to_jsonb(''bar_depth_from_regrid_geometry_p50''::text);\n  END IF;\n  bar_depth := LEAST(GREATEST(bar_depth, 45), 72);\n  IF p75length IS NOT NULL AND n_prec >= 5 THEN\n    p90fp := p75length * bar_depth;\n    flags := flags || to_jsonb(''bar_length_target_from_regrid_geometry_p75''::text);\n  END IF;');

  if position('sc_prec := CASE WHEN avg_bar_fp IS NOT NULL AND p75fp IS NOT NULL AND p75fp > 0' in v_definition)=0 then
    raise exception 'MF generator precedent score marker not found';
  end if;
  v_definition:=replace(v_definition,
    E'sc_prec := CASE WHEN avg_bar_fp IS NOT NULL AND p75fp IS NOT NULL AND p75fp > 0\n    THEN LEAST(avg_bar_fp, p75fp) / GREATEST(avg_bar_fp, p75fp) ELSE 0.5 END;',
    E'sc_prec := 0.5 * (CASE WHEN avg_bar_fp IS NOT NULL AND p75fp IS NOT NULL AND p75fp > 0\n    THEN LEAST(avg_bar_fp, p75fp) / GREATEST(avg_bar_fp, p75fp) ELSE 0.5 END)\n    + 0.25 * (CASE WHEN p75coverage IS NOT NULL AND p75coverage > 0\n      THEN LEAST(100.0 * tot_fp / NULLIF(parcel_area,0), p75coverage) / GREATEST(100.0 * tot_fp / NULLIF(parcel_area,0), p75coverage) ELSE 0.5 END)\n    + 0.25 * (CASE WHEN p75s IS NOT NULL AND p75s > 0\n      THEN LEAST(floors::numeric, p75s) / GREATEST(floors::numeric, p75s) ELSE 0.5 END);');

  if position('''[]''::jsonb, prog_version)' in v_definition)>0 then
    v_definition:=replace(v_definition,
      '''[]''::jsonb, prog_version)',
      'COALESCE(pri->''precedent_parcel_ids'',''[]''::jsonb), prog_version)');
  end if;

  if position('''context_hash'', ctx_hash),' in v_definition)>0 then
    v_definition:=replace(v_definition,
      '''context_hash'', ctx_hash),',
      '''context_hash'', ctx_hash, ''regrid_precedent_selection'', pri->''selection''),');
  end if;

  v_definition:=replace(v_definition,
    '''generator_version'', ''mf_context_v2'',',
    '''generator_version'', ''mf_context_v2_regrid_typology_v1'',');
  v_definition:=replace(v_definition,
    '''mf_context_v2'', ''context_score_v1''',
    '''mf_context_v2_regrid_typology_v1'', ''context_score_v2''');
  v_definition:=replace(v_definition,
    '''score_version'', ''context_score_v1'',',
    '''score_version'', ''context_score_v2'',');

  execute v_definition;
end
$patch_generator$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Context-driven MF generator using planner_context_v2. Regrid typology-filtered footprint depth, length, stories, coverage and precedent lineage affect geometry and scoring.';
