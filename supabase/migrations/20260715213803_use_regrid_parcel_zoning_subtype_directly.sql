-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-15 (context-engine parity export).
-- Restored byte-exact from supabase_migrations.schema_migrations.statements[1].

do $patch$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.fn_local_built_form_v2(integer,text,numeric,integer)'::regprocedure);
  if position('left join public.planner_zoning z on z.zoning_id=p.zoning_id' in v_definition)=0 then
    raise exception 'subject planner_zoning marker not found';
  end if;
  v_definition:=replace(v_definition,
    E'select z.zoning_subtype,p.centroid_2274,p.lot_sqft_2274\n  into v_subtype,v_centroid,v_lot\n  from public.parcels p\n  left join public.planner_zoning z on z.zoning_id=p.zoning_id',
    E'select p.zoning_subtype,p.centroid_2274,p.lot_sqft_2274\n  into v_subtype,v_centroid,v_lot\n  from public.parcels p');
  v_definition:=replace(v_definition,
    E'      left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id\n',
    '');
  v_definition:=replace(v_definition,
    E'    left join public.planner_zoning z2 on z2.zoning_id=c.zoning_id\n',
    '');
  v_definition:=replace(v_definition,'z2.zoning_subtype','c.zoning_subtype');
  execute v_definition;
end
$patch$;

comment on function public.fn_local_built_form_v2(integer,text,numeric,integer) is
  'Typology-aware Regrid context using parcels.zoning_subtype directly, avoiding repeated planner_zoning view lookups.';
