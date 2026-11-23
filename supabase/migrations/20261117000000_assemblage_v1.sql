-- Assemblage v1: combined sites (applied to project okxrvetbzpoazrybhcqj on 2026-11-17).
-- This file is the source of record for the live migrations
--   assemblage_v1_combined_site
--   assemblage_v1_permitted_uses_keep_error_shape
--   assemblage_v1_fix_permitted_uses_permission
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

-- fn_assemblage_members  (acl {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres})
CREATE OR REPLACE FUNCTION public.fn_assemblage_members(p_ogc_fid integer)
 RETURNS integer[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.member_fids from public.parcel_assemblage a where a.ogc_fid = p_ogc_fid and p_ogc_fid < 0;
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
    'districts', '^(R|RS)[0-9]'   -- districts the planner can draw a combined site in so far (the subdivision engine)
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
      return jsonb_build_object('error', 'district_not_supported', 'district', z, 'message', format('Combined sites are planned in R and RS districts so far. These parcels are zoned %s.', z));
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
grant execute on function public.fn_assemblage_members(integer) to anon, authenticated, service_role;
