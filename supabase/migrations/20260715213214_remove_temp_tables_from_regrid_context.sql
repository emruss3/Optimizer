-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

create or replace function public.fn_local_built_form_v2(
  p_ogc_fid integer,
  p_typology text,
  p_radius_ft numeric default 5280,
  p_min_comps integer default 5
) returns jsonb
language plpgsql
stable
security invoker
set search_path = 'pg_catalog','public'
as $$
declare
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

  with subject as materialized (
    select p.ogc_fid,z.zoning_subtype,p.centroid_2274,p.lot_sqft_2274
    from public.parcels p
    left join public.planner_zoning z on z.zoning_id=p.zoning_id
    where p.ogc_fid=p_ogc_fid and p.centroid_2274 is not null and p.lot_sqft_2274>0
  ), candidate_parcels as materialized (
    select c.ogc_fid,c.ll_uuid::text as ll_uuid,c.lot_sqft_2274 as lot_sqft,
           public.st_distance(c.centroid_2274,s.centroid_2274) as distance_ft,
           z2.zoning_subtype,c.usecode,c.usedesc,uc.use_class,
           public.fn_regrid_typology_match(p_typology,uc.use_class) as match_level
    from subject s
    join public.parcels c on c.ogc_fid<>s.ogc_fid
      and c.centroid_2274 is not null
      and c.lot_sqft_2274>0
      and public.st_dwithin(c.centroid_2274,s.centroid_2274,p_radius_ft)
    left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id
    cross join lateral (select public.fn_regrid_use_class(c.usecode,c.usedesc) as use_class) uc
  ), modes(mode_priority,mode_name,match_mode,same_zoning) as (
    values
      (1,'exact_same_zoning','exact',true),
      (2,'exact_any_zoning','exact',false),
      (3,'compatible_same_zoning','compatible',true),
      (4,'compatible_any_zoning','compatible',false),
      (5,'zoning_only','any',true),
      (6,'all_nearby','any',false)
  ), bands(band_priority,band) as (
    values (1,0.5::numeric),(2,1.0::numeric),(3,2.0::numeric),(4,999::numeric)
  ), mode_counts as materialized (
    select m.mode_priority,m.mode_name,m.match_mode,m.same_zoning,
           b.band_priority,b.band,count(*)::integer as available_count
    from modes m
    cross join bands b
    cross join subject s
    join candidate_parcels c on
      (case m.match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end)
      and (not m.same_zoning or c.zoning_subtype is not distinct from s.zoning_subtype)
      and (b.band>=999 or c.lot_sqft between s.lot_sqft_2274*(1-least(b.band,0.99)) and s.lot_sqft_2274*(1+b.band))
    group by m.mode_priority,m.mode_name,m.match_mode,m.same_zoning,b.band_priority,b.band
  ), preferred as (
    select * from mode_counts where available_count>=p_min_comps
    order by mode_priority,band_priority limit 1
  ), fallback as (
    select * from mode_counts where available_count>=3
    order by mode_priority,band_priority limit 1
  ), choice as materialized (
    select * from preferred
    union all
    select * from fallback where not exists(select 1 from preferred)
  ), selected_parcels as materialized (
    select c.*
    from candidate_parcels c
    cross join subject s
    cross join choice ch
    where (case ch.match_mode when 'exact' then c.match_level=2 when 'compatible' then c.match_level>=1 else true end)
      and (not ch.same_zoning or c.zoning_subtype is not distinct from s.zoning_subtype)
      and (ch.band>=999 or c.lot_sqft between s.lot_sqft_2274*(1-least(ch.band,0.99)) and s.lot_sqft_2274*(1+ch.band))
    order by abs(ln(greatest(c.lot_sqft,1)/greatest(s.lot_sqft_2274,1))),c.distance_ft,c.ogc_fid
    limit 1000
  ), building_rows as materialized (
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
    from selected_parcels s
    join public.building_parcel_join j on j.ll_uuid=s.ll_uuid
    join public.buildings b on b.ed_bld_uuid=j.ed_bld_uuid
    where b.ed_bldg_footprint_sqft>0
  ), selected_buildings as materialized (
    select ogc_fid,ed_bld_uuid,lot_sqft,distance_ft,zoning_subtype,usecode,usedesc,use_class,match_level,
           building_count,ed_bldg_footprint_sqft as largest_footprint_sqft,total_footprint_sqft,
           100*total_footprint_sqft/nullif(lot_sqft,0) as coverage_pct,
           case when ed_stories ~ '^[0-9]+([.][0-9]+)?$' then ed_stories::numeric else null end as stories,
           gross_area_sqft
    from building_rows
    cross join subject s
    where rn=1
    order by abs(ln(greatest(lot_sqft,1)/greatest(s.lot_sqft_2274,1))),distance_ft,ogc_fid
    limit 500
  ), transformed as materialized (
    select s.*,public.st_transform(public.st_collectionextract(public.st_makevalid(b.geom),3),2274) as g2274
    from selected_buildings s
    join public.buildings b on b.ed_bld_uuid=s.ed_bld_uuid
    where b.geom is not null
  ), oriented as materialized (
    select t.*,public.st_orientedenvelope(t.g2274) as obb
    from transformed t
    where t.g2274 is not null and not public.st_isempty(t.g2274)
  ), measured as materialized (
    select o.*,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as d1,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as d2,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as a1,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as a2
    from oriented o
    where o.obb is not null and not public.st_isempty(o.obb)
  ), metrics as materialized (
    select ogc_fid,lot_sqft,distance_ft,zoning_subtype,usecode,usedesc,use_class,match_level,
           building_count,largest_footprint_sqft,total_footprint_sqft,coverage_pct,stories,gross_area_sqft,
           greatest(d1,d2) as length_ft,least(d1,d2) as depth_ft,
           greatest(d1,d2)/nullif(least(d1,d2),0) as aspect_ratio,
           4*pi()*public.st_area(g2274)/nullif(power(public.st_perimeter(g2274),2),0) as compactness,
           mod((degrees(case when d1>=d2 then a1 else a2 end)+180)::numeric,180) as orientation_deg
    from measured
    where d1>0 and d2>0
  ), stats as materialized (
    select count(*)::integer as n_comps,
      round(percentile_cont(.25) within group(order by largest_footprint_sqft)::numeric,0) as fp25,
      round(percentile_cont(.50) within group(order by largest_footprint_sqft)::numeric,0) as fp50,
      round(percentile_cont(.75) within group(order by largest_footprint_sqft)::numeric,0) as fp75,
      round(percentile_cont(.90) within group(order by largest_footprint_sqft)::numeric,0) as fp90,
      round(percentile_cont(.25) within group(order by total_footprint_sqft)::numeric,0) as tfp25,
      round(percentile_cont(.50) within group(order by total_footprint_sqft)::numeric,0) as tfp50,
      round(percentile_cont(.75) within group(order by total_footprint_sqft)::numeric,0) as tfp75,
      round(percentile_cont(.90) within group(order by total_footprint_sqft)::numeric,0) as tfp90,
      round(percentile_cont(.25) within group(order by building_count)::numeric,1) as bc25,
      round(percentile_cont(.50) within group(order by building_count)::numeric,1) as bc50,
      round(percentile_cont(.75) within group(order by building_count)::numeric,1) as bc75,
      round(percentile_cont(.90) within group(order by building_count)::numeric,1) as bc90,
      round(percentile_cont(.25) within group(order by coverage_pct)::numeric,1) as cov25,
      round(percentile_cont(.50) within group(order by coverage_pct)::numeric,1) as cov50,
      round(percentile_cont(.75) within group(order by coverage_pct)::numeric,1) as cov75,
      round(percentile_cont(.90) within group(order by coverage_pct)::numeric,1) as cov90,
      round(percentile_cont(.50) within group(order by stories)::numeric,1) as st50,
      round(percentile_cont(.75) within group(order by stories)::numeric,1) as st75,
      round(percentile_cont(.90) within group(order by stories)::numeric,1) as st90,
      round(percentile_cont(.25) within group(order by length_ft)::numeric,1) as len25,
      round(percentile_cont(.50) within group(order by length_ft)::numeric,1) as len50,
      round(percentile_cont(.75) within group(order by length_ft)::numeric,1) as len75,
      round(percentile_cont(.90) within group(order by length_ft)::numeric,1) as len90,
      round(percentile_cont(.25) within group(order by depth_ft)::numeric,1) as dep25,
      round(percentile_cont(.50) within group(order by depth_ft)::numeric,1) as dep50,
      round(percentile_cont(.75) within group(order by depth_ft)::numeric,1) as dep75,
      round(percentile_cont(.90) within group(order by depth_ft)::numeric,1) as dep90,
      round(percentile_cont(.25) within group(order by aspect_ratio)::numeric,2) as ar25,
      round(percentile_cont(.50) within group(order by aspect_ratio)::numeric,2) as ar50,
      round(percentile_cont(.75) within group(order by aspect_ratio)::numeric,2) as ar75,
      round(percentile_cont(.90) within group(order by aspect_ratio)::numeric,2) as ar90,
      round(percentile_cont(.25) within group(order by compactness)::numeric,3) as co25,
      round(percentile_cont(.50) within group(order by compactness)::numeric,3) as co50,
      round(percentile_cont(.75) within group(order by compactness)::numeric,3) as co75,
      round(percentile_cont(.25) within group(order by gross_area_sqft)::numeric,0) as ga25,
      round(percentile_cont(.50) within group(order by gross_area_sqft)::numeric,0) as ga50,
      round(percentile_cont(.75) within group(order by gross_area_sqft)::numeric,0) as ga75,
      round(percentile_cont(.90) within group(order by gross_area_sqft)::numeric,0) as ga90
    from metrics
  ), type_mix as (
    select coalesce(jsonb_object_agg(use_class,n order by use_class),'{}'::jsonb) as value
    from (select use_class,count(*) n from metrics group by use_class) q
  ), descriptions as (
    select coalesce(jsonb_agg(jsonb_build_object('usedesc',usedesc,'usecode',usecode,'count',n) order by n desc,usedesc),'[]'::jsonb) as value
    from (select usedesc,usecode,count(*) n from metrics group by usedesc,usecode order by count(*) desc,usedesc limit 12) q
  ), ids as (
    select coalesce(jsonb_agg(ogc_fid order by distance_ft,ogc_fid),'[]'::jsonb) as value
    from (select ogc_fid,distance_ft from metrics order by distance_ft,ogc_fid limit 50) q
  )
  select case when st.n_comps<3 then jsonb_build_object('error','insufficient Regrid footprint geometries after normalization') else
    jsonb_build_object(
      'parcel_ogc_fid',p_ogc_fid,'typology',lower(btrim(p_typology)),'zoning_subtype',s.zoning_subtype,
      'subject_lot_sqft',round(s.lot_sqft_2274,0),'n_comps',st.n_comps,'available_comps',ch.available_count,
      'radius_ft',p_radius_ft,'sample_basis','current_regrid_building_stock','sample_cap',500,
      'lot_band_used',case when ch.band>=999 then 'any' else '+/-'||round(ch.band*100)||'%' end,
      'selection',jsonb_build_object(
        'mode',ch.mode_name,'requested_typology',lower(btrim(p_typology)),'match_mode',ch.match_mode,
        'same_zoning_required',ch.same_zoning,'lot_band',case when ch.band>=999 then 'any' else '+/-'||round(ch.band*100)||'%' end,
        'available_count',ch.available_count,'sample_size',st.n_comps,'sample_cap',500,
        'confidence',case
          when ch.mode_name='exact_same_zoning' and ch.band<=1 and st.n_comps>=p_min_comps then 'high'
          when ch.mode_name in ('exact_same_zoning','exact_any_zoning','compatible_same_zoning') and st.n_comps>=p_min_comps then 'medium'
          when ch.mode_name in ('exact_any_zoning','compatible_any_zoning','zoning_only') then 'low'
          else 'insufficient' end
      ),
      'type_mix',tm.value,'source_use_descriptions',d.value,'precedent_parcel_ids',i.value,
      'distribution',jsonb_build_object(
        'footprint_sqft',jsonb_build_object('p25',st.fp25,'p50',st.fp50,'p75',st.fp75,'p90',st.fp90),
        'total_footprint_sqft',jsonb_build_object('p25',st.tfp25,'p50',st.tfp50,'p75',st.tfp75,'p90',st.tfp90),
        'building_count',jsonb_build_object('p25',st.bc25,'p50',st.bc50,'p75',st.bc75,'p90',st.bc90),
        'coverage_pct',jsonb_build_object('p25',st.cov25,'p50',st.cov50,'p75',st.cov75,'p90',st.cov90),
        'stories',jsonb_build_object('p50',st.st50,'p75',st.st75,'p90',st.st90),
        'length_ft',jsonb_build_object('p25',st.len25,'p50',st.len50,'p75',st.len75,'p90',st.len90),
        'depth_ft',jsonb_build_object('p25',st.dep25,'p50',st.dep50,'p75',st.dep75,'p90',st.dep90),
        'aspect_ratio',jsonb_build_object('p25',st.ar25,'p50',st.ar50,'p75',st.ar75,'p90',st.ar90),
        'compactness',jsonb_build_object('p25',st.co25,'p50',st.co50,'p75',st.co75),
        'gross_area_sqft',jsonb_build_object('p25',st.ga25,'p50',st.ga50,'p75',st.ga75,'p90',st.ga90)
      ),
      'underwrite_target',jsonb_build_object(
        'footprint_sqft_p75',st.fp75,'footprint_sqft_p90',st.fp90,'stories_p75',st.st75,
        'length_ft_p75',st.len75,'depth_ft_p50',st.dep50,'coverage_pct_p75',st.cov75,'building_count_p50',st.bc50
      ),
      'confidence',case
        when ch.mode_name='exact_same_zoning' and ch.band<=1 and st.n_comps>=p_min_comps then 'high'
        when ch.mode_name in ('exact_same_zoning','exact_any_zoning','compatible_same_zoning') and st.n_comps>=p_min_comps then 'medium'
        when ch.mode_name in ('exact_any_zoning','compatible_any_zoning','zoning_only') then 'low'
        else 'insufficient' end,
      'flags',jsonb_build_array('regrid_typology_selection_'||ch.mode_name)
        || case when ch.band>=999 then jsonb_build_array('regrid_lot_band_relaxed_any') else '[]'::jsonb end
        || case when ch.mode_name like '%any_zoning' then jsonb_build_array('regrid_zoning_filter_relaxed') else '[]'::jsonb end
        || case when ch.mode_name like 'compatible%' then jsonb_build_array('regrid_compatible_use_classes_used') else '[]'::jsonb end
        || case when ch.mode_name in ('zoning_only','all_nearby') then jsonb_build_array('regrid_typology_filter_insufficient') else '[]'::jsonb end
        || case when ch.available_count>500 then jsonb_build_array('regrid_sample_capped_500') else '[]'::jsonb end,
      'provenance',jsonb_build_object(
        'parcel_source','public.parcels usecode/usedesc','building_source','public.buildings Regrid footprint geometry and attributes',
        'join','public.building_parcel_join','classifier','public.fn_regrid_use_class','matcher','public.fn_regrid_typology_match',
        'sampling','single-query selection; type/zoning/lot filtering before building join; up to 500 closest/lot-similar geometries'
      )
    ) end
  into v_result
  from subject s cross join choice ch cross join stats st cross join type_mix tm cross join descriptions d cross join ids i;

  return coalesce(v_result,jsonb_build_object('error','no eligible Regrid comparison set'));
end
$$;

comment on function public.fn_local_built_form_v2(integer,text,numeric,integer) is
  'Single-query typology-aware Regrid context. No per-request temp DDL; filters parcel use before building joins and returns actual footprint geometry metrics.';
