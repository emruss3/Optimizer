import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { MAPBOX_TOKEN, MAP_STYLE, PARCELS_TILE_URL, NASHVILLE_CENTER } from '../lib/mapbox';
import mapboxgl from 'mapbox-gl';
import { useActiveProject } from '../store/project';
import { useUIStore } from '../store/ui';
import { sizeColorExpr, zoningColorExpr } from '../map/styleExpressions';
import { SelectedParcel } from '../types/parcel';


interface MapViewProps {
  onParcelClick: (parcel: SelectedParcel) => void;
  selectedParcelIds: string[];
  activeProjectId: string | null;
  activeProjectName: string | null;
}

const MapView = React.memo(function MapView({ 
  onParcelClick,
  selectedParcelIds,
  activeProjectId,
  activeProjectName
}: MapViewProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [containerError, setContainerError] = React.useState<string | null>(null);
  const [mapError, setMapError] = React.useState<string | null>(null);
  
  // Memoized filter calculations
  const { filterMode, zoningFilters } = useUIStore();
  const sizeFilter = useMemo(() => 
    filterMode === "large" ? [">=", ["to-number", ["get", "sqft"]], 5000] :
    filterMode === "huge"  ? [">=", ["to-number", ["get", "sqft"]], 20000] :
    true,
    [filterMode]
  );
  
  const zoningFilter = useMemo(() => {
    const zones = zoningFilters?.activeZones ?? [];
    return zones.length
      ? ["in", ["to-string", ["get", "zoning"]], ...zones]
      : true;
  }, [zoningFilters?.activeZones]);
  
  const combinedFilter = useMemo(() => 
    ["all", sizeFilter, zoningFilter],
    [sizeFilter, zoningFilter]
  );

  // Create map once and add vector tiles
  useEffect(() => {
    if (mapRef.current) return; // prevent re-creation
    if (!mapContainerRef.current) return;
    
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [NASHVILLE_CENTER.longitude, NASHVILLE_CENTER.latitude],
      zoom: NASHVILLE_CENTER.zoom,
      maxZoom: 17,
      transformRequest: (url) => {
        // NO headers on tile requests → no OPTIONS storms
        if (url.includes('/functions/v1/mvt-parcels')) {
          return { url }; // no headers -> no preflight
        }
        return undefined;
      }
    });

    map.on("load", () => {
      if (!map.getSource("parcels")) {
        map.addSource("parcels", {
          type: "vector",
          tiles: [
            "https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/mvt-parcels?z={z}&x={x}&y={y}"
          ],
          minzoom: 10,
          maxzoom: 17,
          promoteId: "ogc_fid"   // <-- matches the SQL feature id
        });
        
        map.addLayer({
          id: "parcels-fill",
          type: "fill",
          source: "parcels",
          "source-layer": "parcels",  // must match ST_AsMVT layer name
          paint: { "fill-color": "#1d4ed8", "fill-opacity": 0.15 }
        });
        
        map.addLayer({
          id: "parcels-outline",
          type: "line",
          source: "parcels",
          "source-layer": "parcels",
          paint: { 
            "line-color": [
              "case",
              ["boolean", ["feature-state", "inProject"], false], "#f59e0b", // orange if selected
              "#1d4ed8" // default blue
            ],
            "line-width": 1
          }
        });
        
        // Mouse cursor for interactivity
        map.on("mouseenter", "parcels-fill", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "parcels-fill", () => (map.getCanvas().style.cursor = ""));
        
        // Click handler with robust validation - never sets 'unknown' parcels
        map.on("click", "parcels-fill", async (e) => {
          const hit = e.features?.[0] ?? map.queryRenderedFeatures(e.point, { layers: ["parcels-fill"] })[0];
          const { setDrawer, setSelectedParcel } = useUIStore.getState();
          const { activeProjectId, addParcel } = useActiveProject.getState();

          try {
            // Import supabase for the RPC call
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(
              import.meta.env.VITE_SUPABASE_URL,
              import.meta.env.VITE_SUPABASE_ANON_KEY
            );

            let row = null;

            // 1) fast path via ogc_fid from tile
            const fid = Number((hit?.id as string | number) ?? hit?.properties?.ogc_fid);
            if (Number.isFinite(fid)) {
              const { data, error } = await supabase.rpc("get_parcel_by_id", { p_ogc_fid: fid });
              if (error) throw error;
              row = Array.isArray(data) ? data[0] : data;
            } else {
              // 2) fallback: point-in-polygon
              const { lng, lat } = e.lngLat;
              const { data, error } = await supabase.rpc("get_parcel_at_point", { lon: lng, lat });
              if (error) throw error;
              row = Array.isArray(data) ? data[0] : data;
            }

            // Bail if RPC failed or geometry missing
            if (!row?.geometry || !Array.isArray(row.geometry.coordinates) || !row.geometry.coordinates.length) {
              console.warn('Click had no parcel geometry; ignoring.');
              return;
            }

            const ogc_fid = row.ogc_fid ?? row.id ?? null;
            if (ogc_fid == null) {
              console.warn('Click had no valid parcel ID; ignoring.');
              return;
            }

            // Create validated parcel object
            const parcel = {
              ogc_fid: String(ogc_fid),
              parcelnumb: row.parcelnumb ?? null,
              address: row.address ?? null,
              zoning: row.zoning ?? null,
              sqft: row.sqft ?? null,
              geometry: row.geometry // GeoJSON (Polygon or MultiPolygon)
            };

            if (activeProjectId) { 
              await addParcel(String(ogc_fid), parcel); 
              setDrawer("PROJECT"); 
            } else { 
              // Use the existing ParcelDrawer system
              onParcelClick(parcel);
            }

          } catch (err) { 
            console.error("parcel click failed", err); 
          }
        });

        // Debug click handler
        map.on("click", (e) => {
          const hit = map.queryRenderedFeatures(e.point, { layers: ["parcels-fill"] })[0];
          if (hit) {
            console.log("click →", { 
              id: hit.id, 
              props: hit.properties,
              source: hit.source,
              sourceLayer: hit.sourceLayer
            });
            console.log("Available properties:", Object.keys(hit.properties || {}));
          }
        });
      }
    })

    map.on('error', (e) => {
      console.error('Map error:', e.error);
      if (e.error?.message?.includes('access token')) {
        setMapError('invalid-token');
      } else {
        setMapError('general-error');
      }
    });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Remove onParcelClick dependency to prevent map recreation

  // Project highlights - show selected parcels with orange outline
  const refreshProjectHighlights = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("parcels")) return;
    
    // Clear all feature states first
    if (map.querySourceFeatures) {
      const features = map.querySourceFeatures("parcels", { sourceLayer: "parcels" });
      features.forEach(feature => {
        if (feature.id) {
          map.setFeatureState(
            { source: "parcels", sourceLayer: "parcels", id: feature.id },
            { inProject: false }
          );
        }
      });
    }
    
    // Set selected parcels
    const selectedIds = useActiveProject.getState().selectedParcels;
    const ids = Array.isArray(selectedIds) ? selectedIds : Array.from(selectedIds || []);
    
    ids.forEach((id) => {
      const numericId = parseInt(id);
      if (Number.isFinite(numericId)) {
        map.setFeatureState(
          { source: "parcels", sourceLayer: "parcels", id: numericId },
          { inProject: true }
        );
      }
    });
  }, []);

  // Apply project highlights on mount and when selection changes
  useEffect(() => {
    // Initial application when map is ready
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      refreshProjectHighlights();
    } else if (map) {
      map.once('styledata', refreshProjectHighlights);
    }
    
    // Subscribe to selection changes
    const unsub = useActiveProject.subscribe(
      (s) => s.selectedParcels,
      refreshProjectHighlights
    );
    return () => unsub();
  }, [refreshProjectHighlights]);

  // Resize handler for layout changes
  useEffect(() => {
    const onResize = () => mapRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  
  // Resize when drawer open/close state changes (only for layout-affecting drawers)
  useEffect(() => {
    const unsub = useUIStore.subscribe(
      (s) => s.openDrawer, 
      (newDrawer, prevDrawer) => {
        // Only resize for drawers that actually affect the layout (not parcel selection)
        if (newDrawer !== prevDrawer && newDrawer !== null) {
          // Use a longer delay to ensure the layout has settled
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.resize();
            }
          }, 150);
        }
      }
    );
    return () => unsub();
  }, []);

  // Apply color styling based on mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Wait for map to be ready and layer to exist
    const applyColorMode = () => {
      if (!map.getLayer("parcels-fill")) {
        // Layer not ready yet, try again after a short delay
        setTimeout(applyColorMode, 100);
        return;
      }

      const mode = useUIStore.getState().colorMode; // 'size' | 'zoning'
      map.setPaintProperty(
        "parcels-fill",
        "fill-color",
        mode === "zoning" ? zoningColorExpr() : sizeColorExpr()
      );
    };

    // Apply initial color mode
    if (map.isStyleLoaded()) {
      applyColorMode();
    } else {
      map.once('style.load', applyColorMode);
    }

    // Subscribe to future changes
    const unsub = useUIStore.subscribe(
      (s) => s.colorMode,
      (next) => {
        if (map.getLayer("parcels-fill")) {
          map.setPaintProperty(
            "parcels-fill",
            "fill-color",
            next === "zoning" ? zoningColorExpr() : sizeColorExpr()
          );
        }
      }
    );
    
    return () => unsub();
  }, []);

  // Apply map filters based on UI state
  const applyMapFilters = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    ["parcels-fill", "parcels-outline"].forEach((id) => {
      if (map.getLayer(id)) map.setFilter(id, combinedFilter as (string | number | boolean | null)[]);
    });
  }, [combinedFilter]);

  // Apply filters on mount and whenever UI filters change
  useEffect(() => {
    applyMapFilters();
  }, [applyMapFilters]);

  // Container height validation
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const check = () => {
      const h = el.clientHeight || 0;
      if (h < 1) setContainerError(`Map container has zero height. Container height: ${h}px`);
      else setContainerError(null);
    };

    const raf1 = requestAnimationFrame(() => requestAnimationFrame(check));
    const ro = new ResizeObserver(check);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf1);
      ro.disconnect();
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Mapbox Token Required
          </h3>
          <p className="text-gray-600">
            Please add your Mapbox API key to the .env file
          </p>
        </div>
      </div>
    );
  }

  if (containerError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-red-50">
        <div className="text-center p-8 max-w-md">
          <h3 className="text-lg font-semibold text-red-800 mb-2">
            Map Container Issue
          </h3>
          <p className="text-red-700 mb-4">
            {containerError}
          </p>
        </div>
      </div>
    );
  }

  if (mapError === 'invalid-token') {
    return (
      <div className="flex-1 flex items-center justify-center bg-red-50">
        <div className="text-center p-8 max-w-md">
          <h3 className="text-lg font-semibold text-red-800 mb-2">
            Invalid Mapbox Token
          </h3>
          <p className="text-red-700 mb-4">
            Your Mapbox access token is invalid or expired.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={mapContainerRef}
      className="relative w-full h-full flex-1 min-h-0"
      style={{ minHeight: 200 }}
      data-testid="map-container" 
      data-e2e="map-canvas"
    >
      {/* Map will be created in useEffect */}
    </div>
  );
});

export default MapView;