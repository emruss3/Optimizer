-- =====================================================
-- Create Roads Table for Front Lot Line Analysis
-- Date: 2025-01-16
-- Description: Create roads table for proper front lot line identification
-- =====================================================

-- Create roads table for storing street centerline data
CREATE TABLE IF NOT EXISTS public.roads (
  id SERIAL PRIMARY KEY,
  osm_id BIGINT,
  name TEXT,
  highway TEXT, -- OSM highway classification: 'primary', 'secondary', 'residential', etc.
  surface TEXT,
  lanes INTEGER,
  oneway BOOLEAN DEFAULT false,
  maxspeed TEXT,
  geom GEOMETRY(LINESTRING, 3857), -- Web Mercator projection
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create spatial index for fast proximity queries
CREATE INDEX IF NOT EXISTS idx_roads_geom ON public.roads USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_roads_name ON public.roads(name);
CREATE INDEX IF NOT EXISTS idx_roads_highway ON public.roads(highway);

-- Grant permissions
GRANT SELECT ON public.roads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.roads TO authenticated;
GRANT USAGE ON SEQUENCE roads_id_seq TO authenticated;

-- =====================================================
-- Sample data insertion (for testing)
-- =====================================================

-- Insert sample road data for the Jefferson St area (for testing)
-- In production, this would be replaced with actual OSM import
INSERT INTO public.roads (osm_id, name, highway, geom) VALUES
(
  12345,
  'Jefferson St',
  'residential',
  ST_Transform(
    ST_GeomFromText('LINESTRING(-96.7970 33.1581, -96.7968 33.1579)', 4326),
    3857
  )
),
(
  12346,
  'Main St',
  'primary',
  ST_Transform(
    ST_GeomFromText('LINESTRING(-96.7975 33.1585, -96.7965 33.1575)', 4326),
    3857
  )
);

-- =====================================================
-- Instructions for importing real road data:
-- =====================================================

-- OPTION 1: Import from OpenStreetMap using osm2pgsql
-- 1. Download OSM data for your area from https://download.geofabrik.de/
-- 2. Install osm2pgsql: https://osm2pgsql.org/doc/install.html
-- 3. Run: osm2pgsql -d your_database -H localhost -U postgres --hstore-all your_area.osm.pbf
-- 4. Copy highway data to roads table:
--
-- INSERT INTO public.roads (osm_id, name, highway, geom)
-- SELECT 
--   osm_id,
--   COALESCE(tags->'name', 'Unnamed Road'),
--   tags->'highway',
--   ST_Transform(way, 3857)
-- FROM planet_osm_line 
-- WHERE tags->'highway' IN ('primary', 'secondary', 'residential', 'tertiary', 'trunk');

-- OPTION 2: Import from Mapbox Streets dataset
-- If you have access to Mapbox Streets data, you can import it directly

-- OPTION 3: Use local government street centerline data
-- Many municipalities provide street centerline shapefiles that can be imported

-- =====================================================
-- Update the parcel front edge function to use roads
-- =====================================================

-- Now update the get_parcel_front_edge_with_roads function to use this table
-- Uncomment the road proximity query in that function once you have road data

COMMENT ON TABLE public.roads IS 'Street centerline data for front lot line identification';
COMMENT ON COLUMN public.roads.highway IS 'OSM highway classification: primary, secondary, residential, etc.';
COMMENT ON COLUMN public.roads.geom IS 'Street centerline geometry in Web Mercator (EPSG:3857)';



