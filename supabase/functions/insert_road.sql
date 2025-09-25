-- Function to properly insert road geometry from WKT
CREATE OR REPLACE FUNCTION insert_road(
  p_osm_id BIGINT,
  p_name TEXT,
  p_highway TEXT,
  p_geom_wkt TEXT
)
RETURNS INTEGER AS $$
DECLARE
  road_id INTEGER;
BEGIN
  INSERT INTO public.roads (osm_id, name, highway, geom)
  VALUES (
    p_osm_id,
    p_name,
    p_highway,
    ST_Transform(ST_GeomFromText(p_geom_wkt, 4326), 3857)
  )
  ON CONFLICT (osm_id) DO UPDATE SET
    name = EXCLUDED.name,
    highway = EXCLUDED.highway,
    geom = EXCLUDED.geom,
    updated_at = NOW()
  RETURNING id INTO road_id;
  
  RETURN road_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION insert_road(BIGINT, TEXT, TEXT, TEXT) TO anon, authenticated;



