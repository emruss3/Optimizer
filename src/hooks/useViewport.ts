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
  zoomIn: (centerX?: number, centerY?: number) => void;
  zoomOut: (centerX?: number, centerY?: number) => void;
  zoomBy: (factor: number, centerX?: number, centerY?: number) => void;
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

  // Zoom MUST be anchored: world coordinates here are EPSG:3857 metres
  // (magnitude ~10^7), so scaling without re-anchoring pan slides the content
  // millions of pixels off-screen. Callers pass the screen point to hold
  // fixed (usually the canvas centre or the cursor).
  const zoomBy = useCallback((factor: number, centerX?: number, centerY?: number) => {
    setViewport(prev => {
      const newZoom = Math.max(0.1, Math.min(10, prev.zoom * factor));
      if (centerX !== undefined && centerY !== undefined) {
        const worldX = (centerX - prev.panX) / prev.zoom;
        const worldY = -(centerY - prev.panY) / prev.zoom;
        return {
          zoom: newZoom,
          panX: centerX - worldX * newZoom,
          panY: centerY + worldY * newZoom
        };
      }
      return { ...prev, zoom: newZoom };
    });
  }, []);

  const zoomIn = useCallback((centerX?: number, centerY?: number) => {
    zoomBy(1.1, centerX, centerY);
  }, [zoomBy]);

  const zoomOut = useCallback((centerX?: number, centerY?: number) => {
    zoomBy(0.9, centerX, centerY);
  }, [zoomBy]);

  const zoomTo = useCallback((zoom: number, centerX?: number, centerY?: number) => {
    setViewport(prev => {
      const newZoom = Math.max(0.1, Math.min(10, zoom));
      if (centerX !== undefined && centerY !== undefined) {
        // Zoom towards a specific point
        const worldX = (centerX - prev.panX) / prev.zoom;
        const worldY = -(centerY - prev.panY) / prev.zoom;
        return {
          zoom: newZoom,
          panX: centerX - worldX * newZoom,
          panY: centerY + worldY * newZoom
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
    // Canvas transform order: translate(panX, panY) then scale(zoom)
    // So: screenX = worldX * zoom + panX
    // To center world point (centerX, centerY) at screen (canvasWidth/2, canvasHeight/2):
    // canvasWidth/2 = centerX * zoom + panX
    // Therefore: panX = canvasWidth/2 - centerX * zoom
    const panX = canvasWidth / 2 - centerX * zoom;
    const panY = canvasHeight / 2 + centerY * zoom;

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
    zoomBy,
    zoomTo,
    pan,
    fitToBounds,
    reset
  };
}


