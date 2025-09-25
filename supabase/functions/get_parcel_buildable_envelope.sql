-- Function to determine parcel front/rear/side edges and create buildable envelope
CREATE OR REPLACE FUNCTION get_parcel_buildable_envelope(p_ogc_fid INTEGER)
RETURNS TABLE (
  ogc_fid INTEGER,
  parcel_geom GEOMETRY,
  front_edge GEOMETRY,
  rear_edge GEOMETRY,
  side_edges GEOMETRY[],
  buildable_envelope GEOMETRY,
  front_setback_area GEOMETRY,
  rear_setback_area GEOMETRY,
  side_setback_areas GEOMETRY[],
  edge_classifications JSONB,
  parcel_metrics JSONB
) AS $$
DECLARE
  parcel_record RECORD;
  edge_record RECORD;
  edges GEOMETRY[];
  edge_distances NUMERIC[];
  min_distance NUMERIC;
  front_edge_index INTEGER;
  rear_edge_index INTEGER;
  edge_count INTEGER;
  temp_geom GEOMETRY;
  road_buffer_distance NUMERIC := 50; -- 50 feet buffer to find nearby roads
  front_setback NUMERIC := 25; -- Default values, should come from zoning
  rear_setback NUMERIC := 20;
  side_setback NUMERIC := 15;
BEGIN
  -- Get the parcel geometry
  SELECT 
    ogc_fid as id,
    ST_Transform(geom, 3857) as geom_3857,
    ST_Area(ST_Transform(geom, 3857)) * 10.764 as area_sqft -- Convert m² to sq ft
  INTO parcel_record
  FROM public.parcels 
  WHERE ogc_fid = p_ogc_fid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcel not found: %', p_ogc_fid;
  END IF;
  
  -- Break parcel into edges using ST_Dump(ST_Boundary())
  SELECT array_agg(edge_geom)
  INTO edges
  FROM (
    SELECT (ST_Dump(ST_Boundary(parcel_record.geom_3857))).geom as edge_geom
  ) boundary_edges;
  
  edge_count := array_length(edges, 1);
  
  -- Find the edge closest to roads
  -- This would ideally use a roads dataset, but for now we'll use a simplified approach
  -- In production, you would join with a roads table like:
  -- SELECT ST_Distance(edge, road_geom) FROM roads WHERE ST_DWithin(edge, road_geom, road_buffer_distance)
  
  -- For now, create a mock implementation that assumes the longest edge is the front
  -- In production, replace this with actual road proximity analysis
  edge_distances := ARRAY[]::NUMERIC[];
  
  FOR i IN 1..edge_count LOOP
    -- Calculate edge length as a proxy for road frontage
    -- In production, this would be: ST_Distance(edges[i], nearest_road)
    edge_distances := edge_distances || ST_Length(edges[i]);
  END LOOP;
  
  -- Find the longest edge (proxy for street front)
  SELECT array_position(edge_distances, max_val), max_val
  INTO front_edge_index, min_distance
  FROM (SELECT MAX(val) as max_val FROM unnest(edge_distances) val) t;
  
  -- The rear edge is typically opposite the front edge
  rear_edge_index := CASE 
    WHEN front_edge_index <= edge_count / 2 
    THEN front_edge_index + (edge_count / 2)::INTEGER
    ELSE front_edge_index - (edge_count / 2)::INTEGER
  END;
  
  -- Ensure rear_edge_index is within bounds
  IF rear_edge_index > edge_count THEN
    rear_edge_index := rear_edge_index - edge_count;
  ELSIF rear_edge_index < 1 THEN
    rear_edge_index := rear_edge_index + edge_count;
  END IF;
  
  -- Create setback areas by buffering inward from each edge
  -- Front setback (inward buffer from front edge)
  temp_geom := ST_Buffer(edges[front_edge_index], front_setback, 'side=right');
  front_setback_area := ST_Intersection(parcel_record.geom_3857, temp_geom);
  
  -- Rear setback (inward buffer from rear edge)
  temp_geom := ST_Buffer(edges[rear_edge_index], rear_setback, 'side=right');
  rear_setback_area := ST_Intersection(parcel_record.geom_3857, temp_geom);
  
  -- Create buildable envelope by applying all setbacks
  buildable_envelope := parcel_record.geom_3857;
  
  -- Apply front setback
  buildable_envelope := ST_Difference(
    buildable_envelope,
    ST_Buffer(edges[front_edge_index], front_setback, 'side=right')
  );
  
  -- Apply rear setback
  buildable_envelope := ST_Difference(
    buildable_envelope,
    ST_Buffer(edges[rear_edge_index], rear_setback, 'side=right')
  );
  
  -- Apply side setbacks
  FOR i IN 1..edge_count LOOP
    IF i != front_edge_index AND i != rear_edge_index THEN
      buildable_envelope := ST_Difference(
        buildable_envelope,
        ST_Buffer(edges[i], side_setback, 'side=right')
      );
    END IF;
  END LOOP;
  
  -- Ensure buildable envelope is valid
  IF ST_IsEmpty(buildable_envelope) OR ST_Area(buildable_envelope) < 100 THEN
    -- Create a simple rectangular buildable area if complex geometry fails
    buildable_envelope := ST_MakeEnvelope(
      ST_XMin(parcel_record.geom_3857) + side_setback,
      ST_YMin(parcel_record.geom_3857) + rear_setback,
      ST_XMax(parcel_record.geom_3857) - side_setback,
      ST_YMax(parcel_record.geom_3857) - front_setback,
      3857
    );
  END IF;
  
  -- Return the results
  RETURN QUERY SELECT
    parcel_record.id,
    parcel_record.geom_3857,
    edges[front_edge_index],
    edges[rear_edge_index],
    ARRAY(SELECT edges[i] FROM generate_series(1, edge_count) i 
          WHERE i != front_edge_index AND i != rear_edge_index),
    buildable_envelope,
    front_setback_area,
    rear_setback_area,
    ARRAY[]::GEOMETRY[], -- Side setback areas (would be calculated similarly)
    jsonb_build_object(
      'front_edge_index', front_edge_index,
      'rear_edge_index', rear_edge_index,
      'total_edges', edge_count,
      'front_edge_length_ft', ST_Length(edges[front_edge_index]) * 3.28084,
      'method', 'longest_edge_proxy'
    ),
    jsonb_build_object(
      'parcel_area_sqft', parcel_record.area_sqft,
      'buildable_area_sqft', ST_Area(buildable_envelope) * 10.764,
      'front_setback_ft', front_setback / 3.28084,
      'rear_setback_ft', rear_setback / 3.28084,
      'side_setback_ft', side_setback / 3.28084
    );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_parcel_buildable_envelope(INTEGER) TO anon, authenticated;
