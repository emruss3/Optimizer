-- RPC: get_parcel_detail(p_parcel_id text) -> everything UI needs in one call
drop function if exists public.get_parcel_detail(text);
create function public.get_parcel_detail(p_parcel_id text)
returns table(
  parcel_id text,
  geom geometry,
  base text,
  far_max numeric,
  height_max_ft numeric,
  setbacks jsonb,
  envelope geometry,
  metrics jsonb
) language plpgsql stable security definer set search_path=public as $$
begin
  return query
  select
    j.parcel_id,
    j.geom,
    j.base,
    j.far_max,
    j.height_max_ft,
    j.setbacks,
    public.get_buildable_envelope(j.parcel_id) as envelope,
    public.score_pad(j.parcel_id, public.get_buildable_envelope(j.parcel_id), null) as metrics
  from planner_join j
  where j.parcel_id = p_parcel_id
  limit 1;
end $$;
