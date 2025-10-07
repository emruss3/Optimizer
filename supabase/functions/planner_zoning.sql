-- View: planner_zoning (dynamic FAR if available; no defaults)
-- If a dynamic FAR column exists (effective_far, dynamic_far, ...), use it; else use max_far.
do $dynfar$
declare
  dyn_far_col text;
  far_expr    text;
  sql_zoning  text;
begin
  select column_name into dyn_far_col
  from information_schema.columns
  where table_schema='public' and table_name='zoning'
    and column_name = any (array[
      'effective_far','dynamic_far','calc_far','computed_far','current_far',
      'far_dynamic','far_effective','far_calc','far_current'
    ])
  order by 1 limit 1;

  far_expr := case
    when dyn_far_col is not null then format('nullif(%I, '''')::numeric', dyn_far_col)
    else                           'case when nullif(max_far, '''')::numeric in (-5555,-9999) then null else nullif(max_far, '''')::numeric end'
  end;

  sql_zoning := format($f$
    drop view if exists planner_zoning;
    create view planner_zoning as
    select
      geoid::text as parcel_id,
      zoning      as base,
      %s          as far_max,
      case when nullif(max_building_height_ft,'')::numeric in (-5555,-9999) then null
           else nullif(max_building_height_ft,'')::numeric end as height_max_ft,
      jsonb_build_object(
        'front', case when nullif(min_front_setback_ft,'')::numeric in (-5555,-9999) then null else nullif(min_front_setback_ft,'')::numeric end,
        'side',  case when nullif(min_side_setback_ft,'')::numeric  in (-5555,-9999) then null else nullif(min_side_setback_ft,'')::numeric  end,
        'rear',  case when nullif(min_rear_setback_ft,'')::numeric  in (-5555,-9999) then null else nullif(min_rear_setback_ft,'')::numeric  end
      ) as setbacks,
      null::numeric as parking_ratio,
      zoning_description, zoning_type, zoning_subtype, zoning_code_link, permitted_land_uses
    from public.zoning;
  $f$, far_expr);

  execute sql_zoning;
end
$dynfar$ language plpgsql;
