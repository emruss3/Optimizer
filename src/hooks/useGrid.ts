// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';

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
    
    return {
      x: Math.round(x / gridState.size) * gridState.size,
      y: Math.round(y / gridState.size) * gridState.size
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


