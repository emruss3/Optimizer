-- Plan Persistence: site_plans table for saving/loading generated site plans
-- Prompt 9

create table if not exists public.site_plans (
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
  created_by    uuid references auth.users(id) on delete set null
);

-- Index for fast lookup by parcel
create index if not exists idx_site_plans_parcel on public.site_plans (parcel_id, created_at desc);

-- RLS: users can only see their own plans (or anonymous plans if no auth)
alter table public.site_plans enable row level security;

create policy "Users can view their own plans"
  on public.site_plans for select
  using (auth.uid() = created_by or created_by is null);

create policy "Users can insert their own plans"
  on public.site_plans for insert
  with check (auth.uid() = created_by or created_by is null);

create policy "Users can update their own plans"
  on public.site_plans for update
  using (auth.uid() = created_by or created_by is null);

create policy "Users can delete their own plans"
  on public.site_plans for delete
  using (auth.uid() = created_by or created_by is null);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger site_plans_updated_at
  before update on public.site_plans
  for each row execute function public.set_updated_at();
