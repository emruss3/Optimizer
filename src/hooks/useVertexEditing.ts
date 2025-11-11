// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';
import type { Element } from '../engine/types';

export interface UseVertexEditingReturn {
  isVertexEditing: boolean;
  selectedVertex: { elementId: string; vertexIndex: number } | null;
  enableVertexEditing: (elementId: string, vertexIndex: number) => void;
  disableVertexEditing: () => void;
  updateVertex: (elementId: string, vertexIndex: number, x: number, y: number) => Element | null;
}

export function useVertexEditing(): UseVertexEditingReturn {
  const [isVertexEditing, setIsVertexEditing] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<{ elementId: string; vertexIndex: number } | null>(null);

  const enableVertexEditing = useCallback((elementId: string, vertexIndex: number) => {
    setIsVertexEditing(true);
    setSelectedVertex({ elementId, vertexIndex });
  }, []);

  const disableVertexEditing = useCallback(() => {
    setIsVertexEditing(false);
    setSelectedVertex(null);
  }, []);

  const updateVertex = useCallback((elementId: string, vertexIndex: number, x: number, y: number): Element | null => {
    // This will be used by the component to update the element
    // Return the updated element structure
    return null; // Component will handle the actual update
  }, []);

  return {
    isVertexEditing,
    selectedVertex,
    enableVertexEditing,
    disableVertexEditing,
    updateVertex
  };
}

