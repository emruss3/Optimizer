# Frontend Verification Checklist

## Overview Tab Verification
- [ ] Calls `get_parcel_detail(parcel_id:text)` for text parcel IDs
- [ ] Falls back to `planner_join` query by text parcel_id if detail fails
- [ ] Handles numeric ogc_fid by converting to string parcel_id
- [ ] Displays parcel information correctly
- [ ] Shows zoning data when available
- [ ] Gracefully handles missing data

## Site Plan Tab Verification  
- [ ] Calls `get_buildable_envelope(parcel_id:text)` first
- [ ] Falls back to `get_parcel_buildable_envelope(ogc_fid:int)` if first fails
- [ ] Treats all returned geometries as 3857 (meters)
- [ ] Converts to feet in client for display
- [ ] Shows envelope geometry correctly
- [ ] Handles missing envelope gracefully
- [ ] No backend 500 errors

## Coordinate System Handling
- [ ] All geometries treated as 3857 (Web Mercator meters)
- [ ] Client-side conversion to feet for display
- [ ] Proper coordinate transforms applied
- [ ] No coordinate system mismatches

## Error Handling
- [ ] Graceful fallback between RPC functions
- [ ] Clear console logging for debugging
- [ ] User-friendly error messages
- [ ] No application crashes on RPC failures

## Performance
- [ ] Single RPC call when possible
- [ ] Efficient fallback strategy
- [ ] No redundant API calls
- [ ] Fast response times

## Testing Commands

### Console Verification
```javascript
// Test envelope fetching
const env = await fetchEnvelopeAny('08102016600');
console.log('Envelope result:', env);

// Test parcel overview
const overview = await fetchParcelOverviewAnyId('08102016600');
console.log('Overview result:', overview);
```

### Network Tab Verification
- One successful RPC call (200 status)
- No 500 errors
- Proper request/response format
- Reasonable response times

### UI Verification
- Parcel polygon renders correctly
- Site plan generates successfully
- Slider controls work properly
- No console errors
- Smooth user experience
