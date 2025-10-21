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
import { getPlannerWorker } from '../workers/workerManager';

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Toolbar state
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'edit'>('select');
  const [showLayers, setShowLayers] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);

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
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Render elements on canvas
  const renderElements = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply view transformations
    ctx.save();
    ctx.scale(viewState.zoom, viewState.zoom);
    ctx.translate(viewState.panX, viewState.panY);

    // Render elements
    elements.forEach(element => {
      renderElement(ctx, element, element.id === selectedElement);
    });

    ctx.restore();
  }, [elements, selectedElement, viewState]);

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
    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const worker = getPlannerWorker();
      
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

      setGenerationProgress(25);
      const result = await worker.generateSitePlan(parcel.geometry as any, config);
      setGenerationProgress(75);

      setElements(result.elements);
      setGenerationProgress(100);

      // Call investment analysis callback
      if (onInvestmentAnalysis) {
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
        onInvestmentAnalysis(analysis);
      }

    } catch (error) {
      console.error('Error generating site plan:', error);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  }, [parcel, onInvestmentAnalysis]);

  // Update elements when props change
  useEffect(() => {
    if (planElements.length > 0) {
      setElements(planElements);
    }
  }, [planElements]);

  // Render when elements change
  useEffect(() => {
    renderElements();
  }, [renderElements]);

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
