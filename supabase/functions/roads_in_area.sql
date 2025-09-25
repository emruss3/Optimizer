-- Function to check for roads in a specific area
CREATE OR REPLACE FUNCTION roads_in_area(search_area TEXT)
RETURNS TABLE (
  id INTEGER,
  name TEXT,
  highway TEXT,
  distance_to_center NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.name,
    r.highway,
    ST_Distance(
      r.geom,
      ST_Centroid(ST_GeomFromText(search_area, 4326))
    ) as distance_to_center
  FROM public.roads r
  WHERE ST_Intersects(
    r.geom,
    ST_Transform(ST_GeomFromText(search_area, 4326), 3857)
  )
  ORDER BY distance_to_center;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION roads_in_area(TEXT) TO anon, authenticated;



