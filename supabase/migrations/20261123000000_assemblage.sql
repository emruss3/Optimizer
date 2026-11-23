-- Assemblage v1 and v2: combined sites (applied to project okxrvetbzpoazrybhcqj on 2026-11-17 and 2026-11-23).
-- This file is the source of record for the live migrations
--   assemblage_v1_combined_site
--   assemblage_v1_permitted_uses_keep_error_shape
--   assemblage_v1_fix_permitted_uses_permission
--   assemblage_v2_context_for_combined_sites
--   assemblage_v2_buildability_on_combined_outline
-- It holds the final state of every object they created or changed. See docs/ASSEMBLAGE.md.

create table if not exists public.parcel_assemblage (
  ogc_fid integer primary key check (ogc_fid < 0),
  member_fids integer[] not null unique,
  zoning text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.parcel_assemblage enable row level security;
revoke all on public.parcel_assemblage from anon, authenticated;
create index if not exists parcel_assemblage_created_by_idx on public.parcel_assemblage (created_by, created_at);

create sequence if not exists public.parcel_assemblage_seq as integer start 1 maxvalue 700000 no cycle;
revoke all on sequence public.parcel_assemblage_seq from anon, authenticated;

-- fn_assemblage_lead  (acl {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_assemblage_lead(p_ogc_fid integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.ogc_fid from public.parcel_assemblage a join public.parcels p on p.ogc_fid = any(a.member_fids)
  where a.ogc_fid = p_ogc_fid and p_ogc_fid < 0 order by st_area(p.geom_2274) desc limit 1;
$function$;

-- fn_assemblage_members  (acl {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_assemblage_members(p_ogc_fid integer)
 RETURNS integer[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.member_fids from public.parcel_assemblage a where a.ogc_fid = p_ogc_fid and p_ogc_fid < 0;
$function$;

-- fn_assemblage_outline  (acl {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_assemblage_outline(p_ogc_fid integer)
 RETURNS geometry
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.geom_2274 from public.parcel_assemblage a join training.virtual_parcel v on v.ogc_fid = a.ogc_fid where a.ogc_fid = p_ogc_fid and p_ogc_fid < 0;
$function$;

-- fn_assemblage_params  (acl {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_assemblage_params()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'max_members', 12,            -- cap on parcels in one combined site
    'max_new_per_day', 40,        -- cap on new combined sites per signed-in user per 24 h
    'adjacency_ft', 2,            -- parcels within this distance count as touching (the fabric tolerance fn_parcel_frontage uses)
    'districts', '^(R|RS|RM)[0-9]' -- districts the planner can draw a combined site in so far (subdivision and townhome engines)
  );
$function$;

-- fn_assemble_parcels  (acl {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_assemble_parcels(p_fids integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare P jsonb := public.fn_assemblage_params(); fids integer[]; n int; found int; zs text[]; z text; u geometry; g geometry; parts int;
  tol double precision := (P->>'adjacency_ft')::double precision / 2; fid int; addr text; uid uuid := auth.uid(); made int;
begin
  select coalesce(array_agg(distinct f order by f), '{}') into fids from unnest(coalesce(p_fids, '{}')) f where f is not null and f > 0;
  n := cardinality(fids);
  if n < 2 then return jsonb_build_object('error', 'too_few', 'message', 'Add at least two parcels to combine them.'); end if;
  if n > (P->>'max_members')::int then return jsonb_build_object('error', 'too_many', 'message', format('One combined site can hold up to %s parcels.', P->>'max_members')); end if;

  -- the same set always returns the same combined site
  select a.ogc_fid into fid from public.parcel_assemblage a where a.member_fids = fids;
  if fid is null then
    select count(*), array_agg(distinct p.zoning), st_union(st_makevalid(p.geom_2274))
      into found, zs, u from public.parcels p where p.ogc_fid = any(fids) and p.geom_2274 is not null;
    if found < n then return jsonb_build_object('error', 'not_found', 'message', 'One of these parcels is no longer on record.'); end if;
    if cardinality(zs) <> 1 or zs[1] is null then
      return jsonb_build_object('error', 'mixed_zoning', 'districts', to_jsonb(zs), 'message', format('These parcels are in different zoning districts (%s). One site needs one district, so this set would need a rezoning first.', array_to_string(zs, ', ')));
    end if;
    z := zs[1];
    if z !~ (P->>'districts') then
      return jsonb_build_object('error', 'district_not_supported', 'district', z, 'message', format('Combined sites are planned in R, RS and RM districts so far. These parcels are zoned %s.', z));
    end if;
    -- close the fabric gap between touching parcels, then the union must be one piece
    u := st_buffer(st_buffer(u, tol, 'join=mitre'), -tol, 'join=mitre');
    select count(*) into parts from st_dump(u) d where st_area(d.geom) > 1;
    if parts <> 1 then return jsonb_build_object('error', 'not_adjacent', 'pieces', parts, 'message', 'These parcels do not all touch, so they cannot be planned as one site. Remove the one that stands apart, or add the parcel between them.'); end if;
    select d.geom into g from st_dump(u) d order by st_area(d.geom) desc limit 1;

    select count(*) into made from public.parcel_assemblage a where a.created_by is not distinct from uid and a.created_at > now() - interval '24 hours';
    if made >= (P->>'max_new_per_day')::int then return jsonb_build_object('error', 'too_many_today', 'message', 'That is the limit of new combined sites for one day.'); end if;

    select format('%s + %s more', coalesce(nullif(btrim(p.address), ''), 'parcel ' || p.ogc_fid), n - 1) into addr
      from public.parcels p where p.ogc_fid = any(fids) order by st_area(p.geom_2274) desc limit 1;
    fid := -nextval('public.parcel_assemblage_seq')::int;
    insert into public.parcel_assemblage (ogc_fid, member_fids, zoning, created_by) values (fid, fids, z, uid);
    insert into training.virtual_parcel (ogc_fid, plat_key, zoning, exclude, geom_2274, address, created_at)
      values (fid, null, z, fids, st_setsrid(g, 2274), addr, now());
  end if;
  return (select jsonb_build_object('ogc_fid', v.ogc_fid, 'address', v.address, 'zoning', v.zoning,
            'acres', round((st_area(v.geom_2274) / 43560)::numeric, 2), 'member_fids', to_jsonb(v.exclude))
          from training.virtual_parcel v where v.ogc_fid = fid);
end $function$;

-- fn_compile_assemblage_context  (acl {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_compile_assemblage_context(p_ogc_fid integer, p_use text, p_user_intent jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare members integer[]; m integer; r jsonb; ctx jsonb; sb jsonb; g geometry; a double precision; ma double precision;
  dens numeric; ec jsonb; inset double precision; env geometry; flags jsonb; v_hash text; v_id uuid; v_created timestamptz; v_exp timestamptz := now() + interval '30 minutes';
  add_flags jsonb := '["combined_site","combined_site_district_facts_read_from_largest_member","combined_site_physical_read_from_largest_member","combined_site_frontage_not_resolved","combined_site_max_buildout_not_computed","combined_site_uniform_setback_envelope"]'::jsonb;
begin
  members := public.fn_assemblage_members(p_ogc_fid);
  if members is null then return jsonb_build_object('error', 'valid p_ogc_fid is required'); end if;
  select v.geom_2274, st_area(v.geom_2274) into g, a from training.virtual_parcel v where v.ogc_fid = p_ogc_fid;
  if g is null then return jsonb_build_object('error', 'combined site has no outline'); end if;
  select p.ogc_fid, st_area(p.geom_2274) into m, ma from public.parcels p where p.ogc_fid = any(members) order by st_area(p.geom_2274) desc limit 1;

  r := public.fn_compile_planner_context(m, p_use, p_user_intent);
  if r is null or r ? 'error' then
    return coalesce(r, jsonb_build_object('error', 'compile returned null')) || jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'combined_site', true, 'read_from_member', m);
  end if;
  ctx := r->'context'; sb := r->'solver_brief';
  flags := coalesce(ctx->'flags', '[]'::jsonb) - 'frontage_from_parcel_fabric_primary_segment' || add_flags;

  -- the unit and impervious caps scale with the combined lot area; density is the district's
  dens := nullif(ctx #>> '{legal,max_density_du_acre,value}', '')::numeric;
  ec := coalesce(ctx #> '{legal,entitlement_capacity}', '{}'::jsonb) || jsonb_build_object(
    'lot_sqft', round(a), 'lot_acres', round((a / 43560)::numeric, 3),
    'max_units', case when dens is not null then floor(dens * a / 43560)::int
                      when (ctx #>> '{legal,entitlement_capacity,max_units}') is not null and ma > 0 then floor((ctx #>> '{legal,entitlement_capacity,max_units}')::numeric * a / ma)::int end,
    'max_impervious_sqft', case when (ctx #>> '{legal,entitlement_capacity,max_impervious_sqft}') is not null and ma > 0 then round((ctx #>> '{legal,entitlement_capacity,max_impervious_sqft}')::numeric * a / ma) end,
    'max_gfa_sqft', case when (ctx #>> '{legal,entitlement_capacity,max_gfa_sqft}') is not null and ma > 0 then round((ctx #>> '{legal,entitlement_capacity,max_gfa_sqft}')::numeric * a / ma) end,
    'basis', 'district caps x combined site area (EPSG:2274)');

  inset := greatest(coalesce((sb #>> '{hard_constraints,front_setback_ft}')::double precision, 0), coalesce((sb #>> '{hard_constraints,side_setback_ft}')::double precision, 0), coalesce((sb #>> '{hard_constraints,rear_setback_ft}')::double precision, 0));
  select d.geom into env from st_dump(st_buffer(g, -inset)) d order by st_area(d.geom) desc limit 1;

  ctx := ctx || jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'flags', flags,
    'combined_site', jsonb_build_object('member_fids', to_jsonb(members), 'district_facts_from', m, 'site_sqft', round(a)),
    'legal', (ctx->'legal') || jsonb_build_object('entitlement_capacity', ec),
    'entitlement_capacity', ec,
    'physical', coalesce(ctx->'physical', '{}'::jsonb) || jsonb_build_object('read_from_member', m),
    'frontage', jsonb_build_object('resolved', '{}'::jsonb, 'legacy_envelope', '{}'::jsonb, 'front_edge_is_placeholder', true, 'access_method', 'combined_site_frontage_not_resolved'),
    'max_buildout', '{}'::jsonb, 'massing_program', '{}'::jsonb,
    'provenance', coalesce(ctx->'provenance', '{}'::jsonb) || jsonb_build_object('combined_site', jsonb_build_object('function', 'public.fn_compile_assemblage_context', 'district_facts_from', m)));

  sb := sb || jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'flags', flags,
    'geometry', jsonb_build_object(
      'parcel', st_asgeojson(st_transform(g, 4326))::jsonb,
      'buildable_envelope', case when env is not null and not st_isempty(env) then st_asgeojson(st_transform(env, 4326))::jsonb end,
      'front_edge', null, 'front_edge_2274', null, 'frontage_midpoint_2274', null, 'frontage_bearing_deg', null,
      'front_edge_is_placeholder', true, 'landlocked', false, 'access_method', 'combined_site_frontage_not_resolved', 'frontage_method', null),
    'hard_constraints', (sb->'hard_constraints') || jsonb_build_object('max_impervious_sqft', ec->'max_impervious_sqft'),
    'entitlement_capacity', ec, 'max_buildout', '{}'::jsonb, 'massing_program', '{}'::jsonb,
    'physical', coalesce(sb->'physical', '{}'::jsonb) || jsonb_build_object('read_from_member', m));

  v_hash := encode(extensions.digest((r->>'context_version') || '|' || (ctx #- '{provenance,compiled_at}')::text || '|' || sb::text, 'sha256'), 'hex');
  insert into planner.context_snapshot (parcel_ogc_fid, selected_use, typology, context_version, context_hash, generation_allowed, compiled_context, solver_brief, provenance,
      objective_profile, created_by, is_current, request_fingerprint, cache_expires_at)
    values (p_ogc_fid, ctx->>'selected_use', ctx->>'typology', r->>'context_version', v_hash, coalesce((r->>'generation_allowed')::boolean, false), ctx, sb, ctx->'provenance',
      coalesce(ctx->'objective_profile', '{}'::jsonb), auth.uid(), true, encode(extensions.digest(coalesce(p_user_intent::text, ''), 'sha256'), 'hex'), v_exp)
    on conflict (parcel_ogc_fid, selected_use, context_version, context_hash)
    do update set compiled_context = excluded.compiled_context, solver_brief = excluded.solver_brief, is_current = true, cache_expires_at = excluded.cache_expires_at
    returning id, created_at into v_id, v_created;
  update planner.context_snapshot set is_current = false where parcel_ogc_fid = p_ogc_fid and selected_use = ctx->>'selected_use' and id <> v_id and is_current;

  return jsonb_build_object('context_id', v_id, 'context_version', r->>'context_version', 'context_hash', v_hash, 'created_at', v_created,
    'generation_allowed', coalesce((r->>'generation_allowed')::boolean, false), 'context', ctx, 'solver_brief', sb, 'cache_status', 'miss', 'cache_expires_at', v_exp,
    'entitlement_path', r->'entitlement_path', 'not_by_right', r->'not_by_right');
end $function$;

-- fn_compile_planner_context  (acl {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_compile_planner_context(p_ogc_fid integer, p_use text, p_user_intent jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_selected_use text;
  v_typology text;
  v_use_key text;
  v_uses jsonb;
  v_permitted boolean := false;
  v_rezone boolean := false;
  v_entitlement_path text := 'as_of_right';
  v_result jsonb;
BEGIN
  IF p_ogc_fid < 0 AND public.fn_assemblage_members(p_ogc_fid) IS NOT NULL THEN
    RETURN public.fn_compile_assemblage_context(p_ogc_fid, p_use, p_user_intent);
  END IF;
  IF p_ogc_fid IS NULL OR p_ogc_fid <= 0 THEN
    RETURN jsonb_build_object('error', 'valid p_ogc_fid is required');
  END IF;
  IF p_use IS NULL OR btrim(p_use) = '' OR length(p_use) > 64 THEN
    RETURN jsonb_build_object('error', 'valid p_use is required');
  END IF;
  IF p_user_intent IS NULL THEN
    p_user_intent := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_user_intent) <> 'object' THEN
    RETURN jsonb_build_object('error', 'p_user_intent must be a JSON object');
  END IF;

  v_selected_use := lower(btrim(p_use));
  v_typology := CASE
    WHEN v_selected_use IN ('multi_family', 'multifamily', 'mf') THEN 'multifamily'
    WHEN v_selected_use IN ('single_family', 'sf', 'two_family', 'duplex') THEN 'single_family'
    ELSE v_selected_use
  END;
  v_use_key := CASE
    WHEN v_typology = 'multifamily' THEN 'multi_family'
    WHEN v_selected_use IN ('two_family', 'duplex') THEN 'two_family'
    WHEN v_typology = 'single_family' THEN 'single_family'
    ELSE v_selected_use
  END;

  v_uses := public.fn_resolve_permitted_uses(p_ogc_fid);
  IF v_uses ? 'error' THEN
    RETURN v_uses;
  END IF;

  v_permitted := coalesce((v_uses -> 'as_of_right' ->> v_use_key)::boolean, false);
  v_rezone := coalesce((p_user_intent ->> 'rezone')::boolean, false)
    OR lower(coalesce(p_user_intent ->> 'scenario', '')) = 'rezone';

  IF NOT v_permitted AND NOT v_rezone THEN
    RETURN jsonb_build_object(
      'error', 'selected_use_not_as_of_right',
      'message',
        'Selected use is not as-of-right for this parcel. Pass p_user_intent.rezone=true (or scenario=rezone) for an explicit not-by-right rezone scenario.',
      'entitlement_path', 'as_of_right_required',
      'not_by_right', false,
      'parcel_ogc_fid', p_ogc_fid,
      'selected_use', v_selected_use,
      'use_key', v_use_key,
      'permitted_uses', v_uses,
      'suggested_primary_use', v_uses ->> 'suggested_primary_use',
      'generation_allowed', false
    );
  END IF;

  IF v_rezone AND NOT v_permitted THEN
    v_entitlement_path := 'rezone_not_by_right';
  ELSE
    v_entitlement_path := 'as_of_right';
  END IF;

  v_result := public.fn_compile_planner_context_ungated(p_ogc_fid, p_use, p_user_intent);
  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'compile returned null');
  END IF;
  IF v_result ? 'error' THEN
    RETURN v_result;
  END IF;

  v_result := v_result
    || jsonb_build_object(
      'entitlement_path', v_entitlement_path,
      'not_by_right', (v_entitlement_path = 'rezone_not_by_right')
    );

  IF jsonb_typeof(v_result -> 'context') = 'object' THEN
    v_result := jsonb_set(
      v_result,
      '{context,entitlement_path}',
      to_jsonb(v_entitlement_path),
      true
    );
    v_result := jsonb_set(
      v_result,
      '{context,not_by_right}',
      to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
      true
    );
    IF jsonb_typeof(v_result #> '{context,legal}') = 'object' THEN
      v_result := jsonb_set(
        v_result,
        '{context,legal,entitlement_path}',
        to_jsonb(v_entitlement_path),
        true
      );
      v_result := jsonb_set(
        v_result,
        '{context,legal,not_by_right}',
        to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
        true
      );
      v_result := jsonb_set(
        v_result,
        '{context,legal,rezone_scenario}',
        to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
        true
      );
    END IF;
    IF v_entitlement_path = 'rezone_not_by_right' THEN
      v_result := jsonb_set(
        v_result,
        '{context,flags}',
        coalesce(v_result #> '{context,flags}', '[]'::jsonb)
          || jsonb_build_array('rezone_scenario_not_by_right'),
        true
      );
    END IF;
  END IF;

  IF jsonb_typeof(v_result -> 'solver_brief') = 'object' THEN
    v_result := jsonb_set(
      v_result,
      '{solver_brief,entitlement_path}',
      to_jsonb(v_entitlement_path),
      true
    );
    v_result := jsonb_set(
      v_result,
      '{solver_brief,not_by_right}',
      to_jsonb(v_entitlement_path = 'rezone_not_by_right'),
      true
    );
    IF v_entitlement_path = 'rezone_not_by_right' THEN
      v_result := jsonb_set(
        v_result,
        '{solver_brief,flags}',
        coalesce(v_result #> '{solver_brief,flags}', '[]'::jsonb)
          || jsonb_build_array('rezone_scenario_not_by_right'),
        true
      );
    END IF;
  END IF;

  IF v_entitlement_path = 'rezone_not_by_right' THEN
    IF coalesce((v_result #>> '{context,physical,developable}')::boolean,
                (v_result #>> '{solver_brief,hard_constraints,developable}')::boolean,
                true) THEN
      v_result := jsonb_set(v_result, '{generation_allowed}', 'true'::jsonb, true);
      IF jsonb_typeof(v_result -> 'context') = 'object' THEN
        v_result := jsonb_set(v_result, '{context,generation_allowed}', 'true'::jsonb, true);
      END IF;
      IF jsonb_typeof(v_result -> 'solver_brief') = 'object' THEN
        v_result := jsonb_set(v_result, '{solver_brief,generation_allowed}', 'true'::jsonb, true);
      END IF;
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

-- fn_parcel_buildability  (acl {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_parcel_buildability(p_ogc_fid integer, p_typology text DEFAULT 'multifamily'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  env jsonb; env_geom geometry; up jsonb;
  min_area numeric; min_width numeric; circ_d numeric := 0; env_area numeric;
  v_front numeric; v_side numeric; v_rear numeric; ctx jsonb;
  base jsonb; sf jsonb; v_ref integer; v_out geometry;
BEGIN
  v_ref := coalesce(case when p_ogc_fid < 0 then public.fn_assemblage_lead(p_ogc_fid) end, p_ogc_fid);
  IF p_ogc_fid < 0 THEN v_out := public.fn_assemblage_outline(p_ogc_fid); END IF;
  ctx := public.fn_resolve_design_context(v_ref, p_typology);
  IF ctx ? 'error' THEN ctx := public.fn_resolve_design_context(v_ref, 'multifamily'); END IF;
  IF ctx ? 'error' THEN RETURN jsonb_build_object('verdict','unknown','reason',ctx->>'error'); END IF;
  v_front := coalesce((ctx#>>'{setbacks,front,value}')::numeric,20);
  v_side  := coalesce((ctx#>>'{setbacks,side,value}')::numeric,5);
  v_rear  := coalesce((ctx#>>'{setbacks,rear,value}')::numeric,20);
  IF p_typology = 'single_family' THEN min_area := 800; min_width := 24;
  ELSE
    up := public.fn_unit_program(p_typology);
    min_width := coalesce((up->>'implied_bar_depth_ft')::numeric,67.3);
    min_area := min_width * 60;
  END IF;
  IF v_out IS NOT NULL THEN
    env := (SELECT jsonb_build_object('area_sqft', st_area(d.geom), 'geom_2274', st_asgeojson(d.geom)::jsonb, 'basis', 'combined site outline inset by the largest setback') FROM st_dump(st_buffer(v_out, -greatest(v_front, v_side, v_rear))) d ORDER BY st_area(d.geom) DESC LIMIT 1);
    env := coalesce(env, jsonb_build_object('area_sqft', 0));
  ELSE
    env := public.fn_directional_envelope(p_ogc_fid, v_front, v_side, v_rear);
  END IF;
  env_area := coalesce((env->>'area_sqft')::numeric,0);
  IF env ? 'error' OR env_area < min_area THEN
    base := jsonb_build_object('parcel_ogc_fid',p_ogc_fid,'typology',p_typology,
      'verdict','unbuildable_area','reason',round(env_area)::text||' sqft envelope < min '||p_typology||' footprint',
      'envelope_sqft',round(env_area),'min_area_sqft',round(min_area),
      'note','buildable-stratum = verdict LIKE buildable%; refusal is a VERDICT, never an error.');
  ELSE
    BEGIN
      env_geom := ST_SetSRID(ST_GeomFromGeoJSON((env->'geom_2274')::text),2274);
      SELECT (radius*2)::numeric(10,1) INTO circ_d FROM ST_MaximumInscribedCircle(env_geom);
    EXCEPTION WHEN others THEN circ_d := 0; END;
    circ_d := coalesce(circ_d,0);
    IF circ_d < min_width THEN
      base := jsonb_build_object('parcel_ogc_fid',p_ogc_fid,'typology',p_typology,
        'verdict','unbuildable_depth','reason',circ_d::text||' ft max width < '||min_width::text||' ft required',
        'envelope_sqft',round(env_area),'max_inscribed_width_ft',circ_d,'min_width_ft',min_width);
    ELSE
      base := jsonb_build_object('parcel_ogc_fid',p_ogc_fid,'typology',p_typology,
        'verdict','buildable','reason',circ_d::text||' ft width, '||round(env_area)::text||' sqft envelope',
        'envelope_sqft',round(env_area),'max_inscribed_width_ft',circ_d);
    END IF;
  END IF;
  IF p_typology='multifamily' AND (base->>'verdict') LIKE 'unbuildable%' THEN
    sf := public.fn_parcel_buildability(p_ogc_fid, 'single_family');
    IF (sf->>'verdict')='buildable' THEN
      base := base || jsonb_build_object('suggested_typology','single_family',
        'suggestion_reason','envelope fits a house ('||(sf->>'envelope_sqft')||' sqft, '||(sf->>'max_inscribed_width_ft')||' ft wide)');
    END IF;
  END IF;
  RETURN base;
END $function$;

-- fn_resolve_permitted_uses  (acl {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_resolve_permitted_uses(p_ogc_fid integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE v_members integer[]; v_aor text; v_cond text; v_all text; v_suggested text;
        v_base text; v_ord public.jurisdiction_zoning_standards%rowtype;
        v_commercial boolean; v_commercial_basis text;
BEGIN
  IF p_ogc_fid < 0 THEN
    v_members := public.fn_assemblage_members(p_ogc_fid);
    IF v_members IS NULL THEN RETURN jsonb_build_object('error','no zoning use data'); END IF;
    RETURN (SELECT public.fn_resolve_permitted_uses(p.ogc_fid) || jsonb_build_object('combined_site', true, 'read_from_member', p.ogc_fid)
      FROM public.parcels p WHERE p.ogc_fid = ANY(v_members) ORDER BY st_area(p.geom_2274) DESC LIMIT 1);
  END IF;
  SELECT z.permitted_land_uses_as_of_right::text, z.permitted_land_uses_conditional::text, z.permitted_land_uses::text, pz.base
    INTO v_aor, v_cond, v_all, v_base
  FROM public.parcels p
  JOIN public.zoning z ON z.zoning_id = p.zoning_id
  LEFT JOIN public.planner_zoning pz ON pz.zoning_id = p.zoning_id
  WHERE p.ogc_fid = p_ogc_fid LIMIT 1;
  IF v_all IS NULL THEN RETURN jsonb_build_object('error','no zoning use data'); END IF;
  -- a Specific Plan district (SP) has no base-code use table: its uses and bulk standards are the SP ordinance itself (council bill and case number on the parcel record),
  -- which is not loaded here. The answer names the ordinance instead of reporting every use as not permitted (app audit 2026-11-09, 117 Lemuel Rd).
  IF (SELECT p.zoning FROM public.parcels p WHERE p.ogc_fid = p_ogc_fid) IN ('SP', 'SP-R', 'SP-C', 'SP-MU') THEN
    RETURN (SELECT jsonb_build_object(
      'status', 'sp_ordinance_not_loaded',
      'district', p.zoning, 'ordinance', p.ordinance, 'case_no', p.case_no,
      'reason', format('Specific Plan: uses and standards are set by %s (%s), not the base code; that ordinance is not loaded, so no as-of-right use can be resolved from the district alone', coalesce(p.ordinance, 'the SP ordinance'), coalesce(p.case_no, 'case number unknown')),
      'as_of_right', jsonb_build_object('single_family', null, 'two_family', null, 'multi_family', null, 'commercial', null, 'industrial', null, 'short_term_rental', null),
      'as_of_right_basis', jsonb_build_object('all', 'sp_ordinance:' || coalesce(p.ordinance, 'unknown')),
      'suggested_primary_use', null, 'suggested_primary_use_basis', 'sp_ordinance_not_loaded', 'feasible_uses_as_of_right', null,
      'regrid_flags', jsonb_build_object('as_of_right', v_aor, 'conditional', v_cond))
      FROM public.parcels p WHERE p.ogc_fid = p_ogc_fid);
  END IF;

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
    WHEN v_aor ILIKE '%multi_family_permitted%' OR v_cond ILIKE '%multi_family_permitted%' THEN 'multi_family'
    WHEN v_commercial THEN 'commercial'
    WHEN v_aor ILIKE '%two_family_permitted%' THEN 'two_family'
    WHEN v_aor ILIKE '%industrial_uses_permitted%' THEN 'industrial'
    WHEN v_aor ILIKE '%single_family_permitted%' THEN 'single_family'
    ELSE NULL END;

  RETURN jsonb_build_object(
    'as_of_right', jsonb_build_object(
      'single_family', v_aor ILIKE '%single_family_permitted%',
      'two_family',    v_aor ILIKE '%two_family_permitted%',
      'multi_family',  (v_aor ILIKE '%multi_family_permitted%' OR v_cond ILIKE '%multi_family_permitted%'),
      'commercial',    v_commercial,
      'industrial',    v_aor ILIKE '%industrial_uses_permitted%',
      'short_term_rental', v_aor ILIKE '%short_term_rentals_permitted%'),
    'as_of_right_basis', jsonb_build_object('commercial', v_commercial_basis, 'multi_family', CASE WHEN v_aor ILIKE '%multi_family_permitted%' THEN 'regrid_as_of_right_flag' WHEN v_cond ILIKE '%multi_family_permitted%' THEN 'permitted_with_conditions_17.16 (PC in table 17.08.030: by right subject to the listed conditions)' ELSE 'not_permitted' END),
    'suggested_primary_use', v_suggested,
    'suggested_primary_use_basis', 'highest_intensity_as_of_right_heuristic',
    'feasible_uses_as_of_right', (
      SELECT jsonb_agg(u) FROM (
        SELECT u FROM (VALUES
          ('single_family', v_aor ILIKE '%single_family_permitted%'),
          ('two_family',    v_aor ILIKE '%two_family_permitted%'),
          ('multi_family',  (v_aor ILIKE '%multi_family_permitted%' OR v_cond ILIKE '%multi_family_permitted%')),
          ('commercial',    v_commercial),
          ('industrial',    v_aor ILIKE '%industrial_uses_permitted%')
        ) AS t(u, ok) WHERE ok) x));
END $function$;

-- get_parcel_by_id  (acl {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.get_parcel_by_id(p_ogc_fid integer)
 RETURNS TABLE(ogc_fid integer, parcelnumb text, parcelnumb_no_formatting text, address text, zoning text, zoning_description text, usedesc text, deeded_acres double precision, sqft double precision, yearbuilt integer, structstyle text, numunits integer, parval double precision, landval double precision, improvval double precision, saleprice double precision, saledate date, taxamt double precision, taxyear text, max_far double precision, max_density_du_per_acre double precision, max_impervious_coverage_pct double precision, min_front_setback_ft double precision, min_side_setback_ft double precision, min_rear_setback_ft double precision, lat double precision, lon double precision, geometry jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.ogc_fid, p.parcelnumb, p.parcelnumb_no_formatting, p.address,
    p.zoning, p.zoning_description, p.usedesc,
    p.deededacreage as deeded_acres, p.sqft, p.yearbuilt, p.structstyle, p.numunits,
    p.parval, p.landval, p.improvval, p.saleprice, p.saledate, p.taxamt, p.taxyear,
    nullif(greatest(z.max_far::double precision, -1), -1) as max_far, nullif(greatest(z.max_density_du_per_acre::double precision, -1), -1) as max_density_du_per_acre,
    nullif(greatest(z.max_impervious_coverage_pct::double precision, -1), -1) as max_impervious_coverage_pct,
    nullif(greatest(z.min_front_setback_ft::double precision, -1), -1) as min_front_setback_ft, nullif(greatest(z.min_side_setback_ft::double precision, -1), -1) as min_side_setback_ft,
    nullif(greatest(z.min_rear_setback_ft::double precision, -1), -1) as min_rear_setback_ft,
    ST_Y(ST_Centroid(p.wkb_geometry_4326))::double precision as lat,
    ST_X(ST_Centroid(p.wkb_geometry_4326))::double precision as lon,
    ST_AsGeoJSON(p.wkb_geometry_4326)::jsonb as geometry
  from public.parcels p
  left join public.zoning z on z.zoning = p.zoning
  where p.ogc_fid = p_ogc_fid
  union all
  select v.ogc_fid, format('combined site of %s parcels', cardinality(a.member_fids)), null::text, v.address,
    v.zoning, null::text, 'COMBINED SITE'::text,
    null::double precision, st_area(v.geom_2274)::double precision, null::integer, null::text, null::integer,
    null::double precision, null::double precision, null::double precision, null::double precision, null::date, null::double precision, null::text,
    nullif(greatest(z.max_far::double precision, -1), -1), nullif(greatest(z.max_density_du_per_acre::double precision, -1), -1),
    nullif(greatest(z.max_impervious_coverage_pct::double precision, -1), -1),
    nullif(greatest(z.min_front_setback_ft::double precision, -1), -1), nullif(greatest(z.min_side_setback_ft::double precision, -1), -1),
    nullif(greatest(z.min_rear_setback_ft::double precision, -1), -1),
    ST_Y(ST_Centroid(ST_Transform(v.geom_2274, 4326)))::double precision, ST_X(ST_Centroid(ST_Transform(v.geom_2274, 4326)))::double precision,
    ST_AsGeoJSON(ST_Transform(v.geom_2274, 4326))::jsonb
  from public.parcel_assemblage a
  join training.virtual_parcel v on v.ogc_fid = a.ogc_fid
  left join lateral (select zz.* from public.zoning zz where zz.zoning = v.zoning limit 1) z on true
  where a.ogc_fid = p_ogc_fid and p_ogc_fid < 0
  limit 1;
$function$;

revoke all on function public.fn_assemble_parcels(integer[]) from public, anon;
grant execute on function public.fn_assemble_parcels(integer[]) to authenticated, service_role;
revoke all on function public.fn_assemblage_members(integer) from public;
revoke all on function public.fn_assemblage_lead(integer) from public;
revoke all on function public.fn_assemblage_outline(integer) from public;
revoke all on function public.fn_compile_assemblage_context(integer, text, jsonb) from public;
grant execute on function public.fn_assemblage_lead(integer) to anon, authenticated, service_role;
grant execute on function public.fn_assemblage_outline(integer) to anon, authenticated, service_role;
grant execute on function public.fn_compile_assemblage_context(integer, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.fn_assemblage_members(integer) to anon, authenticated, service_role;
