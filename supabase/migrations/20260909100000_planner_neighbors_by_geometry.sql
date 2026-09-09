-- 2026-09-09 · Neighbours are measured from the parcel, not from its centroid.
--
-- Eric, on 2400 W Heiman (550510): "We're missing the context of the
-- neighboring lots. In other instances, you show the lots/buildings greyed
-- out."
--
-- fn_planner_neighbors selected parcels whose CENTROID lay within 500 ft of
-- the subject parcel's CENTROID, buildings through those parcels, and roads
-- within 1,500 ft of the centroid. On a 2,381 × 250 ft strip the centroid
-- sits in the middle of the field: the nearest neighbouring centroid is
-- 546 ft away and the nearest road segment 1,083 ft, so the call returned
-- {parcels: [], buildings: [], roads: []} and the plan floated in white
-- space — while 90 parcels and 76 buildings sit within 500 ft of the
-- parcel's boundary.
--
-- Distances are now measured from the parcel geometry (edge to edge, on the
-- geom_2274 GiST index), and the row caps scale with the parcel's perimeter
-- so a long flank is not cut off at the first 60 abutters. Payload shape is
-- unchanged (a `basis` note is added); grants are unchanged.

CREATE OR REPLACE FUNCTION public.fn_planner_neighbors(
  p_ogc_fid integer,
  p_radius_ft numeric DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_geom geometry;
  v_parcels jsonb;
  v_buildings jsonb;
  v_roads jsonb;
  v_parcel_limit int;
  v_building_limit int;
BEGIN
  IF p_ogc_fid IS NULL OR p_ogc_fid <= 0 THEN
    RETURN jsonb_build_object('error', 'valid p_ogc_fid is required');
  END IF;
  IF p_radius_ft IS NULL OR p_radius_ft < 100 OR p_radius_ft > 2000 THEN
    RETURN jsonb_build_object('error', 'p_radius_ft must be between 100 and 2000');
  END IF;

  SELECT geom_2274 INTO v_geom FROM public.parcels WHERE ogc_fid = p_ogc_fid;
  IF v_geom IS NULL THEN
    RETURN jsonb_build_object('error', 'parcel has no geometry');
  END IF;

  -- A long parcel has a long flank: a 5,000-ft perimeter has ~90 abutters
  -- within 500 ft where a house lot has a dozen. Cap by perimeter, bounded.
  v_parcel_limit := LEAST(200, GREATEST(60, ceil(ST_Perimeter(v_geom) / 40.0)::int));
  v_building_limit := LEAST(400, GREATEST(150, v_parcel_limit * 2));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ogc_fid', q.ogc_fid,
           'geom', ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(q.geom_2274, 2), 4326), 6)::jsonb
         )), '[]'::jsonb)
    INTO v_parcels
  FROM (
    SELECT c.ogc_fid, c.geom_2274
    FROM public.parcels c
    WHERE c.ogc_fid <> p_ogc_fid
      AND c.geom_2274 IS NOT NULL
      AND ST_DWithin(c.geom_2274, v_geom, p_radius_ft)
    ORDER BY ST_Distance(c.geom_2274, v_geom)
    LIMIT v_parcel_limit
  ) q;

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
      AND c.geom_2274 IS NOT NULL
      AND ST_DWithin(c.geom_2274, v_geom, p_radius_ft)
      AND b.geom IS NOT NULL
      AND b.ed_bldg_footprint_sqft > 100
    ORDER BY ST_Distance(c.geom_2274, v_geom)
    LIMIT v_building_limit
  ) q;

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
            v_geom,
            GREATEST(p_radius_ft, 1500)
          )
    LIMIT 40
  ) q;

  RETURN jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid,
    'radius_ft', p_radius_ft,
    'basis', 'distance from the parcel boundary; caps scale with the perimeter (2026-09-09)',
    'parcels', v_parcels,
    'buildings', v_buildings,
    'roads', v_roads
  );
END
$function$;
