-- =====================================================
-- Zoning Schema Enhancement Migration
-- Date: 2025-01-12
-- Description: Add Regrid Standardized Zoning Schema fields
-- =====================================================

-- Add new zoning columns to support Regrid Standardized Zoning Schema
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS zoning_id INTEGER;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS zoning_type TEXT;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS zoning_subtype TEXT;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS zoning_objective TEXT;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS zoning_code_link TEXT;

-- Permitted Land Uses
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS permitted_land_uses JSONB;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS permitted_land_uses_as_of_right TEXT;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS permitted_land_uses_conditional TEXT;

-- Lot & Building Regulations
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS min_lot_area_sq_ft DOUBLE PRECISION;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS min_lot_width_ft DOUBLE PRECISION;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS max_building_height_ft DOUBLE PRECISION;

-- Coverage & Density Regulations
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS max_coverage_pct DOUBLE PRECISION;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS min_landscaped_space_pct DOUBLE PRECISION;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS min_open_space_pct DOUBLE PRECISION;

-- Administrative Information
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS zoning_data_date DATE;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS municipality_id INTEGER;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS municipality_name TEXT;
ALTER TABLE public.zoning ADD COLUMN IF NOT EXISTS geoid TEXT;

-- Ensure parcels table has zoning_id reference
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS zoning_id INTEGER;

-- Add foreign key constraint (optional but recommended)
ALTER TABLE public.parcels 
ADD CONSTRAINT IF NOT EXISTS fk_parcels_zoning 
FOREIGN KEY (zoning_id) REFERENCES public.zoning(zoning_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_parcels_zoning_id ON public.parcels(zoning_id);
CREATE INDEX IF NOT EXISTS idx_zoning_zoning_id ON public.zoning(zoning_id);




