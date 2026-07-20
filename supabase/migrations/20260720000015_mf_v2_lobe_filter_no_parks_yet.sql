-- P0-4 companion: the EARLY connectivity filter deleted drive-connected
-- buildings whenever no parking existed YET (the compact-plex path builds
-- its parking in the later supplemental passes) — 'disconnected_site_lobe
-- _excluded' erased the freshly placed block. The early filter now
-- tolerates the no-parks-yet state (drive proximity still required); the
-- FINAL hard gates still enforce bar-to-parking distance and stall
-- sufficiency at the end, so nothing dishonest can render.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> 'c7f4dff093155ef315608a7b3cf25a6c' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected c7f4dff093155ef315608a7b3cf25a6c', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $u1o$    IF ST_DWithin(bars_arr[k],drives,GREATEST(40,stall_d+aisle/2))
       AND parks IS NOT NULL
       AND NOT ST_IsEmpty(parks)
       AND ST_DWithin(ST_Centroid(bars_arr[k]),parks,250) THEN$u1o$, $u1n$    IF ST_DWithin(bars_arr[k],drives,GREATEST(40,stall_d+aisle/2))
       AND (parks IS NULL OR ST_IsEmpty(parks)
            OR ST_DWithin(ST_Centroid(bars_arr[k]),parks,250)) THEN$u1n$);

  IF md5(v_new) <> 'd8863e829375dc9c50934161db2d2215' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected d8863e829375dc9c50934161db2d2215', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
