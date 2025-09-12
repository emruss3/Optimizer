# 🧠 Parcel Intelligence Platform – Bolt Jumpstart

This repo initializes your real estate intelligence platform using Mapbox + Supabase. The MVP goal is a dynamic parcel map, pulling live data from Supabase, with clickable parcels and real-time overlays based on zoning, development potential, and investment metrics.

---

## 🎯 END GOAL

**An investor-grade platform to evaluate any parcel for its highest and best use** – in real time, from the map.

### 💡 Feature Highlights (End-State Vision)

- 🗺️ Interactive Mapbox viewer with zoom-based parcel loading
- 📦 Parcel-level data including zoning, acreage, setbacks, overlays
- 📊 Financial underwriting panel (IRR, build cost, yield)
- 🔄 Scenario comparison (for-sale vs rental strategies)
- 🧩 **NEW: Assemblage Engine** - Combine multiple parcels for optimal yield analysis
- 🧱 Unit yield calculator based on zoning + site constraints
- 🧭 Overlay engine: zoning, topography, floodplain, comps
- 🎨 Data visualizations: heatmaps, traffic density, market trends
- 🧠 **NEW: AI Zoning Explainer** - Plain-language zoning analysis and violation fixes
- 💬 Real-time collaboration with comments and team sharing
- 👥 Role-based access control (viewer/analyst/manager/admin)
- 📄 One-click report export (PDF summary of any parcel)
- 📦 **NEW: Batch Export Engine** - Queue multiple projects for PDF/Excel export
- 🔍 Filter: "for sale", "by zoning", "highest IRR", etc.
- ⌨️ **NEW: Command Palette** - ⌘K global search for parcels, projects, actions
- 🏗️ **NEW: Assemblage Engine** - Multi-parcel yield optimization with ST_Union geometry
- 🤖 **NEW: AI Zoning Explainer** - Plain-language zoning analysis via OpenAI
- 💬 **NEW: Realtime Comments** - Live collaboration with unread badges
- 🎯 **NEW: Map Optimize Massing** - One-click optimization directly from map

---

## ✅ CURRENT STARTING POINT

This repo sets up:

- Supabase backend with `parcels` and `zoning` tables
- Mapbox map rendering
- Real-time parcel pull from Supabase via RPC or REST
- Parcel popup showing zoning + site data
- Multi-scenario underwriting analysis
- Collaborative project management
- Advanced data overlays with deck.gl
- **Sprint-4 NEW**: Assemblage engine, AI zoning explainer, batch export, command palette
- **Sprint-4 COMPLETE**: Full assemblage engine with ST_Union geometry, AI-powered zoning explanations, live comments, map-based optimization
- **Sprint-4 NEW**: Complete assemblage engine with ST_Union, AI explanations, realtime comments, map optimization

---

## 🚀 SETUP INSTRUCTIONS

### 1. Clone and install
```bash
git clone [your_repo_url]
cd project
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Fill out `.env` with:
- Your **Supabase URL**
- Your **Supabase anon key**
- Your **Mapbox token**
- **OpenAI key** for AI zoning explanations

---

## 🔐 .ENV Reference

```dotenv
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Mapbox
VITE_MAPBOX_API_KEY=pk.abc123...

# OpenAI (for AI features)
VITE_OPENAI_API_KEY=sk-...
```

---

## 🗃️ Supabase Schema (Key Tables)

### `parcels`
| Column        | Type    | Description                     |
|---------------|---------|---------------------------------|
| id            | UUID    | Primary key                     |
| address       | Text    | Street address                  |
| deededacreage | Float   | Lot acreage                     |
| sqft          | Integer | Square footage fallback         |
| zoning        | Text    | Zoning type (RS5, R6, etc.)     |

### `zoning`
| Column                       | Type   | Description                       |
|-----------------------------|--------|-----------------------------------|
| zoning                      | Text   | Primary key                       |
| max_far                     | Float  | Max Floor Area Ratio              |
| max_density_du_per_acre     | Float  | Max DU/acre                       |
| max_impervious_coverage_pct | Float  | Max coverage %                    |
| min_front_setback_ft        | Float  | Front setback                     |
| min_side_setback_ft         | Float  | Side setback                      |
| min_rear_setback_ft         | Float  | Rear setback                      |

---

## 🧭 MVP DEV PRIORITIES

1. **Mapbox working**
   - [x] Nashville-centered base map
   - [x] Pull `parcels` from Supabase on zoom
   - [x] Render parcels as polygon overlays
   - [x] Show parcel popup or drawer with full data

2. **Financial Analysis**
   - [x] Underwriting panel with configurable assumptions
   - [x] For-sale vs rental scenario comparison
   - [x] IRR, cash-on-cash, ROI calculations
   - [x] Sensitivity analysis and break-even metrics

3. **Collaboration & Sharing**
   - [x] Real-time comments on parcels and projects
   - [x] Project sharing with role-based permissions
   - [x] Team invitation system
   - [x] Live collaboration with Supabase Realtime

4. **Advanced Visualizations**
   - [x] Data overlays with deck.gl (heatmaps, traffic density)
   - [x] Zoning compliance visualization
   - [x] Professional site plan generator
   - [x] Interactive scenario comparison

5. **Power Tools (Sprint-4)**
   - [x] **Assemblage Engine** - Multi-parcel yield optimization
   - [x] **AI Zoning Explainer** - Plain-language zoning analysis
   - [x] **Command Palette** - ⌘K global search and navigation
   - [x] **Batch Export** - Queue multiple projects for PDF/Excel export
   - [x] **Enhanced Role-Based Access** - Granular permissions with UI guards
   - [x] **Performance Polish** - Skeleton loaders, touch targets, virtualization

---

## 🧪 Dev Commands

```bash
npm run dev        # Start local server
```

---

## 📁 Key Folders

- `/supabase/migrations/` – SQL for core schema
- `/docs/` – schema definitions, roadmap
- `.env` – local API config (not committed)

---

## 👷 Bolt Dev Team Notes

Start by ensuring:
- Map renders with Mapbox token
- Supabase pulls parcel data with geometry
- On-click (or hover) displays parcel popup with key info

From there: wire drawer, zoning join, IRR calc, filters, and assemblage engine.

**Sprint-4 Features:**
- Use ⌘K to open command palette for global search
- Select 2+ parcels and use "Combine Parcels" in Assemblage tab
- Click "AI Explain" on any zoning code for plain-language analysis
- Use batch export for multiple projects with email delivery
- All features respect role-based permissions (viewer/analyst/manager/admin)
- Use "Optimize Massing" button on map for instant yield analysis
- Live comments with /c shortcut and unread badges in header
- ST_Union assemblage geometry for accurate buildable area calculations
- Real-time cost updates with live proforma integration

---

## 🧠 Supabase Best Practices (Map + List Views)

### 🗂️ Use `parcels_list_view` for:
- Table/side-panel parcel listings
- Zoning filters
- Displaying parcel metadata

> ⚠️ Excludes `geometry` to prevent PostgREST 500 errors or slowdowns

---

### 🗺️ Use `parcels_map_geojson` or `get_parcels_in_bbox_v2(...)` for:
- Rendering parcel boundaries on the Mapbox map
- GeoJSON output from `wkb_geometry_4326` (SRID 4326)
- Fast bounding box queries using spatial index

Example RPC usage:
```sql
select * from get_parcels_in_bbox_v2(-86.9, 36.1, -86.7, 36.3) limit 1000;
```

---

### ⚙️ Performance Guidance

| Tip | Why It Matters |
|-----|----------------|
| ✅ Avoid `select(*)` from parcel tables with geometry | Raw geometry types cause PostgREST serialization errors |
| ✅ Always use `.limit(...)` | Prevents timeouts and browser crashes |
| ✅ Transform geometry to GeoJSON via `st_asgeojson(...)` | Mapbox-compatible |
| ✅ Use `parcels_list_view` for lists, `parcels_map_geojson` for maps | Clear separation of UI concerns |
