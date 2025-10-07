-- RPC: score_pad(p_parcel_id text, p_pad_3857 geometry, p_parking_3857 geometry) -> jsonb
drop function if exists public.score_pad(text, geometry, geometry);
create function public.score_pad(
  p_parcel_id text,
  p_pad_3857 geometry,
  p_parking_3857 geometry
) returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  env geometry := public.get_buildable_envelope(p_parcel_id);
  pad_sf numeric := ST_Area(p_pad_3857) * 10.7639;
  env_sf numeric := nullif(ST_Area(env) * 10.7639, 0);

  far_max numeric := (select far_max from planner_zoning where parcel_id = p_parcel_id limit 1);
  pratio  numeric := (select parking_ratio from planner_zoning where parcel_id = p_parcel_id limit 1);

  far_ok boolean := case when far_max is null or env_sf is null then true else pad_sf <= far_max * env_sf end;
  coverage numeric := case when env_sf is null then 0 else pad_sf / env_sf end;

  stalls int := coalesce((select count(*) from ST_Dump(p_parking_3857)), 0);
  stalls_needed numeric := case when pratio is null then 0 else (pad_sf/1000.0) * pratio end;
  parking_ok boolean := stalls >= stalls_needed;

  envelope_ok boolean := ST_CoveredBy(p_pad_3857, env);
  score numeric;
begin
  score := (case when far_ok then 0.4 else 0 end)
         + (case when parking_ok then 0.3 else 0 end)
         + (case when envelope_ok then 0.2 else 0 end)
         + greatest(0, 0.1 - abs(coverage - 0.35));

  return jsonb_build_object(
    'pad_sf', round(pad_sf,0),
    'env_sf', round(coalesce(env_sf,0),0),
    'coverage', round(coverage,3),
    'stalls', stalls,
    'stalls_needed', ceil(stalls_needed),
    'far_ok', far_ok,
    'parking_ok', parking_ok,
    'envelope_ok', envelope_ok,
    'score', round(score,3)
  );
end $$;
