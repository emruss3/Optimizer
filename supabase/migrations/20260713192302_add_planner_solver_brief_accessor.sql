-- Already applied to project okxrvetbzpoazrybhcqj via MCP on 2026-07-13.
-- Committed for source control and environment parity. Do not reapply blindly.

create or replace function public.fn_get_planner_solver_brief(
  p_context_id uuid,
  p_expected_parcel_ogc_fid integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row planner.context_snapshot%rowtype;
begin
  if p_context_id is null or p_expected_parcel_ogc_fid is null then
    return jsonb_build_object('error', 'context_id and expected parcel are required');
  end if;

  select * into v_row
  from planner.context_snapshot c
  where c.id = p_context_id;

  if not found then
    return jsonb_build_object('error', 'planner_context_not_found');
  end if;
  if v_row.parcel_ogc_fid <> p_expected_parcel_ogc_fid then
    return jsonb_build_object('error', 'planner_context_parcel_mismatch');
  end if;

  return jsonb_build_object(
    'context_id', v_row.id,
    'context_version', v_row.context_version,
    'context_hash', v_row.context_hash,
    'parcel_ogc_fid', v_row.parcel_ogc_fid,
    'selected_use', v_row.selected_use,
    'typology', v_row.typology,
    'generation_allowed', v_row.generation_allowed,
    'solver_brief', v_row.solver_brief,
    'objective_profile', v_row.objective_profile,
    'created_at', v_row.created_at,
    'refreshed_at', v_row.refreshed_at
  );
end;
$$;

comment on function public.fn_get_planner_solver_brief(uuid, integer) is
  'Returns only the solver-safe portion of a private planner context after verifying that it belongs to the expected parcel.';

revoke execute on function public.fn_get_planner_solver_brief(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_get_planner_solver_brief(uuid, integer) to anon, authenticated, service_role;
