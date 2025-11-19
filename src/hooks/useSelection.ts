// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';

export interface UseSelectionReturn {
  selectedElements: Set<string>;
  selectElement: (id: string, multiSelect?: boolean) => void;
  deselectElement: (id: string) => void;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  selectedCount: number;
}

export function useSelection(): UseSelectionReturn {
  const [selectedElements, setSelectedElements] = useState<Set<string>>(new Set());

  const selectElement = useCallback((id: string, multiSelect = false) => {
    setSelectedElements(prev => {
      if (multiSelect) {
        const next = new Set(prev);
        next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const deselectElement = useCallback((id: string) => {
    setSelectedElements(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedElements(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedElements(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedElements(new Set());
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedElements.has(id);
  }, [selectedElements]);

  return {
    selectedElements,
    selectElement,
    deselectElement,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount: selectedElements.size
  };
}


