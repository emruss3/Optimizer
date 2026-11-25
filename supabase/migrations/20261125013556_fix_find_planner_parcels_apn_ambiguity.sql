-- The live parcels table has an apn column. Distinguish the PL/pgSQL
-- variable from that column so the indexed exact-first lookup can run.
CREATE OR REPLACE FUNCTION public.find_planner_parcels(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(ogc_fid integer, address text, parcelnumb text, zoning text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  term text := upper(btrim(regexp_replace(translate(p_query, $chars$,*%_()"\$chars$, '        '), '[[:space:]]+', ' ', 'g')));
  v_search_apn text := public.planner_apn_key(null, term);
  n integer := least(greatest(coalesce(p_limit, 10), 0), 50);
  address_pattern text;
  apn_pattern text;
begin
  if term is null or length(term) not between 2 and 256 or n = 0 then return; end if;

  return query
    select p.ogc_fid, p.address::text, p.parcelnumb::text, p.zoning::text
    from public.parcels p
    where upper(p.address) = term
       or (v_search_apn <> '' and public.planner_apn_key(p.parcelnumb_no_formatting, p.parcelnumb) = v_search_apn)
    order by p.ogc_fid limit n;
  if found then return; end if;

  -- A two-character contains search cannot narrow a trigram index. Prefix
  -- matching uses the B-trees for early keystrokes and punctuation-only terms.
  address_pattern := case when term ~ '[[:alnum:]]{3}' then '%' else '' end || term || '%';
  apn_pattern := case when length(v_search_apn) >= 3 then '%' else '' end || v_search_apn || '%';
  return query
    select p.ogc_fid, p.address::text, p.parcelnumb::text, p.zoning::text
    from public.parcels p
    where upper(p.address) like address_pattern
       or (v_search_apn <> '' and public.planner_apn_key(p.parcelnumb_no_formatting, p.parcelnumb) like apn_pattern)
    limit n;
end
$function$;
