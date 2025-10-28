-- ===== Reset the planner views =====
DROP VIEW IF EXISTS planner_join CASCADE;
DROP VIEW IF EXISTS planner_zoning CASCADE;
DROP VIEW IF EXISTS planner_parcels CASCADE;

-- ===== planner_parcels: unique id from ogc_fid, keep geoid for joins =====
CREATE VIEW planner_parcels AS
SELECT
  p.ogc_fid::text                                  AS parcel_id,          -- UNIQUE
  NULLIF(p.geoid::text, '')                        AS geoid,              -- may be null/constant; used only for zoning join
  CASE 
    WHEN p.wkb_geometry_4326 IS NOT NULL AND NOT ST_IsEmpty(p.wkb_geometry_4326)
      THEN ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(p.wkb_geometry_4326), 3857), 3))::geometry(MultiPolygon,3857)
    WHEN p.wkb_geometry IS NOT NULL AND NOT ST_IsEmpty(p.wkb_geometry)
      THEN ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(p.wkb_geometry), 3857), 3))::geometry(MultiPolygon,3857)
    ELSE NULL
  END                                              AS geom
FROM public.parcels p
WHERE COALESCE(p.wkb_geometry_4326, p.wkb_geometry) IS NOT NULL
  AND NOT ST_IsEmpty(COALESCE(p.wkb_geometry_4326, p.wkb_geometry));

-- ===== planner_zoning (leave your logic as-is; key is geoid::text) =====
-- If you already deployed a dynamic version, you can keep it.
-- Below is a simple, robust version keyed on geoid::text.
CREATE VIEW planner_zoning AS
SELECT
  z.geoid::text                                    AS parcel_id,          -- this is GEOID, used for join
  z.zoning                                         AS base,
  CASE WHEN z.max_far IS NOT NULL AND z.max_far <> '' AND z.max_far::numeric NOT IN (-5555,-9999)
       THEN z.max_far::numeric ELSE NULL END       AS far_max,
  CASE WHEN z.max_building_height_ft IS NOT NULL AND z.max_building_height_ft <> '' 
            AND z.max_building_height_ft::numeric NOT IN (-5555,-9999)
       THEN z.max_building_height_ft::numeric ELSE NULL END AS height_max_ft,
  jsonb_build_object(
    'front', CASE WHEN z.min_front_setback_ft IS NOT NULL AND z.min_front_setback_ft <> '' THEN z.min_front_setback_ft::numeric ELSE NULL END,
    'side',  CASE WHEN z.min_side_setback_ft  IS NOT NULL AND z.min_side_setback_ft  <> '' THEN z.min_side_setback_ft::numeric  ELSE NULL END,
    'rear',  CASE WHEN z.min_rear_setback_ft  IS NOT NULL AND z.min_rear_setback_ft  <> '' THEN z.min_rear_setback_ft::numeric  ELSE NULL END
  )                                                AS setbacks,
  NULL::numeric                                    AS parking_ratio
FROM public.zoning z;

-- ===== planner_join: join zoning using GEOID carried on planner_parcels =====
CREATE VIEW planner_join AS
SELECT
  p.parcel_id,               -- ogc_fid::text (unique)
  p.geom,
  z.base,
  z.far_max,
  z.height_max_ft,
  z.setbacks,
  z.parking_ratio
FROM planner_parcels p
LEFT JOIN planner_zoning z
  ON z.parcel_id = p.geoid;  -- join by geoid (can be null)

-- Test the fixed views
SELECT 'Testing fixed views...' AS status;

-- Test planner_parcels
SELECT 
  'planner_parcels' AS view_name,
  COUNT(*) AS row_count,
  COUNT(geom) AS has_geom
FROM planner_parcels
WHERE parcel_id = '661807';

-- Test planner_join
SELECT 
  'planner_join' AS view_name,
  COUNT(*) AS row_count,
  far_max,
  setbacks
FROM planner_join
WHERE parcel_id = '661807';

-- Test the function
SELECT 'Testing get_parcel_buildable_envelope...' AS status;
SELECT * FROM public.get_parcel_buildable_envelope(661807);

SELECT 'Fixed views deployed successfully!' AS status;

