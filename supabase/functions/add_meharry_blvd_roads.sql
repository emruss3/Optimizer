-- Add the correct road data for the 17th Ave & Meharry Blvd parcel
-- This will replace the sample Jefferson St data with the actual roads

-- Clear existing sample data
DELETE FROM public.roads WHERE name IN ('Jefferson St', 'Main St');

-- Add the actual roads for this parcel location
INSERT INTO public.roads (osm_id, name, highway, geom) VALUES
(
  17001,
  'Meharry Blvd',
  'secondary',
  ST_Transform(
    ST_GeomFromText('LINESTRING(-86.8130 36.1650, -86.8090 36.1650)', 4326),
    3857
  )
),
(
  17002,
  '17th Ave N',
  'residential', 
  ST_Transform(
    ST_GeomFromText('LINESTRING(-86.8110 36.1640, -86.8110 36.1660)', 4326),
    3857
  )
),
(
  17003,
  'Dr D B Todd Jr Blvd',
  'primary',
  ST_Transform(
    ST_GeomFromText('LINESTRING(-86.8140 36.1630, -86.8140 36.1670)', 4326),
    3857
  )
);

-- Verify the roads were added
SELECT id, name, highway FROM public.roads ORDER BY name;



