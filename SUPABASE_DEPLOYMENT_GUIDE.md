# SUPABASE_DEPLOYMENT_GUIDE.md

## Database Setup (Run Once in Supabase Studio)

### 1. Verify Views Exist
Run `SUPABASE_STATUS_CHECK.sql` to verify:
- `planner_parcels` view exists and has data
- `planner_zoning` view exists and has data  
- `planner_join` view exists and has data

### 2. Verify Functions Exist
The following functions must be available:
- `get_buildable_envelope(p_parcel_id text)` - returns geometry(3857)
- `get_parcel_buildable_envelope(p_ogc_fid int)` - returns table with buildable_geom/area_sqft
- `get_parcel_detail(p_parcel_id text)` - returns complete parcel info
- `score_pad(p_parcel_id text, pad_geom geometry, envelope_geom geometry)` - scoring function

### 3. Test Functions
Run `SUPABASE_SQL_TEST.sql` to verify all functions work with sample data.

## Frontend Integration

### Overview Tab
```typescript
// Use fetchParcelOverviewAnyId for complete parcel data
import { fetchParcelOverviewAnyId } from '@/lib/fetchParcelOverview';

const overview = await fetchParcelOverviewAnyId(parcelId);
```

### Site Plan Tab  
```typescript
// Use fetchEnvelopeAny for envelope geometry
import { fetchEnvelopeAny } from '@/lib/fetchEnvelope';

const env = await fetchEnvelopeAny(parcelId);
```

## Coordinate System Rules

### Database Layer
- All geometries stored as 3857 (Web Mercator meters)
- Functions return geometries in 3857
- Area calculations in square feet

### Frontend Layer
- Treat all returned geometries as 3857
- Convert to feet for display using `CoordinateTransform.toFeet()`
- Use client-side area calculations for UI display

## Error Handling Strategy

### RPC Fallback Chain
1. Try `get_buildable_envelope(parcel_id:text)` first
2. Fall back to `get_parcel_buildable_envelope(ogc_fid:int)` 
3. Return null gracefully if both fail

### User Experience
- No 500 errors bubble up to UI
- Graceful degradation to raw parcel geometry
- Clear console logging for debugging
- User-friendly error messages

## Testing Checklist

### Database Tests
- [ ] All views return data
- [ ] All functions execute without errors
- [ ] Sample parcel IDs work correctly
- [ ] Cross-reference validation passes

### Frontend Tests
- [ ] Overview tab loads parcel data
- [ ] Site plan tab renders envelope
- [ ] Fallback behavior works
- [ ] No console errors
- [ ] Smooth user experience

### Performance Tests
- [ ] Single RPC call when possible
- [ ] Fast response times (<2s)
- [ ] No redundant API calls
- [ ] Efficient error handling

## Troubleshooting

### Common Issues
1. **Function not found**: Check function names and parameters
2. **Geometry errors**: Verify coordinate system handling
3. **Permission errors**: Check RLS policies
4. **Timeout errors**: Optimize function performance

### Debug Commands
```sql
-- Check function existence
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public';

-- Test with sample data
SELECT * FROM get_parcel_detail('08102016600');
SELECT * FROM get_buildable_envelope('08102016600');
```

### Console Debugging
```javascript
// Test envelope fetching
const env = await fetchEnvelopeAny('08102016600');
console.log('Envelope:', env);

// Test parcel overview  
const overview = await fetchParcelOverviewAnyId('08102016600');
console.log('Overview:', overview);
```