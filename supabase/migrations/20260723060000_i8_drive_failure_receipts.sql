-- Diagnostic contract for the remaining I-8 drive-connectivity class.
-- The solver still fails closed; this only makes the exhausted geometry
-- measurable from the dispatcher/census without parcel-specific debugging.

do $patch$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('drive_component_summary' in d)>0 then
    return;
  end if;

  old := $old$    RETURN jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'flags',flags
    );$old$;

  new := $new$    RETURN jsonb_build_object(
      'error','planner_drive_network_disconnected',
      'components',drive_components,
      'drive_component_summary',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'i',q.i,
          'area_sqft',round(ST_Area(q.geom)),
          'xmin',round(ST_XMin(q.geom)::numeric,1),
          'xmax',round(ST_XMax(q.geom)::numeric,1),
          'ymin',round(ST_YMin(q.geom)::numeric,1),
          'ymax',round(ST_YMax(q.geom)::numeric,1),
          'distance_to_spine_ft',case when spine is null then null
            else round(ST_Distance(q.geom,spine)::numeric,1) end,
          'distance_to_main_ft',case when main_comp is null then null
            else round(ST_Distance(q.geom,main_comp)::numeric,1) end
        ) order by q.i),'[]'::jsonb)
        from (
          select row_number() over(order by ST_Area(x.geom) desc)::integer i,x.geom
          from (select (ST_Dump(ST_CollectionExtract(ST_UnaryUnion(drives),3))).geom) x
        ) q
      ),
      'building_summary',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'i',s.k,
          'area_sqft',round(ST_Area(bars_arr[s.k])),
          'xmin',round(ST_XMin(bars_arr[s.k])::numeric,1),
          'xmax',round(ST_XMax(bars_arr[s.k])::numeric,1),
          'ymin',round(ST_YMin(bars_arr[s.k])::numeric,1),
          'ymax',round(ST_YMax(bars_arr[s.k])::numeric,1),
          'distance_to_drive_ft',round(ST_Distance(bars_arr[s.k],drives)::numeric,1)
        ) order by s.k),'[]'::jsonb)
        from generate_subscripts(bars_arr,1) s(k)
      ),
      'impervious_headroom_sqft',case when max_impervious_sqft is null then null
        else round(greatest(max_impervious_sqft-(tot_fp+tot_park+tot_drive),0)) end,
      'flags',flags
    );$new$;

  if position(old in d)=0 then
    raise exception 'I-8 drive receipt marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily core. Recoverable errors feed the I-8 dispatcher; exhausted drive failures carry structured component/building/headroom receipts.';

notify pgrst,'reload schema';
