# Courtyard Generate Flow Analysis (667574)

## Question from Supabase
Persist=true tip is courtyard (designed_court_sf=6215) but siteplanner_candidate metrics omit designed_court_sf/amenity; buildings OK. If client hydrates from candidate row not tip JSON, that explains Elements/designed_court miss.

**Confirm**: Does Generate apply tip response immediately to canvas Elements, or only hydrate from candidate row?

## Answer: Immediate Tip Response Painting

**Generate paints from tip response immediately, NOT from candidate row hydration.**

### Evidence Flow in `SiteWorkspace.tsx`

1. **Server RPC returns response** (`runServerMfPlan`, line 596-610):
   ```typescript
   let resp = effectiveContextId
     ? await generateMfSitePlanV2(contextOgcFid, effectiveContextId, { ... })
     : null;
   ```

2. **Response mapped IMMEDIATELY** (line 674-676):
   ```typescript
   const mapped = isSeedFamilyResponse(resp)
     ? seedFamilyPlanToElements(resp)    // ← Maps tip JSON to Elements
     : mfPlanToElements(resp);
   ```

3. **Elements painted to canvas BEFORE persistence** (line 720, 732-733):
   ```typescript
   let generated = mapped.elements;
   // ... validation ...
   const base = elements.filter(el => !isMfPlanElement(el) && !isSfPlanElement(el));
   setPlanOutput([...base, ...generated], serverMetrics ?? metrics);
   ```
   **This happens synchronously in `runServerMfPlan`, BEFORE `refreshCandidates` is called.**

4. **Candidate refresh happens AFTER painting** (line 801):
   ```typescript
   refreshCandidates();  // ← Updates rail UI, does NOT repaint canvas
   ```

### Key Points

- **Canvas Elements come from tip JSON** via `seedFamilyPlanToElements` or `mfPlanToElements`
- **Candidate row metrics** are used ONLY for:
  - Rail UI display (schemes list)
  - Smart sorting/filtering (courtyard preference)
  - Market margin enrichment
- **Candidate row does NOT re-paint canvas** after initial Generate

### Why Courtyard Might Not Appear

If courtyard geometry doesn't appear on canvas, the issue is:

1. **Tip JSON lacks greens[]/amenity[] arrays** with courtyard geometry, OR
2. **`seedFamilyPlanToElements` doesn't map them** (FIXED in commit `5c975639`)

The candidate row metrics are irrelevant for canvas rendering.

## Client Requirements for Courtyard Display

✅ **FIXED (5c975639)**: `seedFamilyPlanToElements` now maps `resp.greens[]` and `resp.amenity[]`:
```typescript
const seedGreens = (resp as { greens?: SeedFamilyGreen[] }).greens ?? [];
seedGreens.forEach((g, idx) => {
  if (!g?.geom_2274) return;
  let poly: Polygon = seedTo3857(g.geom_2274 as Polygon);
  elements.push({
    id: `${prefix}-green-${idx + 1}`,
    type: 'greenspace',
    name: g.kind === 'courtyard' || g.kind === 'court' ? 'Courtyard' : 'Open space',
    geometry: poly,
    properties: { areaSqFt: num(g.area_sqft) ?? undefined, color: '#86EFAC', ... },
  });
});
```

## Recommendation for Supabase

**Widen candidate metrics to include designed_court_sf/amenity** for:
- Rail UI transparency (show "Courtyard" regime in schemes list)
- Smart sorting/filtering (already working, but clearer with metrics)
- User feedback (see court SF in scheme summary)

But **this is NOT blocking canvas rendering**. Client will paint courtyard from tip JSON `greens[]` immediately, regardless of what's in the candidate row.

## Verify

When Supabase ships:
1. Persist selected tip without wrong-seed re-solve
2. Widen candidate metrics to include designed_court_sf

Client will:
- Already paint courtyard from tip JSON `greens[]` (fixed in `5c975639`)
- Show better rail UI when metrics include designed_court_sf
- Force fresh generate if old stale `tuck_under` candidates are filtered out (already implemented)

---
**Date**: 2026-09-13  
**HEAD**: `5c975639`  
**Status**: Client ready. Courtyard geometry will render from tip JSON `greens[]` when server provides it.
