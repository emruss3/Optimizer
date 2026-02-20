// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React, { useRef, useEffect, useCallback } from 'react';
import type { Element } from '../../engine/types';
import type { ViewportState } from '../../hooks/useViewport';
import { ElementService } from '../../services/elementService';

interface SitePlanCanvasProps {
  elements: Element[];
  selectedElements: Set<string>;
  viewport: ViewportState;
  processedGeometry: { geometry: any; bounds: { minX: number; minY: number; maxX: number; maxY: number } } | null;
  buildableEnvelope?: import('geojson').Polygon;
  isVertexEditing?: boolean;
  selectedVertex?: { elementId: string; vertexIndex: number } | null;
  measurementState?: { isMeasuring: boolean; startPoint: { x: number; y: number } | null; endPoint: { x: number; y: number } | null };
  gridState?: { enabled: boolean; snapToGrid: boolean; size: number };
  hoveredElement?: string | null;
  showLabels?: boolean;
  parkingViz?: { angleDeg: number; stallWidthFt: number; stallDepthFt: number };
  onElementClick?: (element: Element | null, event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel?: (event: React.WheelEvent<HTMLCanvasElement>) => void;
}

export const SitePlanCanvas: React.FC<SitePlanCanvasProps> = ({
  elements,
  selectedElements,
  viewport,
  processedGeometry,
  buildableEnvelope,
  isVertexEditing = false,
  selectedVertex = null,
  measurementState,
  gridState,
  hoveredElement = null,
  showLabels = true,
  parkingViz,
  onElementClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Add non-passive wheel event listener to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onWheel) return;

    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      // Create synthetic React event for compatibility
      const syntheticEvent = {
        ...event,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
        nativeEvent: event,
        currentTarget: canvas,
        target: canvas,
        clientX: event.clientX,
        clientY: event.clientY,
        deltaY: event.deltaY,
        deltaX: event.deltaX,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode
      } as React.WheelEvent<HTMLCanvasElement>;
      onWheel(syntheticEvent);
    };

    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [onWheel]);

  // Get element color and opacity based on z-order spec
  const getElementStyle = useCallback((element: Element): { color: string; opacity: number } => {
    switch (element.type) {
      case 'greenspace':
        return { color: '#22C55E', opacity: 0.15 };
      case 'parking-aisle':
        return { color: '#94A3B8', opacity: 0.2 };
      case 'circulation':
        return { color: '#94A3B8', opacity: 0.25 };
      case 'parking':
      case 'parking-bay':
        return { color: '#60A5FA', opacity: 0.3 };
      case 'building':
        return { color: '#3B82F6', opacity: 0.5 };
      default:
        return { color: '#6B7280', opacity: 0.3 };
    }
  }, []);

  // Render parcel boundary (stroke only, no fill)
  const renderParcelBoundary = useCallback((ctx: CanvasRenderingContext2D, geometry: any, zoom: number) => {
    ctx.save();
    ctx.strokeStyle = '#6B7280';
    ctx.lineWidth = 2 / zoom;
    ctx.globalAlpha = 0.8;
    
    let coords: number[][];
    if (geometry.type === 'Polygon') {
      coords = geometry.coordinates[0] as number[][];
    } else if (geometry.type === 'MultiPolygon') {
      coords = (geometry.coordinates as number[][][])[0][0];
    } else {
      ctx.restore();
      return;
    }
    
    if (coords && coords.length > 0) {
      ctx.beginPath();
      ctx.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i][0], coords[i][1]);
      }
      ctx.closePath();
      ctx.stroke();
    }
    
    ctx.restore();
  }, []);

  // Render buildable envelope (filled region, primary)
  const renderBuildableEnvelope = useCallback((ctx: CanvasRenderingContext2D, envelope: import('geojson').Polygon, zoom: number) => {
    ctx.save();
    ctx.fillStyle = '#DBEAFE';
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2 / zoom;
    ctx.globalAlpha = 0.4;
    
    const coords = envelope.coordinates[0];
    if (coords && coords.length > 0) {
      ctx.beginPath();
      ctx.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i][0], coords[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    
    ctx.restore();
  }, []);

  // Render rotation handle
  const renderRotationHandle = useCallback((ctx: CanvasRenderingContext2D, centerX: number, centerY: number, handleX: number, handleY: number, zoom: number) => {
    ctx.save();
    ctx.strokeStyle = '#3B82F6';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2 / zoom;
    
    // Line from center to handle
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(handleX, handleY);
    ctx.stroke();
    
    // Handle circle
    ctx.beginPath();
    ctx.arc(handleX, handleY, 6 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }, []);

  // Render grid
  const renderGrid = useCallback((ctx: CanvasRenderingContext2D, bounds: { minX: number; minY: number; maxX: number; maxY: number }, gridSize: number, zoom: number) => {
    ctx.save();
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1 / zoom;
    ctx.globalAlpha = 0.5;

    const startX = Math.floor(bounds.minX / gridSize) * gridSize;
    const startY = Math.floor(bounds.minY / gridSize) * gridSize;
    const endX = Math.ceil(bounds.maxX / gridSize) * gridSize;
    const endY = Math.ceil(bounds.maxY / gridSize) * gridSize;

    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, bounds.minY);
      ctx.lineTo(x, bounds.maxY);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(bounds.minX, y);
      ctx.lineTo(bounds.maxX, y);
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  // Render measurement line
  const renderMeasurement = useCallback((ctx: CanvasRenderingContext2D, startPoint: { x: number; y: number } | null, endPoint: { x: number; y: number } | null, zoom: number) => {
    if (!startPoint || !endPoint) return;

    ctx.save();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();

    // Draw endpoints
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(startPoint.x, startPoint.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(endPoint.x, endPoint.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();

    // Draw distance label (Y-flipped so text is right-side up)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;

    ctx.save();
    ctx.translate(midX, midY);
    ctx.scale(1, -1);

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([]);
    ctx.font = `${12 / zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const text = `${distance.toFixed(1)} ft`;
    const metrics = ctx.measureText(text);
    const padding = 4 / zoom;
    const textWidth = metrics.width;
    const textHeight = 16 / zoom;

    ctx.fillRect(-textWidth / 2 - padding, -textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);
    ctx.strokeRect(-textWidth / 2 - padding, -textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);
    ctx.fillStyle = '#EF4444';
    ctx.fillText(text, 0, 0);
    ctx.restore();

    ctx.restore();
  }, []);

  // Render vertex handles
  const renderVertexHandles = useCallback((ctx: CanvasRenderingContext2D, element: Element, isSelected: boolean, isVertexEditing: boolean, selectedVertex: { elementId: string; vertexIndex: number } | null, zoom: number) => {
    if (!isSelected) return;
    
    ctx.save();
    const coords = element.geometry.coordinates[0];
    
    coords.forEach(([x, y], index) => {
      const isSelectedVertex = isVertexEditing && selectedVertex?.elementId === element.id && selectedVertex.vertexIndex === index;
      
      ctx.fillStyle = isSelectedVertex ? '#EF4444' : '#3B82F6';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1 / zoom;
      
      ctx.beginPath();
      ctx.arc(x, y, 5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    
    ctx.restore();
  }, []);

  // Render parking stripes
  const renderParkingStripes = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    if (element.type !== 'parking' && element.type !== 'parking-bay') return;
    if (!parkingViz) return;

    ctx.save();
    
    // Get element bounds and center for rotation
    const bounds = ElementService.getElementBounds(element);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Rotate context around element center
    ctx.translate(centerX, centerY);
    ctx.rotate((parkingViz.angleDeg * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
    
    // Clip to the polygon shape
    const coords = element.geometry.coordinates[0];
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.clip();
    
    // Calculate bounds in rotated space (after rotation, bounds may have changed)
    // We'll use the original bounds but draw dividers across the full clipped area
    const stallWidth = parkingViz.stallWidthFt;
    
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1 / zoom;
    ctx.globalAlpha = 0.8;
    
    // Draw vertical divider lines (in rotated space) spaced by stallWidthFt
    // Start from the leftmost edge and draw dividers every stallWidthFt
    const startX = bounds.minX;
    const endX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;
    
    // Draw dividers from left to right, spaced by stallWidthFt
    for (let x = startX + stallWidth; x < endX; x += stallWidth) {
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
      ctx.stroke();
    }
    
    ctx.restore();
  }, [parkingViz]);

  // Render element labels (Y-flipped to appear right-side up)
  const renderElementLabel = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    // Determine label text based on element type
    let label: string;
    if (element.type === 'building') {
      const areaSqFt = element.properties?.areaSqFt;
      const areaLabel = areaSqFt != null ? `${Math.round(areaSqFt).toLocaleString()} sq ft` : '';
      label = `${element.name || 'Building'}${areaLabel ? '\n' + areaLabel : ''}`;
    } else if (element.type === 'parking' || element.type === 'parking-bay') {
      const stalls = element.properties?.stalls ?? element.properties?.stallCount;
      label = stalls != null ? `${stalls} stalls` : '';
    } else if (element.type === 'circulation') {
      label = element.name || 'Circulation';
    } else {
      return; // greenspace, parking-aisle: no label
    }
    if (!label) return;

    ctx.save();
    const center = ElementService.calculateElementCenter(element);

    // Flip locally so text renders right-side up (canvas Y is negated)
    ctx.translate(center.x, center.y);
    ctx.scale(1, -1);

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1 / zoom;
    ctx.font = `${10 / zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = label.split('\n');
    const lineHeight = 12 / zoom;
    const totalHeight = lines.length * lineHeight;

    // Draw background
    const padding = 4 / zoom;
    const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));

    ctx.fillRect(
      -textWidth / 2 - padding,
      -totalHeight / 2 - padding,
      textWidth + padding * 2,
      totalHeight + padding * 2
    );
    ctx.strokeRect(
      -textWidth / 2 - padding,
      -totalHeight / 2 - padding,
      textWidth + padding * 2,
      totalHeight + padding * 2
    );

    // Draw text
    ctx.fillStyle = '#374151';
    lines.forEach((line, index) => {
      ctx.fillText(line, 0, -totalHeight / 2 + (index + 0.5) * lineHeight);
    });

    ctx.restore();
  }, []);

  // Render individual element
  const renderElement = useCallback((ctx: CanvasRenderingContext2D, element: Element, isSelected: boolean, isHovered: boolean, zoom: number) => {
    ctx.save();
    
    const style = getElementStyle(element);
    ctx.strokeStyle = isSelected ? '#3B82F6' : isHovered ? '#60A5FA' : '#6B7280';
    ctx.lineWidth = isSelected ? 3 / zoom : isHovered ? 2 / zoom : 1 / zoom;
    ctx.fillStyle = style.color;
    ctx.globalAlpha = isHovered ? Math.min(style.opacity + 0.1, 1) : style.opacity;

    const coords = element.geometry.coordinates[0];
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }, [getElementStyle]);

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('⚠️ [SitePlanCanvas] Canvas ref is null');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('⚠️ [SitePlanCanvas] Could not get 2D context');
      return;
    }

    // Clear canvas
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply view transformations
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, -viewport.zoom);

    // Render grid
    if (gridState?.enabled && processedGeometry) {
      renderGrid(ctx, processedGeometry.bounds, gridState.size, viewport.zoom);
    }

    // Render buildable envelope (filled, primary)
    if (buildableEnvelope) {
      renderBuildableEnvelope(ctx, buildableEnvelope, viewport.zoom);
    }

    // Render parcel boundary (stroke only)
    if (processedGeometry) {
      renderParcelBoundary(ctx, processedGeometry.geometry, viewport.zoom);
    }

    // Render measurement line
    if (measurementState?.isMeasuring && measurementState.startPoint && measurementState.endPoint) {
      renderMeasurement(ctx, measurementState.startPoint, measurementState.endPoint, viewport.zoom);
    }

    // Sort elements by z-order: greenspace → parking-aisle → circulation → parking-bay → building → other
    const zOrder: Record<string, number> = {
      'greenspace': 0,
      'parking-aisle': 1,
      'circulation': 2,
      'parking': 3,
      'parking-bay': 3,
      'building': 4,
    };
    const sortedElements = [...elements].sort(
      (a, b) => (zOrder[a.type] ?? 5) - (zOrder[b.type] ?? 5)
    );

    // Render elements in z-order
    sortedElements.forEach((element) => {
      const isSelected = selectedElements.has(element.id);
      const isHovered = hoveredElement === element.id;
      renderElement(ctx, element, isSelected, isHovered, viewport.zoom);
      
      // Render parking stripes for parking elements
      if (element.type === 'parking' || element.type === 'parking-bay') {
        renderParkingStripes(ctx, element, viewport.zoom);
      }
      
      // Render labels only for buildings and parking bays
      if (showLabels && (element.type === 'building' || element.type === 'parking-bay')) {
        renderElementLabel(ctx, element, viewport.zoom);
      }
      
      // Render vertex handles if selected
      if (isSelected) {
        renderVertexHandles(ctx, element, isSelected, isVertexEditing, selectedVertex, viewport.zoom);
      }
      
      // Render rotation handle if single element selected
      if (isSelected && selectedElements.size === 1) {
        const center = ElementService.calculateElementCenter(element);
        const bounds = ElementService.getElementBounds(element);
        const handleDistance = 30 / viewport.zoom;
        const handleX = center.x;
        const handleY = bounds.maxY + handleDistance;
        renderRotationHandle(ctx, center.x, center.y, handleX, handleY, viewport.zoom);
      }
    });

    ctx.restore();
  }, [elements, selectedElements, viewport.zoom, viewport.panX, viewport.panY, processedGeometry, buildableEnvelope, isVertexEditing, selectedVertex, measurementState, gridState, hoveredElement, showLabels, renderParcelBoundary, renderBuildableEnvelope, renderElement, renderVertexHandles, renderRotationHandle, renderGrid, renderMeasurement, renderParkingStripes, renderElementLabel]);

  // Handle mouse move for hover detection
  const handleMouseMoveInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (onMouseMove) onMouseMove(event);
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.panX) / viewport.zoom;
    const worldY = -(event.clientY - rect.top - viewport.panY) / viewport.zoom;

    const hovered = ElementService.findElementAtPoint(elements, worldX, worldY);
    // Note: We can't set hoveredElement here directly, it needs to be passed as prop
    // This is just for the callback
  }, [elements, viewport, onMouseMove]);
  const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onElementClick) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.panX) / viewport.zoom;
    const worldY = -(event.clientY - rect.top - viewport.panY) / viewport.zoom;

    const clickedElement = ElementService.findElementAtPoint(elements, worldX, worldY);
    onElementClick(clickedElement || null, event);
  }, [elements, viewport, onElementClick]);

  // Initialize canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || 800;
      const height = rect.height || 600;
      
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Render when dependencies change
  useEffect(() => {
    render();
  }, [render]);

  // Also trigger render on mount and when canvas size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const observer = new ResizeObserver(() => {
      render();
    });
    
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair absolute inset-0"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={handleClick}
      style={{ display: 'block' }}
    />
  );
};

