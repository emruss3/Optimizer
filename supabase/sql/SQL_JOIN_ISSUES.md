# SQL Join Issues Analysis

## Critical Issues Found

### 1. **planner_zoning view uses `geoid::text as parcel_id` (WRONG)**
**File:** `supabase/sql/planner_zoning.sql:27`
**Issue:** The `planner_zoning` view selects from `public.zoning` (a rules table, not parcels) and uses `geoid::text as parcel_id`. This is incorrect because:
- `public.zoning` is a **zoning rules table**, not a parcel table
- It doesn't have a `geoid` column that maps to parcels
- This creates a join mismatch with `planner_parcels` which uses `ogc_fid` as fallback

**Impact:** The join in `planner_join.sql` will fail for parcels without `geoid`, and the view structure is fundamentally wrong.

**Fix Needed:** `planner_zoning` should NOT have a `parcel_id` column. It should be a rules table keyed by `zoning_id` or `zoning` code.

---

### 2. **Old migrations join on `z.zoning = p.zoning` (text join, creates duplicates)**
**Files:**
- `supabase/migrations/20250804015849_scarlet_sea.sql:130`
- `supabase/migrations/20250804014759_rough_coast.sql:79`

**Issue:** These migrations join `public.zoning z ON p.zoning = z.zoning` (text match) instead of using `zoning_id`.

**Impact:** 
- Creates duplicate rows when multiple zoning rows have the same `zoning` code
- No sentinel filtering (-5555/-9999 values leak through)
- Inefficient text comparison

**Fix Needed:** Change to `ON z.zoning_id = p.zoning_id`

---

### 3. **planner_join view joins on mismatched keys**
**File:** `supabase/sql/planner_join.sql:14`
**Issue:** Joins `planner_zoning z ON z.parcel_id = p.parcel_id`, but:
- `planner_parcels.parcel_id` = `coalesce(geoid, parcelnumb, state_parcelnumb, ogc_fid)`
- `planner_zoning.parcel_id` = `geoid::text` (from zoning table, which doesn't have geoid!)

**Impact:** Join will fail or return no rows for most parcels.

**Fix Needed:** Restructure to join parcels → zoning on `zoning_id`, not on `parcel_id`.

---

## Correct Patterns (Already Fixed)

✅ **Enhanced functions use `zoning_id` join:**
- `supabase/migrations/20250112_deploy_enhanced_functions.sql:164, 318`
- `supabase/functions/get_parcel_by_id_enhanced.sql:165`
- `supabase/functions/get_parcel_at_point_enhanced.sql:172`

These correctly join `ON z.zoning_id = p.zoning_id`.

---

## Recommended Fixes

### Fix 1: Restructure planner_zoning view
The view should be a **zoning rules lookup table**, not a parcel-zoning mapping:

```sql
-- planner_zoning should be a rules table, not parcel-specific
CREATE OR REPLACE VIEW planner_zoning AS
SELECT
  zoning_id,
  zoning as base,
  -- sentinel-filtered fields
  CASE WHEN nullif(max_far, '')::numeric IN (-5555, -9999) THEN NULL 
       ELSE nullif(max_far, '')::numeric END as far_max,
  -- ... other fields
FROM public.zoning;
```

### Fix 2: Fix old migration joins
Update the two old migrations to use `zoning_id`:

```sql
-- In 20250804015849_scarlet_sea.sql:130
LEFT JOIN zoning z ON z.zoning_id = p.zoning_id  -- FIXED

-- In 20250804014759_rough_coast.sql:79  
LEFT JOIN zoning z ON z.zoning_id = p.zoning_id  -- FIXED
```

### Fix 3: Fix planner_join view
Join parcels to zoning on `zoning_id`:

```sql
CREATE OR REPLACE VIEW planner_join AS
SELECT
  p.parcel_id,
  p.geom,
  z.base,
  z.far_max,
  z.height_max_ft,
  z.setbacks,
  z.parking_ratio
FROM planner_parcels p
LEFT JOIN planner_zoning z ON z.zoning_id = (
  SELECT zoning_id FROM public.parcels WHERE ogc_fid::text = p.parcel_id
);
```

Or better: Add `zoning_id` to `planner_parcels` view:

```sql
CREATE OR REPLACE VIEW planner_parcels AS
SELECT
  coalesce(geoid::text, parcelnumb, state_parcelnumb, ogc_fid::text) as parcel_id,
  zoning_id,  -- ADD THIS
  geom
FROM public.parcels
WHERE ...
```

Then join:
```sql
LEFT JOIN planner_zoning z ON z.zoning_id = p.zoning_id
```
