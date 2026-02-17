// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * EnterpriseSitePlannerShell - Modular Site Planner Component
 * 
 * This component orchestrates modular pieces:
 * - Hooks: useViewport, useSelection, useDrag, useDrawingTools
 * - Components: SitePlanCanvas, SitePlanToolbar
 * - Services: ElementService
 * 
 * The shell component coordinates these pieces but doesn't contain
 * the implementation details, making it easier to maintain and extend.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Grid, Building } from 'lucide-react';
import { SelectedParcel } from '../types/parcel';
import type { Element, SiteMetrics, PlannerOutput } from '../engine/types';
import { feature4326To3857 } from '../utils/reproject';
import { normalizeToPolygon } from '../engine/geometry';

// Modular hooks
import { useViewport } from '../hooks/useViewport';
import { useSelection } from '../hooks/useSelection';
import { useDrag } from '../hooks/useDrag';
import { useDrawingTools } from '../hooks/useDrawingTools';
import { useRotation } from '../hooks/useRotation';
import { useVertexEditing } from '../hooks/useVertexEditing';
import { useMeasurement } from '../hooks/useMeasurement';
import { useGrid } from '../hooks/useGrid';

// Modular components
import { SitePlanCanvas } from './site-planner/SitePlanCanvas';
import { SitePlanToolbar } from './site-planner/SitePlanToolbar';
import { TemplateSelector } from './site-planner/TemplateSelector';
import { StatusBar } from './site-planner/StatusBar';

// Services
import { ElementService } from '../services/elementService';
import { TemplateService } from '../services/templateService';

interface EnterpriseSitePlannerProps {
  parcel: SelectedParcel;
  planElements?: Element[];
  metrics?: SiteMetrics;
  activePlanId?: string;
  selectedSolve?: PlannerOutput;
  parkingViz?: { angleDeg: number; stallWidthFt: number; stallDepthFt: number };
  buildableEnvelope?: import('geojson').Polygon;
  envelopeStatus?: 'loading' | 'ready' | 'invalid';
  envelopeError?: string | null;
  usingFallbackEnvelope?: boolean;
  onRetryEnvelope?: () => void;
  onBuildingUpdate?: (
    update: {
      id: string;
      anchor: { x: number; y: number };
      rotationRad: number;
      widthFt: number;
      depthFt: number;
      floors?: number;
    },
    options?: { final?: boolean }
  ) => void;
  onAddBuilding?: () => void;
}

const EnterpriseSitePlanner: React.FC<EnterpriseSitePlannerProps> = ({
  parcel,
  planElements = [],
  metrics,
  activePlanId,
  selectedSolve,
  parkingViz,
  buildableEnvelope,
  envelopeStatus,
  envelopeError,
  usingFallbackEnvelope,
  onRetryEnvelope,
  onBuildingUpdate,
  onAddBuilding
}) => {
  // Early return if no parcel
  if (!parcel) {
    return (
      <div className="flex flex-col h-full bg-gray-50 min-h-[400px] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Parcel Selected</h2>
          <p className="text-gray-600">Please select a parcel to use the site planner</p>
        </div>
      </div>
    );
  }

  // Use selectedSolve if provided, otherwise use planElements/metrics
  const initialElements = selectedSolve?.elements || planElements;
  const initialMetrics = selectedSolve?.metrics || metrics;

  // State
  const [elements, setElements] = useState<Element[]>(initialElements);
  const [showLayers, setShowLayers] = useState(true);
  const [copiedElements, setCopiedElements] = useState<Element[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [hasInitializedView, setHasInitializedView] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [displayMetrics, setDisplayMetrics] = useState<SiteMetrics | null>(initialMetrics || null);
  const updateTimerRef = useRef<number | null>(null);
  
  // Update elements and metrics when selectedSolve changes
  useEffect(() => {
    if (selectedSolve) {
      setElements(selectedSolve.elements);
      setDisplayMetrics(selectedSolve.metrics);
    } else if (planElements.length > 0 || metrics) {
      setElements(planElements);
      setDisplayMetrics(metrics || null);
    }
  }, [selectedSolve, planElements, metrics]);

  // Modular hooks
  const viewport = useViewport();
  const selection = useSelection();
  const drag = useDrag();
  const drawingTools = useDrawingTools();
  const rotation = useRotation();
  const vertexEditing = useVertexEditing();
  const measurement = useMeasurement();
  const grid = useGrid(10); // 10 foot grid

  // NOTE: We use a container div ref (not a canvas ref) because the <canvas>
  // element lives inside SitePlanCanvas which manages its own ref.
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const queueBuildingUpdate = useCallback((update: {
    id: string;
    anchor: { x: number; y: number };
    rotationRad: number;
    widthFt: number;
    depthFt: number;
    floors?: number;
  }, options?: { final?: boolean }) => {
    if (!onBuildingUpdate) return;
    if (options?.final) {
      onBuildingUpdate(update, { final: true });
      return;
    }
    if (updateTimerRef.current) {
      window.clearTimeout(updateTimerRef.current);
    }
    updateTimerRef.current = window.setTimeout(() => {
      onBuildingUpdate(update);
    }, 80);
  }, [onBuildingUpdate]);

  const getElementDimensions = useCallback((element: Element) => {
    const coords = element.geometry.coordinates[0];
    if (coords.length < 3) return { widthFt: 0, depthFt: 0 };
    const [x1, y1] = coords[0];
    const [x2, y2] = coords[1];
    const [x3, y3] = coords[2];
    const edge1 = Math.hypot(x2 - x1, y2 - y1);
    const edge2 = Math.hypot(x3 - x2, y3 - y2);
    return { widthFt: edge1, depthFt: edge2 };
  }, []);

  const getElementRotationRad = useCallback((element: Element) => {
    if (typeof element.properties?.rotation === 'number') {
      return (element.properties.rotation * Math.PI) / 180;
    }
    const coords = element.geometry.coordinates[0];
    if (coords.length < 2) return 0;
    const [x1, y1] = coords[0];
    const [x2, y2] = coords[1];
    return Math.atan2(y2 - y1, x2 - x1);
  }, []);

  // Process parcel geometry: reproject to EPSG:3857 meters directly (no feet, no normalization)
  const processedGeometry = useMemo(() => {
    if (!parcel?.geometry) return null;

    let geometry3857 = parcel.geometry;
    
    // Check if already in 3857 (coords > 1000) or 4326 (degrees)
    const sampleCoords = parcel.geometry.type === 'Polygon'
      ? parcel.geometry.coordinates[0][0]
      : parcel.geometry.type === 'MultiPolygon'
      ? parcel.geometry.coordinates[0][0][0]
      : null;
    
    if (sampleCoords && (Math.abs(sampleCoords[0]) < 1000 && Math.abs(sampleCoords[1]) < 1000)) {
      // Likely 4326 (degrees), reproject to 3857
      geometry3857 = feature4326To3857(parcel.geometry);
    }
    
    // Normalize to Polygon (handles MultiPolygon by selecting largest)
    const polygon = normalizeToPolygon(geometry3857);
    
    // Compute bounds directly from polygon.coordinates[0]
    const coords = polygon.coordinates[0];
    const bounds = coords.reduce(
      (acc, [x, y]) => ({
        minX: Math.min(acc.minX, x),
        minY: Math.min(acc.minY, y),
        maxX: Math.max(acc.maxX, x),
        maxY: Math.max(acc.maxY, y)
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    
    return { geometry: polygon, bounds };
  }, [parcel?.geometry]);

  // Fit viewport to parcel
  const fitViewToParcel = useCallback(() => {
    const canvas = canvasContainerRef.current;
    if (!canvas || !processedGeometry) return;

    const rect = canvas.getBoundingClientRect();
    viewport.fitToBounds(processedGeometry.bounds, rect.width, rect.height);
    setHasInitializedView(true);
  }, [processedGeometry, viewport]);

  // Initialize viewport when geometry loads
  useEffect(() => {
    if (processedGeometry && !hasInitializedView) {
      const initViewport = () => {
        const canvas = canvasContainerRef.current;
        if (!canvas) {
          setTimeout(initViewport, 50);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          setTimeout(initViewport, 50);
          return;
        }
        fitViewToParcel();
      };
      requestAnimationFrame(() => initViewport());
    }
  }, [processedGeometry, hasInitializedView, fitViewToParcel]);

  // Handle mouse down
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasContainerRef.current;
    if (!canvas) return;

    // Panning (middle mouse or Ctrl+drag)
    if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
      setIsPanning(true);
      setLastPanPoint({ x: event.clientX, y: event.clientY });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
    const worldY = (event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
    const snapped = grid.snapPoint(worldX, worldY);

    // Measurement tool
    if (drawingTools.activeTool === 'measure') {
      if (!measurement.measurementState.isMeasuring) {
        measurement.startMeasurement(snapped.x, snapped.y);
      } else {
        measurement.updateMeasurement(snapped.x, snapped.y);
        measurement.endMeasurement();
        drawingTools.setActiveTool('select');
      }
      return;
    }

    // Drawing tools
    if (drawingTools.activeTool.startsWith('draw-')) {
      // Disable draw-building tool (use Add Building button instead)
      if (drawingTools.activeTool === 'draw-building') {
        drawingTools.setActiveTool('select');
        return;
      }
      const elementType = drawingTools.activeTool.replace('draw-', '') as 'building' | 'parking' | 'greenspace';
      const newElement = drawingTools.createElement(snapped.x, snapped.y, elementType);
      setElements(prev => [...prev, newElement]);
      selection.selectElement(newElement.id);
      drawingTools.setActiveTool('select');
      return;
    }

    // Selection
    if (drawingTools.activeTool === 'select') {
      // Check for rotation handle click first
      if (selection.selectedCount === 1) {
        const selectedId = Array.from(selection.selectedElements)[0];
        const selectedElement = elements.find(el => el.id === selectedId);
        if (selectedElement) {
          const center = ElementService.calculateElementCenter(selectedElement);
          const bounds = ElementService.getElementBounds(selectedElement);
          const handleDistance = 30 / viewport.viewport.zoom; // Rotation handle distance
          const handleX = center.x;
          const handleY = bounds.minY - handleDistance;
          
          // Check if clicked on rotation handle
          const distToHandle = Math.sqrt(Math.pow(worldX - handleX, 2) + Math.pow(worldY - handleY, 2));
          if (distToHandle < 15 / viewport.viewport.zoom) {
            const startAngle = ElementService.calculateAngle(center, { x: worldX, y: worldY });
            const originalCoords = selectedElement.geometry.coordinates[0];
            rotation.startRotation(selectedId, center.x, center.y, startAngle, originalCoords);
            return;
          }

          // Check for vertex editing
          if (vertexEditing.isVertexEditing) {
            const nearest = ElementService.findNearestVertex(selectedElement, worldX, worldY, 15 / viewport.viewport.zoom);
            if (nearest) {
              vertexEditing.enableVertexEditing(selectedId, nearest.vertexIndex);
              drag.startDrag(selectedId, worldX, worldY);
              return;
            }
          }
        }
      }

      // Check for vertex near click (for enabling vertex editing)
      const clickedElement = ElementService.findElementAtPoint(elements, worldX, worldY);
      if (clickedElement && selection.isSelected(clickedElement.id)) {
        const nearest = ElementService.findNearestVertex(clickedElement, worldX, worldY, 15 / viewport.viewport.zoom);
        if (nearest) {
          vertexEditing.enableVertexEditing(clickedElement.id, nearest.vertexIndex);
          drag.startDrag(clickedElement.id, worldX, worldY);
          return;
        }
      }
      
      if (clickedElement) {
        if (event.ctrlKey || event.metaKey) {
          selection.toggleSelection(clickedElement.id);
        } else {
          selection.selectElement(clickedElement.id);
          const originalVertices = elements
            .filter(el => el.id === clickedElement.id)
            .map(el => ({ id: el.id, coords: el.geometry.coordinates[0] }));
          drag.startDrag(clickedElement.id, worldX, worldY, originalVertices);
        }
      } else {
        if (!event.ctrlKey && !event.metaKey) {
          selection.clearSelection();
          vertexEditing.disableVertexEditing();
        }
      }
    }
  }, [elements, viewport.viewport, drawingTools, selection, drag]);

  // Handle mouse move
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasContainerRef.current;
    if (!canvas) return;

    // Update hovered element
    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
    const worldY = (event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
    const hovered = ElementService.findElementAtPoint(elements, worldX, worldY);
    setHoveredElement(hovered?.id || null);

    // Panning
    if (isPanning) {
      const deltaX = event.clientX - lastPanPoint.x;
      const deltaY = event.clientY - lastPanPoint.y;
      viewport.pan(deltaX, deltaY);
      setLastPanPoint({ x: event.clientX, y: event.clientY });
      return;
    }

    // Rotation
    if (rotation.rotationState.isRotating && rotation.rotationState.elementId) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = (event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      
      const angle = rotation.updateRotation(worldX, worldY, event.shiftKey ? 15 : 0);
      if (angle !== null && rotation.rotationState.startAngle !== undefined) {
        const element = elements.find(el => el.id === rotation.rotationState.elementId);
        if (element && rotation.rotationState.rotationCenter) {
          // Calculate delta from start angle
          let deltaAngle = angle - rotation.rotationState.startAngle;
          // Normalize to -180 to 180 range
          if (deltaAngle > 180) deltaAngle -= 360;
          if (deltaAngle < -180) deltaAngle += 360;
          
          // Get current rotation from element properties
          const currentRotation = element.properties?.rotation || 0;
          const newRotation = currentRotation + deltaAngle;
          
          // Apply rotation relative to original position
          const originalCoords = element.geometry.coordinates[0];
          const rotatedCoords = originalCoords.map(([x, y]) => {
            const rotated = ElementService.rotatePoint(
              { x, y },
              rotation.rotationState.rotationCenter!,
              newRotation
            );
            return [rotated.x, rotated.y];
          });
          
          setElements(prev => prev.map(el => {
            if (el.id === rotation.rotationState.elementId) {
              return {
                ...el,
                geometry: {
                  ...el.geometry,
                  coordinates: [rotatedCoords]
                },
                properties: {
                  ...el.properties,
                  rotation: newRotation
                },
                metadata: {
                  ...el.metadata,
                  updatedAt: new Date().toISOString()
                }
              };
            }
            return el;
          }));

          if (element.type === 'building' && rotation.rotationState.rotationCenter) {
            const { widthFt, depthFt } = getElementDimensions(element);
            queueBuildingUpdate({
              id: element.id,
              anchor: rotation.rotationState.rotationCenter,
              rotationRad: (newRotation * Math.PI) / 180,
              widthFt,
              depthFt,
              floors: element.properties?.stories || element.properties?.floors
            });
          }
        }
      }
      return;
    }

    // Vertex editing
    if (vertexEditing.isVertexEditing && vertexEditing.selectedVertex) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = (event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      const snapped = grid.snapPoint(worldX, worldY);
      
      setElements(prev => prev.map(element => {
        if (element.id === vertexEditing.selectedVertex?.elementId) {
          return ElementService.updateVertex(
            element,
            vertexEditing.selectedVertex.vertexIndex,
            snapped.x,
            snapped.y
          );
        }
        return element;
      }));
      return;
    }

    // Measurement tool update
    if (drawingTools.activeTool === 'measure' && measurement.measurementState.isMeasuring) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = (event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      const snapped = grid.snapPoint(worldX, worldY);
      measurement.updateMeasurement(snapped.x, snapped.y);
      return;
    }

    // Dragging
    if (drag.dragState.isDragging && drag.dragState.elementId) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = (event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      const snapped = grid.snapPoint(worldX, worldY);
      
      drag.updateDrag(snapped.x, snapped.y);
      const delta = drag.getDragDelta();
      if (delta) {
        const draggedElement = elements.find(el => el.id === drag.dragState.elementId);
        if (draggedElement?.type === 'building' && onBuildingUpdate) {
          const center = ElementService.calculateElementCenter(draggedElement);
          const { widthFt, depthFt } = getElementDimensions(draggedElement);
          setElements(prev => ElementService.moveElements(
            prev,
            selection.selectedElements,
            delta.deltaX,
            delta.deltaY,
            drag.dragState.originalVertices
          ));
          queueBuildingUpdate({
            id: draggedElement.id,
            anchor: { x: center.x + delta.deltaX, y: center.y + delta.deltaY },
            rotationRad: getElementRotationRad(draggedElement),
            widthFt,
            depthFt,
            floors: draggedElement.properties?.stories || draggedElement.properties?.floors
          });
          return;
        }

        setElements(prev => ElementService.moveElements(
          prev,
          selection.selectedElements,
          delta.deltaX,
          delta.deltaY,
          drag.dragState.originalVertices
        ));
      }
    }
  }, [isPanning, lastPanPoint, viewport.viewport.zoom, viewport.viewport.panX, viewport.viewport.panY, viewport.pan, drag.dragState, drag.updateDrag, drag.getDragDelta, selection.selectedElements, elements, measurement.measurementState, measurement.updateMeasurement, grid.snapPoint, drawingTools.activeTool, vertexEditing.isVertexEditing, vertexEditing.selectedVertex, getElementDimensions, getElementRotationRad, onBuildingUpdate, queueBuildingUpdate]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (drag.dragState.isDragging && drag.dragState.elementId) {
      const delta = drag.getDragDelta();
      const draggedElement = elements.find(el => el.id === drag.dragState.elementId);
      if (delta && draggedElement?.type === 'building' && onBuildingUpdate) {
        const center = ElementService.calculateElementCenter(draggedElement);
        const { widthFt, depthFt } = getElementDimensions(draggedElement);
        queueBuildingUpdate({
          id: draggedElement.id,
          anchor: { x: center.x + delta.deltaX, y: center.y + delta.deltaY },
          rotationRad: getElementRotationRad(draggedElement),
          widthFt,
          depthFt,
          floors: draggedElement.properties?.stories || draggedElement.properties?.floors
        }, { final: true });
      }
    }

    setIsPanning(false);
    drag.endDrag();
    rotation.endRotation();
  }, [drag, elements, getElementDimensions, getElementRotationRad, onBuildingUpdate, queueBuildingUpdate, rotation]);

  // Handle wheel zoom
  const handleWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasContainerRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, viewport.viewport.zoom * zoomFactor));
    viewport.zoomTo(newZoom, mouseX, mouseY);
  }, [viewport]);

  // Alignment tools
  const handleAlign = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selection.selectedCount < 2) return;
    setElements(prev => ElementService.alignElements(prev, selection.selectedElements, alignment));
  }, [selection]);

  // Template application
  const handleApplyTemplate = useCallback((templateId: string) => {
    if (!processedGeometry) return;
    
    // Place template at center of parcel
    const centerX = (processedGeometry.bounds.minX + processedGeometry.bounds.maxX) / 2;
    const centerY = (processedGeometry.bounds.minY + processedGeometry.bounds.maxY) / 2;
    
    const newElements = TemplateService.applyTemplate(templateId, centerX, centerY);
    setElements(prev => [...prev, ...newElements]);
    selection.selectAll(newElements.map(el => el.id));
    setShowTemplates(false);
  }, [selection.selectAll, processedGeometry]);

  // Element operations
  const handleDelete = useCallback(() => {
    setElements(prev => ElementService.deleteElements(prev, selection.selectedElements));
    selection.clearSelection();
    vertexEditing.disableVertexEditing();
  }, [selection.selectedElements, selection.clearSelection, vertexEditing.disableVertexEditing]);

  const handleCopy = useCallback(() => {
    const toCopy = elements.filter(el => selection.selectedElements.has(el.id));
    setCopiedElements(toCopy);
  }, [elements, selection.selectedElements, selection.selectAll]);

  const handlePaste = useCallback(() => {
    if (copiedElements.length === 0) return;
    const newElements = ElementService.copyElements(elements, new Set(copiedElements.map(el => el.id)));
    setElements(prev => [...prev, ...newElements]);
    selection.selectAll(newElements.map(el => el.id));
  }, [copiedElements, elements, selection.selectAll]);

  // Update elements from props
  useEffect(() => {
    if (planElements.length > 0) {
      setElements(planElements);
    }
  }, [planElements]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.selectedCount > 0) {
        e.preventDefault();
        handleDelete();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection.selectedCount > 0) {
        e.preventDefault();
        handleCopy();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedElements.length > 0) {
        e.preventDefault();
        handlePaste();
      }

      if (e.key === '0') {
        e.preventDefault();
        fitViewToParcel();
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        viewport.zoomIn();
      }

      if (e.key === '-') {
        e.preventDefault();
        viewport.zoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection.selectedCount, copiedElements.length, handleDelete, handleCopy, handlePaste, fitViewToParcel, viewport]);

  return (
    <div className="flex flex-col h-full bg-gray-50 min-h-[400px]">
      {/* Envelope Status Banner */}
      {(envelopeStatus || usingFallbackEnvelope) && (
        <div className={`px-4 py-2 border-b ${
          usingFallbackEnvelope
            ? 'bg-yellow-50 border-yellow-200'
            : envelopeStatus === 'ready'
            ? 'bg-green-50 border-green-200'
            : envelopeStatus === 'loading'
            ? 'bg-blue-50 border-blue-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">
                Envelope status: <span className={
                  usingFallbackEnvelope ? 'text-yellow-700' :
                  envelopeStatus === 'ready' ? 'text-green-700' :
                  envelopeStatus === 'loading' ? 'text-blue-700' :
                  'text-yellow-700'
                }>{usingFallbackEnvelope ? 'fallback' : envelopeStatus}</span>
              </span>
              {usingFallbackEnvelope && (
                <span className="text-sm text-yellow-700">
                  (Using fallback envelope - Supabase envelope unavailable. Default setbacks: 20ft front, 5ft side, 20ft rear)
                </span>
              )}
              {envelopeStatus === 'invalid' && envelopeError && !usingFallbackEnvelope && (
                <span className="text-sm text-red-700">
                  {envelopeError}
                  {envelopeError.includes('returned null') && (
                    <span className="ml-2 text-xs">
                      Check: supabase/sql/get_parcel_buildable_envelope.sql and AUDIT_BACKEND_STATUS.sql
                    </span>
                  )}
                </span>
              )}
            </div>
            {envelopeStatus === 'invalid' && !usingFallbackEnvelope && onRetryEnvelope && (
              <button
                onClick={onRetryEnvelope}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold">Site Planner</h2>
        </div>
        
        <div className="flex items-center space-x-2">
          {onAddBuilding && (
            <button
              onClick={onAddBuilding}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Building className="w-4 h-4" />
              <span>Add Building</span>
            </button>
          )}
          {/* Templates disabled until solver-backed */}
          {/* <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Templates
          </button> */}
          <button
            onClick={() => setShowLayers(!showLayers)}
            className="p-2 text-gray-600 hover:text-gray-900"
          >
            <Grid className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Modular Toolbar */}
        <SitePlanToolbar
          activeTool={drawingTools.activeTool}
          onToolChange={drawingTools.setActiveTool}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onFitToParcel={fitViewToParcel}
          onZoomIn={viewport.zoomIn}
          onZoomOut={viewport.zoomOut}
          onAlign={handleAlign}
          onToggleVertexEdit={() => {
            if (vertexEditing.isVertexEditing) {
              vertexEditing.disableVertexEditing();
            } else if (selection.selectedCount === 1) {
              // Enable vertex editing mode
              vertexEditing.enableVertexEditing(Array.from(selection.selectedElements)[0], 0);
            }
          }}
          onToggleGrid={grid.toggleGrid}
          onToggleSnapToGrid={grid.toggleSnapToGrid}
          canCopy={selection.selectedCount > 0}
          canPaste={copiedElements.length > 0}
          canDelete={selection.selectedCount > 0}
          canAlign={selection.selectedCount >= 2}
          isVertexEditing={vertexEditing.isVertexEditing}
          gridEnabled={grid.gridState.enabled}
          snapToGridEnabled={grid.gridState.snapToGrid}
        />

        {/* Modular Canvas */}
        <div ref={canvasContainerRef} className="flex-1 relative min-h-[400px] bg-gray-100">
          {showTemplates && (
            <TemplateSelector
              onSelectTemplate={handleApplyTemplate}
              onClose={() => setShowTemplates(false)}
            />
          )}
          <SitePlanCanvas
            elements={elements}
            selectedElements={selection.selectedElements}
            viewport={viewport.viewport}
            processedGeometry={processedGeometry}
            buildableEnvelope={buildableEnvelope}
            isVertexEditing={vertexEditing.isVertexEditing}
            selectedVertex={vertexEditing.selectedVertex}
            measurementState={measurement.measurementState}
            gridState={grid.gridState}
            hoveredElement={hoveredElement}
            showLabels={true}
            parkingViz={parkingViz}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
          
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        metrics={displayMetrics}
        activeTool={drawingTools.activeTool}
        selectedCount={selection.selectedCount}
        elementCount={elements.length}
        zoomLevel={viewport.viewport.zoom}
        gridEnabled={grid.gridState.enabled}
        snapToGridEnabled={grid.gridState.snapToGrid}
        measurementDistance={measurement.getDistance()}
      />
    </div>
  );
};

export default EnterpriseSitePlanner;
