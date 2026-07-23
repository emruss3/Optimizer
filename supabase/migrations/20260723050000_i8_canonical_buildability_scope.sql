-- I-8 scope correction: the relaxation ladder operates only on parcels that
-- fn_parcel_buildability identifies as buildable for the selected typology.
-- Canonical unbuildable_* outcomes are cited verdicts, never solver failures.
--
-- A degenerate/single-point frontier on a genuinely buildable parcel skips the
-- directive/unit-band step and enters placement relaxation directly. This is a
-- generic contract change; no parcel, address, or jurisdiction branch exists.

do $patch_dispatcher$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  ) into d;

  if position('planner_buildability_verdict_v1' in d)>0 then
    return;
  end if;

  old := $old$  bres jsonb; brief jsonb; max_buildout jsonb; massing_program jsonb;$old$;
  new := $new$  bres jsonb; brief jsonb; max_buildout jsonb; massing_program jsonb;
  buildability jsonb; buildability_verdict text; degenerate_frontier boolean := false;$new$;
  if position(old in d)=0 then
    raise exception 'I-8 buildability declaration marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$  if not coalesce((bres->>'generation_allowed')::boolean,false) then
    return jsonb_build_object(
      'error','planner_generation_not_allowed',
      'flags',coalesce(brief->'flags','[]'::jsonb)
    );
  end if;
  max_buildout := brief->'max_buildout';$old$;
  new := $new$  if not coalesce((bres->>'generation_allowed')::boolean,false) then
    return jsonb_build_object(
      'error','planner_generation_not_allowed',
      'flags',coalesce(brief->'flags','[]'::jsonb)
    );
  end if;

  -- Geometry/program buildability is canonical and precedes I-8. A correct
  -- refusal is a deliverable, not an error for the relaxation ladder to hide.
  buildability := public.fn_parcel_buildability(p_ogc_fid,p_typology);
  buildability_verdict := lower(coalesce(buildability->>'verdict','unknown'));
  if buildability_verdict like 'unbuildable_%' then
    return jsonb_build_object(
      'error','planner_generation_not_allowed',
      'reason',buildability_verdict,
      'verdict_class','parcel_unbuildable_for_selected_typology',
      'buildability',buildability,
      'flags',coalesce(brief->'flags','[]'::jsonb)
        || jsonb_build_array('planner_buildability_verdict_v1',buildability_verdict)
    );
  elsif buildability_verdict not like 'buildable%' then
    return jsonb_build_object(
      'error','planner_buildability_unknown',
      'reason',coalesce(buildability->>'reason','canonical buildability could not be resolved'),
      'buildability',buildability,
      'flags',coalesce(brief->'flags','[]'::jsonb)
        || jsonb_build_array('planner_buildability_unknown_v1')
    );
  end if;

  max_buildout := brief->'max_buildout';$new$;
  if position(old in d)=0 then
    raise exception 'I-8 buildability preflight marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$  if coalesce((max_buildout->>'degenerate_frontier')::boolean,false)
     or coalesce((max_buildout->>'units_at_max')::integer,0)<coalesce((max_buildout->>'minimum_typology_units')::integer,3) then
    return jsonb_build_object(
      'error','planner_generation_not_allowed',
      'reason','planner_degenerate_frontier_below_typology_minimum',
      'verdict_class','program_infeasible_for_selected_typology',
      'minimum_typology_units',coalesce((max_buildout->>'minimum_typology_units')::integer,3),
      'units_at_max',coalesce((max_buildout->>'units_at_max')::integer,0),
      'max_gsf',coalesce((max_buildout->>'max_gsf')::numeric,0),
      'flags',coalesce(brief->'flags','[]'::jsonb)||jsonb_build_array('planner_degenerate_frontier_verdict_v1')
    );
  end if;$old$;
  new := $new$  degenerate_frontier := coalesce((max_buildout->>'degenerate_frontier')::boolean,false)
    or coalesce((max_buildout->>'units_at_max')::integer,0)
       < coalesce((max_buildout->>'minimum_typology_units')::integer,3);
  if degenerate_frontier then
    extra_flags := extra_flags
      || jsonb_build_array('planner_degenerate_frontier_band_step_skipped_v1');
    receipts := receipts || jsonb_build_object(
      'frontier',jsonb_build_object(
        'degenerate',true,
        'units_at_max',coalesce((max_buildout->>'units_at_max')::integer,0),
        'max_gsf',coalesce((max_buildout->>'max_gsf')::numeric,0),
        'action','skip_program_directive_and_enter_placement_relaxation'
      )
    );
  end if;$new$;
  if position(old in d)=0 then
    raise exception 'I-8 degenerate-frontier marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$  else
    parti := 'unavailable';
    primary_regime := 'surface';
    extra_flags := extra_flags || jsonb_build_array('massing_program_unavailable_free_pack_v1');
  end if;

  -- Pinned edits are user-authored geometry, not a massing-prior experiment.$old$;
  new := $new$  else
    parti := 'unavailable';
    primary_regime := 'surface';
    extra_flags := extra_flags || jsonb_build_array('massing_program_unavailable_free_pack_v1');
  end if;

  if degenerate_frontier then
    -- A single-point frontier has no meaningful band/directive walk. Enter
    -- placement relaxation without manufacturing a band-infeasible failure.
    parti := 'unavailable';
    primary_regime := 'surface';
    compact_candidate := true;
    extra_flags := extra_flags
      || jsonb_build_array('planner_degenerate_frontier_straight_to_placement_relaxation_v1');
  end if;

  -- Pinned edits are user-authored geometry, not a massing-prior experiment.$new$;
  if position(old in d)=0 then
    raise exception 'I-8 degenerate routing marker not found';
  end if;
  d := replace(d,old,new);

  old := $old$  r_best := jsonb_set(
    r_best,'{metrics,free_pack_floor_gsf}',
    case when free_gsf<0 then 'null'::jsonb else to_jsonb(round(free_gsf)) end,true
  );
  return r_best;$old$;
  new := $new$  r_best := jsonb_set(
    r_best,'{metrics,free_pack_floor_gsf}',
    case when free_gsf<0 then 'null'::jsonb else to_jsonb(round(free_gsf)) end,true
  );
  r_best := r_best || jsonb_build_object('buildability',buildability);
  return r_best;$new$;
  if position(old in d)=0 then
    raise exception 'I-8 buildability receipt marker not found';
  end if;
  d := replace(d,old,new);

  execute d;
end
$patch_dispatcher$;

do $patch_compiler$
declare
  d text;
begin
  select pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  ) into d;
  d := regexp_replace(
    d,
    $re$v_compiler_revision constant text := '[^']+'$re$,
    $rep$v_compiler_revision constant text := 'planner_context_v2_i8_totality_buildability_20260723'$rep$
  );
  execute d;
end
$patch_compiler$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Multifamily I-8 dispatcher. Canonical unbuildable parcels return cited verdicts; buildable parcels exhaust recoverable regimes with a free-pack floor; degenerate buildable frontiers skip directly to placement relaxation.';

notify pgrst,'reload schema';
