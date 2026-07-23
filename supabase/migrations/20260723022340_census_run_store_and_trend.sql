-- Census persistence + trend (CAPSTONE Phase 0.4): nightly census runs land
-- in planner.census_run; the dev-build trend surface reads summaries via a
-- definer RPC. Writes are token-gated (the census job holds the token as a
-- CI secret) — the table itself is RLS-locked with no client policies.

create table if not exists planner.census_config (
  key text primary key,
  value text not null
);
alter table planner.census_config enable row level security;

create table if not exists planner.census_run (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  seed text not null,
  n_total integer not null,
  summary jsonb not null,   -- per-stratum summaries (clusters, rates, medians)
  results jsonb not null,   -- full per-parcel outcomes
  created_at timestamptz not null default now(),
  unique (run_date, seed)
);
alter table planner.census_run enable row level security;

insert into planner.census_config (key, value)
values ('census_run_token', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Token-gated recorder: idempotent per (run_date, seed) — a re-run replaces.
create or replace function public.fn_record_census_run(p_token text, p_run jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  if p_token is distinct from (select value from planner.census_config where key = 'census_run_token') then
    raise exception 'census: invalid token';
  end if;
  if octet_length(p_run::text) > 2097152 then
    raise exception 'census: run payload exceeds 2MB';
  end if;
  insert into planner.census_run (run_date, seed, n_total, summary, results)
  values (
    coalesce((p_run->>'date')::date, current_date),
    coalesce(p_run->>'seed', 'unseeded'),
    coalesce((p_run->>'n_total')::integer, 0),
    coalesce(p_run->'summary', '{}'::jsonb),
    coalesce(p_run->'results', '[]'::jsonb)
  )
  on conflict (run_date, seed) do update
    set n_total = excluded.n_total, summary = excluded.summary,
        results = excluded.results, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fn_record_census_run(text, jsonb) from public;
grant execute on function public.fn_record_census_run(text, jsonb) to anon, authenticated, service_role;

-- Trend reader: summaries only (never the full per-parcel payload), newest
-- first, capped. Safe for the dev banner via the anon client.
create or replace function public.fn_census_trend(p_limit integer default 14)
returns jsonb
language sql
security definer
set search_path to ''
stable
as $$
  select coalesce(jsonb_agg(t order by t->>'run_date' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'run_date', run_date,
      'seed', seed,
      'n_total', n_total,
      'summary', summary
    ) as t
    from planner.census_run
    order by run_date desc, created_at desc
    limit greatest(1, least(coalesce(p_limit, 14), 60))
  ) s;
$$;
revoke all on function public.fn_census_trend(integer) from public;
grant execute on function public.fn_census_trend(integer) to anon, authenticated, service_role;
