-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Fresh environments cannot queue training ingestion until explicitly enabled.

insert into training.runtime_config(key,value)
values('ingestion_enabled','false')
on conflict(key) do nothing;

create or replace function training.enforce_ingestion_enabled()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_enabled boolean;
begin
  select lower(btrim(c.value)) in ('1','true','yes','on')
  into v_enabled
  from training.runtime_config c
  where c.key='ingestion_enabled';

  if coalesce(v_enabled,false) is not true then
    raise exception 'Training ingestion is disabled for this environment. Configure runtime settings before queueing jobs.';
  end if;

  return new;
end;
$$;

drop trigger if exists ingestion_jobs_enabled_gate on training.ingestion_jobs;
create trigger ingestion_jobs_enabled_gate
before insert or update of status on training.ingestion_jobs
for each row
when (new.status='queued')
execute function training.enforce_ingestion_enabled();

revoke all on function training.enforce_ingestion_enabled() from public,anon,authenticated;
grant execute on function training.enforce_ingestion_enabled() to service_role;
