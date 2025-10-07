# 🚀 Supabase Planner Functions Deployment Guide

## 📋 Overview

This guide walks you through deploying the complete planner schema to your Supabase database. The schema includes views, RPC functions, and indexes for parcel analysis and site planning.

## 🗂️ Files Created

### Core SQL Files
- `supabase/functions/planner_parcels.sql` - Parcel geometry view
- `supabase/functions/planner_zoning.sql` - Dynamic zoning view with FAR detection
- `supabase/functions/planner_join.sql` - Joined parcel + zoning view
- `supabase/functions/get_buildable_envelope.sql` - Envelope calculation RPC
- `supabase/functions/score_pad.sql` - Pad scoring RPC
- `supabase/functions/get_parcel_detail.sql` - One-call detail RPC
- `supabase/functions/planner_indexes.sql` - Spatial indexes
- `supabase/functions/planner_complete.sql` - **Single file with everything**
- `supabase/functions/planner_test.sql` - Test script

### Frontend Integration
- `src/services/parcelAnalysis.ts` - TypeScript service
- `src/hooks/useParcelAnalysis.ts` - React hook
- `src/components/ParcelAnalysisDemo.tsx` - Demo component
- `src/components/SupabaseIntegrationExample.tsx` - Code example

## 🚀 Deployment Steps

### Option 1: Single File Deployment (Recommended)

1. **Open Supabase Studio**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor

2. **Run the Complete Schema**
   ```sql
   -- Copy and paste the entire contents of:
   -- supabase/functions/planner_complete.sql
   ```
   - Click "Run" to execute the entire schema

3. **Verify Deployment**
   ```sql
   -- Run the test script:
   -- supabase/functions/planner_test.sql
   ```

### Option 2: Individual File Deployment

If you prefer to run files individually:

1. Run in this exact order:
   ```sql
   -- 1. Create views
   \i planner_parcels.sql
   \i planner_zoning.sql
   \i planner_join.sql
   
   -- 2. Create functions
   \i get_buildable_envelope.sql
   \i score_pad.sql
   \i get_parcel_detail.sql
   
   -- 3. Create indexes
   \i planner_indexes.sql
   ```

## 🧪 Testing the Deployment

### 1. Test Views
```sql
-- Check if views exist and have data
select count(*) from planner_parcels;
select count(*) from planner_zoning;
select count(*) from planner_join;
```

### 2. Test Functions
```sql
-- Test with a specific parcel ID
select public.get_buildable_envelope('47037');

-- Test scoring
select public.score_pad(
  '47037',
  public.get_buildable_envelope('47037'),
  null
);

-- Test complete detail function
select * from public.get_parcel_detail('47037');
```

### 3. Frontend Testing
1. **Start the development server** (already running on http://localhost:5173/)
2. **Click "Analysis Demo"** in the header
3. **Test with parcel ID "47037"** or any valid parcel ID
4. **View the integration example** for exact code usage

## 📊 Schema Overview

### Views
- **`planner_parcels`** - Standardized parcel geometry in EPSG:3857
- **`planner_zoning`** - Dynamic zoning with automatic FAR column detection
- **`planner_join`** - Combined parcel + zoning data

### RPC Functions
- **`get_buildable_envelope(parcel_id)`** - Returns buildable area geometry
- **`score_pad(parcel_id, pad_geometry, parking_geometry)`** - Scores a development pad
- **`get_parcel_detail(parcel_id)`** - One-call for all parcel data

### Indexes
- **`gix_parcels_wkb4326`** - Spatial index on parcel geometry
- **`gix_zoning_geom`** - Spatial index on zoning geometry

## 🔧 Configuration Notes

### Dynamic FAR Detection
The `planner_zoning` view automatically detects dynamic FAR columns:
- `effective_far`, `dynamic_far`, `calc_far`, `computed_far`, `current_far`
- `far_dynamic`, `far_effective`, `far_calc`, `far_current`

If your dynamic FAR column has a different name, add it to the detection array in `planner_zoning.sql`.

### Coordinate Systems
- **Input**: Parcels can be in any coordinate system
- **Processing**: Automatically transformed to EPSG:3857 (Web Mercator)
- **Output**: All functions return EPSG:3857 geometry

### Error Handling
- Functions include proper error handling for missing parcels
- Invalid geometry is automatically cleaned with `ST_MakeValid`
- Missing zoning data uses sensible defaults

## 🎯 Frontend Integration

### Basic Usage
```typescript
import { parcelAnalysisService } from './services/parcelAnalysis';

// Fetch parcel data
const parcel = await parcelAnalysisService.fetchParcelData('47037');

// Get buildable envelope
const envelope = await parcelAnalysisService.getBuildableEnvelope('47037');

// Score a pad
const score = await parcelAnalysisService.scorePad('47037', padGeometry, parkingGeometry);
```

### React Hook Usage
```typescript
import { useParcelAnalysis } from './hooks/useParcelAnalysis';

const { parcel, envelope, score, analyzeParcel } = useParcelAnalysis();

// Run complete analysis
await analyzeParcel('47037', padGeometry, parkingGeometry);
```

## 🚨 Troubleshooting

### Common Issues

1. **"Parcel not found"**
   - Check if parcel ID exists in `planner_parcels` view
   - Verify parcel has valid geometry

2. **"Function does not exist"**
   - Ensure all SQL files were run successfully
   - Check function names match exactly

3. **"Geometry errors"**
   - Verify input geometry is valid GeoJSON
   - Check coordinate system (should be EPSG:3857)

4. **"No zoning data"**
   - Check if parcel exists in `planner_zoning` view
   - Verify zoning table has data for the parcel

### Debug Queries
```sql
-- Check parcel exists
select * from planner_parcels where parcel_id = '47037';

-- Check zoning data
select * from planner_zoning where parcel_id = '47037';

-- Check joined data
select * from planner_join where parcel_id = '47037';
```

## ✅ Success Criteria

After deployment, you should be able to:

1. ✅ Query `planner_parcels`, `planner_zoning`, and `planner_join` views
2. ✅ Call `get_buildable_envelope()` function successfully
3. ✅ Call `score_pad()` function successfully
4. ✅ Call `get_parcel_detail()` function successfully
5. ✅ Use the frontend demo with real data
6. ✅ See proper error handling for invalid parcel IDs

## 📞 Support

If you encounter issues:
1. Check the test script output
2. Verify your parcel and zoning tables have data
3. Ensure Supabase RLS policies allow function execution
4. Check the browser console for frontend errors

The complete planner schema is now ready for production use! 🎉
