-- Function to identify parcel front edge using road proximity analysis
-- This function can work with OpenStreetMap road data or any road dataset
CREATE OR REPLACE FUNCTION get_parcel_front_edge_with_roads(
  p_ogc_fid INTEGER,
  p_front_setback NUMERIC DEFAULT 25,
  p_rear_setback NUMERIC DEFAULT 20,
  p_side_setback NUMERIC DEFAULT 15
)
RETURNS TABLE (
  ogc_fid INTEGER,
  parcel_geom_geojson JSONB,
  buildable_envelope_geojson JSONB,
  front_edge_geojson JSONB,
  rear_edge_geojson JSONB,
  side_edges_geojson JSONB[],
  nearest_road_info JSONB,
  edge_analysis JSONB,
  parcel_metrics JSONB
) AS $$
DECLARE
  parcel_geom GEOMETRY;
  parcel_3857 GEOMETRY;
  edge_geoms GEOMETRY[];
  edge_distances NUMERIC[];
  front_edge_idx INTEGER;
  rear_edge_idx INTEGER;
  min_road_distance NUMERIC := 999999;
  nearest_road_name TEXT;
  buildable_geom GEOMETRY;
  front_edge GEOMETRY;
  rear_edge GEOMETRY;
  side_edges GEOMETRY[];
  road_search_buffer NUMERIC := 100; -- 100 meter search radius for roads
BEGIN
  -- Get the parcel geometry
  SELECT ST_Transform(geom, 3857)
  INTO parcel_3857
  FROM public.parcels 
  WHERE public.parcels.ogc_fid = p_ogc_fid;
  
  IF parcel_3857 IS NULL THEN
    RAISE EXCEPTION 'Parcel not found: %', p_ogc_fid;
  END IF;
  
  -- Break parcel into individual edges using ST_Dump
  WITH parcel_boundary AS (
    SELECT ST_Boundary(parcel_3857) as boundary_geom
  ),
  edge_dump AS (
    SELECT (ST_Dump(boundary_geom)).geom as edge_geom
    FROM parcel_boundary
  )
  SELECT array_agg(edge_geom ORDER BY ST_Length(edge_geom) DESC)
  INTO edge_geoms
  FROM edge_dump;
  
  -- Initialize arrays
  edge_distances := ARRAY[]::NUMERIC[];
  side_edges := ARRAY[]::GEOMETRY[];
  
  -- For each edge, find the distance to the nearest road
  -- This would work with OSM data or any road table like:
  -- CREATE TABLE roads (id SERIAL, name TEXT, geom GEOMETRY(LINESTRING, 3857));
  
  FOR i IN 1..array_length(edge_geoms, 1) LOOP
    DECLARE
      current_edge GEOMETRY := edge_geoms[i];
      road_distance NUMERIC;
      road_name TEXT;
    BEGIN
      -- Try to find nearest road (this would be your actual road table)
      -- For now, we'll use a placeholder that could work with OSM data:
      
      /*
      -- UNCOMMENT THIS WHEN YOU HAVE ROAD DATA:
      SELECT 
        ST_Distance(current_edge, r.geom) as distance,
        r.name
      INTO road_distance, road_name
      FROM roads r
      WHERE ST_DWithin(current_edge, r.geom, road_search_buffer)
      ORDER BY ST_Distance(current_edge, r.geom)
      LIMIT 1;
      */
      
      -- TEMPORARY: Use edge length as proxy for road frontage
      -- Longer edges are more likely to face streets
      road_distance := 1000 - ST_Length(current_edge); -- Invert so longer = smaller distance
      road_name := 'Unknown Street';
      
      edge_distances := edge_distances || COALESCE(road_distance, 999999);
      
      -- Track the closest edge to roads
      IF road_distance < min_road_distance THEN
        min_road_distance := road_distance;
        front_edge_idx := i;
        nearest_road_name := road_name;
      END IF;
    END;
  END LOOP;
  
  -- Identify front edge (closest to road)
  front_edge := edge_geoms[front_edge_idx];
  
  -- Identify rear edge (opposite to front, or furthest from roads)
  IF array_length(edge_geoms, 1) = 4 THEN
    -- For rectangular parcels, rear is opposite
    rear_edge_idx := CASE 
      WHEN front_edge_idx <= 2 THEN front_edge_idx + 2
      ELSE front_edge_idx - 2
    END;
    IF rear_edge_idx > array_length(edge_geoms, 1) THEN
      rear_edge_idx := rear_edge_idx - array_length(edge_geoms, 1);
    END IF;
  ELSE
    -- For irregular parcels, find the edge furthest from roads
    SELECT array_position(edge_distances, max_dist)
    INTO rear_edge_idx
    FROM (SELECT MAX(dist) as max_dist FROM unnest(edge_distances) dist) t;
  END IF;
  
  rear_edge := edge_geoms[rear_edge_idx];
  
  -- Collect side edges (all edges that are not front or rear)
  FOR i IN 1..array_length(edge_geoms, 1) LOOP
    IF i != front_edge_idx AND i != rear_edge_idx THEN
      side_edges := side_edges || edge_geoms[i];
    END IF;
  END LOOP;
  
  -- Create buildable envelope by buffering inward from each edge type
  buildable_geom := parcel_3857;
  
  -- Apply front setback
  buildable_geom := ST_Difference(
    buildable_geom,
    ST_Buffer(front_edge, p_front_setback / 3.28084, 'side=right')
  );
  
  -- Apply rear setback
  buildable_geom := ST_Difference(
    buildable_geom,
    ST_Buffer(rear_edge, p_rear_setback / 3.28084, 'side=right')
  );
  
  -- Apply side setbacks
  FOR i IN 1..array_length(side_edges, 1) LOOP
    buildable_geom := ST_Difference(
      buildable_geom,
      ST_Buffer(side_edges[i], p_side_setback / 3.28084, 'side=right')
    );
  END LOOP;
  
  -- Ensure buildable envelope is valid
  IF ST_IsEmpty(buildable_geom) OR ST_Area(buildable_geom) < 100 THEN
    -- Fallback to uniform buffer if complex geometry fails
    buildable_geom := ST_Buffer(parcel_3857, -LEAST(p_front_setback, p_rear_setback, p_side_setback) / 3.28084);
  END IF;
  
  -- Return results
  RETURN QUERY SELECT
    p_ogc_fid,
    ST_AsGeoJSON(ST_Transform(parcel_3857, 4326))::JSONB,
    ST_AsGeoJSON(ST_Transform(buildable_geom, 4326))::JSONB,
    ST_AsGeoJSON(ST_Transform(front_edge, 4326))::JSONB,
    ST_AsGeoJSON(ST_Transform(rear_edge, 4326))::JSONB,
    ARRAY(SELECT ST_AsGeoJSON(ST_Transform(se, 4326))::JSONB FROM unnest(side_edges) se),
    jsonb_build_object(
      'nearest_road_name', nearest_road_name,
      'distance_to_road_ft', min_road_distance * 3.28084,
      'method', 'edge_length_proxy'
    ),
    jsonb_build_object(
      'total_edges', array_length(edge_geoms, 1),
      'front_edge_index', front_edge_idx,
      'rear_edge_index', rear_edge_idx,
      'front_edge_length_ft', ST_Length(front_edge) * 3.28084,
      'rear_edge_length_ft', ST_Length(rear_edge) * 3.28084,
      'side_edge_count', array_length(side_edges, 1)
    ),
    jsonb_build_object(
      'parcel_area_sqft', ST_Area(parcel_3857) * 10.764,
      'buildable_area_sqft', ST_Area(buildable_geom) * 10.764,
      'buildable_ratio', (ST_Area(buildable_geom) / ST_Area(parcel_3857)),
      'front_setback_ft', p_front_setback,
      'rear_setback_ft', p_rear_setback,
      'side_setback_ft', p_side_setback
    );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_parcel_front_edge_with_roads(INTEGER, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;

-- =====================================================
-- Instructions for adding road data:
-- =====================================================
-- 
-- To use this function with actual road data, you need to:
-- 
-- 1. Import OpenStreetMap road data:
--    CREATE TABLE roads (
--      id SERIAL PRIMARY KEY,
--      osm_id BIGINT,
--      name TEXT,
--      highway TEXT, -- 'primary', 'secondary', 'residential', etc.
--      geom GEOMETRY(LINESTRING, 3857)
--    );
--    CREATE INDEX idx_roads_geom ON roads USING GIST(geom);
-- 
-- 2. Uncomment the road proximity query in the function above
-- 
-- 3. You can import OSM data using:
--    - osm2pgsql tool
--    - QGIS QuickOSM plugin
--    - Overpass API queries
-- 
-- Example OSM import command:
-- osm2pgsql -d your_database -H localhost -U postgres --hstore-all --style openstreetmap-carto.style your_area.osm.pbf
--
-- =====================================================



