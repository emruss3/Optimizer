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

  // Calculate bounds from geometry
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

  // Fit viewport to parcel geometry
  const fitViewToParcel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parcel?.geometry) return;

    const bounds = calculateBounds(parcel.geometry);
    if (!bounds) {
      console.warn('⚠️ [EnterpriseSitePlanner] Could not calculate bounds for parcel');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    const geometryWidth = bounds.maxX - bounds.minX;
    const geometryHeight = bounds.maxY - bounds.minY;

    if (geometryWidth === 0 || geometryHeight === 0) {
      console.warn('⚠️ [EnterpriseSitePlanner] Invalid geometry dimensions');
      return;
    }

    // Calculate zoom to fit with padding
    const padding = 40;
    const scaleX = (canvasWidth - padding * 2) / geometryWidth;
    const scaleY = (canvasHeight - padding * 2) / geometryHeight;
    const zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1x

    // Since we normalize coordinates to start at (0,0), we just need to center the geometry
    // The normalized geometry will have its top-left at (0,0), so we center it
    const normalizedCenterX = geometryWidth / 2;
    const normalizedCenterY = geometryHeight / 2;

    // Calculate pan to center normalized geometry on canvas
    const panX = canvasWidth / 2 - normalizedCenterX * zoom;
    const panY = canvasHeight / 2 - normalizedCenterY * zoom;

    console.log('🎯 [EnterpriseSitePlanner] Fitting view to parcel:', {
      bounds,
      canvasSize: { width: canvasWidth, height: canvasHeight },
      geometrySize: { width: geometryWidth, height: geometryHeight },
      calculatedZoom: zoom,
      calculatedPan: { x: panX, y: panY }
    });

    setViewState({ zoom, panX, panY });
    setHasInitializedView(true);
  }, [parcel?.geometry, calculateBounds]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      // Re-fit view if parcel is loaded
      if (parcel?.geometry && hasInitializedView) {
        setTimeout(fitViewToParcel, 0);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [parcel?.geometry, hasInitializedView, fitViewToParcel]);

  // Fit view to parcel when parcel geometry is first loaded
  useEffect(() => {
    if (parcel?.geometry && !hasInitializedView) {
      console.log('🎯 [EnterpriseSitePlanner] Initializing view to fit parcel');
      setTimeout(fitViewToParcel, 100); // Small delay to ensure canvas is ready
    }
  }, [parcel?.geometry, hasInitializedView, fitViewToParcel]);

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

    console.log('🎨 [EnterpriseSitePlanner] Rendering canvas:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      elementsCount: elements.length,
      hasParcel: !!parcel,
      hasParcelGeometry: !!parcel?.geometry
    });

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply view transformations
    ctx.save();
    ctx.scale(viewState.zoom, viewState.zoom);
    ctx.translate(viewState.panX, viewState.panY);

    // Render parcel boundary first (as background)
    if (parcel?.geometry) {
      let coords: number[][];
      if (parcel.geometry.type === 'Polygon') {
        coords = parcel.geometry.coordinates[0] as number[][];
      } else if (parcel.geometry.type === 'MultiPolygon') {
        coords = (parcel.geometry.coordinates as number[][][])[0][0];
      } else {
        coords = [];
      }

      const coordSystem = coords.length > 0 ? detectCoordinateSystem(coords) : null;
      const bounds = calculateBounds(parcel.geometry);
      
      console.log('🎨 [EnterpriseSitePlanner] Rendering parcel boundary:', {
        geometryType: parcel.geometry.type,
        coordinateSystem: coordSystem,
        coordinateCount: coords.length,
        sampleCoord: coords[0],
        bounds: bounds,
        needsReprojection: coordSystem === '3857'
      });
      renderParcelBoundary(ctx, parcel.geometry);
    } else {
      console.warn('⚠️ [EnterpriseSitePlanner] No parcel geometry to render');
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
    console.log('✅ [EnterpriseSitePlanner] Canvas render complete');
  }, [elements, selectedElement, viewState, parcel, detectCoordinateSystem, calculateBounds]);

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

  // Normalize coordinates to canvas space (subtract min to start at origin)
  const normalizeCoordinates = useCallback((coords: number[][], bounds: { minX: number; minY: number }): number[][] => {
    return coords.map(([x, y]) => [x - bounds.minX, y - bounds.minY]);
  }, []);

  // Render parcel boundary
  const renderParcelBoundary = useCallback((ctx: CanvasRenderingContext2D, geometry: any) => {
    try {
      const bounds = calculateBounds(geometry);
      if (!bounds) {
        console.warn('⚠️ [EnterpriseSitePlanner] Could not calculate bounds for boundary rendering');
        return;
      }

      ctx.save();
      
      // Draw parcel boundary with light fill and outline
      ctx.strokeStyle = '#374151'; // Dark gray outline
      ctx.lineWidth = 2;
      ctx.fillStyle = '#F3F4F6'; // Light gray fill
      ctx.globalAlpha = 0.5;
      
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

      const coordSystem = detectCoordinateSystem(coords);
      console.log('🎨 [EnterpriseSitePlanner] Rendering parcel boundary:', {
        coordinateCount: coords.length,
        coordinateSystem: coordSystem,
        sampleCoord: coords[0],
        bounds: bounds,
        needsReprojection: coordSystem === '3857'
      });
      
      if (coords && coords.length > 0) {
        // Normalize coordinates relative to bounds (so they start near origin)
        const normalizedCoords = normalizeCoordinates(coords, bounds);
        
        ctx.beginPath();
        ctx.moveTo(normalizedCoords[0][0], normalizedCoords[0][1]);
        for (let i = 1; i < normalizedCoords.length; i++) {
          ctx.lineTo(normalizedCoords[i][0], normalizedCoords[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        console.log('✅ [EnterpriseSitePlanner] Parcel boundary rendered with normalized coordinates');
      } else {
        console.warn('⚠️ [EnterpriseSitePlanner] No coordinates in parcel geometry');
      }
      
      ctx.restore();
    } catch (error) {
      console.error('❌ [EnterpriseSitePlanner] Error rendering parcel boundary:', error);
    }
  }, [calculateBounds, normalizeCoordinates, detectCoordinateSystem]);

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

  // Render when elements or parcel changes
  useEffect(() => {
    console.log('🔍 [EnterpriseSitePlanner] Render effect triggered:', {
      elementsCount: elements.length,
      hasParcel: !!parcel,
      hasParcelGeometry: !!parcel?.geometry
    });
    renderElements();
  }, [renderElements, parcel?.geometry]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
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
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            onClick={handleCanvasClick}
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
