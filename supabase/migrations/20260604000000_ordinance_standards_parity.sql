-- PARITY EXPORT — already applied to project okxrvetbzpoazrybhcqj (live).
-- Original migration applied outside tracked history; regenerated from the
-- live catalog + data export on 2026-07-14. Functional parity verified;
-- byte-fidelity to the original script not guaranteed.
-- Owner: context-engine agent. Do not reapply blindly.
--
-- Real Metro Nashville Code §17.12.020 dimensional standards (Tables A/B/
-- B.1/C): 109 rows across district × use_class, keyed by jurisdiction so a
-- second county loads data, not code. Data inserts are guarded (skip when
-- the table is already populated).

CREATE TABLE IF NOT EXISTS public.jurisdictions (
  county_fips text NOT NULL,
  jurisdiction_key text NOT NULL,
  local_srid integer NOT NULL,
  name text,
  PRIMARY KEY (jurisdiction_key)
);

CREATE TABLE IF NOT EXISTS public.jurisdiction_zoning_standards (
  jurisdiction text NOT NULL,
  district text NOT NULL,
  use_class text NOT NULL,
  min_lot_area_sqft numeric,
  max_far numeric,
  max_isr numeric,
  max_density_du_acre numeric,
  front_setback_ft numeric,
  side_setback_ft numeric,
  rear_setback_ft numeric,
  max_height_ft numeric,
  max_height_stories numeric,
  source text NOT NULL,
  notes text
);

CREATE OR REPLACE FUNCTION public.fn_ordinance_standards(p_district text, p_use_class text, p_county_fips text DEFAULT '47037'::text)
 RETURNS jurisdiction_zoning_standards
 LANGUAGE sql
 STABLE
AS $function$
  SELECT s.* FROM public.jurisdiction_zoning_standards s
  JOIN public.jurisdictions j ON j.jurisdiction_key = s.jurisdiction
  WHERE j.county_fips = p_county_fips
    AND upper(s.district) = upper(regexp_replace(coalesce(p_district,''), '-NS$', '', 'i'))
    AND s.use_class = p_use_class
  LIMIT 1;
$function$;

DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jurisdictions) THEN
    INSERT INTO public.jurisdictions (county_fips, jurisdiction_key, local_srid, name) VALUES
('47037','nashville_davidson_tn_47037',2274,'Metro Nashville / Davidson County, TN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jurisdiction_zoning_standards) THEN
    INSERT INTO public.jurisdiction_zoning_standards
      (jurisdiction, district, use_class, min_lot_area_sqft, max_far, max_isr,
       max_density_du_acre, front_setback_ft, side_setback_ft, rear_setback_ft,
       max_height_ft, max_height_stories, source, notes) VALUES
('nashville_davidson_tn_47037','AG','sf_two_family',217800,0.20,NULL,NULL,20,20,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','AR2a','sf_two_family',87120,0.20,NULL,NULL,20,20,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','CA','mixed_nonres',NULL,0.60,0.90,NULL,20,NULL,20,30,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','CF','mixed_nonres',NULL,5.00,1.00,NULL,20,NULL,NULL,65,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','CL','mixed_nonres',NULL,0.60,0.90,NULL,20,NULL,20,30,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','CN','mixed_nonres',NULL,0.25,0.80,NULL,20,NULL,20,20,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','CS','mixed_nonres',NULL,0.60,0.90,NULL,20,NULL,20,30,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','IG','mixed_nonres',NULL,0.60,0.90,NULL,20,NULL,20,60,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','IR','mixed_nonres',NULL,0.60,0.90,NULL,20,NULL,20,45,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','IWD','mixed_nonres',NULL,0.80,0.90,NULL,20,NULL,20,30,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','MUG','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUG','mixed_nonres',NULL,3.00,0.90,NULL,20,NULL,20,75,5,'17.12.020C',NULL),
('nashville_davidson_tn_47037','MUG','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','MUG-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUG-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','MUI','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUI','mixed_nonres',NULL,5.00,1.00,NULL,20,NULL,NULL,105,7,'17.12.020C',NULL),
('nashville_davidson_tn_47037','MUI','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','MUI-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUI-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','MUL','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUL','mixed_nonres',NULL,1.00,0.90,NULL,20,NULL,20,45,3,'17.12.020C',NULL),
('nashville_davidson_tn_47037','MUL','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','MUL-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUL-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','MUN','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUN','mixed_nonres',NULL,0.60,0.80,NULL,20,NULL,20,45,3,'17.12.020C',NULL),
('nashville_davidson_tn_47037','MUN','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','MUN-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','MUN-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','OG','mixed_nonres',NULL,1.50,0.80,NULL,20,5,20,30,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','OL','mixed_nonres',NULL,0.75,0.70,NULL,20,5,20,30,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','ON','mixed_nonres',NULL,0.40,0.60,NULL,20,5,20,20,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','ON','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','OR20','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','OR20','multifamily_nonres',7500,0.80,0.70,20,20,5,20,30,NULL,'17.12.020B','No max FAR for MF per Note 2; FAR shown applies otherwise'),
('nashville_davidson_tn_47037','OR20','sf_two_family',3750,0.60,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','OR20-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','OR20-A','sf_two_family',3750,0.60,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','OR40','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','OR40','multifamily_nonres',6000,1.00,0.75,40,20,5,20,45,NULL,'17.12.020B','No max FAR for MF per Note 2; FAR shown applies otherwise'),
('nashville_davidson_tn_47037','OR40','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','OR40-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','OR40-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','ORI','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','ORI','mixed_nonres',NULL,3.00,0.90,NULL,20,NULL,20,65,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','ORI','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','ORI-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','ORI-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R10','sf_two_family',10000,0.40,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R15','sf_two_family',15000,0.35,NULL,NULL,20,10,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R20','sf_two_family',20000,0.35,NULL,NULL,20,10,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R30','sf_two_family',30000,0.30,NULL,NULL,20,15,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R40','sf_two_family',40000,0.25,NULL,NULL,20,15,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R6','sf_two_family',6000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R6-A','sf_two_family',6000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R8','sf_two_family',8000,0.45,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R80','sf_two_family',80000,0.20,NULL,NULL,20,20,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','R8-A','sf_two_family',8000,0.45,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM100-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM15','attached',1800,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM15','multifamily_nonres',10000,0.75,0.70,15,20,10,20,20,NULL,'17.12.020B','No max FAR for MF per Note 2; FAR shown applies otherwise'),
('nashville_davidson_tn_47037','RM15','sf_two_family',5000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM15-A','attached',1800,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM15-A','sf_two_family',5000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM2','attached',2800,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM2','multifamily_nonres',66000,0.40,0.60,2,20,20,20,20,NULL,'17.12.020B',NULL),
('nashville_davidson_tn_47037','RM2','sf_two_family',20000,0.35,NULL,NULL,20,15,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM20','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM20','multifamily_nonres',7500,0.80,0.70,20,20,5,20,30,NULL,'17.12.020B','No max FAR for MF per Note 2; FAR shown applies otherwise'),
('nashville_davidson_tn_47037','RM20','sf_two_family',3750,0.60,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM20-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM20-A','sf_two_family',3750,0.60,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM4','attached',2800,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM4','multifamily_nonres',33000,0.40,0.60,4,20,10,20,20,NULL,'17.12.020B',NULL),
('nashville_davidson_tn_47037','RM4','sf_two_family',10000,0.40,NULL,NULL,20,10,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM40','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM40','multifamily_nonres',6000,1.00,0.75,40,20,5,20,45,NULL,'17.12.020B','No max FAR for MF per Note 2; FAR shown applies otherwise'),
('nashville_davidson_tn_47037','RM40','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM40-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM40-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM6','attached',2800,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM6','multifamily_nonres',22000,0.60,0.70,6,20,10,20,20,NULL,'17.12.020B',NULL),
('nashville_davidson_tn_47037','RM6','sf_two_family',6000,0.50,NULL,NULL,20,10,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM60','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM60','multifamily_nonres',6000,1.25,0.80,60,20,5,20,65,NULL,'17.12.020B','No max FAR for MF per Note 2; FAR shown applies otherwise'),
('nashville_davidson_tn_47037','RM60','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM60-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM80-A','attached',1500,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM9','attached',2800,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM9','multifamily_nonres',15000,0.60,0.70,9,20,10,20,20,NULL,'17.12.020B',NULL),
('nashville_davidson_tn_47037','RM9','sf_two_family',5000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RM9-A','attached',2800,NULL,NULL,NULL,NULL,5,5,NULL,3,'17.12.020B.1','side=0 common wall / 5 end unit'),
('nashville_davidson_tn_47037','RM9-A','sf_two_family',5000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS10','sf_two_family',10000,0.40,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS15','sf_two_family',15000,0.35,NULL,NULL,20,10,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS20','sf_two_family',20000,0.35,NULL,NULL,20,10,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS30','sf_two_family',30000,0.30,NULL,NULL,20,15,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS3.75','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS3.75-A','sf_two_family',3750,0.60,NULL,NULL,20,3,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS40','sf_two_family',40000,0.25,NULL,NULL,20,15,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS5','sf_two_family',5000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS5-A','sf_two_family',5000,0.50,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS7.5','sf_two_family',7500,0.45,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS7.5-A','sf_two_family',7500,0.45,NULL,NULL,20,5,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','RS80','sf_two_family',80000,0.20,NULL,NULL,20,20,20,NULL,3,'17.12.020A','front=local-street std per 17.12.030 (40ft non-local; contextual may apply)'),
('nashville_davidson_tn_47037','SCC','mixed_nonres',NULL,0.50,0.80,NULL,20,NULL,20,30,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','SCN','mixed_nonres',NULL,0.25,0.80,NULL,20,NULL,20,20,NULL,'17.12.020C',NULL),
('nashville_davidson_tn_47037','SCR','mixed_nonres',NULL,1.00,0.80,NULL,20,NULL,20,30,NULL,'17.12.020C',NULL);
  END IF;
END $seed$;
