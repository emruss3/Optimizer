# Parcel ID Standardization Guide

This document explains the standardized approach to handling parcel IDs throughout the application.

## Overview

The application uses two different ID types for different purposes:

- **`ogc_fid` (number)**: Used for geometry RPCs like `get_parcel_geometry_3857`
- **`parcel_id` (string)**: Used for planner RPCs like `get_parcel_detail`, `get_buildable_envelope`

## ID Conversion

### Converting Between ID Types

```typescript
import { ogcFidToParcelId, parcelIdToOgcFid } from '@/utils/parcelId';

// Convert ogc_fid to parcel_id
const ogcFid = 12345;
const parcelId = ogcFidToParcelId(ogcFid); // "12345"

// Convert parcel_id to ogc_fid
const parcelId = "12345";
const ogcFid = parcelIdToOgcFid(parcelId); // 12345
```

### Extracting IDs from Map Features

```typescript
import { extractOgcFidFromFeature, extractParcelIdFromFeature } from '@/utils/parcelId';

// When clicking on a map feature
const feature = map.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] })[0];

const ogcFid = extractOgcFidFromFeature(feature); // number
const parcelId = extractParcelIdFromFeature(feature); // string
```

## RPC Usage

### Geometry RPCs (use ogc_fid)

```typescript
import { getParcelGeometry3857 } from '@/lib/parcelRpc';

// Get geometry for canvas rendering
const geometry = await getParcelGeometry3857(ogcFid); // Uses p_ogc_fid: number
```

### Planner RPCs (use parcel_id)

```typescript
import { getParcelDetail, getBuildableEnvelope } from '@/lib/parcelRpc';

// Get complete parcel detail
const detail = await getParcelDetail(parcelId); // Uses p_parcel_id: string

// Get buildable envelope
const envelope = await getBuildableEnvelope(parcelId); // Uses p_parcel_id: string
```

### Planner Views (use parcel_id)

```typescript
import { getParcelZoningInfo } from '@/lib/parcelRpc';

// Get zoning information from planner views
const zoning = await getParcelZoningInfo(parcelId); // Queries planner_join with parcel_id
```

## Standardized RPC Client

The `@/lib/parcelRpc` module provides type-safe RPC calls with proper ID handling:

```typescript
import { getCompleteParcelData } from '@/lib/parcelRpc';

// Get all parcel data in one call
const parcelData = await getCompleteParcelData(ogcFid);
// Returns: { geometry, detail, zoning }
```

## Map Click Handling

The standardized approach for handling map clicks:

```typescript
// In MapView.tsx
map.on("click", "parcels-fill", async (e) => {
  const f = map.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] })[0];
  if (!f) return;
  
  // Extract IDs using standardized utilities
  const ogcFid = extractOgcFidFromFeature(f);
  const parcelId = extractParcelIdFromFeature(f);
  
  if (!ogcFid || !parcelId) {
    console.warn('Could not extract valid parcel IDs from feature');
    return;
  }

  // Get complete parcel data
  const parcelData = await getCompleteParcelData(ogcFid);
  
  // Create standardized parcel selection
  const selected: SelectedParcel = {
    ogc_fid: parcelId, // Use string ID for consistency
    // ... other properties
    zoning_data: parcelData.zoning,
    detail_data: parcelData.detail,
    geometry_data: parcelData.geometry
  };
});
```

## RPC Parameter Names

The standardized RPC parameter names are:

- `p_ogc_fid`: For geometry RPCs (number)
- `p_parcel_id`: For planner RPCs (string)
- `p_parcel_ids`: For batch operations (string[])

## Validation

Use the validation utilities to ensure ID integrity:

```typescript
import { isValidOgcFid, isValidParcelId } from '@/utils/parcelId';

if (isValidOgcFid(ogcFid)) {
  // Safe to use ogcFid
}

if (isValidParcelId(parcelId)) {
  // Safe to use parcelId
}
```

## Best Practices

1. **Always use the standardized utilities** for ID conversion and extraction
2. **Use the correct ID type** for each RPC call
3. **Never query `public.parcels` directly** for planner fields - use `planner_join` or `planner_parcels` views
4. **Handle errors gracefully** when ID extraction fails
5. **Use the `getCompleteParcelData` function** for getting all parcel data in one call

## Common Patterns

### Pattern 1: Map Click → Parcel Selection

```typescript
const selection = createParcelSelection(feature);
if (selection) {
  const { ogcFid, parcelId } = selection;
  // Use ogcFid for geometry operations
  // Use parcelId for planner operations
}
```

### Pattern 2: RPC Call with Correct ID

```typescript
// For geometry operations
const geometry = await getParcelGeometry3857(ogcFid);

// For planner operations
const detail = await getParcelDetail(parcelId);
```

### Pattern 3: Batch Operations

```typescript
import { createBatchRpcParams } from '@/utils/parcelId';

const ogcFids = [12345, 67890, 11111];
const params = createBatchRpcParams(ogcFids);
// Returns: { p_parcel_ids: ["12345", "67890", "11111"] }
```

## Error Handling

Always handle potential errors when working with IDs:

```typescript
try {
  const ogcFid = extractOgcFidFromFeature(feature);
  if (!ogcFid) {
    throw new Error('Invalid feature: no ogc_fid found');
  }
  
  const parcelData = await getCompleteParcelData(ogcFid);
  // Process parcel data...
} catch (error) {
  console.error('Error processing parcel:', error);
  // Handle error appropriately
}
```

## Testing

Use the provided test utilities to verify ID handling:

```typescript
import { describe, it, expect } from 'vitest';
import { ogcFidToParcelId, parcelIdToOgcFid } from '@/utils/parcelId';

describe('ID Conversion', () => {
  it('converts ogc_fid to parcel_id', () => {
    expect(ogcFidToParcelId(12345)).toBe('12345');
  });
  
  it('converts parcel_id to ogc_fid', () => {
    expect(parcelIdToOgcFid('12345')).toBe(12345);
  });
});
```

This standardization ensures consistent ID handling throughout the application and prevents common errors related to ID type mismatches.
