-- © 2025 ER Technologies. All rights reserved.
-- Proprietary and confidential. Not for distribution.

-- Create score_pad function for evaluating site plan layouts
CREATE OR REPLACE FUNCTION score_pad(
  parcel_id text,
  building_geometry geometry,
  parking_geometry geometry DEFAULT NULL,
  landscape_geometry geometry DEFAULT NULL,
  zoning_data jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  parcel_geom geometry;
  parcel_area_sqft numeric;
  building_area_sqft numeric;
  parking_area_sqft numeric;
  landscape_area_sqft numeric;
  total_building_area_sqft numeric;
  coverage_ratio numeric;
  far_ratio numeric;
  parking_ratio numeric;
  setback_compliance boolean;
  zoning_compliance boolean;
  score numeric;
  metrics jsonb;
BEGIN
  -- Get parcel geometry and area
  SELECT ST_Area(ST_Transform(geometry, 3857)) * 10.764 INTO parcel_area_sqft
  FROM parcels 
  WHERE ogc_fid = parcel_id;
  
  -- Calculate building area
  building_area_sqft := ST_Area(ST_Transform(building_geometry, 3857)) * 10.764;
  
  -- Calculate parking area (if provided)
  IF parking_geometry IS NOT NULL THEN
    parking_area_sqft := ST_Area(ST_Transform(parking_geometry, 3857)) * 10.764;
  ELSE
    parking_area_sqft := 0;
  END IF;
  
  -- Calculate landscape area (if provided)
  IF landscape_geometry IS NOT NULL THEN
    landscape_area_sqft := ST_Area(ST_Transform(landscape_geometry, 3857)) * 10.764;
  ELSE
    landscape_area_sqft := 0;
  END IF;
  
  -- Calculate total building area
  total_building_area_sqft := building_area_sqft + parking_area_sqft;
  
  -- Calculate ratios
  coverage_ratio := total_building_area_sqft / parcel_area_sqft;
  far_ratio := building_area_sqft / parcel_area_sqft;
  parking_ratio := parking_area_sqft / building_area_sqft;
  
  -- Check setback compliance (simplified - would need actual setback requirements)
  setback_compliance := true; -- Placeholder
  
  -- Check zoning compliance
  zoning_compliance := true; -- Placeholder
  
  -- Calculate score (0-100)
  score := 0;
  
  -- Coverage score (optimal around 0.6-0.8)
  IF coverage_ratio BETWEEN 0.6 AND 0.8 THEN
    score := score + 25;
  ELSIF coverage_ratio BETWEEN 0.4 AND 0.9 THEN
    score := score + 15;
  ELSE
    score := score + 5;
  END IF;
  
  -- FAR score (optimal around 0.4-0.6)
  IF far_ratio BETWEEN 0.4 AND 0.6 THEN
    score := score + 25;
  ELSIF far_ratio BETWEEN 0.2 AND 0.8 THEN
    score := score + 15;
  ELSE
    score := score + 5;
  END IF;
  
  -- Parking score (optimal around 0.3-0.5)
  IF parking_ratio BETWEEN 0.3 AND 0.5 THEN
    score := score + 20;
  ELSIF parking_ratio BETWEEN 0.2 AND 0.7 THEN
    score := score + 10;
  ELSE
    score := score + 5;
  END IF;
  
  -- Compliance bonus
  IF setback_compliance THEN
    score := score + 15;
  END IF;
  
  IF zoning_compliance THEN
    score := score + 15;
  END IF;
  
  -- Build metrics object
  metrics := jsonb_build_object(
    'score', score,
    'parcel_area_sqft', parcel_area_sqft,
    'building_area_sqft', building_area_sqft,
    'parking_area_sqft', parking_area_sqft,
    'landscape_area_sqft', landscape_area_sqft,
    'total_building_area_sqft', total_building_area_sqft,
    'coverage_ratio', coverage_ratio,
    'far_ratio', far_ratio,
    'parking_ratio', parking_ratio,
    'setback_compliance', setback_compliance,
    'zoning_compliance', zoning_compliance,
    'timestamp', NOW()
  );
  
  RETURN metrics;
END;
$$;
