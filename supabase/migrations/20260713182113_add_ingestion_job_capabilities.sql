-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create extension if not exists pg_net with schema extensions;

alter table training.ingestion_jobs
  add column if not exists invocation_nonce uuid not null default gen_random_uuid();

create or replace function training.invoke_ingestion_job(p_job_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nonce uuid;
  v_request_id bigint;
begin
  update training.ingestion_jobs
  set invocation_nonce=gen_random_uuid(), scheduled_at=now(), status='queued', updated_at=now()
  where id=p_job_id
  returning invocation_nonce into v_nonce;

  if v_nonce is null then
    raise exception 'Unknown ingestion job %', p_job_id;
  end if;

  select net.http_post(
    url := 'https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/training-ingest',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('job_id',p_job_id,'nonce',v_nonce),
    timeout_milliseconds := 150000
  ) into v_request_id;

  update training.ingestion_jobs set request_id=v_request_id where id=p_job_id;
  return v_request_id;
end;
$$;

revoke all on function training.invoke_ingestion_job(uuid) from public, anon, authenticated;
grant execute on function training.invoke_ingestion_job(uuid) to service_role;
