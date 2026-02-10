-- =====================================================
-- get_roads_near_parcel RPC
-- Date: 2026-02-10
-- Description: Fetch roads within a buffer distance of a parcel for
--              front-lot-line / edge classification analysis.
--
-- The parcels table stores geometry in wkb_geometry_4326 (SRID 4326)
-- The roads table stores geometry in geom (SRID 3857)
-- We transform the parcel to 3857 for the spatial join.
-- =====================================================

CREATE OR REPLACE FUNCTION get_roads_near_parcel(
  p_parcel_id integer,
  p_buffer_m  float DEFAULT 60  -- ~200 ft
)
RETURNS TABLE(
  id      int,
  name    text,
  highway text,
  geom    geometry
)
AS $$
  SELECT r.id,
         r.name,
         r.highway,
         r.geom
  FROM   roads   r,
         parcels p
  WHERE  p.ogc_fid = p_parcel_id
    AND  ST_DWithin(
           r.geom,
           ST_Transform(p.wkb_geometry_4326, 3857),
           p_buffer_m
         );
$$ LANGUAGE sql STABLE;

-- Allow both anon and authenticated callers (read-only)
GRANT EXECUTE ON FUNCTION get_roads_near_parcel(integer, float) TO anon, authenticated;

COMMENT ON FUNCTION get_roads_near_parcel IS
  'Returns roads within p_buffer_m metres of a parcel. Used for front-lot-line classification.';
