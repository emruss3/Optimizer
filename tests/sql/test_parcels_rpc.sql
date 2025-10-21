-- Test the get_parcels_in_bbox function
-- This should return some parcels around Nashville
select * from public.get_parcels_in_bbox(
  -86.9, 36.1, -86.7, 36.2,  -- Nashville area bbox
  0,                         -- min_sqft
  5,                         -- max_results
  '{}'                       -- zoning_filter
) limit 5;
