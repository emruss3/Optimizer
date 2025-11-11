// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface UseViewportReturn {
  viewport: ViewportState;
  setViewport: (viewport: ViewportState | ((prev: ViewportState) => ViewportState)) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (zoom: number, centerX?: number, centerY?: number) => void;
  pan: (deltaX: number, deltaY: number) => void;
  fitToBounds: (bounds: { minX: number; minY: number; maxX: number; maxY: number }, canvasWidth: number, canvasHeight: number) => void;
  reset: () => void;
}

export function useViewport(initialZoom = 1, initialPanX = 0, initialPanY = 0): UseViewportReturn {
  const [viewport, setViewport] = useState<ViewportState>({
    zoom: initialZoom,
    panX: initialPanX,
    panY: initialPanY
  });

  const zoomIn = useCallback(() => {
    setViewport(prev => ({ ...prev, zoom: Math.min(10, prev.zoom * 1.1) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({ ...prev, zoom: Math.max(0.1, prev.zoom * 0.9) }));
  }, []);

  const zoomTo = useCallback((zoom: number, centerX?: number, centerY?: number) => {
    setViewport(prev => {
      const newZoom = Math.max(0.1, Math.min(10, zoom));
      if (centerX !== undefined && centerY !== undefined) {
        // Zoom towards a specific point
        const worldX = (centerX - prev.panX) / prev.zoom;
        const worldY = (centerY - prev.panY) / prev.zoom;
        return {
          zoom: newZoom,
          panX: centerX - worldX * newZoom,
          panY: centerY - worldY * newZoom
        };
      }
      return { ...prev, zoom: newZoom };
    });
  }, []);

  const pan = useCallback((deltaX: number, deltaY: number) => {
    setViewport(prev => ({
      ...prev,
      panX: prev.panX + deltaX,
      panY: prev.panY + deltaY
    }));
  }, []);

  const fitToBounds = useCallback((bounds: { minX: number; minY: number; maxX: number; maxY: number }, canvasWidth: number, canvasHeight: number) => {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    if (width === 0 || height === 0) return;

    const padding = 40;
    const scaleX = (canvasWidth - padding * 2) / width;
    const scaleY = (canvasHeight - padding * 2) / height;
    const zoom = Math.min(scaleX, scaleY);

    const centerX = bounds.minX + width / 2;
    const centerY = bounds.minY + height / 2;
    const panX = (canvasWidth / 2) / zoom - centerX;
    const panY = (canvasHeight / 2) / zoom - centerY;

    setViewport({ zoom, panX, panY });
  }, []);

  const reset = useCallback(() => {
    setViewport({ zoom: initialZoom, panX: initialPanX, panY: initialPanY });
  }, [initialZoom, initialPanX, initialPanY]);

  return {
    viewport,
    setViewport,
    zoomIn,
    zoomOut,
    zoomTo,
    pan,
    fitToBounds,
    reset
  };
}

