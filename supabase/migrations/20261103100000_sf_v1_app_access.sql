-- 2026-11-03 · The by-right subdivision generator (sf_v1) for the app.
--
-- fn_sf_v1_plan / fn_th_v3_site exist in the database (sources in the Real
-- Estate Optimizer project: code/sf_v1_functions.sql, code/th_v3_functions.sql)
-- and are granted to anon, but they call helpers that are not
-- (fn_site_inputs, the fn_th_v3_* family) and read tables the anon role may
-- not: as anon the plan fails with "permission denied for function
-- fn_site_inputs". The handoff says to call them with the service role; the
-- app calls RPCs with the anon key like every other generator, so these
-- SECURITY DEFINER wrappers are the service role the app gets — owned by
-- postgres, search_path pinned, nothing else widened.
--
--   fn_sf_v1_plan_app(ogc_fid, opt)      the plan (by right, or the override in opt)
--   fn_sf_v1_site_app(ogc_fid, flood)    the site's no-build land (wetlands, the flood hold) for the sheet
--   fn_sf_v1_pad_fill(ogc_fid, pads, t)  fill per pad to the pad target, from the parcel's DEM (the fill-depth view)
--   fn_sf_v1_bfe_contour(ogc_fid, bfe)   the ground-at-BFE contour from the DEM (st_contour), WKT 2274

CREATE OR REPLACE FUNCTION public.fn_sf_v1_plan_app(p_ogc_fid integer, p_opt jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.fn_sf_v1_plan(p_ogc_fid, coalesce(p_opt, '{}'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.fn_sf_v1_site_app(p_ogc_fid integer, p_flood text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE s jsonb;
BEGIN
  s := public.fn_th_v3_site(p_ogc_fid, p_flood);
  IF s IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'ogc_fid', p_ogc_fid,
    'flood_hold', s->>'flood_hold',
    'held_acres', s->'held_acres',
    'site_acres', s->'site_acres',
    'nobuild_wkt', s->>'nobuild_wkt',
    'hold_wkt', s->>'hold_wkt',
    'site_wkt', s->>'site_wkt');
END $function$;

-- Fill per pad: the pad target less the mean ground under the pad (the DEM's
-- cells clipped to the pad; the centre cell when the pad is smaller than a
-- cell), never negative. One number per pad in the order of the pads layer.
CREATE OR REPLACE FUNCTION public.fn_sf_v1_pad_fill(p_ogc_fid integer, p_pads_wkt text, p_pad_target_ft double precision)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE r raster; out jsonb := '[]'::jsonb; v double precision; d record;
BEGIN
  SELECT rast INTO r FROM public.parcel_topo WHERE ogc_fid = p_ogc_fid;
  IF r IS NULL OR p_pads_wkt IS NULL OR p_pad_target_ft IS NULL THEN RETURN NULL; END IF;
  FOR d IN SELECT (ST_Dump(ST_SetSRID(ST_GeomFromText(p_pads_wkt), ST_SRID(r)))).geom AS geom LOOP
    v := NULL;
    BEGIN
      SELECT (ST_SummaryStats(ST_Clip(r, d.geom, true), 1, true)).mean INTO v;
    EXCEPTION WHEN others THEN v := NULL; END;
    IF v IS NULL THEN
      BEGIN v := ST_Value(r, 1, ST_Centroid(d.geom), true); EXCEPTION WHEN others THEN v := NULL; END;
    END IF;
    out := out || to_jsonb(CASE WHEN v IS NULL THEN NULL ELSE round(GREATEST(0, p_pad_target_ft - v)::numeric, 1) END);
  END LOOP;
  RETURN out;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_sf_v1_bfe_contour(p_ogc_fid integer, p_bfe_ft double precision)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT ST_AsText(ST_Collect(c.geom))
  FROM public.parcel_topo t, LATERAL ST_Contour(t.rast, 1, 1.0, 0.0, ARRAY[p_bfe_ft]::double precision[]) c
  WHERE t.ogc_fid = p_ogc_fid;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_sf_v1_plan_app(integer, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_sf_v1_site_app(integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_sf_v1_pad_fill(integer, text, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_sf_v1_bfe_contour(integer, double precision) TO anon, authenticated, service_role;
