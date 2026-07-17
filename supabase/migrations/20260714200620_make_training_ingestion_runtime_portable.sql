-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Routes supported ingestion jobs through an environment-specific Edge Function base URL.

create table if not exists training.runtime_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on training.runtime_config from public,anon,authenticated;
grant select,insert,update,delete on training.runtime_config to service_role;

insert into training.runtime_config(key,value)
values('edge_base_url','https://okxrvetbzpoazrybhcqj.supabase.co')
on conflict(key) do nothing;

create or replace function training.invoke_ingestion_job(p_job_id uuid)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_nonce uuid;
  v_request_id bigint;
  v_base_url text;
  v_job_type text;
  v_function_slug text;
begin
  select j.job_type into v_job_type
  from training.ingestion_jobs j
  where j.id=p_job_id;

  if v_job_type is null then
    raise exception 'Unknown ingestion job %',p_job_id;
  end if;

  v_function_slug := case v_job_type
    when 'jsonl_gzip_to_raw' then 'training-ingest'
    when 'ifc_to_bim' then 'training-model-ingest'
    else null
  end;

  if v_function_slug is null then
    raise exception 'No deployed ingestion worker is registered for job type %',v_job_type;
  end if;

  select rtrim(c.value,'/') into v_base_url
  from training.runtime_config c
  where c.key='edge_base_url';

  if v_base_url is null or v_base_url='' then
    raise exception 'training.runtime_config edge_base_url is not configured';
  end if;

  update training.ingestion_jobs
  set invocation_nonce=gen_random_uuid(),scheduled_at=now(),status='queued',updated_at=now()
  where id=p_job_id
  returning invocation_nonce into v_nonce;

  select net.http_post(
    url:=v_base_url||'/functions/v1/'||v_function_slug,
    headers:=jsonb_build_object('Content-Type','application/json'),
    body:=jsonb_build_object('job_id',p_job_id,'nonce',v_nonce),
    timeout_milliseconds:=150000
  ) into v_request_id;

  update training.ingestion_jobs set request_id=v_request_id where id=p_job_id;
  return v_request_id;
end;
$$;

revoke all on function training.invoke_ingestion_job(uuid) from public,anon,authenticated;
grant execute on function training.invoke_ingestion_job(uuid) to service_role;
