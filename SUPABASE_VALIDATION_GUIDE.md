# Supabase SQL Validation Guide

## 🎯 **Goal**
Verify that the SQL functions work correctly before deploying them to fix the parcel visibility issue.

## 📋 **Step-by-Step Validation Process**

### **Step 1: Check Your Database Schema**
First, verify your database has the expected tables and columns:

```sql
-- Check if parcels table exists and has the right columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'parcels' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if zoning table exists and has the right columns  
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'zoning' 
  AND table_schema = 'public'
ORDER BY ordinal_position;
```

### **Step 2: Test Data Availability**
Check if you have data for the parcel that's failing (OGC_FID: 661807):

```sql
-- Check if parcel 661807 exists
SELECT ogc_fid, geoid, parcelnumb, state_parcelnumb
FROM public.parcels 
WHERE ogc_fid = 661807;

-- Check if zoning data exists for this parcel
SELECT geoid, zoning, max_far, max_building_height_ft
FROM public.zoning 
WHERE geoid = '661807';
```

### **Step 3: Test the Simplified Deployment**
1. **Copy the contents of `SUPABASE_SIMPLE_DEPLOYMENT.sql`**
2. **Paste into Supabase Studio SQL Editor**
3. **Run the script**
4. **Check for any errors**

### **Step 4: Validate the Functions**
After deployment, test each function:

```sql
-- Test 1: Check if views work
SELECT COUNT(*) FROM planner_parcels WHERE parcel_id = '661807';
SELECT COUNT(*) FROM planner_zoning WHERE parcel_id = '661807';
SELECT COUNT(*) FROM planner_join WHERE parcel_id = '661807';

-- Test 2: Test the main function
SELECT * FROM public.get_parcel_buildable_envelope(661807);

-- Test 3: Check performance
EXPLAIN ANALYZE SELECT * FROM public.get_parcel_buildable_envelope(661807);
```

### **Step 5: Common Issues and Solutions**

#### **Issue 1: "Parcel not found"**
- **Cause**: The parcel ID doesn't exist in your database
- **Solution**: Check what parcel IDs you actually have:
```sql
SELECT ogc_fid, geoid FROM public.parcels LIMIT 10;
```

#### **Issue 2: "Geometry is NULL"**
- **Cause**: The parcel has no geometry data
- **Solution**: Check geometry columns:
```sql
SELECT ogc_fid, 
       wkb_geometry_4326 IS NOT NULL as has_4326,
       wkb_geometry IS NOT NULL as has_geom
FROM public.parcels 
WHERE ogc_fid = 661807;
```

#### **Issue 3: "Function timeout"**
- **Cause**: Complex geometry operations are too slow
- **Solution**: Use the simplified version or add more indexes

#### **Issue 4: "Column doesn't exist"**
- **Cause**: Your database schema is different
- **Solution**: Check your actual column names and adjust the SQL

### **Step 6: Alternative Simple Test**
If the full deployment fails, try this minimal test:

```sql
-- Minimal test function
CREATE OR REPLACE FUNCTION public.test_parcel(p_ogc_fid int)
RETURNS TABLE(ogc_fid int, has_geom boolean, area_sqft numeric)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.ogc_fid,
    p.geom IS NOT NULL as has_geom,
    CASE 
      WHEN p.geom IS NOT NULL THEN ROUND(ST_Area(p.geom) * 10.7639, 0)
      ELSE 0
    END as area_sqft
  FROM (
    SELECT 
      ogc_fid,
      CASE 
        WHEN wkb_geometry_4326 IS NOT NULL THEN ST_Transform(wkb_geometry_4326, 3857)
        WHEN wkb_geometry IS NOT NULL THEN ST_Transform(wkb_geometry, 3857)
        ELSE NULL
      END as geom
    FROM public.parcels
    WHERE ogc_fid = p_ogc_fid
  ) p;
END $$;

-- Test it
SELECT * FROM public.test_parcel(661807);
```

## 🚨 **If All Else Fails**

If the SQL functions still don't work, we can:

1. **Use a different parcel ID** that exists in your database
2. **Simplify the frontend** to not depend on the buildable envelope
3. **Use basic parcel geometry** without setbacks
4. **Check your Supabase project settings** for any restrictions

## 📞 **Next Steps**

1. Run the validation tests
2. Deploy the simplified SQL
3. Test the functions
4. Let me know the results so we can fix any remaining issues

The goal is to get the parcel visible again, even if we need to use a simpler approach initially.

