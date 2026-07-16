-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

do $patch$
declare v_definition text; v_old text; v_new text;
begin
  v_definition:=pg_get_functiondef('public.fn_local_built_form_v2(integer,text,numeric,integer)'::regprocedure);
  v_old:=E'select ogc_fid,ed_bld_uuid,lot_sqft,distance_ft,zoning_subtype,usecode,usedesc,use_class,match_level,\n           building_count,ed_bldg_footprint_sqft as largest_footprint_sqft,total_footprint_sqft,\n           100*total_footprint_sqft/nullif(lot_sqft,0) as coverage_pct,\n           case when ed_stories ~ ''^[0-9]+([.][0-9]+)?$'' then ed_stories::numeric else null end as stories,\n           gross_area_sqft\n    from building_rows\n    cross join subject s\n    where rn=1\n    order by abs(ln(greatest(lot_sqft,1)/greatest(s.lot_sqft_2274,1))),distance_ft,ogc_fid';
  v_new:=E'select br.ogc_fid,br.ed_bld_uuid,br.lot_sqft,br.distance_ft,br.zoning_subtype,br.usecode,br.usedesc,br.use_class,br.match_level,\n           br.building_count,br.ed_bldg_footprint_sqft as largest_footprint_sqft,br.total_footprint_sqft,\n           100*br.total_footprint_sqft/nullif(br.lot_sqft,0) as coverage_pct,\n           case when br.ed_stories ~ ''^[0-9]+([.][0-9]+)?$'' then br.ed_stories::numeric else null end as stories,\n           br.gross_area_sqft\n    from building_rows br\n    cross join subject s\n    where br.rn=1\n    order by abs(ln(greatest(br.lot_sqft,1)/greatest(s.lot_sqft_2274,1))),br.distance_ft,br.ogc_fid';
  if position(v_old in v_definition)=0 then raise exception 'selected_buildings replacement marker not found'; end if;
  execute replace(v_definition,v_old,v_new);
end
$patch$;
