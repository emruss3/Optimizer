# 🏗️ Site Planner Architecture Deep Dive

## 📊 System Architecture Overview

The site planner is a complex multi-layered system with **5 distinct architectural layers** and **multiple data flow paths**. Here's the complete architectural analysis:

## 🎯 **Layer 1: Database & Backend (Supabase)**

### **Core Database Schema**
```sql
-- Primary Tables
parcels (ogc_fid, wkb_geometry_4326, address, sqft, zoning_id, ...)
zoning (zoning_id, max_far, max_coverage_pct, min_setbacks, ...)
roads (osm_id, name, highway, geom)
```

### **RPC Functions (Backend API Layer)**
1. **`get_parcel_by_id(ogc_fid)`** - Fast path for parcel details
2. **`get_parcel_at_point(lon, lat)`** - Fallback point-in-polygon lookup
3. **`get_parcel_geometry_3857(ogc_fid)`** - Web Mercator geometry for site planner
4. **`get_parcel_geometry_for_siteplan(ogc_fid)`** - Enhanced geometry with metrics
5. **`get_parcel_buildable_envelope(ogc_fid)`** - Setback analysis with road context
6. **`parcels_mvt_b64(z, x, y)`** - Vector tiles for map rendering

### **Edge Functions**
- **`mvt-parcels`** - Vector tile generation for map
- **`import-roads-from-mapbox`** - Road data import (current file)

## 🎯 **Layer 2: Data Services & Geometry Pipeline**

### **Geometry Processing Pipeline**
```
Database (WGS84) → Web Mercator (3857) → Meters → Feet → Normalized SVG
```

### **Key Services**
1. **`parcelGeometry.ts`** - Geometry fetching and conversion
   - `fetchParcelGeometry3857()` - Primary geometry source
   - `fetchParcelBuildableEnvelope()` - Setback analysis
   - `parseGeometryForSitePlanner()` - Coordinate normalization

2. **`sitePlanEngine.ts`** - Business logic engine
   - Zoning constraint analysis
   - Building massing calculations
   - Financial impact analysis

3. **`osmRoads.ts`** - Road data integration
   - Mapbox road import
   - Road context analysis

## 🎯 **Layer 3: State Management (Zustand + React)**

### **Global State (Zustand)**
```typescript
// src/store/ui.ts
interface UIState {
  openDrawer: Drawer | null;
  selectedParcel: any | null;
  filterMode: 'all' | 'large' | 'huge';
  colorMode: 'size' | 'zoning';
  selectionMode: 'single' | 'multi';
  selectedParcelIds: string[];
}
```

### **Component State (React Hooks)**
- **`useSitePlanDesigner`** - Site plan configuration and generation
- **`useActiveProject`** - Project management
- **Local component state** - UI interactions, tool selection, drag states

## 🎯 **Layer 4: Component Architecture**

### **Component Hierarchy**
```
App
├── MapView (Mapbox GL JS)
│   ├── Vector Tiles (mvt-parcels)
│   ├── Click Handlers
│   └── Parcel Selection
├── FullAnalysisModal
│   ├── SitePlanDesigner (Wrapper)
│   │   ├── useSitePlanDesigner (Hook)
│   │   └── SitePlanEngine (Business Logic)
│   └── EnterpriseSitePlanner (Visual CAD)
│       ├── SVG Canvas
│       ├── Mouse Handlers
│       ├── Element Management
│       └── AI Optimization
└── UI Store (Zustand)
```

### **Component Responsibilities**

#### **MapView.tsx** (Entry Point)
- Renders Mapbox GL JS map
- Handles parcel clicks via vector tiles
- Fast path: `get_parcel_by_id(ogc_fid)`
- Fallback: `get_parcel_at_point(lon, lat)`
- Updates global state with selected parcel

#### **FullAnalysisModal.tsx** (Modal Container)
- Tab-based interface (Overview, HBU, Site Plan, Visual, Financial)
- Data validation and fallback creation
- Error boundary wrapping
- Props standardization

#### **SitePlanDesigner.tsx** (Configuration Wrapper)
- Tab interface for site plan configuration
- Integrates with `useSitePlanDesigner` hook
- Financial data propagation to underwriting
- Auto-generation on configuration changes

#### **EnterpriseSitePlanner.tsx** (Visual CAD Engine)
- 5,143 lines of complex CAD functionality
- SVG-based canvas with professional tools
- Mouse interaction system (with bugs)
- AI optimization engine
- Layout template system

## 🎯 **Layer 5: Data Flow Architecture**

### **Primary Data Flow Path**
```
1. Map Click → Vector Tile (ogc_fid)
2. get_parcel_by_id(ogc_fid) → Parcel Details
3. FullAnalysisModal → Data Validation
4. SitePlanDesigner → Configuration
5. EnterpriseSitePlanner → Geometry Fetch
6. fetchParcelGeometry3857() → Web Mercator
7. Coordinate Conversion → Feet → SVG
8. Visual Rendering → User Interaction
```

### **Secondary Data Flow (Site Plan Engine)**
```
1. SitePlanDesigner → useSitePlanDesigner
2. SitePlanEngine → Zoning Analysis
3. Building Massing → Financial Impact
4. Results → UI Display
```

## 🔴 **Critical Architectural Issues**

### **1. Data Flow Inconsistencies**
```typescript
// Problem: Different components expect different data shapes
FullAnalysisModal: parcel.geometry
EnterpriseSitePlanner: parcelGeometry (fetched internally)
SitePlanDesigner: parcel.zoning_data, parcel.sqft
Database: ST_AsGeoJSON(wkb_geometry_4326)::jsonb AS geometry
```

### **2. Multiple Competing Implementations**
- **5 different site planner components** with overlapping functionality
- **Inconsistent prop interfaces** across components
- **Duplicate business logic** in multiple places

### **3. State Management Chaos**
- **Mixed patterns**: Zustand (global) + useState (local) + useReducer
- **Prop drilling**: Deep component trees without proper state architecture
- **State synchronization issues** between components

### **4. Geometry Pipeline Complexity**
- **Multiple coordinate systems**: WGS84 → Web Mercator → Meters → Feet → SVG
- **Inconsistent conversion factors** across components
- **No single source of truth** for geometry data

### **5. Performance Bottlenecks**
- **No memoization**: Expensive calculations run on every render
- **Large component files**: 5,143 lines in EnterpriseSitePlanner
- **No code splitting**: Entire site planner loads at once
- **Unnecessary re-renders**: Missing React.memo and useMemo

## 🎯 **Backend Integration Patterns**

### **RPC Function Architecture**
```sql
-- Fast Path (Optimized)
get_parcel_by_id(ogc_fid) → Single query with JOINs

-- Fallback Path
get_parcel_at_point(lon, lat) → Point-in-polygon lookup

-- Geometry Pipeline
get_parcel_geometry_3857(ogc_fid) → Web Mercator coordinates
get_parcel_geometry_for_siteplan(ogc_fid) → Enhanced with metrics
get_parcel_buildable_envelope(ogc_fid) → Setback analysis
```

### **Vector Tile System**
```typescript
// Mapbox Vector Tiles
tiles: ["https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/mvt-parcels?z={z}&x={x}&y={y}"]
promoteId: "ogc_fid"  // Enables fast feature lookup
```

### **Edge Function Integration**
- **`mvt-parcels`**: Generates vector tiles for map rendering
- **`import-roads-from-mapbox`**: Server-side road data import
- **CORS handling**: Server-side API calls avoid browser CORS issues

## 🎯 **Component Interaction Patterns**

### **Event Flow**
```
Map Click → Parcel Selection → Modal Open → Tab Selection → Component Render
```

### **Data Propagation**
```
Global State (Zustand) → Component Props → Local State → Child Components
```

### **Error Handling**
```
Error Boundaries → Fallback Components → User Feedback → Recovery Actions
```

## 🎯 **Performance Architecture**

### **Current Issues**
- **No virtualization**: Large datasets can crash browser
- **No lazy loading**: All components load immediately
- **No caching**: Repeated API calls for same data
- **No optimization**: Missing React.memo, useMemo, useCallback

### **Optimization Opportunities**
- **Code splitting**: Lazy load site planner components
- **Memoization**: Cache expensive calculations
- **Virtualization**: Handle large parcel datasets
- **Caching**: Cache geometry and zoning data

## 🎯 **Security Architecture**

### **Database Security**
- **Row Level Security (RLS)**: Supabase RLS policies
- **SECURITY DEFINER**: RPC functions run with elevated privileges
- **Input validation**: Parameterized queries prevent SQL injection

### **API Security**
- **CORS handling**: Server-side API calls
- **Authentication**: Supabase auth integration
- **Rate limiting**: Built into Supabase Edge Functions

## 🎯 **Scalability Architecture**

### **Current Limitations**
- **Single database**: No read replicas or sharding
- **No CDN**: Static assets served from single origin
- **No caching**: No Redis or similar caching layer
- **No load balancing**: Single Supabase instance

### **Scalability Opportunities**
- **Database optimization**: Indexes, query optimization
- **CDN integration**: Static asset delivery
- **Caching layer**: Redis for frequently accessed data
- **Microservices**: Split site planner into separate services

## 🎯 **Recommendations**

### **Immediate (Week 1)**
1. **Fix mouse handlers** in EnterpriseSitePlanner
2. **Standardize data interfaces** across components
3. **Add error boundaries** to all site planner usage
4. **Consolidate components** - remove redundant implementations

### **Short-term (Week 2-3)**
1. **Implement proper state management** - single source of truth
2. **Add performance optimizations** - memoization, code splitting
3. **Fix type safety** - replace all `any` types
4. **Complete missing features** - undo/redo, keyboard shortcuts

### **Medium-term (Month 1-2)**
1. **Refactor architecture** - proper separation of concerns
2. **Add comprehensive testing** - unit and integration tests
3. **Implement caching** - reduce database load
4. **Add monitoring** - performance and error tracking

### **Long-term (Month 3+)**
1. **Microservices architecture** - split into focused services
2. **Advanced features** - real-time collaboration, AI optimization
3. **Mobile optimization** - responsive design improvements
4. **Enterprise features** - multi-tenant support, advanced analytics

## 🎯 **Success Metrics**

### **Technical Metrics**
- **Performance**: <100ms geometry loading, 60fps interactions
- **Reliability**: 99.9% uptime, <1% error rate
- **Maintainability**: <500 lines per component, 90% test coverage

### **User Experience Metrics**
- **Usability**: <5 minutes to create site plan
- **Accuracy**: <0.1 feet measurement precision
- **Satisfaction**: >4.5/5 user rating

The site planner architecture is **functionally complete but architecturally complex**. The system works but requires significant refactoring to achieve production-ready quality, performance, and maintainability.





