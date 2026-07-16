-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

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
  v_available_n integer := 0;
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

  create temp table if not exists _regrid_parcel_candidates_v2 (
    ogc_fid integer,
    ll_uuid text,
    lot_sqft numeric,
    distance_ft numeric,
    zoning_subtype text,
    usecode text,
    usedesc text,
    use_class text,
    match_level smallint
  ) on commit drop;
  truncate pg_temp._regrid_parcel_candidates_v2;

  insert into pg_temp._regrid_parcel_candidates_v2
  select c.ogc_fid,c.ll_uuid::text,c.lot_sqft_2274,
         public.st_distance(c.centroid_2274,v_centroid),z2.zoning_subtype,
         c.usecode,c.usedesc,uc.use_class,
         public.fn_regrid_typology_match(p_typology,uc.use_class)
  from public.parcels c
  left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id
  cross join lateral (select public.fn_regrid_use_class(c.usecode,c.usedesc) as use_class) uc
  where c.ogc_fid<>p_ogc_fid
    and c.centroid_2274 is not null
    and c.lot_sqft_2274>0
    and public.st_dwithin(c.centroid_2274,v_centroid,p_radius_ft);

  if not exists (select 1 from pg_temp._regrid_parcel_candidates_v2) then
    return jsonb_build_object('error','no nearby Regrid parcels');
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
      select count(*) into v_available_n
      from pg_temp._regrid_parcel_candidates_v2 c
      where case v_match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end
        and (not v_require_same_zoning or c.zoning_subtype is not distinct from v_subtype)
        and (v_band>=999 or c.lot_sqft between v_lot*(1-least(v_band,0.99)) and v_lot*(1+v_band));
      if v_available_n>=p_min_comps then v_selected:=true; exit mode_loop; end if;
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
      select count(*) into v_available_n
      from pg_temp._regrid_parcel_candidates_v2 c
      where case v_match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end
        and (not v_require_same_zoning or c.zoning_subtype is not distinct from v_subtype);
      if v_available_n>=3 then v_selected:=true; exit fallback_loop; end if;
    end loop;
  end if;

  if not v_selected then return jsonb_build_object('error','insufficient nearby Regrid parcels'); end if;

  create temp table if not exists _regrid_selected_parcels_v2
    (like pg_temp._regrid_parcel_candidates_v2 including defaults) on commit drop;
  truncate pg_temp._regrid_selected_parcels_v2;
  insert into pg_temp._regrid_selected_parcels_v2
  select *
  from pg_temp._regrid_parcel_candidates_v2 c
  where case v_match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end
    and (not v_require_same_zoning or c.zoning_subtype is not distinct from v_subtype)
    and (v_band>=999 or c.lot_sqft between v_lot*(1-least(v_band,0.99)) and v_lot*(1+v_band))
  order by abs(ln(greatest(c.lot_sqft,1)/greatest(v_lot,1))),c.distance_ft,c.ogc_fid
  limit 1000;

  create temp table if not exists _regrid_selected_base_v2 (
    ogc_fid integer,
    largest_bld_uuid text,
    lot_sqft numeric,
    distance_ft numeric,
    zoning_subtype text,
    usecode text,
    usedesc text,
    use_class text,
    match_level smallint,
    building_count integer,
    largest_footprint_sqft numeric,
    total_footprint_sqft numeric,
    coverage_pct numeric,
    stories numeric,
    gross_area_sqft numeric
  ) on commit drop;
  truncate pg_temp._regrid_selected_base_v2;

  with building_rows as materialized (
    select s.*,
           b.ed_bld_uuid,b.ed_bldg_footprint_sqft,b.ed_gross_area,b.ed_stories,b.ed_largest,
           row_number() over (
             partition by s.ogc_fid
             order by case when b.ed_largest in ('1','1.0') then 1 else 0 end desc,
                      b.ed_bldg_footprint_sqft desc,b.ed_bld_uuid
           ) as rn,
           count(*) over (partition by s.ogc_fid)::integer as building_count,
           sum(b.ed_bldg_footprint_sqft) over (partition by s.ogc_fid) as total_footprint_sqft,
           sum(b.ed_gross_area) over (partition by s.ogc_fid) as gross_area_sqft
    from pg_temp._regrid_selected_parcels_v2 s
    join public.building_parcel_join j on j.ll_uuid=s.ll_uuid
    join public.buildings b on b.ed_bld_uuid=j.ed_bld_uuid
    where b.ed_bldg_footprint_sqft>0
  )
  insert into pg_temp._regrid_selected_base_v2
  select ogc_fid,ed_bld_uuid,lot_sqft,distance_ft,zoning_subtype,usecode,usedesc,use_class,match_level,
         building_count,ed_bldg_footprint_sqft,total_footprint_sqft,
         100*total_footprint_sqft/nullif(lot_sqft,0),
         case when ed_stories ~ '^[0-9]+([.][0-9]+)?$' then ed_stories::numeric else null end,
         gross_area_sqft
  from building_rows
  where rn=1
  order by abs(ln(greatest(lot_sqft,1)/greatest(v_lot,1))),distance_ft,ogc_fid
  limit 500;

  create temp table if not exists _regrid_selected_metrics_v2 (
    ogc_fid integer,lot_sqft numeric,distance_ft numeric,zoning_subtype text,
    usecode text,usedesc text,use_class text,match_level smallint,
    building_count integer,largest_footprint_sqft numeric,total_footprint_sqft numeric,
    coverage_pct numeric,stories numeric,gross_area_sqft numeric,
    length_ft numeric,depth_ft numeric,aspect_ratio numeric,compactness numeric,orientation_deg numeric
  ) on commit drop;
  truncate pg_temp._regrid_selected_metrics_v2;

  with transformed as (
    select s.*,public.st_transform(public.st_collectionextract(public.st_makevalid(b.geom),3),2274) as g2274
    from pg_temp._regrid_selected_base_v2 s
    join public.buildings b on b.ed_bld_uuid=s.largest_bld_uuid
    where b.geom is not null
  ), oriented as (
    select t.*,public.st_orientedenvelope(t.g2274) as obb
    from transformed t
    where t.g2274 is not null and not public.st_isempty(t.g2274)
  ), measured as (
    select o.*,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as d1,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as d2,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as a1,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as a2
    from oriented o
    where o.obb is not null and not public.st_isempty(o.obb)
  )
  insert into pg_temp._regrid_selected_metrics_v2
  select ogc_fid,lot_sqft,distance_ft,zoning_subtype,usecode,usedesc,use_class,match_level,
         building_count,largest_footprint_sqft,total_footprint_sqft,coverage_pct,stories,gross_area_sqft,
         greatest(d1,d2),least(d1,d2),greatest(d1,d2)/nullif(least(d1,d2),0),
         4*pi()*public.st_area(g2274)/nullif(power(public.st_perimeter(g2274),2),0),
         mod((degrees(case when d1>=d2 then a1 else a2 end)+180)::numeric,180)
  from measured
  where d1>0 and d2>0;

  select count(*) into v_n from pg_temp._regrid_selected_metrics_v2;
  if v_n<3 then return jsonb_build_object('error','insufficient Regrid footprint geometries after normalization'); end if;

  v_confidence:=case
    when v_mode='exact_same_zoning' and v_band<=1 and v_n>=p_min_comps then 'high'
    when v_mode in ('exact_same_zoning','exact_any_zoning','compatible_same_zoning') and v_n>=p_min_comps then 'medium'
    when v_mode in ('exact_any_zoning','compatible_any_zoning','zoning_only') then 'low'
    else 'insufficient' end;

  v_flags:=jsonb_build_array('regrid_typology_selection_'||v_mode)
    || case when v_band>=999 then jsonb_build_array('regrid_lot_band_relaxed_any') else '[]'::jsonb end
    || case when v_mode like '%any_zoning' then jsonb_build_array('regrid_zoning_filter_relaxed') else '[]'::jsonb end
    || case when v_mode like 'compatible%' then jsonb_build_array('regrid_compatible_use_classes_used') else '[]'::jsonb end
    || case when v_mode in ('zoning_only','all_nearby') then jsonb_build_array('regrid_typology_filter_insufficient') else '[]'::jsonb end
    || case when v_available_n>500 then jsonb_build_array('regrid_sample_capped_500') else '[]'::jsonb end;

  select coalesce(jsonb_object_agg(use_class,n order by use_class),'{}'::jsonb) into v_type_mix
  from (select use_class,count(*) n from pg_temp._regrid_selected_metrics_v2 group by use_class) q;

  select coalesce(jsonb_agg(jsonb_build_object('usedesc',usedesc,'usecode',usecode,'count',n) order by n desc,usedesc),'[]'::jsonb) into v_usedesc_mix
  from (select usedesc,usecode,count(*) n from pg_temp._regrid_selected_metrics_v2 group by usedesc,usecode order by count(*) desc,usedesc limit 12) q;

  select coalesce(jsonb_agg(ogc_fid order by distance_ft,ogc_fid),'[]'::jsonb) into v_ids
  from (select ogc_fid,distance_ft from pg_temp._regrid_selected_metrics_v2 order by distance_ft,ogc_fid limit 50) q;

  select jsonb_build_object(
    'parcel_ogc_fid',p_ogc_fid,'typology',lower(btrim(p_typology)),'zoning_subtype',v_subtype,
    'subject_lot_sqft',round(v_lot,0),'n_comps',v_n,'available_comps',v_available_n,'radius_ft',p_radius_ft,
    'sample_basis','current_regrid_building_stock','sample_cap',500,
    'lot_band_used',case when v_band>=999 then 'any' else '+/-'||round(v_band*100)||'%' end,
    'selection',jsonb_build_object('mode',v_mode,'requested_typology',lower(btrim(p_typology)),'match_mode',v_match_mode,'same_zoning_required',v_require_same_zoning,'lot_band',case when v_band>=999 then 'any' else '+/-'||round(v_band*100)||'%' end,'available_count',v_available_n,'sample_size',v_n,'sample_cap',500,'confidence',v_confidence),
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
    'underwrite_target',jsonb_build_object('footprint_sqft_p75',round(percentile_cont(.75) within group(order by largest_footprint_sqft)::numeric,0),'footprint_sqft_p90',round(percentile_cont(.90) within group(order by largest_footprint_sqft)::numeric,0),'stories_p75',round(percentile_cont(.75) within group(order by stories)::numeric,1),'length_ft_p75',round(percentile_cont(.75) within group(order by length_ft)::numeric,1),'depth_ft_p50',round(percentile_cont(.50) within group(order by depth_ft)::numeric,1),'coverage_pct_p75',round(percentile_cont(.75) within group(order by coverage_pct)::numeric,1),'building_count_p50',round(percentile_cont(.50) within group(order by building_count)::numeric,1)),
    'confidence',v_confidence,'flags',v_flags,
    'provenance',jsonb_build_object('parcel_source','public.parcels usecode/usedesc','building_source','public.buildings Regrid footprint geometry and attributes','join','public.building_parcel_join','classifier','public.fn_regrid_use_class','matcher','public.fn_regrid_typology_match','sampling','select parcel type before building join; up to 500 closest/lot-similar building geometries')
  ) into v_result
  from pg_temp._regrid_selected_metrics_v2;

  return v_result;
end
$$;

comment on function public.fn_local_built_form_v2(integer,text,numeric,integer) is
  'Performance-optimized typology-aware Regrid context. Selects matching parcel uses before joining and normalizing building footprints.';
