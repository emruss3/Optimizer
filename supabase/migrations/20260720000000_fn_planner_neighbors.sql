-- Neighborhood context for the site planner (work order 2026-07-20 §3a).
--
-- Additive read-only RPC: the subject parcel's surroundings — neighbor
-- parcel outlines, existing Regrid building footprints with stories, and
-- street segments — so a plan renders in its block instead of floating in
-- white space (2D grey context + 3D white massing). We own this data;
-- TestFit rents a basemap.
--
-- Geometry ships as WGS84 GeoJSON (simplified for payload size); the client
-- reprojects into its 3857 canvas frame with the same utility used for the
-- subject parcel. Nothing here measures — display context only.

CREATE OR REPLACE FUNCTION public.fn_planner_neighbors(
  p_ogc_fid integer,
  p_radius_ft numeric DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_center geometry;
  v_radius_m numeric;
  v_parcels jsonb;
  v_buildings jsonb;
  v_roads jsonb;
BEGIN
  IF p_ogc_fid IS NULL OR p_ogc_fid <= 0 THEN
    RETURN jsonb_build_object('error', 'valid p_ogc_fid is required');
  END IF;
  IF p_radius_ft IS NULL OR p_radius_ft < 100 OR p_radius_ft > 2000 THEN
    RETURN jsonb_build_object('error', 'p_radius_ft must be between 100 and 2000');
  END IF;

  SELECT centroid_2274 INTO v_center FROM public.parcels WHERE ogc_fid = p_ogc_fid;
  IF v_center IS NULL THEN
    RETURN jsonb_build_object('error', 'parcel has no centroid');
  END IF;
  v_radius_m := p_radius_ft * 0.3048;

  -- Neighbor parcel outlines (closest first, capped)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ogc_fid', q.ogc_fid,
           'geom', ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(q.geom_2274, 2), 4326), 6)::jsonb
         )), '[]'::jsonb)
    INTO v_parcels
  FROM (
    -- wkb_geometry is NULL for most rows; geom_2274 is the canonical shape
    SELECT c.ogc_fid, c.geom_2274
    FROM public.parcels c
    WHERE c.ogc_fid <> p_ogc_fid
      AND c.centroid_2274 IS NOT NULL
      AND c.geom_2274 IS NOT NULL
      AND ST_DWithin(c.centroid_2274, v_center, p_radius_ft)
    ORDER BY ST_Distance(c.centroid_2274, v_center)
    LIMIT 60
  ) q;

  -- Existing building footprints on those neighbors (Regrid stock + stories)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'geom', ST_AsGeoJSON(ST_SimplifyPreserveTopology(q.geom, 0.000005), 6)::jsonb,
           'stories', q.stories,
           'footprint_sqft', q.footprint_sqft
         )), '[]'::jsonb)
    INTO v_buildings
  FROM (
    SELECT b.geom,
           CASE WHEN b.ed_stories ~ '^[0-9]+([.][0-9]+)?$'
                THEN LEAST(20, GREATEST(1, b.ed_stories::numeric))
                ELSE 1 END AS stories,
           b.ed_bldg_footprint_sqft AS footprint_sqft
    FROM public.parcels c
    JOIN public.building_parcel_join j ON j.ll_uuid = c.ll_uuid::text
    JOIN public.buildings b ON b.ed_bld_uuid = j.ed_bld_uuid
    WHERE c.ogc_fid <> p_ogc_fid
      AND c.centroid_2274 IS NOT NULL
      AND ST_DWithin(c.centroid_2274, v_center, p_radius_ft)
      AND b.geom IS NOT NULL
      AND b.ed_bldg_footprint_sqft > 100
    ORDER BY ST_Distance(c.centroid_2274, v_center)
    LIMIT 150
  ) q;

  -- Street segments through the neighborhood (drawn as street edges).
  -- roads.geom is SRID 3857 — simplify in metres, output as WGS84 so the
  -- whole payload shares one frame.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'geom', ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(q.geom, 1), 4326), 6)::jsonb,
           'name', q.name,
           'highway', q.highway
         )), '[]'::jsonb)
    INTO v_roads
  FROM (
    SELECT r.geom, r.name, r.highway
    FROM public.roads r
    WHERE r.geom IS NOT NULL
      AND ST_DWithin(
            ST_Transform(r.geom, 2274),
            v_center,
            GREATEST(p_radius_ft, 1500)  -- roads corpus is sparse; reach the corridor
          )
    LIMIT 40
  ) q;

  RETURN jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid,
    'radius_ft', p_radius_ft,
    'parcels', v_parcels,
    'buildings', v_buildings,
    'roads', v_roads
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.fn_planner_neighbors(integer, numeric) TO anon, authenticated, service_role;
