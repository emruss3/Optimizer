-- Order-8 audit: 19.1% of the multifamily universe (7,254 parcels) sits in
-- "-A" alternative districts (MUL-A, RM20-A, MUG-A, MUI-A, ORI-A, MUN-A,
-- RM15-A, RM40-A, OR20-A, ...) whose bulk-standards rows
-- (multifamily_nonres / mixed_nonres) are absent from
-- jurisdiction_zoning_standards — the compiler then carries NULL
-- height/FAR/density and fn_max_buildout silently assumes 3 stories
-- (1917 Broadway, MUI-A: 7,750 GSF where the district allows 105 ft / FAR 5).
-- Per Metro 17.12, an "-A" alternative district carries the base district's
-- bulk standards (the suffix adds 17.12.030 design standards); "-NS" only
-- removes short-term rental. Resolution now prefers the exact district, then
-- falls back to the base district with "-A" stripped. Rows that already exist
-- for the exact variant (attached / sf_two_family) keep winning.

CREATE OR REPLACE FUNCTION public.fn_ordinance_standards(p_district text, p_use_class text, p_county_fips text DEFAULT '47037'::text)
 RETURNS jurisdiction_zoning_standards
 LANGUAGE sql
 STABLE
AS $function$
  WITH d AS (
    SELECT upper(regexp_replace(coalesce(p_district,''), '-NS$', '', 'i')) AS exact_d
  ), d2 AS (
    SELECT exact_d, regexp_replace(exact_d, '-A$', '', 'i') AS base_d FROM d
  )
  SELECT s.* FROM public.jurisdiction_zoning_standards s
  JOIN public.jurisdictions j ON j.jurisdiction_key = s.jurisdiction
  CROSS JOIN d2
  WHERE j.county_fips = p_county_fips
    AND upper(s.district) IN (d2.exact_d, d2.base_d)
    AND s.use_class = p_use_class
  ORDER BY (upper(s.district) = d2.exact_d) DESC
  LIMIT 1;
$function$;
