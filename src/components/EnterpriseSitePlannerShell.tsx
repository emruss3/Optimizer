import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { 
  Building, Car, TreePine, Settings, Play, RotateCcw, RotateCw, TrendingUp,
  AlertTriangle, CheckCircle, Target, BarChart3, DollarSign, Users,
  Home, Building2, Eye, Ruler, Move, Square, Circle, Trash2,
  Copy, AlignLeft, AlignCenter, AlignRight, AlignStartVertical,
  AlignCenterVertical, AlignEndVertical, ZoomIn, ZoomOut, Grid,
  MousePointer, Edit3, Maximize, MoreHorizontal, X
} from 'lucide-react';
import { SelectedParcel, MarketData, InvestmentAnalysis } from '../types/parcel';
import type { Element, PlannerConfig, PlannerOutput, SiteMetrics } from '../engine/types';
import { workerManager } from '../workers/workerManager';
import { feature3857To4326 } from '../utils/reproject';

interface EnterpriseSitePlannerProps {
  parcel: SelectedParcel;
  planElements?: Element[];
  metrics?: SiteMetrics;
  onInvestmentAnalysis?: (analysis: InvestmentAnalysis) => void;
}

interface DragState {
  isDragging: boolean;
  dragType: 'element' | 'vertex' | 'selection';
  elementId?: string;
  vertexId?: string;
  offset: { x: number; y: number };
  originalPosition: { x: number; y: number };
  originalVertices?: any[];
}

const EnterpriseSitePlanner: React.FC<EnterpriseSitePlannerProps> = ({
  parcel,
  planElements = [],
  metrics,
  onInvestmentAnalysis
}) => {
  console.log('🔍 [EnterpriseSitePlanner] Component rendered:', {
    parcelId: parcel?.ogc_fid,
    address: parcel?.address,
    hasPlanElements: planElements.length > 0,
    hasMetrics: !!metrics
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<Element[]>(planElements);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: 'selection',
    offset: { x: 0, y: 0 },
    originalPosition: { x: 0, y: 0 }
  });
  const [viewState, setViewState] = useState({
    zoom: 1,
    panX: 0,
    panY: 0
  });
  const [hasInitializedView, setHasInitializedView] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Toolbar state
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'edit'>('select');
  const [showLayers, setShowLayers] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);

  // Detect coordinate system (3857 = Web Mercator, 4326 = WGS84)
  const detectCoordinateSystem = useCallback((coords: number[][]): '3857' | '4326' => {
    if (!coords || coords.length === 0) return '4326';
    const sample = coords[0];
    // Web Mercator coordinates are typically in millions (e.g., -12200000, 3700000)
    // WGS84 coordinates are typically small (e.g., -122.0, 37.0)
    return (Math.abs(sample[0]) > 1000 || Math.abs(sample[1]) > 1000) ? '3857' : '4326';
  }, []);

  // Reproject and normalize parcel geometry
  const processedGeometry = useMemo(() => {
    if (!parcel?.geometry) {
      console.log('⚠️ [EnterpriseSitePlanner] No parcel geometry to process');
      return null;
    }

    // Step 1: Reproject from 3857 to 4326 if needed
    let reprojectedGeometry = parcel.geometry;
    let coords: number[][];
    
    if (parcel.geometry.type === 'Polygon') {
      coords = parcel.geometry.coordinates[0] as number[][];
    } else if (parcel.geometry.type === 'MultiPolygon') {
      coords = (parcel.geometry.coordinates as number[][][])[0][0];
    } else {
      console.warn('⚠️ [EnterpriseSitePlanner] Unsupported geometry type:', parcel.geometry.type);
      return null;
    }

    if (!coords || coords.length === 0) {
      console.warn('⚠️ [EnterpriseSitePlanner] No coordinates in geometry');
      return null;
    }

    const coordSystem = detectCoordinateSystem(coords);
    console.log('🌐 [EnterpriseSitePlanner] Processing geometry:', {
      originalType: parcel.geometry.type,
      coordinateSystem: coordSystem,
      sampleCoord: coords[0]
    });

    if (coordSystem === '3857') {
      console.log('🔄 [EnterpriseSitePlanner] Reprojecting from 3857 to 4326');
      reprojectedGeometry = feature3857To4326(parcel.geometry);
      // Update coords after reprojection
      if (reprojectedGeometry.type === 'Polygon') {
        coords = reprojectedGeometry.coordinates[0] as number[][];
      } else if (reprojectedGeometry.type === 'MultiPolygon') {
        coords = (reprojectedGeometry.coordinates as number[][][])[0][0];
      }
      console.log('✅ [EnterpriseSitePlanner] Reprojected, new sample coord:', coords[0]);
    }

    // Step 2: Calculate bounds from reprojected geometry
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    coords.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    const bounds = { minX, minY, maxX, maxY };
    const geometryWidth = maxX - minX;
    const geometryHeight = maxY - minY;

    console.log('📐 [EnterpriseSitePlanner] Calculated bounds:', {
      bounds,
      geometrySize: { width: geometryWidth, height: geometryHeight }
    });

    // Step 3: Normalize coordinates (subtract minX/minY to start at origin)
    const normalizeCoords = (coords: number[][]): number[][] => {
      return coords.map(([x, y]) => [x - bounds.minX, y - bounds.minY]);
    };

    let normalizedGeometry: any;
    if (reprojectedGeometry.type === 'Polygon') {
      normalizedGeometry = {
        ...reprojectedGeometry,
        coordinates: [normalizeCoords(reprojectedGeometry.coordinates[0] as number[][])]
      };
    } else if (reprojectedGeometry.type === 'MultiPolygon') {
      normalizedGeometry = {
        ...reprojectedGeometry,
        coordinates: [[normalizeCoords((reprojectedGeometry.coordinates as number[][][])[0][0])]]
      };
    } else {
      return null;
    }

    console.log('✅ [EnterpriseSitePlanner] Geometry processed:', {
      normalized: true,
      normalizedBounds: { minX: 0, minY: 0, maxX: geometryWidth, maxY: geometryHeight },
      sampleNormalizedCoord: normalizedGeometry.coordinates[0]?.[0]?.[0]
    });

    return {
      geometry: normalizedGeometry,
      bounds: { minX: 0, minY: 0, maxX: geometryWidth, maxY: geometryHeight },
      originalBounds: bounds
    };
  }, [parcel?.geometry, detectCoordinateSystem]);

  // Calculate bounds from geometry (legacy function, kept for compatibility)
  const calculateBounds = useCallback((geometry: any): { minX: number; minY: number; maxX: number; maxY: number } | null => {
    if (!geometry || !geometry.coordinates) return null;

    let coords: number[][];
    if (geometry.type === 'Polygon') {
      coords = geometry.coordinates[0] as number[][];
    } else if (geometry.type === 'MultiPolygon') {
      coords = (geometry.coordinates as number[][][])[0][0];
    } else {
      return null;
    }

    if (!coords || coords.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    coords.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    return { minX, minY, maxX, maxY };
  }, []);

  // Fit viewport to parcel geometry (using processed/normalized geometry)
  const fitViewToParcel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedGeometry) {
      console.log('⚠️ [EnterpriseSitePlanner] Cannot fit view: missing canvas or processed geometry');
      return;
    }

    const { bounds } = processedGeometry;
    const geometryWidth = bounds.maxX - bounds.minX; // Already normalized, so minX=0, minY=0
    const geometryHeight = bounds.maxY - bounds.minY;

    if (geometryWidth === 0 || geometryHeight === 0) {
      console.warn('⚠️ [EnterpriseSitePlanner] Invalid geometry dimensions:', { geometryWidth, geometryHeight });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    // Calculate zoom to fit with padding
    const padding = 40;
    const scaleX = (canvasWidth - padding * 2) / geometryWidth;
    const scaleY = (canvasHeight - padding * 2) / geometryHeight;
    const zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1x

    // Since geometry is normalized (starts at 0,0), center it on canvas
    // Transform order: translate(panX, panY) then scale(zoom)
    // After transform: point (x,y) becomes (panX*zoom + x*zoom, panY*zoom + y*zoom)
    // To center geometry: center (width/2, height/2) should map to (canvasWidth/2, canvasHeight/2)
    // So: panX*zoom + (width/2)*zoom = canvasWidth/2
    // Therefore: panX = (canvasWidth/2)/zoom - width/2
    const centerX = geometryWidth / 2;
    const centerY = geometryHeight / 2;
    const panX = (canvasWidth / 2) / zoom - centerX;
    const panY = (canvasHeight / 2) / zoom - centerY;
    
    console.log('🔧 [EnterpriseSitePlanner] Viewport calculation details:', {
      geometryCenter: { x: centerX, y: centerY },
      canvasCenter: { x: canvasWidth / 2, y: canvasHeight / 2 },
      zoom,
      calculatedPan: { x: panX, y: panY },
      expectedCenterAfterTransform: {
        x: panX * zoom + centerX * zoom,
        y: panY * zoom + centerY * zoom
      }
    });

    console.log('🎯 [EnterpriseSitePlanner] Fitting view to parcel:', {
      normalizedBounds: bounds,
      canvasSize: { width: canvasWidth, height: canvasHeight },
      geometrySize: { width: geometryWidth, height: geometryHeight },
      calculatedZoom: zoom,
      calculatedPan: { x: panX, y: panY }
    });

    setViewState({ zoom, panX, panY });
    setHasInitializedView(true);
  }, [processedGeometry]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || 800; // Fallback width
      const height = rect.height || 600; // Fallback height
      
      console.log('📏 [EnterpriseSitePlanner] Resizing canvas:', {
        rectWidth: rect.width,
        rectHeight: rect.height,
        calculatedWidth: width,
        calculatedHeight: height,
        devicePixelRatio: window.devicePixelRatio
      });
      
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      // Force a render after resize (will be handled by render effect)
      // Re-fit view if parcel is loaded
      if (processedGeometry && hasInitializedView) {
        setTimeout(fitViewToParcel, 0);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [processedGeometry, hasInitializedView, fitViewToParcel, renderElements]);

  // Fit view to parcel when processed geometry is first loaded
  useEffect(() => {
    if (processedGeometry && !hasInitializedView) {
      console.log('🎯 [EnterpriseSitePlanner] Initializing view to fit parcel');
      // Use requestAnimationFrame to ensure canvas is fully ready
      requestAnimationFrame(() => {
        setTimeout(() => {
          fitViewToParcel();
          // Force a render after viewport is set
          // The render effect should also trigger, but this ensures it happens
          setTimeout(() => {
            console.log('🔄 [EnterpriseSitePlanner] Forcing render after viewport init');
            renderElements();
          }, 100);
        }, 100);
      });
    }
  }, [processedGeometry, hasInitializedView, fitViewToParcel, renderElements]);
  
  // Also render immediately when processedGeometry becomes available (even before viewport init)
  useEffect(() => {
    if (processedGeometry) {
      console.log('🔄 [EnterpriseSitePlanner] processedGeometry available, triggering render');
      // Small delay to ensure canvas is initialized
      requestAnimationFrame(() => {
        renderElements();
      });
    }
  }, [processedGeometry, renderElements]);

  // Render parcel boundary and elements on canvas
  const renderElements = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('⚠️ [EnterpriseSitePlanner] Canvas ref not available');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('⚠️ [EnterpriseSitePlanner] Canvas context not available');
      return;
    }

    const displayWidth = canvas.width / window.devicePixelRatio;
    const displayHeight = canvas.height / window.devicePixelRatio;

    console.log('🎨 [EnterpriseSitePlanner] Rendering canvas:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      displayWidth,
      displayHeight,
      devicePixelRatio: window.devicePixelRatio,
      elementsCount: elements.length,
      hasParcel: !!parcel,
      hasProcessedGeometry: !!processedGeometry,
      viewState
    });

    // Clear canvas with a light background to verify canvas is working
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw a test rectangle to verify canvas rendering works
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(10, 10, 100, 100);
    console.log('✅ [EnterpriseSitePlanner] Test rectangle drawn at (10, 10)');

    // Apply view transformations
    // Transform order: translate then scale
    // This centers the geometry, then scales it
    ctx.save();
    ctx.translate(viewState.panX, viewState.panY);
    ctx.scale(viewState.zoom, viewState.zoom);

    console.log('🔧 [EnterpriseSitePlanner] Applied view transform:', {
      panX: viewState.panX,
      panY: viewState.panY,
      zoom: viewState.zoom,
      transformOrder: 'translate then scale'
    });

    // Render parcel boundary first (as background)
    // Use processed geometry (already reprojected and normalized)
    if (processedGeometry) {
      const coords = processedGeometry.geometry.type === 'Polygon'
        ? processedGeometry.geometry.coordinates[0]
        : processedGeometry.geometry.coordinates[0][0];
      
      console.log('🎨 [EnterpriseSitePlanner] Rendering parcel boundary:', {
        geometryType: processedGeometry.geometry.type,
        coordinateCount: coords?.length,
        firstCoord: coords?.[0],
        lastCoord: coords?.[coords?.length - 1],
        bounds: processedGeometry.bounds,
        viewState
      });
      
      renderParcelBoundary(ctx, processedGeometry.geometry);
      
      // Draw a test point at the first coordinate to verify it's visible
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(coords[0][0], coords[0][1], 5, 0, Math.PI * 2);
      ctx.fill();
      console.log('🔴 [EnterpriseSitePlanner] Test point drawn at first coordinate:', coords[0]);
    } else {
      console.warn('⚠️ [EnterpriseSitePlanner] No processed geometry to render');
    }

    // Render generated elements on top
    const elementTypes = [...new Set(elements.map(e => e.type))];
    console.log('🎨 [EnterpriseSitePlanner] Rendering elements:', {
      count: elements.length,
      types: elementTypes,
      selectedId: selectedElement
    });
    elements.forEach((element) => {
      renderElement(ctx, element, element.id === selectedElement);
    });

    ctx.restore();
    
    // Draw viewport info for debugging
    ctx.fillStyle = 'black';
    ctx.font = '12px monospace';
    ctx.fillText(`Zoom: ${viewState.zoom.toFixed(4)}`, 10, 20);
    ctx.fillText(`Pan: (${viewState.panX.toFixed(1)}, ${viewState.panY.toFixed(1)})`, 10, 35);
    ctx.fillText(`Canvas: ${canvas.width}x${canvas.height}`, 10, 50);
    if (processedGeometry) {
      ctx.fillText(`Bounds: ${processedGeometry.bounds.maxX.toFixed(1)}x${processedGeometry.bounds.maxY.toFixed(1)}`, 10, 65);
    }
    
    console.log('✅ [EnterpriseSitePlanner] Canvas render complete');
  }, [elements, selectedElement, viewState, processedGeometry]);

  // Render individual element
  const renderElement = (ctx: CanvasRenderingContext2D, element: Element, isSelected: boolean) => {
    ctx.save();
    
    // Set styles
    ctx.strokeStyle = isSelected ? '#3B82F6' : '#6B7280';
    ctx.lineWidth = isSelected ? 3 : 1;
    ctx.fillStyle = getElementColor(element);
    ctx.globalAlpha = 0.3;

    // Draw element based on type
    switch (element.type) {
      case 'building':
        renderBuilding(ctx, element);
        break;
      case 'parking':
        renderParking(ctx, element);
        break;
      case 'greenspace':
        renderGreenspace(ctx, element);
        break;
    }

    ctx.restore();
  };

  // Render building element
  const renderBuilding = (ctx: CanvasRenderingContext2D, element: Element) => {
    const coords = element.geometry.coordinates[0];
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  // Render parking element
  const renderParking = (ctx: CanvasRenderingContext2D, element: Element) => {
    const coords = element.geometry.coordinates[0];
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  // Render greenspace element
  const renderGreenspace = (ctx: CanvasRenderingContext2D, element: Element) => {
    const coords = element.geometry.coordinates[0];
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  // Render parcel boundary (geometry is already normalized)
  const renderParcelBoundary = useCallback((ctx: CanvasRenderingContext2D, geometry: any) => {
    try {
      ctx.save();
      
      // Draw parcel boundary with light fill and outline
      ctx.strokeStyle = '#374151'; // Dark gray outline
      ctx.lineWidth = 2 / viewState.zoom; // Adjust line width for zoom
      ctx.fillStyle = '#3B82F6'; // Blue fill (more visible)
      ctx.globalAlpha = 0.6;
      
      let coords: number[][];
      
      if (geometry.type === 'Polygon') {
        coords = geometry.coordinates[0] as number[][];
      } else if (geometry.type === 'MultiPolygon') {
        coords = (geometry.coordinates as number[][][])[0][0];
      } else {
        console.warn('⚠️ [EnterpriseSitePlanner] Unsupported geometry type for boundary:', geometry.type);
        ctx.restore();
        return;
      }
      
      if (coords && coords.length > 0) {
        console.log('📐 [EnterpriseSitePlanner] Rendering coordinates:', {
          count: coords.length,
          firstCoord: coords[0],
          lastCoord: coords[coords.length - 1],
          minX: Math.min(...coords.map(c => c[0])),
          maxX: Math.max(...coords.map(c => c[0])),
          minY: Math.min(...coords.map(c => c[1])),
          maxY: Math.max(...coords.map(c => c[1]))
        });
        
        // Geometry is already normalized (starts at 0,0), render directly
        ctx.beginPath();
        ctx.moveTo(coords[0][0], coords[0][1]);
        for (let i = 1; i < coords.length; i++) {
          ctx.lineTo(coords[i][0], coords[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw coordinate points for debugging
        ctx.fillStyle = 'red';
        ctx.strokeStyle = 'red';
        coords.slice(0, 5).forEach((coord, idx) => {
          ctx.beginPath();
          ctx.arc(coord[0], coord[1], 3, 0, Math.PI * 2);
          ctx.fill();
          console.log(`  📍 Point ${idx}: (${coord[0].toFixed(2)}, ${coord[1].toFixed(2)})`);
        });
        
        console.log('✅ [EnterpriseSitePlanner] Parcel boundary rendered (already normalized)');
      } else {
        console.warn('⚠️ [EnterpriseSitePlanner] No coordinates in parcel geometry');
      }
      
      ctx.restore();
    } catch (error) {
      console.error('❌ [EnterpriseSitePlanner] Error rendering parcel boundary:', error);
      console.error('❌ [EnterpriseSitePlanner] Error stack:', error instanceof Error ? error.stack : 'No stack');
    }
  }, [viewState.zoom]);

  // Get element color
  const getElementColor = (element: Element): string => {
    switch (element.type) {
      case 'building':
        return '#3B82F6';
      case 'parking':
        return '#10B981';
      case 'greenspace':
        return '#059669';
      default:
        return '#6B7280';
    }
  };

  // Handle canvas interactions
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / viewState.zoom - viewState.panX;
    const y = (event.clientY - rect.top) / viewState.zoom - viewState.panY;

    // Find clicked element
    const clickedElement = elements.find(element => {
      // Simple point-in-polygon check
      return isPointInElement(x, y, element);
    });

    setSelectedElement(clickedElement?.id || null);
  }, [elements, viewState]);

  // Check if point is in element
  const isPointInElement = (x: number, y: number, element: Element): boolean => {
    // Simplified point-in-polygon check
    const coords = element.geometry.coordinates[0];
    let inside = false;
    
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      if (((coords[i][1] > y) !== (coords[j][1] > y)) &&
          (x < (coords[j][0] - coords[i][0]) * (y - coords[i][1]) / (coords[j][1] - coords[i][1]) + coords[i][0])) {
        inside = !inside;
      }
    }
    
    return inside;
  };

  // Generate site plan using worker
  const generateSitePlan = useCallback(async () => {
    console.log('🚀 [EnterpriseSitePlanner] Starting site plan generation...');
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      console.log('🔍 [EnterpriseSitePlanner] Parcel data:', {
        ogc_fid: parcel.ogc_fid,
        address: parcel.address,
        hasGeometry: !!parcel.geometry,
        hasProcessedGeometry: !!processedGeometry,
        geometryType: parcel.geometry?.type
      });

      // Use workerManager directly
      console.log('🔍 [EnterpriseSitePlanner] Checking workerManager:', {
        exists: !!workerManager,
        hasGenerateSitePlan: typeof workerManager?.generateSitePlan === 'function'
      });
      
      // Create planner config
      const config: PlannerConfig = {
        parcelId: parcel.ogc_fid,
        // Use original geometry for worker (before normalization)
        // Worker expects coordinates in their original system
        buildableArea: parcel.geometry as any,
        zoning: {
          frontSetbackFt: 20,
          sideSetbackFt: 10,
          rearSetbackFt: 20,
          maxFar: 2.0,
          maxCoveragePct: 60,
          minParkingRatio: 1.0
        },
        designParameters: {
          targetFAR: 1.5,
          targetCoveragePct: 50,
          parking: {
            targetRatio: 1.5,
            stallWidthFt: 9,
            stallDepthFt: 18,
            aisleWidthFt: 12,
            adaPct: 5,
            evPct: 10,
            layoutAngle: 0
          },
          buildingTypology: 'bar',
          numBuildings: 2
        }
      };

      console.log('🔍 [EnterpriseSitePlanner] Config created:', {
        parcelId: config.parcelId,
        hasBuildableArea: !!config.buildableArea,
        zoning: config.zoning,
        designParams: config.designParameters
      });

      setGenerationProgress(25);
      console.log('⏳ [EnterpriseSitePlanner] Calling workerManager.generateSitePlan...');
      console.log('⏳ [EnterpriseSitePlanner] Geometry:', parcel.geometry);
      console.log('⏳ [EnterpriseSitePlanner] Config:', config);
      
      const startTime = Date.now();
      const result = await workerManager.generateSitePlan(parcel.geometry as any, config);
      const duration = Date.now() - startTime;
      
      console.log(`✅ [EnterpriseSitePlanner] Worker completed in ${duration}ms:`, {
        hasElements: !!result?.elements,
        elementsCount: result?.elements?.length,
        hasMetrics: !!result?.metrics,
        metrics: result?.metrics
      });
      
      setGenerationProgress(75);

      if (!result || !result.elements) {
        console.error('❌ [EnterpriseSitePlanner] Invalid result from worker:', result);
        throw new Error('Invalid result from worker: missing elements');
      }

      console.log('🔍 [EnterpriseSitePlanner] Setting elements:', result.elements.length);
      setElements(result.elements);
      setGenerationProgress(100);
      console.log('✅ [EnterpriseSitePlanner] Elements set, generation complete');

      // Call investment analysis callback
      if (onInvestmentAnalysis) {
        console.log('💰 [EnterpriseSitePlanner] Calculating investment analysis...');
        const analysis: InvestmentAnalysis = {
          totalInvestment: result.metrics.totalBuiltSF * 150,
          projectedRevenue: result.metrics.totalBuiltSF * 2.5 * 12,
          operatingExpenses: result.metrics.totalBuiltSF * 1.0 * 12,
          netOperatingIncome: result.metrics.totalBuiltSF * 1.5 * 12,
          capRate: 0.06,
          irr: 0.12,
          paybackPeriod: 8.3,
          riskAssessment: 'medium'
        };
        console.log('💰 [EnterpriseSitePlanner] Investment analysis:', analysis);
        onInvestmentAnalysis(analysis);
      }

    } catch (error) {
      console.error('❌ [EnterpriseSitePlanner] Error generating site plan:', error);
      console.error('❌ [EnterpriseSitePlanner] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
    } finally {
      console.log('🏁 [EnterpriseSitePlanner] Generation finished, resetting state');
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  }, [parcel, onInvestmentAnalysis]);

  // Auto-generate site plan when parcel loads (if no existing elements)
  useEffect(() => {
    console.log('🔍 [EnterpriseSitePlanner] Auto-generation check:', {
      hasParcel: !!parcel,
      hasPlanElements: planElements.length > 0,
      hasElements: elements.length > 0,
      isGenerating
    });

    // Only auto-generate if:
    // 1. We have a parcel
    // 2. No existing plan elements from props
    // 3. No existing elements in state
    // 4. Not currently generating
    if (parcel && planElements.length === 0 && elements.length === 0 && !isGenerating) {
      console.log('🚀 [EnterpriseSitePlanner] Auto-generating site plan on mount...');
      generateSitePlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.ogc_fid]); // Only run when parcel changes - generateSitePlan is stable via useCallback

  // Update elements when props change
  useEffect(() => {
    console.log('🔍 [EnterpriseSitePlanner] planElements changed:', {
      planElementsCount: planElements.length,
      hasElements: elements.length > 0
    });
    if (planElements.length > 0) {
      console.log('✅ [EnterpriseSitePlanner] Setting elements from props');
      setElements(planElements);
    }
  }, [planElements, elements.length]);

  // Render when elements, processedGeometry, or viewState changes
  useEffect(() => {
    console.log('🔍 [EnterpriseSitePlanner] Render effect triggered:', {
      elementsCount: elements.length,
      hasParcel: !!parcel,
      hasParcelGeometry: !!parcel?.geometry,
      hasProcessedGeometry: !!processedGeometry,
      viewState,
      hasInitializedView
    });
    
    // Only render if we have processed geometry or elements
    if (processedGeometry || elements.length > 0) {
      // Use requestAnimationFrame to ensure canvas is ready
      requestAnimationFrame(() => {
        renderElements();
      });
    }
  }, [renderElements, processedGeometry, elements.length, viewState, hasInitializedView]);

  return (
    <div className="flex flex-col h-full bg-gray-50 min-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold">Site Planner</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={generateSitePlan}
              disabled={isGenerating}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{isGenerating ? 'Generating...' : 'Generate Plan'}</span>
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className="p-2 text-gray-600 hover:text-gray-900"
          >
            <BarChart3 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowLayers(!showLayers)}
            className="p-2 text-gray-600 hover:text-gray-900"
          >
            <Grid className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="w-16 bg-white border-r flex flex-col items-center py-4 space-y-2">
          <button
            onClick={() => setActiveTool('select')}
            className={`p-2 rounded ${activeTool === 'select' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <MousePointer className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTool('draw')}
            className={`p-2 rounded ${activeTool === 'draw' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Square className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTool('edit')}
            className={`p-2 rounded ${activeTool === 'edit' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Edit3 className="w-5 h-5" />
          </button>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 relative min-h-[400px] bg-gray-100">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair absolute inset-0"
            onClick={handleCanvasClick}
            style={{ display: 'block' }}
          />
          
          {/* Generation Progress */}
          {isGenerating && (
            <div className="absolute top-4 left-4 bg-white p-4 rounded-lg shadow-lg">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Generating site plan...</span>
              </div>
              <div className="w-48 h-2 bg-gray-200 rounded-full mt-2">
                <div 
                  className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Metrics HUD */}
        {showMetrics && metrics && (
          <div className="w-80 bg-white border-l p-4">
            <h3 className="text-lg font-semibold mb-4">Site Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">FAR:</span>
                <span className="font-medium">{metrics.achievedFAR.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Coverage:</span>
                <span className="font-medium">{metrics.siteCoveragePct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Parking Ratio:</span>
                <span className="font-medium">{metrics.parkingRatio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Built SF:</span>
                <span className="font-medium">{metrics.totalBuiltSF.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Open Space:</span>
                <span className="font-medium">{metrics.openSpacePct.toFixed(1)}%</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Compliance:</span>
                {metrics.zoningCompliant ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnterpriseSitePlanner;
