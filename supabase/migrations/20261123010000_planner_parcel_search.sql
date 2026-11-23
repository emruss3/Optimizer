-- On a live Regrid import, prebuild these four indexes CONCURRENTLY in
-- autocommit sessions before applying this migration. See the rollout notes.
create extension if not exists pg_trgm with schema extensions;
set local search_path = pg_catalog, public, extensions;

create or replace function public.planner_apn_key(unformatted text, formatted text)
returns text language sql immutable parallel safe
as $$
  select regexp_replace(upper(coalesce(nullif(btrim(unformatted), ''), formatted)), '[^A-Z0-9]', '', 'g')
$$;

create index if not exists parcels_planner_address_prefix on public.parcels
  (upper(address) text_pattern_ops);
create index if not exists parcels_planner_apn_prefix on public.parcels
  (public.planner_apn_key(parcelnumb_no_formatting, parcelnumb) text_pattern_ops);
create index if not exists parcels_planner_address_trgm on public.parcels using gin
  (upper(address) gin_trgm_ops);
create index if not exists parcels_planner_apn_trgm on public.parcels using gin
  (public.planner_apn_key(parcelnumb_no_formatting, parcelnumb) gin_trgm_ops);

create or replace function public.find_planner_parcels(p_query text, p_limit integer default 10)
returns table (ogc_fid integer, address text, parcelnumb text, zoning text)
language plpgsql stable security invoker
set search_path = pg_catalog, public
set plan_cache_mode = force_custom_plan
as $$
declare
  term text := upper(btrim(regexp_replace(translate(p_query, $chars$,*%_()"\$chars$, '        '), '[[:space:]]+', ' ', 'g')));
  apn text := public.planner_apn_key(null, term);
  n integer := least(greatest(coalesce(p_limit, 10), 0), 50);
  address_pattern text;
  apn_pattern text;
begin
  if term is null or length(term) not between 2 and 256 or n = 0 then return; end if;

  return query
    select p.ogc_fid, p.address::text, p.parcelnumb::text, p.zoning::text
    from public.parcels p
    where upper(p.address) = term
       or (apn <> '' and public.planner_apn_key(p.parcelnumb_no_formatting, p.parcelnumb) = apn)
    order by p.ogc_fid limit n;
  if found then return; end if;

  -- A two-character contains search cannot narrow a trigram index. Prefix
  -- matching uses the B-trees for early keystrokes and punctuation-only terms.
  address_pattern := case when term ~ '[[:alnum:]]{3}' then '%' else '' end || term || '%';
  apn_pattern := case when length(apn) >= 3 then '%' else '' end || apn || '%';
  return query
    select p.ogc_fid, p.address::text, p.parcelnumb::text, p.zoning::text
    from public.parcels p
    where upper(p.address) like address_pattern
       or (apn <> '' and public.planner_apn_key(p.parcelnumb_no_formatting, p.parcelnumb) like apn_pattern)
    limit n;
end
$$;
