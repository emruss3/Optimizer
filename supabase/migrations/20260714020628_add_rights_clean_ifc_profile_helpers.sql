-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create or replace function training.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '_' from regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]+', '_', 'g')),
      ''
    ),
    'unknown'
  )
$$;

create or replace function training.ifc_unquote(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_token is null or btrim(p_token) in ('', '$', '*') then null
    when left(btrim(p_token),1) = '''' and right(btrim(p_token),1) = ''''
      then nullif(replace(substr(btrim(p_token),2,length(btrim(p_token))-2), '''''', ''''), '')
    else btrim(p_token)
  end
$$;

create or replace function training.ifc_entity_counts(p_content text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with c as (
    select upper(m[1]) as entity_type, count(*)::bigint as n
    from regexp_matches(
      coalesce(p_content,''),
      '#[0-9]+\s*=\s*([A-Za-z0-9_]+)\s*\(',
      'g'
    ) as m
    group by upper(m[1])
  )
  select coalesce(jsonb_object_agg(entity_type, n order by entity_type), '{}'::jsonb)
  from c
$$;

create or replace function training.ifc_spatial_entities(p_content text)
returns table (
  express_id text,
  entity_type text,
  guid text,
  name text,
  raw_args text
)
language sql
immutable
set search_path = ''
as $$
  with matches as (
    select
      m[1] as express_id,
      upper(m[2]) as entity_type,
      m[3] as raw_args
    from regexp_matches(
      coalesce(p_content,''),
      '#([0-9]+)\s*=\s*(IFCPROJECT|IFCSITE|IFCBUILDINGSTOREY|IFCBUILDING|IFCSPACE|IFCZONE|IFCSYSTEM)\s*\(([^;]*)\);',
      'gi'
    ) as m
  ),
  parsed as (
    select
      express_id,
      entity_type,
      raw_args,
      regexp_match(raw_args, '^\s*(''(?:[^'']|'''')*''|\$)') as guid_match,
      regexp_match(
        raw_args,
        '^\s*(?:''(?:[^'']|'''')*''|\$)\s*,\s*[^,]+\s*,\s*(''(?:[^'']|'''')*''|\$)'
      ) as name_match
    from matches
  )
  select
    express_id,
    entity_type,
    training.ifc_unquote(guid_match[1]),
    training.ifc_unquote(name_match[1]),
    raw_args
  from parsed
$$;

revoke all on function training.slugify(text) from public, anon, authenticated;
revoke all on function training.ifc_unquote(text) from public, anon, authenticated;
revoke all on function training.ifc_entity_counts(text) from public, anon, authenticated;
revoke all on function training.ifc_spatial_entities(text) from public, anon, authenticated;
grant execute on function training.slugify(text) to service_role;
grant execute on function training.ifc_unquote(text) to service_role;
grant execute on function training.ifc_entity_counts(text) to service_role;
grant execute on function training.ifc_spatial_entities(text) to service_role;
