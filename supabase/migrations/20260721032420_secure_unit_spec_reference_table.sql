-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-21.
-- Static reference data is browser-readable but migration/service controlled.

alter table public.unit_spec enable row level security;

drop policy if exists "unit_spec_read" on public.unit_spec;
create policy "unit_spec_read"
on public.unit_spec
for select
to anon, authenticated
using (true);

revoke insert, update, delete, truncate, references, trigger
  on public.unit_spec from anon, authenticated;
grant select on public.unit_spec to anon, authenticated, service_role;

comment on table public.unit_spec is
  'Read-only public reference data for per-typology unit program dimensions and parking assumptions. Browser roles may select; writes are migration/service controlled.';
