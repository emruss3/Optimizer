// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';
import type { Element } from '../engine/types';

export interface DragState {
  isDragging: boolean;
  dragType: 'element' | 'vertex' | 'selection';
  elementId?: string;
  vertexId?: string;
  offset: { x: number; y: number };
  originalPosition: { x: number; y: number };
  originalVertices?: Array<{ id: string; coords: number[][] }>;
}

export interface UseDragReturn {
  dragState: DragState;
  startDrag: (elementId: string, worldX: number, worldY: number, originalVertices?: Array<{ id: string; coords: number[][] }>) => void;
  updateDrag: (worldX: number, worldY: number) => void;
  endDrag: () => void;
  getDragDelta: () => { deltaX: number; deltaY: number } | null;
}

export function useDrag(): UseDragReturn {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: 'element',
    offset: { x: 0, y: 0 },
    originalPosition: { x: 0, y: 0 }
  });

  const startDrag = useCallback((elementId: string, worldX: number, worldY: number, originalVertices?: Array<{ id: string; coords: number[][] }>) => {
    setDragState({
      isDragging: true,
      dragType: 'element',
      elementId,
      offset: { x: worldX, y: worldY },
      originalPosition: { x: worldX, y: worldY },
      originalVertices
    });
  }, []);

  const updateDrag = useCallback((worldX: number, worldY: number) => {
    setDragState(prev => ({
      ...prev,
      offset: { x: worldX, y: worldY }
    }));
  }, []);

  const endDrag = useCallback(() => {
    setDragState(prev => ({ ...prev, isDragging: false }));
  }, []);

  const getDragDelta = useCallback(() => {
    if (!dragState.isDragging) return null;
    return {
      deltaX: dragState.offset.x - dragState.originalPosition.x,
      deltaY: dragState.offset.y - dragState.originalPosition.y
    };
  }, [dragState]);

  return {
    dragState,
    startDrag,
    updateDrag,
    endDrag,
    getDragDelta
  };
}
