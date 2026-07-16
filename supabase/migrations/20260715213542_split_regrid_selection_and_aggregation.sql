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
  v_subtype text;
  v_centroid geometry;
  v_lot numeric;
  v_mode text;
  v_match_mode text;
  v_same_zoning boolean;
  v_band numeric;
  v_available_n integer := 0;
  v_selected boolean := false;
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

  if v_centroid is null or v_lot is null or v_lot<=0 then
    return jsonb_build_object('error','no parcel centroid/lot area for Regrid context');
  end if;

  <<preferred_modes>>
  for v_mode,v_match_mode,v_same_zoning in
    select * from (values
      ('exact_same_zoning','exact',true),
      ('exact_any_zoning','exact',false),
      ('compatible_same_zoning','compatible',true),
      ('compatible_any_zoning','compatible',false),
      ('zoning_only','any',true)
    ) x(mode_name,match_mode,same_zoning)
  loop
    foreach v_band in array array[0.5,1.0,2.0,999]::numeric[] loop
      select count(*) into v_available_n
      from public.parcels c
      left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id
      where c.ogc_fid<>p_ogc_fid
        and c.centroid_2274 is not null
        and c.lot_sqft_2274>0
        and public.st_dwithin(c.centroid_2274,v_centroid,p_radius_ft)
        and case v_match_mode
          when 'exact' then public.fn_regrid_typology_match(p_typology,public.fn_regrid_use_class(c.usecode,c.usedesc))=2
          when 'compatible' then public.fn_regrid_typology_match(p_typology,public.fn_regrid_use_class(c.usecode,c.usedesc))>=1
          else true end
        and (not v_same_zoning or z2.zoning_subtype is not distinct from v_subtype)
        and (v_band>=999 or c.lot_sqft_2274 between v_lot*(1-least(v_band,0.99)) and v_lot*(1+v_band));
      if v_available_n>=p_min_comps then v_selected:=true; exit preferred_modes; end if;
    end loop;
  end loop;

  if not v_selected then
    <<fallback_modes>>
    for v_mode,v_match_mode,v_same_zoning in
      select * from (values
        ('exact_any_zoning','exact',false),
        ('compatible_any_zoning','compatible',false),
        ('zoning_only','any',true),
        ('all_nearby','any',false)
      ) x(mode_name,match_mode,same_zoning)
    loop
      v_band:=999;
      select count(*) into v_available_n
      from public.parcels c
      left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id
      where c.ogc_fid<>p_ogc_fid
        and c.centroid_2274 is not null
        and c.lot_sqft_2274>0
        and public.st_dwithin(c.centroid_2274,v_centroid,p_radius_ft)
        and case v_match_mode
          when 'exact' then public.fn_regrid_typology_match(p_typology,public.fn_regrid_use_class(c.usecode,c.usedesc))=2
          when 'compatible' then public.fn_regrid_typology_match(p_typology,public.fn_regrid_use_class(c.usecode,c.usedesc))>=1
          else true end
        and (not v_same_zoning or z2.zoning_subtype is not distinct from v_subtype);
      if v_available_n>=3 then v_selected:=true; exit fallback_modes; end if;
    end loop;
  end if;

  if not v_selected then
    return jsonb_build_object('error','insufficient nearby Regrid parcels');
  end if;

  with selected_parcels as materialized (
    select c.ogc_fid,c.ll_uuid::text as ll_uuid,c.lot_sqft_2274 as lot_sqft,
           public.st_distance(c.centroid_2274,v_centroid) as distance_ft,
           z2.zoning_subtype,c.usecode,c.usedesc,
           public.fn_regrid_use_class(c.usecode,c.usedesc) as use_class,
           public.fn_regrid_typology_match(p_typology,public.fn_regrid_use_class(c.usecode,c.usedesc)) as match_level
    from public.parcels c
    left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id
    where c.ogc_fid<>p_ogc_fid
      and c.centroid_2274 is not null
      and c.lot_sqft_2274>0
      and public.st_dwithin(c.centroid_2274,v_centroid,p_radius_ft)
      and case v_match_mode
        when 'exact' then public.fn_regrid_typology_match(p_typology,public.fn_regrid_use_class(c.usecode,c.usedesc))=2
        when 'compatible' then public.fn_regrid_typology_match(p_typology,public.fn_regrid_use_class(c.usecode,c.usedesc))>=1
        else true end
      and (not v_same_zoning or z2.zoning_subtype is not distinct from v_subtype)
      and (v_band>=999 or c.lot_sqft_2274 between v_lot*(1-least(v_band,0.99)) and v_lot*(1+v_band))
    order by abs(ln(greatest(c.lot_sqft_2274,1)/greatest(v_lot,1))),
             public.st_distance(c.centroid_2274,v_centroid),c.ogc_fid
    limit 1000
  ), building_rows as materialized (
    select sp.*,
           b.ed_bld_uuid,b.ed_bldg_footprint_sqft,b.ed_gross_area,b.ed_stories,b.ed_largest,
           row_number() over (
             partition by sp.ogc_fid
             order by case when b.ed_largest in ('1','1.0') then 1 else 0 end desc,
                      b.ed_bldg_footprint_sqft desc,b.ed_bld_uuid
           ) as rn,
           count(*) over (partition by sp.ogc_fid)::integer as building_count,
           sum(b.ed_bldg_footprint_sqft) over (partition by sp.ogc_fid) as total_footprint_sqft,
           sum(b.ed_gross_area) over (partition by sp.ogc_fid) as gross_area_sqft
    from selected_parcels sp
    join public.building_parcel_join j on j.ll_uuid=sp.ll_uuid
    join public.buildings b on b.ed_bld_uuid=j.ed_bld_uuid
    where b.ed_bldg_footprint_sqft>0
  ), selected_buildings as materialized (
    select br.ogc_fid,br.ed_bld_uuid,br.lot_sqft,br.distance_ft,br.zoning_subtype,
           br.usecode,br.usedesc,br.use_class,br.match_level,br.building_count,
           br.ed_bldg_footprint_sqft as largest_footprint_sqft,br.total_footprint_sqft,
           100*br.total_footprint_sqft/nullif(br.lot_sqft,0) as coverage_pct,
           case when br.ed_stories ~ '^[0-9]+([.][0-9]+)?$' then br.ed_stories::numeric else null end as stories,
           br.gross_area_sqft
    from building_rows br
    where br.rn=1
    order by abs(ln(greatest(br.lot_sqft,1)/greatest(v_lot,1))),br.distance_ft,br.ogc_fid
    limit 500
  ), transformed as materialized (
    select sb.*,public.st_transform(public.st_collectionextract(public.st_makevalid(b.geom),3),2274) as g2274
    from selected_buildings sb
    join public.buildings b on b.ed_bld_uuid=sb.ed_bld_uuid
    where b.geom is not null
  ), measured as materialized (
    select t.*,o.obb,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as d1,
           public.st_distance(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as d2,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),1),public.st_pointn(public.st_exteriorring(o.obb),2)) as a1,
           public.st_azimuth(public.st_pointn(public.st_exteriorring(o.obb),2),public.st_pointn(public.st_exteriorring(o.obb),3)) as a2
    from transformed t
    cross join lateral (select public.st_orientedenvelope(t.g2274) as obb) o
    where t.g2274 is not null and not public.st_isempty(t.g2274)
  ), metrics as materialized (
    select ogc_fid,lot_sqft,distance_ft,zoning_subtype,usecode,usedesc,use_class,match_level,
           building_count,largest_footprint_sqft,total_footprint_sqft,coverage_pct,stories,gross_area_sqft,
           greatest(d1,d2) as length_ft,least(d1,d2) as depth_ft,
           greatest(d1,d2)/nullif(least(d1,d2),0) as aspect_ratio,
           4*pi()*public.st_area(g2274)/nullif(power(public.st_perimeter(g2274),2),0) as compactness,
           mod((degrees(case when d1>=d2 then a1 else a2 end)+180)::numeric,180) as orientation_deg
    from measured
    where obb is not null and not public.st_isempty(obb) and d1>0 and d2>0
  ), stats as materialized (
    select count(*)::integer as n,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by largest_footprint_sqft) as fp,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by total_footprint_sqft) as tfp,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by building_count) as bc,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by coverage_pct) as cov,
      percentile_cont(array[.50,.75,.90]) within group(order by stories) as stories,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by length_ft) as len,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by depth_ft) as dep,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by aspect_ratio) as ar,
      percentile_cont(array[.25,.50,.75]) within group(order by compactness) as compact,
      percentile_cont(array[.25,.50,.75,.90]) within group(order by gross_area_sqft) as ga
    from metrics
  )
  select case when st.n<3 then jsonb_build_object('error','insufficient Regrid footprint geometries after normalization') else
    jsonb_build_object(
      'parcel_ogc_fid',p_ogc_fid,'typology',lower(btrim(p_typology)),'zoning_subtype',v_subtype,
      'subject_lot_sqft',round(v_lot,0),'n_comps',st.n,'available_comps',v_available_n,
      'radius_ft',p_radius_ft,'sample_basis','current_regrid_building_stock','sample_cap',500,
      'lot_band_used',case when v_band>=999 then 'any' else '+/-'||round(v_band*100)||'%' end,
      'selection',jsonb_build_object(
        'mode',v_mode,'requested_typology',lower(btrim(p_typology)),'match_mode',v_match_mode,
        'same_zoning_required',v_same_zoning,'lot_band',case when v_band>=999 then 'any' else '+/-'||round(v_band*100)||'%' end,
        'available_count',v_available_n,'sample_size',st.n,'sample_cap',500,
        'confidence',case
          when v_mode='exact_same_zoning' and v_band<=1 and st.n>=p_min_comps then 'high'
          when v_mode in ('exact_same_zoning','exact_any_zoning','compatible_same_zoning') and st.n>=p_min_comps then 'medium'
          when v_mode in ('exact_any_zoning','compatible_any_zoning','zoning_only') then 'low'
          else 'insufficient' end
      ),
      'type_mix',(select coalesce(jsonb_object_agg(use_class,n order by use_class),'{}'::jsonb) from (select use_class,count(*) n from metrics group by use_class) q),
      'source_use_descriptions',(select coalesce(jsonb_agg(jsonb_build_object('usedesc',usedesc,'usecode',usecode,'count',n) order by n desc,usedesc),'[]'::jsonb) from (select usedesc,usecode,count(*) n from metrics group by usedesc,usecode order by count(*) desc,usedesc limit 12) q),
      'precedent_parcel_ids',(select coalesce(jsonb_agg(ogc_fid order by distance_ft,ogc_fid),'[]'::jsonb) from (select ogc_fid,distance_ft from metrics order by distance_ft,ogc_fid limit 50) q),
      'distribution',jsonb_build_object(
        'footprint_sqft',jsonb_build_object('p25',round(st.fp[1]::numeric,0),'p50',round(st.fp[2]::numeric,0),'p75',round(st.fp[3]::numeric,0),'p90',round(st.fp[4]::numeric,0)),
        'total_footprint_sqft',jsonb_build_object('p25',round(st.tfp[1]::numeric,0),'p50',round(st.tfp[2]::numeric,0),'p75',round(st.tfp[3]::numeric,0),'p90',round(st.tfp[4]::numeric,0)),
        'building_count',jsonb_build_object('p25',round(st.bc[1]::numeric,1),'p50',round(st.bc[2]::numeric,1),'p75',round(st.bc[3]::numeric,1),'p90',round(st.bc[4]::numeric,1)),
        'coverage_pct',jsonb_build_object('p25',round(st.cov[1]::numeric,1),'p50',round(st.cov[2]::numeric,1),'p75',round(st.cov[3]::numeric,1),'p90',round(st.cov[4]::numeric,1)),
        'stories',jsonb_build_object('p50',round(st.stories[1]::numeric,1),'p75',round(st.stories[2]::numeric,1),'p90',round(st.stories[3]::numeric,1)),
        'length_ft',jsonb_build_object('p25',round(st.len[1]::numeric,1),'p50',round(st.len[2]::numeric,1),'p75',round(st.len[3]::numeric,1),'p90',round(st.len[4]::numeric,1)),
        'depth_ft',jsonb_build_object('p25',round(st.dep[1]::numeric,1),'p50',round(st.dep[2]::numeric,1),'p75',round(st.dep[3]::numeric,1),'p90',round(st.dep[4]::numeric,1)),
        'aspect_ratio',jsonb_build_object('p25',round(st.ar[1]::numeric,2),'p50',round(st.ar[2]::numeric,2),'p75',round(st.ar[3]::numeric,2),'p90',round(st.ar[4]::numeric,2)),
        'compactness',jsonb_build_object('p25',round(st.compact[1]::numeric,3),'p50',round(st.compact[2]::numeric,3),'p75',round(st.compact[3]::numeric,3)),
        'gross_area_sqft',jsonb_build_object('p25',round(st.ga[1]::numeric,0),'p50',round(st.ga[2]::numeric,0),'p75',round(st.ga[3]::numeric,0),'p90',round(st.ga[4]::numeric,0))
      ),
      'underwrite_target',jsonb_build_object(
        'footprint_sqft_p75',round(st.fp[3]::numeric,0),'footprint_sqft_p90',round(st.fp[4]::numeric,0),
        'stories_p75',round(st.stories[2]::numeric,1),'length_ft_p75',round(st.len[3]::numeric,1),
        'depth_ft_p50',round(st.dep[2]::numeric,1),'coverage_pct_p75',round(st.cov[3]::numeric,1),
        'building_count_p50',round(st.bc[2]::numeric,1)
      ),
      'confidence',case
        when v_mode='exact_same_zoning' and v_band<=1 and st.n>=p_min_comps then 'high'
        when v_mode in ('exact_same_zoning','exact_any_zoning','compatible_same_zoning') and st.n>=p_min_comps then 'medium'
        when v_mode in ('exact_any_zoning','compatible_any_zoning','zoning_only') then 'low'
        else 'insufficient' end,
      'flags',jsonb_build_array('regrid_typology_selection_'||v_mode)
        || case when v_band>=999 then jsonb_build_array('regrid_lot_band_relaxed_any') else '[]'::jsonb end
        || case when v_mode like '%any_zoning' then jsonb_build_array('regrid_zoning_filter_relaxed') else '[]'::jsonb end
        || case when v_mode like 'compatible%' then jsonb_build_array('regrid_compatible_use_classes_used') else '[]'::jsonb end
        || case when v_mode in ('zoning_only','all_nearby') then jsonb_build_array('regrid_typology_filter_insufficient') else '[]'::jsonb end
        || case when v_available_n>500 then jsonb_build_array('regrid_sample_capped_500') else '[]'::jsonb end,
      'provenance',jsonb_build_object(
        'parcel_source','public.parcels usecode/usedesc','building_source','public.buildings Regrid footprint geometry and attributes',
        'join','public.building_parcel_join','classifier','public.fn_regrid_use_class','matcher','public.fn_regrid_typology_match',
        'sampling','mode selected in small indexed queries; up to 500 closest/lot-similar building geometries'
      )
    ) end
  into v_result
  from stats st;

  return coalesce(v_result,jsonb_build_object('error','no eligible Regrid comparison set'));
end
$$;

comment on function public.fn_local_built_form_v2(integer,text,numeric,integer) is
  'Typology-aware Regrid context with separate indexed selection and geometry aggregation plans for low first-load latency.';
