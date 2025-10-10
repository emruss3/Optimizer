-- =====================================================
-- Add Unique Constraint to Roads Table
-- Date: 2025-01-16
-- Description: Add unique constraint on osm_id to support ON CONFLICT in insert_road function
-- =====================================================

-- Add unique constraint on osm_id to support ON CONFLICT in insert_road function
ALTER TABLE public.roads 
ADD CONSTRAINT roads_osm_id_unique UNIQUE (osm_id);

-- Add index for better performance on osm_id lookups
CREATE INDEX IF NOT EXISTS idx_roads_osm_id ON public.roads(osm_id);
