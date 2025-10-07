# 🚀 Supabase Deployment Guide

## ⚠️ **CRITICAL: Functions Not Deployed**

The application is failing because the new Supabase RPC functions haven't been deployed yet. Follow these steps to deploy:

---

## 📋 **DEPLOYMENT STEPS**

### **Step 1: Deploy Core Planner Functions**

Run these SQL scripts in **Supabase Studio** → **SQL Editor** in this exact order:

```sql
-- 1. Create planner views
\i supabase/functions/planner_parcels.sql
\i supabase/functions/planner_zoning.sql  
\i supabase/functions/planner_join.sql

-- 2. Create RPC functions
\i supabase/functions/get_buildable_envelope.sql
\i supabase/functions/score_pad.sql
\i supabase/functions/get_parcel_detail.sql
\i supabase/functions/get_parcel_buildable_envelope.sql

-- 3. Create indexes
\i supabase/functions/planner_indexes.sql
```

### **Step 2: Alternative - Single Deployment**

Or run the consolidated script:

```sql
-- Run the complete planner schema
\i supabase/functions/planner_complete.sql
```

### **Step 3: Verify Deployment**

Test the functions:

```sql
-- Test parcel detail function
SELECT * FROM get_parcel_detail('47037');

-- Test buildable envelope function  
SELECT * FROM get_parcel_buildable_envelope(661807);

-- Test envelope function
SELECT * FROM get_buildable_envelope('47037');
```

---

## 🔧 **MANUAL DEPLOYMENT (If SQL Editor Fails)**

If the `\i` commands don't work, copy and paste each file's contents directly:

### **1. planner_parcels.sql**
```sql
-- View: planner_parcels (stable MultiPolygon,3857)
drop view if exists planner_parcels;
create view planner_parcels as
select
  coalesce(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) as parcel_id,
  coalesce(
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry_4326),3857),3)) )::geometry(MultiPolygon,3857),
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry       ),3857),3)) )::geometry(MultiPolygon,3857)
  ) as geom
from public.parcels
where coalesce(wkb_geometry_4326, wkb_geometry) is not null
  and not ST_IsEmpty(coalesce(wkb_geometry_4326, wkb_geometry));
```

### **2. get_parcel_buildable_envelope.sql**
```sql
-- RPC: get_parcel_buildable_envelope(ogc_fid int)
drop function if exists public.get_parcel_buildable_envelope(int);
create or replace function public.get_parcel_buildable_envelope(p_ogc_fid int)
returns table(
  ogc_fid int,
  buildable_geom geometry,
  area_sqft numeric,
  edge_types jsonb,
  setbacks_applied jsonb,
  easements_removed int
) 
language plpgsql 
stable 
security definer 
set search_path=public 
as $$
declare
  parcel_geom geometry;
  zoning_data record;
  front_setback numeric := 20;  -- default in feet
  side_setback numeric := 5;    -- default in feet
  rear_setback numeric := 20;   -- default in feet
  buildable_geom geometry;
  final_geom geometry;
  easement_count int := 0;
  edge_types jsonb;
  setbacks_applied jsonb;
begin
  -- Get parcel geometry
  select geom into parcel_geom
  from planner_parcels
  where parcel_id = p_ogc_fid::text
  limit 1;

  if parcel_geom is null then
    raise exception 'Parcel % not found in planner_parcels', p_ogc_fid;
  end if;

  -- Get zoning data for setbacks
  select 
    coalesce((setbacks->>'front')::numeric, front_setback) as front,
    coalesce((setbacks->>'side')::numeric, side_setback) as side,
    coalesce((setbacks->>'rear')::numeric, rear_setback) as rear
  into zoning_data
  from planner_zoning
  where parcel_id = p_ogc_fid::text
  limit 1;

  -- Use zoning setbacks if available, otherwise use defaults
  if zoning_data is not null then
    front_setback := zoning_data.front;
    side_setback := zoning_data.side;
    rear_setback := zoning_data.rear;
  end if;

  -- Convert setbacks from feet to meters for ST_Buffer
  front_setback := front_setback / 3.28084;
  side_setback := side_setback / 3.28084;
  rear_setback := rear_setback / 3.28084;

  -- Apply setbacks using negative buffer
  -- Use the largest setback to ensure compliance
  buildable_geom := ST_Buffer(parcel_geom, -greatest(front_setback, side_setback, rear_setback));

  -- Handle easements (if easement table exists)
  -- This is a placeholder - implement based on your easement data structure
  /*
  with easements as (
    select ST_Union(geom) as easement_geom
    from easements 
    where ST_Intersects(geom, parcel_geom)
  )
  select 
    ST_Difference(buildable_geom, easement_geom) as final_geom,
    (select count(*) from easements where ST_Intersects(geom, parcel_geom)) as easement_count
  into final_geom, easement_count
  from easements;
  */

  -- For now, use buildable_geom as final_geom (no easements)
  final_geom := buildable_geom;
  easement_count := 0;

  -- Determine edge types (simplified - assumes rectangular parcel)
  edge_types := jsonb_build_object(
    'front', true,
    'side', true, 
    'rear', true,
    'easement', easement_count > 0
  );

  -- Record applied setbacks
  setbacks_applied := jsonb_build_object(
    'front', front_setback * 3.28084,  -- convert back to feet
    'side', side_setback * 3.28084,
    'rear', rear_setback * 3.28084
  );

  -- Return results
  return query
  select 
    p_ogc_fid,
    ST_MakeValid(final_geom) as buildable_geom,
    round(ST_Area(final_geom) * 10.7639, 0) as area_sqft,  -- convert m² to ft²
    edge_types,
    setbacks_applied,
    easement_count;
end $$;
```

---

## 🧪 **TESTING AFTER DEPLOYMENT**

### **Test 1: Basic Function Call**
```sql
SELECT * FROM get_parcel_buildable_envelope(661807);
```

### **Test 2: Check Function Exists**
```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%parcel%';
```

### **Test 3: Frontend Integration Test**
After deployment, test in the app:
1. Open parcel analysis demo
2. Enter parcel ID: `661807`
3. Click "Fetch Buildable Envelope"
4. Should see envelope data instead of 404 error

---

## 🚨 **TROUBLESHOOTING**

### **Error: Function Not Found (PGRST202)**
- **Cause**: Function not deployed to Supabase
- **Fix**: Run the SQL scripts above in Supabase Studio

### **Error: View Does Not Exist**
- **Cause**: Views not created in correct order
- **Fix**: Run `planner_parcels.sql` → `planner_zoning.sql` → `planner_join.sql` first

### **Error: Permission Denied**
- **Cause**: Insufficient database permissions
- **Fix**: Ensure you're using the correct Supabase project and have admin access

### **Error: Geometry Type Mismatch**
- **Cause**: Coordinate system issues
- **Fix**: Ensure PostGIS extension is enabled in Supabase

---

## 📊 **VERIFICATION CHECKLIST**

- [ ] `planner_parcels` view exists
- [ ] `planner_zoning` view exists  
- [ ] `planner_join` view exists
- [ ] `get_buildable_envelope` function exists
- [ ] `get_parcel_buildable_envelope` function exists
- [ ] `score_pad` function exists
- [ ] `get_parcel_detail` function exists
- [ ] Spatial indexes created
- [ ] Test queries return data
- [ ] Frontend can call functions without 404 errors

---

## 🎯 **NEXT STEPS**

1. **Deploy Functions**: Run the SQL scripts in Supabase Studio
2. **Test Functions**: Verify with test queries
3. **Update Frontend**: Test the parcel analysis demo
4. **Monitor Logs**: Check for any remaining errors
5. **Optimize**: Add any missing indexes or constraints

**Status**: ⚠️ **DEPLOYMENT REQUIRED** - Functions exist in code but not in database