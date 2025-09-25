-- Final function to identify parcel front edge using actual road data
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
  nearest_road_info JSONB,
  edge_analysis JSONB,
  parcel_metrics JSONB
) AS $$
DECLARE
  parcel_geom GEOMETRY;
  parcel_3857 GEOMETRY;
  edge_geoms GEOMETRY[];
  front_edge_idx INTEGER := 1;
  min_road_distance NUMERIC := 999999;
  nearest_road_name TEXT := 'Unknown';
  buildable_geom GEOMETRY;
  front_edge GEOMETRY;
  road_count INTEGER := 0;
BEGIN
  -- Get the parcel geometry
  SELECT ST_Transform(geom, 3857)
  INTO parcel_3857
  FROM public.parcels 
  WHERE public.parcels.ogc_fid = p_ogc_fid;
  
  IF parcel_3857 IS NULL THEN
    RAISE EXCEPTION 'Parcel not found: %', p_ogc_fid;
  END IF;
  
  -- Check if we have road data
  SELECT COUNT(*) INTO road_count FROM public.roads;
  
  -- Break parcel into individual edges
  WITH boundary_points AS (
    SELECT (ST_DumpPoints(ST_Boundary(parcel_3857))).geom as pt
  ),
  numbered_points AS (
    SELECT pt, ROW_NUMBER() OVER() as point_num
    FROM boundary_points
  ),
  edges AS (
    SELECT 
      ST_MakeLine(p1.pt, p2.pt) as edge_geom,
      p1.point_num as edge_num
    FROM numbered_points p1
    JOIN numbered_points p2 ON p2.point_num = p1.point_num + 1
    UNION ALL
    SELECT 
      ST_MakeLine(plast.pt, pfirst.pt) as edge_geom,
      plast.point_num as edge_num
    FROM numbered_points plast
    CROSS JOIN numbered_points pfirst
    WHERE plast.point_num = (SELECT MAX(point_num) FROM numbered_points)
    AND pfirst.point_num = 1
  )
  SELECT array_agg(edge_geom ORDER BY edge_num)
  INTO edge_geoms
  FROM edges
  WHERE edge_geom IS NOT NULL AND ST_Length(edge_geom) > 1; -- Filter out tiny edges
  
  -- Find the edge closest to roads (if we have road data)
  IF road_count > 0 THEN
    FOR i IN 1..array_length(edge_geoms, 1) LOOP
      DECLARE
        current_edge GEOMETRY := edge_geoms[i];
        road_distance NUMERIC;
        road_name TEXT;
      BEGIN
        -- Find nearest road to this edge
        SELECT 
          ST_Distance(current_edge, r.geom) as distance,
          r.name
        INTO road_distance, road_name
        FROM public.roads r
        WHERE ST_DWithin(current_edge, r.geom, 200) -- 200 meter search radius
        ORDER BY ST_Distance(current_edge, r.geom)
        LIMIT 1;
        
        -- Track the closest edge to roads
        IF road_distance IS NOT NULL AND road_distance < min_road_distance THEN
          min_road_distance := road_distance;
          front_edge_idx := i;
          nearest_road_name := road_name;
        END IF;
      END;
    END LOOP;
  ELSE
    -- Fallback: Use longest edge as front (common heuristic)
    SELECT array_position(
      ARRAY(SELECT ST_Length(edge) FROM unnest(edge_geoms) edge),
      max_length
    )
    INTO front_edge_idx
    FROM (SELECT MAX(ST_Length(edge)) as max_length FROM unnest(edge_geoms) edge) t;
    
    nearest_road_name := 'No road data - using longest edge';
  END IF;
  
  -- Get the front edge
  front_edge := edge_geoms[front_edge_idx];
  
  -- Create buildable envelope by applying uniform setback for now
  -- In production, this would apply different setbacks to different edge types
  buildable_geom := ST_Buffer(parcel_3857, -GREATEST(p_front_setback, p_rear_setback, p_side_setback) / 3.28084);
  
  -- Ensure buildable envelope is valid
  IF ST_IsEmpty(buildable_geom) OR ST_Area(buildable_geom) < 50 THEN
    -- Create a simple rectangular buildable area
    buildable_geom := ST_MakeEnvelope(
      ST_XMin(parcel_3857) + (p_side_setback / 3.28084),
      ST_YMin(parcel_3857) + (p_rear_setback / 3.28084),
      ST_XMax(parcel_3857) - (p_side_setback / 3.28084),
      ST_YMax(parcel_3857) - (p_front_setback / 3.28084),
      3857
    );
  END IF;
  
  -- Return results
  RETURN QUERY SELECT
    p_ogc_fid,
    ST_AsGeoJSON(ST_Transform(parcel_3857, 4326))::JSONB,
    ST_AsGeoJSON(ST_Transform(buildable_geom, 4326))::JSONB,
    ST_AsGeoJSON(ST_Transform(front_edge, 4326))::JSONB,
    jsonb_build_object(
      'nearest_road_name', nearest_road_name,
      'distance_to_road_ft', min_road_distance * 3.28084,
      'road_count_in_db', road_count,
      'method', CASE WHEN road_count > 0 THEN 'road_proximity' ELSE 'longest_edge_fallback' END
    ),
    jsonb_build_object(
      'total_edges', array_length(edge_geoms, 1),
      'front_edge_index', front_edge_idx,
      'front_edge_length_ft', ST_Length(front_edge) * 3.28084,
      'has_road_data', road_count > 0
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



