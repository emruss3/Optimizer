\set ON_ERROR_STOP on

do $smoke$
declare
  v_rls boolean;
  v_policy_count integer;
begin
  select relrowsecurity into v_rls
  from pg_class
  where oid = 'public.unit_spec'::regclass;

  if not coalesce(v_rls, false) then
    raise exception 'public.unit_spec must have RLS enabled';
  end if;

  select count(*) into v_policy_count
  from pg_policy
  where polrelid = 'public.unit_spec'::regclass
    and polcmd = 'r';

  if v_policy_count < 1 then
    raise exception 'public.unit_spec must have a SELECT policy';
  end if;

  if not has_table_privilege('anon', 'public.unit_spec', 'SELECT')
     or not has_table_privilege('authenticated', 'public.unit_spec', 'SELECT') then
    raise exception 'browser roles must be able to read unit_spec reference data';
  end if;

  if has_table_privilege('anon', 'public.unit_spec', 'INSERT')
     or has_table_privilege('anon', 'public.unit_spec', 'UPDATE')
     or has_table_privilege('anon', 'public.unit_spec', 'DELETE')
     or has_table_privilege('authenticated', 'public.unit_spec', 'INSERT')
     or has_table_privilege('authenticated', 'public.unit_spec', 'UPDATE')
     or has_table_privilege('authenticated', 'public.unit_spec', 'DELETE') then
    raise exception 'browser roles must not mutate unit_spec';
  end if;
end
$smoke$;

select 'unit_spec security smoke passed' as result;
