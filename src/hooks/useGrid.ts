// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';
import { feetToMeters } from '../engine/units';

export interface GridState {
  enabled: boolean;
  snapToGrid: boolean;
  size: number; // Grid size in feet
}

export interface UseGridReturn {
  gridState: GridState;
  toggleGrid: () => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;
  snapPoint: (x: number, y: number) => { x: number; y: number };
}

export function useGrid(initialSize = 10): UseGridReturn {
  const [gridState, setGridState] = useState<GridState>({
    enabled: false,
    snapToGrid: false,
    size: initialSize
  });

  const toggleGrid = useCallback(() => {
    setGridState(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const toggleSnapToGrid = useCallback(() => {
    setGridState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }));
  }, []);

  const setGridSize = useCallback((size: number) => {
    setGridState(prev => ({ ...prev, size }));
  }, []);

  const snapPoint = useCallback((x: number, y: number): { x: number; y: number } => {
    if (!gridState.snapToGrid) return { x, y };
    // x,y are world coordinates in metres (EPSG:3857); grid size is in feet.
    const sizeMeters = feetToMeters(gridState.size);
    if (sizeMeters <= 0) return { x, y };
    return {
      x: Math.round(x / sizeMeters) * sizeMeters,
      y: Math.round(y / sizeMeters) * sizeMeters
    };
  }, [gridState.snapToGrid, gridState.size]);

  return {
    gridState,
    toggleGrid,
    toggleSnapToGrid,
    setGridSize,
    snapPoint
  };
}


