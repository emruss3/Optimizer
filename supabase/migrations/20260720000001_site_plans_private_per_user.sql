-- Plan persistence: site_plans — saved/loaded generated site plans.
--
-- ENTERPRISE RLS POSTURE. This supersedes the never-applied 20260210 draft,
-- whose policies all carried an `or created_by is null` escape — under it any
-- anonymously-saved plan (deal economics included, in `investment`) was
-- readable, editable, and deletable by EVERY user of the app through the anon
-- key. Plans are strictly per-user:
--   · INSERT requires an authenticated user saving as themselves
--     (created_by defaults to auth.uid(); the client does not send it)
--   · SELECT / UPDATE / DELETE are owner-scoped, no null escape
-- Anonymous sessions read an empty list (200 — no probe noise) and cannot
-- write until an auth flow ships.

create table public.site_plans (
  id            uuid primary key default gen_random_uuid(),
  parcel_id     text not null,
  name          text not null default 'Untitled Plan',
  is_favorite   boolean not null default false,

  -- Snapshot of the full plan
  config        jsonb not null,          -- PlannerConfig at time of save
  elements      jsonb not null,          -- Element[]
  metrics       jsonb,                   -- SiteMetrics
  violations    jsonb,                   -- FeasibilityViolation[]
  investment    jsonb,                   -- InvestmentAnalysis

  -- Metadata
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Owner. Cascade: deleting a user deletes their plans (data hygiene).
  created_by    uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- Matches the read path: RLS pins created_by, the query filters parcel_id
-- and orders by created_at desc.
create index idx_site_plans_owner_parcel
  on public.site_plans (created_by, parcel_id, created_at desc);

alter table public.site_plans enable row level security;

create policy "site_plans_select_own"
  on public.site_plans for select
  to authenticated
  using (auth.uid() = created_by);

create policy "site_plans_insert_own"
  on public.site_plans for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "site_plans_update_own"
  on public.site_plans for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "site_plans_delete_own"
  on public.site_plans for delete
  to authenticated
  using (auth.uid() = created_by);

-- updated_at maintenance; search_path pinned (SECURITY-lint clean).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger site_plans_updated_at
  before update on public.site_plans
  for each row execute function public.set_updated_at();
