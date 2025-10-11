-- RPC: get_buildable_envelope(p_parcel_id text) -> geometry (EPSG:3857)
drop function if exists public.get_buildable_envelope(text);
create or replace function public.get_buildable_envelope(p_parcel_id text)
returns geometry
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  p3857  geometry;
  f numeric := 20;  -- defaults if zoning missing
  s numeric := 5;
  r numeric := 20;
  inset_m numeric;
  env geometry;
begin
  select geom into p3857
  from planner_parcels
  where parcel_id = p_parcel_id
  limit 1;

  if p3857 is null then
    raise exception 'Parcel % not found in planner_parcels', p_parcel_id;
  end if;

  select
    coalesce((setbacks->>'front')::numeric, f),
    coalesce((setbacks->>'side')::numeric,  s),
    coalesce((setbacks->>'rear')::numeric,  r)
  into f, s, r
  from planner_zoning
  where parcel_id = p_parcel_id
  limit 1;

  inset_m := greatest(f,s,r) / 3.28084;  -- ft→m
  env := ST_Buffer(p3857, -inset_m);

  return ST_MakeValid(env);
end $$;
