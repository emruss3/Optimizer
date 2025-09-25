# 🏗️ Parcel Intelligence Platform - Development Standards & Architecture

## 📋 PROJECT AUDIT SUMMARY

### ✅ **ARCHITECTURE OVERVIEW**
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **State Management**: Zustand (UI state) + React hooks (component state)
- **Backend**: Supabase (PostgreSQL + PostGIS + Realtime + Auth)
- **Mapping**: Mapbox GL JS + Custom GeoJSON rendering
- **Build System**: Vite with TypeScript, ESLint, Tailwind
- **Testing**: Playwright (E2E), missing unit tests

### 🎯 **CORE BUSINESS LOGIC**
1. **Parcel Analysis Engine** (`src/services/hbuAnalysis.ts`)
2. **Site Planning Engine** (`src/services/sitePlanEngine.ts`) 
3. **Financial Underwriting** (`src/lib/finance.ts`, `src/hooks/useUnderwriting.ts`)
4. **Assemblage Engine** (Supabase SQL functions)
5. **Real-time Collaboration** (Supabase Realtime + Comments)

---

## 🚨 **CRITICAL ISSUES IDENTIFIED**

### **1. SITE PLANNER ARCHITECTURE PROBLEMS**
- **Multiple Competing Components**: `EnterpriseSitePlanner`, `WorkingSitePlanner`, `SitePlanDesigner`
- **Inconsistent Data Flow**: Different components expect different prop shapes
- **Missing Error Boundaries**: No graceful error handling for geometry parsing
- **Coordinate System Confusion**: Mixed meter/feet conversions causing scaling issues

### **2. DATA FLOW INCONSISTENCIES**
- **Parcel Geometry**: Database returns `geometry` field, but components expect various formats
- **Type Safety**: `any` types used extensively, reducing type safety
- **State Management**: Mixed patterns between Zustand and useState
- **Prop Drilling**: Deep component trees without proper state architecture

### **3. PERFORMANCE BOTTLENECKS**
- **No Virtualization**: Large parcel datasets can crash browser
- **Unnecessary Re-renders**: Missing React.memo and useMemo optimizations
- **Bundle Size**: No code splitting or lazy loading
- **Database Queries**: No caching or query optimization

### **4. TECHNICAL DEBT**
- **TODO Comments**: 5 unresolved TODO items in codebase
- **Dead Code**: Multiple deleted components indicate architectural churn
- **Missing Tests**: No unit tests, minimal E2E coverage
- **Documentation**: Sparse inline documentation

---

## 📐 **ENTERPRISE DEVELOPMENT STANDARDS**

### **1. COMPONENT ARCHITECTURE RULES**

#### **🔹 Single Responsibility Principle**
```typescript
// ✅ GOOD: Each component has one clear purpose
const ParcelViewer = ({ parcel }) => { /* Display only */ };
const ParcelEditor = ({ parcel, onSave }) => { /* Edit only */ };

// ❌ BAD: Component tries to do everything
const ParcelComponent = ({ parcel, mode, onSave, onDelete, onShare }) => { /* Too many responsibilities */ };
```

#### **🔹 Props Interface Standards**
```typescript
// ✅ GOOD: Strongly typed interfaces
interface ParcelViewerProps {
  parcel: SelectedParcel;
  onSelect?: (parcel: SelectedParcel) => void;
  isLoading?: boolean;
}

// ❌ BAD: Any types or unclear interfaces
interface ComponentProps {
  data: any;
  callback: Function;
}
```

#### **🔹 Error Boundary Requirements**
```typescript
// ✅ REQUIRED: All complex components must have error boundaries
const SitePlanner = () => (
  <ErrorBoundary fallback={<SitePlannerError />}>
    <EnterpriseSitePlanner {...props} />
  </ErrorBoundary>
);
```

### **2. STATE MANAGEMENT STANDARDS**

#### **🔹 Zustand for Global State**
```typescript
// ✅ GOOD: Global UI state, user preferences, app-wide data
interface UIState {
  selectedParcelId: string | null;
  mapViewport: MapViewport;
  drawerOpen: boolean;
}

// ❌ BAD: Local component state in Zustand
interface BadState {
  modalInputValue: string; // This should be useState
  tempFormData: any; // This should be useState
}
```

#### **🔹 React State for Component State**
```typescript
// ✅ GOOD: Component-specific, temporary state
const SiteDesigner = () => {
  const [selectedElement, setSelectedElement] = useState<Element | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  // ...
};
```

### **3. DATA FLOW STANDARDS**

#### **🔹 Consistent Data Interfaces**
```typescript
// ✅ REQUIRED: All parcel data must conform to these interfaces
interface SelectedParcel {
  id: string;
  address: string;
  sqft: number;
  deeded_acres: number;
  geometry: GeoJSONGeometry; // Always GeoJSON format
  zoning_data: RegridZoningData;
}

interface RegridZoningData {
  zoning?: string;
  zoning_type?: string;
  max_far?: number;
  // ... all zoning fields
}
```

#### **🔹 Database Query Standards**
```sql
-- ✅ GOOD: Always return consistent field names
SELECT 
  ogc_fid as id,
  address,
  sqft,
  deeded_acres,
  ST_AsGeoJSON(wkb_geometry_4326)::jsonb AS geometry,
  z.* as zoning_data
FROM parcels p
LEFT JOIN zoning z ON z.zoning_id = p.zoning_id;

-- ❌ BAD: Inconsistent field names, missing types
SELECT * FROM parcels;
```

### **4. PERFORMANCE STANDARDS**

#### **🔹 React Optimization Requirements**
```typescript
// ✅ REQUIRED: Memoize expensive components
const ExpensiveComponent = React.memo(({ parcel, zoningData }) => {
  const calculations = useMemo(() => 
    computeExpensiveCalculation(parcel, zoningData),
    [parcel.id, zoningData.zoning]
  );
  
  return <div>{calculations.result}</div>;
});

// ✅ REQUIRED: Memoize expensive calculations
const useParcelCalculations = (parcel: SelectedParcel) => {
  return useMemo(() => ({
    buildableArea: calculateBuildableArea(parcel),
    maxUnits: calculateMaxUnits(parcel),
    investmentMetrics: calculateMetrics(parcel)
  }), [parcel.id, parcel.sqft, parcel.zoning_data?.max_far]);
};
```

#### **🔹 Bundle Size Optimization**
```typescript
// ✅ REQUIRED: Lazy load heavy components
const SitePlanner = lazy(() => import('./EnterpriseSitePlanner'));
const HBUAnalysis = lazy(() => import('./HBUAnalysisPanel'));

// ✅ REQUIRED: Code splitting by route
const routes = [
  { path: '/analysis', component: lazy(() => import('./AnalysisPage')) },
  { path: '/reports', component: lazy(() => import('./ReportsPage')) }
];
```

### **5. ERROR HANDLING STANDARDS**

#### **🔹 Graceful Degradation**
```typescript
// ✅ REQUIRED: All components must handle missing data gracefully
const ParcelViewer = ({ parcel }: ParcelViewerProps) => {
  if (!parcel) {
    return <ParcelSkeleton />;
  }
  
  if (!parcel.geometry) {
    return <ParcelFallback parcel={parcel} />;
  }
  
  return <ParcelDisplay parcel={parcel} />;
};
```

#### **🔹 Error Boundary Pattern**
```typescript
// ✅ REQUIRED: Error boundaries for all major features
class SitePlannerErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>Site Planner Error</h2>
          <p>The site planner encountered an error. Please try again.</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Retry
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

### **6. TESTING STANDARDS**

#### **🔹 Unit Test Requirements**
```typescript
// ✅ REQUIRED: Test all business logic
describe('ParcelCalculations', () => {
  it('should calculate buildable area correctly', () => {
    const parcel = createMockParcel({ sqft: 4356, max_coverage_pct: 60 });
    const result = calculateBuildableArea(parcel);
    expect(result).toBe(2613.6); // 4356 * 0.6
  });
  
  it('should handle missing zoning data gracefully', () => {
    const parcel = createMockParcel({ zoning_data: null });
    const result = calculateBuildableArea(parcel);
    expect(result).toBeGreaterThan(0); // Should use fallback
  });
});
```

#### **🔹 E2E Test Requirements**
```typescript
// ✅ REQUIRED: Test critical user flows
test('Parcel analysis workflow', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="parcel-1234"]');
  await page.click('[data-testid="full-analysis-btn"]');
  
  // Should show site planner without errors
  await expect(page.locator('[data-testid="site-planner"]')).toBeVisible();
  await expect(page.locator('[data-testid="parcel-dimensions"]')).toContainText('sq ft');
});
```

---

## 🔧 **IMMEDIATE ACTION ITEMS**

### **Priority 1: Critical Fixes**
1. **Consolidate Site Planner Components** - Choose one implementation and delete others
2. **Fix Geometry Data Flow** - Ensure consistent `geometry` field format throughout
3. **Add Error Boundaries** - Wrap all major components in error boundaries
4. **Type Safety Audit** - Replace all `any` types with proper interfaces

### **Priority 2: Performance**
1. **Add React.memo** to all expensive components
2. **Implement useMemo** for calculations
3. **Add lazy loading** for heavy components
4. **Bundle analysis** and code splitting

### **Priority 3: Testing**
1. **Unit tests** for all business logic functions
2. **Integration tests** for critical user flows
3. **Visual regression tests** for site planner
4. **Performance benchmarks** for large datasets

### **Priority 4: Documentation**
1. **API documentation** for all public functions
2. **Component documentation** with usage examples
3. **Architecture decision records** (ADRs)
4. **Deployment and environment setup** guides

---

## 📊 **QUALITY METRICS**

### **Code Quality Gates**
- ✅ **TypeScript**: 90%+ type coverage (no `any` types)
- ✅ **ESLint**: Zero errors, warnings < 5
- ✅ **Test Coverage**: 80%+ for business logic
- ✅ **Bundle Size**: < 2MB initial, < 500KB per route
- ✅ **Performance**: LCP < 2.5s, FID < 100ms

### **Architecture Quality Gates**
- ✅ **Component Complexity**: Max 300 lines per component
- ✅ **Function Complexity**: Max 50 lines per function
- ✅ **Dependency Depth**: Max 3 levels of prop drilling
- ✅ **Error Handling**: 100% of components have error boundaries
- ✅ **Accessibility**: WCAG 2.1 AA compliance

---

## 🎯 **NEXT PHASE ROADMAP**

### **Phase 1: Stabilization (1-2 weeks)**
- Fix all critical site planner issues
- Implement comprehensive error handling
- Add unit tests for core business logic
- Consolidate component architecture

### **Phase 2: Performance (1 week)**
- React optimization (memo, useMemo, lazy loading)
- Bundle optimization and code splitting
- Database query optimization
- Implement performance monitoring

### **Phase 3: Enterprise Features (2-3 weeks)**
- Advanced site planning tools (CAD-level)
- Multi-parcel assemblage optimization
- Real-time collaboration features
- Advanced reporting and export

### **Phase 4: Scale Preparation (1-2 weeks)**
- Horizontal scaling architecture
- Advanced caching strategies
- Performance benchmarking
- Production deployment optimization

---

This document establishes the foundation for enterprise-grade development practices. All future development must follow these standards to ensure code quality, maintainability, and scalability.




