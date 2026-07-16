-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

create or replace function public.fn_regrid_use_class(p_usecode text, p_usedesc text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when upper(btrim(coalesce(p_usedesc,''))) = 'SINGLE FAMILY'
      or coalesce(p_usecode,'') in ('011','081') then 'single_family'
    when upper(btrim(coalesce(p_usedesc,''))) = 'ZERO LOT LINE'
      or upper(coalesce(p_usedesc,'')) ~ '(TOWNHOME|TOWNHOUSE)'
      or coalesce(p_usecode,'') = '016' then 'townhome'
    when upper(btrim(coalesce(p_usedesc,''))) in ('DUPLEX','TRIPLEX','QUADPLEX')
      or coalesce(p_usecode,'') in ('012','082','013','014') then 'small_multifamily'
    when upper(btrim(coalesce(p_usedesc,''))) = 'RESIDENTIAL CONDO'
      or coalesce(p_usecode,'') in ('015','086') then 'residential_condo'
    when upper(coalesce(p_usedesc,'')) like 'APARTMENT:%'
      or coalesce(p_usecode,'') in ('037','038','039') then 'multifamily'
    when upper(coalesce(p_usedesc,'')) like 'OFFICE BLDG%'
      or coalesce(p_usecode,'') in ('032','033') then 'office'
    when upper(coalesce(p_usedesc,'')) like 'MEDICAL OFFICE%'
      or upper(btrim(coalesce(p_usedesc,''))) = 'HOSPITAL OR CLINIC'
      or coalesce(p_usecode,'') in ('034','035','094') then 'healthcare'
    when upper(coalesce(p_usedesc,'')) ~ '(RETAIL|SHOPPING CENTER|SMALL SERVICE SHOP|CONVENIENCE MARKET)'
      or coalesce(p_usecode,'') in ('022','023','024','025','031','036','045') then 'retail'
    when upper(coalesce(p_usedesc,'')) ~ '(RESTURANT|RESTAURANT|CAFETERIA|FAST FOOD)'
      or coalesce(p_usecode,'') in ('051','052') then 'restaurant'
    when upper(btrim(coalesce(p_usedesc,''))) = 'HOTEL/MOTEL'
      or coalesce(p_usecode,'') = '059' then 'hotel'
    when upper(coalesce(p_usedesc,'')) ~ '(WAREHOUSE|WARHOUSE|MANUFACTURING|TERMINAL/DISTRIBUTION)'
      or coalesce(p_usecode,'') in ('063','064','071','072','077') then 'industrial'
    when upper(btrim(coalesce(p_usedesc,''))) = 'SCHOOL OR COLLEGE'
      or coalesce(p_usecode,'') = '093' then 'education'
    when upper(btrim(coalesce(p_usedesc,''))) = 'CHURCH'
      or coalesce(p_usecode,'') = '091' then 'religious'
    when upper(btrim(coalesce(p_usedesc,''))) = 'PARKING LOT'
      or coalesce(p_usecode,'') = '048' then 'parking'
    when upper(coalesce(p_usedesc,'')) like 'VACANT %' then 'vacant'
    else 'other'
  end
$$;

create or replace function public.fn_regrid_typology_match(p_typology text, p_use_class text)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_typology,'')))
    when 'single_family' then case
      when p_use_class='single_family' then 2
      when p_use_class in ('townhome','small_multifamily') then 1
      else 0 end
    when 'multifamily' then case
      when p_use_class='multifamily' then 2
      when p_use_class in ('residential_condo','small_multifamily','townhome') then 1
      else 0 end
    when 'townhome' then case
      when p_use_class='townhome' then 2
      when p_use_class in ('residential_condo','small_multifamily') then 1
      else 0 end
    when 'office' then case
      when p_use_class='office' then 2
      when p_use_class='healthcare' then 1
      else 0 end
    when 'healthcare' then case
      when p_use_class='healthcare' then 2
      when p_use_class='office' then 1
      else 0 end
    when 'retail' then case
      when p_use_class='retail' then 2
      when p_use_class='restaurant' then 1
      else 0 end
    when 'restaurant' then case
      when p_use_class='restaurant' then 2
      when p_use_class='retail' then 1
      else 0 end
    when 'hotel' then case when p_use_class='hotel' then 2 else 0 end
    when 'industrial' then case when p_use_class='industrial' then 2 else 0 end
    when 'education' then case when p_use_class='education' then 2 else 0 end
    else case when p_use_class=lower(btrim(coalesce(p_typology,''))) then 2 else 0 end
  end::smallint
$$;

create or replace function public.fn_local_built_form_v2(
  p_ogc_fid integer,
  p_typology text,
  p_radius_ft numeric default 5280,
  p_min_comps integer default 5
) returns jsonb
language plpgsql
security invoker
set search_path = 'pg_catalog','public','pg_temp'
as $$
declare
  v_subtype text;
  v_centroid geometry;
  v_lot numeric;
  v_mode text;
  v_match_mode text;
  v_require_same_zoning boolean;
  v_band numeric;
  v_n integer := 0;
  v_selected boolean := false;
  v_confidence text;
  v_flags jsonb := '[]'::jsonb;
  v_type_mix jsonb := '{}'::jsonb;
  v_usedesc_mix jsonb := '[]'::jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_ogc_fid is null or p_ogc_fid <= 0 then
    return jsonb_build_object('error','valid p_ogc_fid is required');
  end if;
  if p_typology is null or btrim(p_typology)='' then
    return jsonb_build_object('error','valid p_typology is required');
  end if;
  if p_radius_ft is null or p_radius_ft < 500 or p_radius_ft > 26400 then
    return jsonb_build_object('error','p_radius_ft must be between 500 and 26400');
  end if;
  if p_min_comps is null or p_min_comps < 3 or p_min_comps > 100 then
    return jsonb_build_object('error','p_min_comps must be between 3 and 100');
  end if;

  select z.zoning_subtype,p.centroid_2274,p.lot_sqft_2274
    into v_subtype,v_centroid,v_lot
  from public.parcels p
  left join public.planner_zoning z on z.zoning_id=p.zoning_id
  where p.ogc_fid=p_ogc_fid;

  if v_centroid is null or v_lot is null or v_lot <= 0 then
    return jsonb_build_object('error','no parcel centroid/lot area for Regrid context');
  end if;

  create temp table if not exists _regrid_built_form_candidates_v2 (
    ogc_fid integer,
    lot_sqft numeric,
    zoning_subtype text,
    usecode text,
    usedesc text,
    use_class text,
    match_level smallint,
    building_count numeric,
    largest_footprint_sqft numeric,
    total_footprint_sqft numeric,
    coverage_pct numeric,
    stories numeric,
    gross_area_sqft numeric,
    length_ft numeric,
    depth_ft numeric,
    aspect_ratio numeric,
    compactness numeric,
    orientation_deg numeric
  ) on commit drop;
  truncate pg_temp._regrid_built_form_candidates_v2;

  with candidate_parcels as (
    select c.ogc_fid,c.ll_uuid,c.lot_sqft_2274,c.usecode,c.usedesc,z2.zoning_subtype
    from public.parcels c
    left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id
    where c.ogc_fid<>p_ogc_fid
      and c.centroid_2274 is not null
      and c.lot_sqft_2274>0
      and public.st_dwithin(c.centroid_2274,v_centroid,p_radius_ft)
  ), building_rows as materialized (
    select c.*,
           b.ed_bld_uuid,b.ed_bldg_footprint_sqft,b.ed_gross_area,b.ed_stories,b.ed_largest,b.geom,
           row_number() over (
             partition by c.ogc_fid
             order by case when b.ed_largest in ('1','1.0') then 1 else 0 end desc,
                      b.ed_bldg_footprint_sqft desc,
                      b.ed_bld_uuid
           ) as rn,
           count(*) over (partition by c.ogc_fid) as building_count,
           sum(b.ed_bldg_footprint_sqft) over (partition by c.ogc_fid) as total_footprint_sqft,
           sum(b.ed_gross_area) over (partition by c.ogc_fid) as gross_area_sqft
    from candidate_parcels c
    join public.building_parcel_join j on j.ll_uuid=c.ll_uuid::text
    join public.buildings b on b.ed_bld_uuid=j.ed_bld_uuid
    where b.geom is not null and b.ed_bldg_footprint_sqft>0
  ), largest as (
    select * from building_rows where rn=1
  ), geometry_metrics as (
    select l.*,public.st_transform(public.st_makevalid(l.geom),2274) as g2274
    from largest l
  ), oriented as (
    select g.*,public.st_orientedenvelope(g.g2274) as obb
    from geometry_metrics g
    where g.g2274 is not null and not public.st_isempty(g.g2274)
  ), measured as (
    select o.*,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as d1,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as d2,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as a1,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as a2
    from oriented o
    where o.obb is not null and not public.st_isempty(o.obb)
  )
  insert into pg_temp._regrid_built_form_candidates_v2
  select m.ogc_fid,m.lot_sqft_2274,m.zoning_subtype,m.usecode,m.usedesc,
         uc.use_class,public.fn_regrid_typology_match(p_typology,uc.use_class),
         m.building_count,m.ed_bldg_footprint_sqft,m.total_footprint_sqft,
         100*m.total_footprint_sqft/nullif(m.lot_sqft_2274,0),
         case when m.ed_stories ~ '^[0-9]+([.][0-9]+)?$' then m.ed_stories::numeric else null end,
         m.gross_area_sqft,greatest(m.d1,m.d2),least(m.d1,m.d2),
         greatest(m.d1,m.d2)/nullif(least(m.d1,m.d2),0),
         4*pi()*public.st_area(m.g2274)/nullif(power(public.st_perimeter(m.g2274),2),0),
         mod((public.degrees(case when m.d1>=m.d2 then m.a1 else m.a2 end)+180)::numeric,180)
  from measured m
  cross join lateral (select public.fn_regrid_use_class(m.usecode,m.usedesc) as use_class) uc
  where m.d1>0 and m.d2>0;

  if not exists (select 1 from pg_temp._regrid_built_form_candidates_v2) then
    return jsonb_build_object('error','no nearby Regrid buildings with usable geometry');
  end if;

  <<mode_loop>>
  for v_mode,v_match_mode,v_require_same_zoning in
    select * from (values
      ('exact_same_zoning','exact',true),('exact_any_zoning','exact',false),
      ('compatible_same_zoning','compatible',true),('compatible_any_zoning','compatible',false),
      ('zoning_only','any',true)
    ) as modes(mode_name,match_mode,same_zoning)
  loop
    foreach v_band in array array[0.5,1.0,2.0,999]::numeric[] loop
      select count(*) into v_n
      from pg_temp._regrid_built_form_candidates_v2 c
      where case v_match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end
        and (not v_require_same_zoning or c.zoning_subtype is not distinct from v_subtype)
        and (v_band>=999 or c.lot_sqft between v_lot*(1-least(v_band,0.99)) and v_lot*(1+v_band));
      if v_n>=p_min_comps then v_selected:=true; exit mode_loop; end if;
    end loop;
  end loop;

  if not v_selected then
    <<fallback_loop>>
    for v_mode,v_match_mode,v_require_same_zoning in
      select * from (values
        ('exact_any_zoning','exact',false),('compatible_any_zoning','compatible',false),
        ('zoning_only','any',true),('all_nearby','any',false)
      ) as modes(mode_name,match_mode,same_zoning)
    loop
      v_band:=999;
      select count(*) into v_n
      from pg_temp._regrid_built_form_candidates_v2 c
      where case v_match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end
        and (not v_require_same_zoning or c.zoning_subtype is not distinct from v_subtype);
      if v_n>=3 then v_selected:=true; exit fallback_loop; end if;
    end loop;
  end if;

  if not v_selected then return jsonb_build_object('error','insufficient nearby Regrid buildings'); end if;

  create temp table if not exists _regrid_built_form_selected_v2
    (like pg_temp._regrid_built_form_candidates_v2 including defaults) on commit drop;
  truncate pg_temp._regrid_built_form_selected_v2;
  insert into pg_temp._regrid_built_form_selected_v2
  select * from pg_temp._regrid_built_form_candidates_v2 c
  where case v_match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end
    and (not v_require_same_zoning or c.zoning_subtype is not distinct from v_subtype)
    and (v_band>=999 or c.lot_sqft between v_lot*(1-least(v_band,0.99)) and v_lot*(1+v_band));

  select count(*) into v_n from pg_temp._regrid_built_form_selected_v2;
  v_confidence:=case
    when v_mode='exact_same_zoning' and v_band<=1 and v_n>=p_min_comps then 'high'
    when v_mode in ('exact_same_zoning','exact_any_zoning','compatible_same_zoning') and v_n>=p_min_comps then 'medium'
    when v_mode in ('exact_any_zoning','compatible_any_zoning','zoning_only') then 'low'
    else 'insufficient' end;

  v_flags:=jsonb_build_array('regrid_typology_selection_'||v_mode)
    || case when v_band>=999 then jsonb_build_array('regrid_lot_band_relaxed_any') else '[]'::jsonb end
    || case when v_mode like '%any_zoning' then jsonb_build_array('regrid_zoning_filter_relaxed') else '[]'::jsonb end
    || case when v_mode like 'compatible%' then jsonb_build_array('regrid_compatible_use_classes_used') else '[]'::jsonb end
    || case when v_mode in ('zoning_only','all_nearby') then jsonb_build_array('regrid_typology_filter_insufficient') else '[]'::jsonb end;

  select coalesce(jsonb_object_agg(use_class,n order by use_class),'{}'::jsonb) into v_type_mix
  from (select use_class,count(*) n from pg_temp._regrid_built_form_selected_v2 group by use_class) q;

  select coalesce(jsonb_agg(jsonb_build_object('usedesc',usedesc,'usecode',usecode,'count',n) order by n desc,usedesc),'[]'::jsonb) into v_usedesc_mix
  from (select usedesc,usecode,count(*) n from pg_temp._regrid_built_form_selected_v2 group by usedesc,usecode order by count(*) desc,usedesc limit 12) q;

  select coalesce(jsonb_agg(ogc_fid order by proximity),'[]'::jsonb) into v_ids
  from (select ogc_fid,abs(ln(greatest(lot_sqft,1)/greatest(v_lot,1))) proximity from pg_temp._regrid_built_form_selected_v2 order by proximity,ogc_fid limit 50) q;

  select jsonb_build_object(
    'parcel_ogc_fid',p_ogc_fid,'typology',lower(btrim(p_typology)),'zoning_subtype',v_subtype,
    'subject_lot_sqft',round(v_lot,0),'n_comps',v_n,'radius_ft',p_radius_ft,
    'sample_basis','current_regrid_building_stock',
    'lot_band_used',case when v_band>=999 then 'any' else '+/-'||round(v_band*100)||'%' end,
    'selection',jsonb_build_object('mode',v_mode,'requested_typology',lower(btrim(p_typology)),'match_mode',v_match_mode,'same_zoning_required',v_require_same_zoning,'lot_band',case when v_band>=999 then 'any' else '+/-'||round(v_band*100)||'%' end,'sample_size',v_n,'confidence',v_confidence),
    'type_mix',v_type_mix,'source_use_descriptions',v_usedesc_mix,'precedent_parcel_ids',v_ids,
    'distribution',jsonb_build_object(
      'footprint_sqft',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by largest_footprint_sqft)::numeric,0),'p50',round(percentile_cont(.50) within group(order by largest_footprint_sqft)::numeric,0),'p75',round(percentile_cont(.75) within group(order by largest_footprint_sqft)::numeric,0),'p90',round(percentile_cont(.90) within group(order by largest_footprint_sqft)::numeric,0)),
      'total_footprint_sqft',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by total_footprint_sqft)::numeric,0),'p50',round(percentile_cont(.50) within group(order by total_footprint_sqft)::numeric,0),'p75',round(percentile_cont(.75) within group(order by total_footprint_sqft)::numeric,0),'p90',round(percentile_cont(.90) within group(order by total_footprint_sqft)::numeric,0)),
      'building_count',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by building_count)::numeric,1),'p50',round(percentile_cont(.50) within group(order by building_count)::numeric,1),'p75',round(percentile_cont(.75) within group(order by building_count)::numeric,1),'p90',round(percentile_cont(.90) within group(order by building_count)::numeric,1)),
      'coverage_pct',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by coverage_pct)::numeric,1),'p50',round(percentile_cont(.50) within group(order by coverage_pct)::numeric,1),'p75',round(percentile_cont(.75) within group(order by coverage_pct)::numeric,1),'p90',round(percentile_cont(.90) within group(order by coverage_pct)::numeric,1)),
      'stories',jsonb_build_object('p50',round(percentile_cont(.50) within group(order by stories)::numeric,1),'p75',round(percentile_cont(.75) within group(order by stories)::numeric,1),'p90',round(percentile_cont(.90) within group(order by stories)::numeric,1)),
      'length_ft',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by length_ft)::numeric,1),'p50',round(percentile_cont(.50) within group(order by length_ft)::numeric,1),'p75',round(percentile_cont(.75) within group(order by length_ft)::numeric,1),'p90',round(percentile_cont(.90) within group(order by length_ft)::numeric,1)),
      'depth_ft',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by depth_ft)::numeric,1),'p50',round(percentile_cont(.50) within group(order by depth_ft)::numeric,1),'p75',round(percentile_cont(.75) within group(order by depth_ft)::numeric,1),'p90',round(percentile_cont(.90) within group(order by depth_ft)::numeric,1)),
      'aspect_ratio',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by aspect_ratio)::numeric,2),'p50',round(percentile_cont(.50) within group(order by aspect_ratio)::numeric,2),'p75',round(percentile_cont(.75) within group(order by aspect_ratio)::numeric,2),'p90',round(percentile_cont(.90) within group(order by aspect_ratio)::numeric,2)),
      'compactness',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by compactness)::numeric,3),'p50',round(percentile_cont(.50) within group(order by compactness)::numeric,3),'p75',round(percentile_cont(.75) within group(order by compactness)::numeric,3)),
      'gross_area_sqft',jsonb_build_object('p25',round(percentile_cont(.25) within group(order by gross_area_sqft)::numeric,0),'p50',round(percentile_cont(.50) within group(order by gross_area_sqft)::numeric,0),'p75',round(percentile_cont(.75) within group(order by gross_area_sqft)::numeric,0),'p90',round(percentile_cont(.90) within group(order by gross_area_sqft)::numeric,0))
    ),
    'underwrite_target',jsonb_build_object(
      'footprint_sqft_p75',round(percentile_cont(.75) within group(order by largest_footprint_sqft)::numeric,0),
      'footprint_sqft_p90',round(percentile_cont(.90) within group(order by largest_footprint_sqft)::numeric,0),
      'stories_p75',round(percentile_cont(.75) within group(order by stories)::numeric,1),
      'length_ft_p75',round(percentile_cont(.75) within group(order by length_ft)::numeric,1),
      'depth_ft_p50',round(percentile_cont(.50) within group(order by depth_ft)::numeric,1),
      'coverage_pct_p75',round(percentile_cont(.75) within group(order by coverage_pct)::numeric,1),
      'building_count_p50',round(percentile_cont(.50) within group(order by building_count)::numeric,1)
    ),
    'confidence',v_confidence,'flags',v_flags,
    'provenance',jsonb_build_object('parcel_source','public.parcels usecode/usedesc','building_source','public.buildings Regrid footprint geometry and attributes','join','public.building_parcel_join','classifier','public.fn_regrid_use_class','matcher','public.fn_regrid_typology_match')
  ) into v_result
  from pg_temp._regrid_built_form_selected_v2;

  return v_result;
end
$$;

revoke all on function public.fn_regrid_use_class(text,text) from public;
revoke all on function public.fn_regrid_typology_match(text,text) from public;
revoke all on function public.fn_local_built_form_v2(integer,text,numeric,integer) from public;
grant execute on function public.fn_regrid_use_class(text,text) to anon,authenticated,service_role;
grant execute on function public.fn_regrid_typology_match(text,text) to anon,authenticated,service_role;
grant execute on function public.fn_local_built_form_v2(integer,text,numeric,integer) to anon,authenticated,service_role;

comment on function public.fn_local_built_form_v2(integer,text,numeric,integer) is
  'Typology-aware Regrid built-form context. Filters nearby parcel/building precedents by parcel use class, adaptively relaxes zoning/lot bands, and returns footprint geometry, stories, coverage, dimensions, and provenance.';
