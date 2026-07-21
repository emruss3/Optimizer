-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-21.
-- The current frontend reads geometry.front_edge.bearing_deg when the compiled
-- front edge is verified. GeoJSON permits foreign members, so retain the line
-- geometry and publish the bearing alongside it for worker parity.

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    $old$  v_compiler_revision constant text := 'planner_context_v2_program_frontage_20260721';$old$,
    $new$  v_compiler_revision constant text := 'planner_context_v2_program_frontage_bearing_20260721';$new$
  );

  v_old := $old$      'front_edge', coalesce(v_front_edge_4326, v_frontage -> 'front_edge_geojson'),$old$;
  v_new := $new$      'front_edge', case
        when v_front_edge_4326 is not null then
          v_front_edge_4326 || jsonb_build_object('bearing_deg', v_frontage_bearing_deg)
        else v_frontage -> 'front_edge_geojson'
      end,$new$;

  if position(v_old in v_definition) = 0 then
    raise exception 'front-edge geometry marker not found';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$patch$;

comment on function public.fn_compile_planner_context(integer,text,jsonb) is
  'Compiles immutable planner_context_v2 snapshots with bounded reuse, max-GSF frontier, unit program and verified frontage. A verified front_edge GeoJSON carries bearing_deg as a foreign member for client-worker orientation parity.';

notify pgrst, 'reload schema';
