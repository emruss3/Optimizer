// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback, useRef, useEffect } from 'react';
import { DragState, MousePosition, SnapResult, RotationHandle, MultiSelectState, UndoRedoState, SitePlannerElement, GridSettings, SnapSettings } from '../types';

interface UseMouseHandlersProps {
  elements: SitePlannerElement[];
  onElementsChange: (elements: SitePlannerElement[]) => void;
  gridSize: number;
  snapToGrid: boolean;
  snapDistance: number;
  onUndo: () => void;
  onRedo: () => void;
  onSaveState: (state: any) => void;
}

export const useMouseHandlers = ({
  elements,
  onElementsChange,
  gridSize,
  snapToGrid,
  snapDistance,
  onUndo,
  onRedo,
  onSaveState
}: UseMouseHandlersProps) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [multiSelectState, setMultiSelectState] = useState<MultiSelectState | null>(null);
  const [rotationHandle, setRotationHandle] = useState<RotationHandle | null>(null);
  const [undoRedoState, setUndoRedoState] = useState<UndoRedoState>({
    history: [],
    currentIndex: -1,
    maxHistorySize: 50
  });

  const animationFrameRef = useRef<number>();
  const lastUpdateTime = useRef<number>(0);

  // Grid settings
  const gridSettings: GridSettings = {
    enabled: true,
    size: gridSize,
    snapToGrid,
    visible: true
  };

  // Snap settings
  const snapSettings: SnapSettings = {
    gridSnap: snapToGrid,
    objectSnap: true,
    snapDistance,
    vertexSnap: true,
    edgeSnap: true
  };

  // Calculate rotation handle position
  const calculateRotationHandle = useCallback((element: SitePlannerElement): RotationHandle => {
    const bounds = getElementBounds(element);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    return {
      x: centerX,
      y: centerY - 20, // 20px above center
      visible: element.selected,
      angle: element.transform.rotation
    };
  }, []);

  // Get element bounds
  const getElementBounds = useCallback((element: SitePlannerElement) => {
    if (!element.vertices || element.vertices.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    const xs = element.vertices.map(v => v.x);
    const ys = element.vertices.map(v => v.y);
    
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  }, []);

  // Snap to grid
  const snapToGridPosition = useCallback((x: number, y: number): SnapResult => {
    if (!snapSettings.gridSnap) {
      return { x, y, snapped: false };
    }

    const gridSizePixels = gridSettings.size * 12; // Convert feet to pixels (12 pixels per foot)
    const snappedX = Math.round(x / gridSizePixels) * gridSizePixels;
    const snappedY = Math.round(y / gridSizePixels) * gridSizePixels;
    
    const distance = Math.sqrt((x - snappedX) ** 2 + (y - snappedY) ** 2);
    
    if (distance <= snapSettings.snapDistance) {
      return {
        x: snappedX,
        y: snappedY,
        snapped: true,
        snapType: 'grid',
        snapTarget: { x: snappedX, y: snappedY }
      };
    }
    
    return { x, y, snapped: false };
  }, [snapSettings.gridSnap, gridSettings.size, snapSettings.snapDistance]);

  // Snap to object vertices/edges
  const snapToObject = useCallback((x: number, y: number, excludeElementId?: string): SnapResult => {
    if (!snapSettings.objectSnap) {
      return { x, y, snapped: false };
    }

    let closestSnap: SnapResult = { x, y, snapped: false };
    let minDistance = snapSettings.snapDistance;

    elements.forEach(element => {
      if (element.id === excludeElementId) return;

      // Check vertices
      if (snapSettings.vertexSnap) {
        element.vertices.forEach(vertex => {
          const distance = Math.sqrt((x - vertex.x) ** 2 + (y - vertex.y) ** 2);
          if (distance < minDistance) {
            minDistance = distance;
            closestSnap = {
              x: vertex.x,
              y: vertex.y,
              snapped: true,
              snapType: 'vertex',
              snapTarget: { x: vertex.x, y: vertex.y }
            };
          }
        });
      }

      // Check edges
      if (snapSettings.edgeSnap) {
        for (let i = 0; i < element.vertices.length; i++) {
          const v1 = element.vertices[i];
          const v2 = element.vertices[(i + 1) % element.vertices.length];
          
          const edgeSnap = snapToEdge(x, y, v1, v2);
          if (edgeSnap.snapped && edgeSnap.distance! < minDistance) {
            minDistance = edgeSnap.distance!;
            closestSnap = {
              x: edgeSnap.x,
              y: edgeSnap.y,
              snapped: true,
              snapType: 'edge',
              snapTarget: { x: edgeSnap.x, y: edgeSnap.y }
            };
          }
        }
      }
    });

    return closestSnap;
  }, [elements, snapSettings, snapSettings.snapDistance]);

  // Snap to edge
  const snapToEdge = useCallback((x: number, y: number, v1: any, v2: any) => {
    const A = x - v1.x;
    const B = y - v1.y;
    const C = v2.x - v1.x;
    const D = v2.y - v1.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      return { x: v1.x, y: v1.y, snapped: false, distance: Math.sqrt(A * A + B * B) };
    }

    const param = dot / lenSq;
    const clampedParam = Math.max(0, Math.min(1, param));
    
    const snapX = v1.x + clampedParam * C;
    const snapY = v1.y + clampedParam * D;
    
    const distance = Math.sqrt((x - snapX) ** 2 + (y - snapY) ** 2);
    
    return {
      x: snapX,
      y: snapY,
      snapped: distance <= snapSettings.snapDistance,
      distance
    };
  }, [snapSettings.snapDistance]);

  // Apply snapping
  const applySnapping = useCallback((x: number, y: number, excludeElementId?: string): SnapResult => {
    const gridSnap = snapToGridPosition(x, y);
    const objectSnap = snapToObject(x, y, excludeElementId);
    
    // Prefer object snap over grid snap
    if (objectSnap.snapped) {
      return objectSnap;
    }
    
    return gridSnap;
  }, [snapToGridPosition, snapToObject]);

  // Update element position
  const updateElementPosition = useCallback((elementId: string, deltaX: number, deltaY: number) => {
    onElementsChange(elements.map(element => {
      if (element.id === elementId) {
        return {
          ...element,
          vertices: element.vertices.map(vertex => ({
            ...vertex,
            x: vertex.x + deltaX,
            y: vertex.y + deltaY
          })),
          transform: {
            ...element.transform,
            x: element.transform.x + deltaX,
            y: element.transform.y + deltaY
          }
        };
      }
      return element;
    }));
  }, [elements, onElementsChange]);

  // Update element rotation
  const updateElementRotation = useCallback((elementId: string, angle: number) => {
    onElementsChange(elements.map(element => {
      if (element.id === elementId) {
        return {
          ...element,
          transform: {
            ...element.transform,
            rotation: angle
          }
        };
      }
      return element;
    }));
  }, [elements, onElementsChange]);

  // Update element scale
  const updateElementScale = useCallback((elementId: string, scaleX: number, scaleY: number) => {
    onElementsChange(elements.map(element => {
      if (element.id === elementId) {
        return {
          ...element,
          transform: {
            ...element.transform,
            scaleX,
            scaleY
          }
        };
      }
      return element;
    }));
  }, [elements, onElementsChange]);

  // Save state for undo/redo
  const saveState = useCallback(() => {
    const newState = {
      elements: [...elements],
      timestamp: Date.now()
    };
    
    setUndoRedoState(prev => {
      const newHistory = prev.history.slice(0, prev.currentIndex + 1);
      newHistory.push(newState);
      
      if (newHistory.length > prev.maxHistorySize) {
        newHistory.shift();
      }
      
      return {
        ...prev,
        history: newHistory,
        currentIndex: newHistory.length - 1
      };
    });
    
    onSaveState(newState);
  }, [elements, onSaveState]);

  // Mouse down handler
  const onMouseDown = useCallback((event: React.MouseEvent, elementId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const mousePos: MousePosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      clientX: event.clientX,
      clientY: event.clientY
    };

    // Check if clicking on rotation handle
    if (elementId && rotationHandle && rotationHandle.visible) {
      const handleDistance = Math.sqrt(
        (mousePos.x - rotationHandle.x) ** 2 + (mousePos.y - rotationHandle.y) ** 2
      );
      
      if (handleDistance <= 10) { // 10px radius for rotation handle
        const element = elements.find(e => e.id === elementId);
        if (element) {
          setDragState({
            mode: 'rotate',
            elementId,
            startX: mousePos.x,
            startY: mousePos.y,
            currentX: mousePos.x,
            currentY: mousePos.y,
            originalElement: { ...element },
            isMultiSelect: false,
            selectedElements: []
          });
          return;
        }
      }
    }

    // Check for multi-select (Ctrl/Cmd + click)
    if (event.ctrlKey || event.metaKey) {
      if (elementId) {
        const element = elements.find(e => e.id === elementId);
        if (element) {
          onElementsChange(elements.map(e => 
            e.id === elementId 
              ? { ...e, selected: !e.selected }
              : e
          ));
        }
      } else {
        // Start multi-select box
        setMultiSelectState({
          isActive: true,
          startX: mousePos.x,
          startY: mousePos.y,
          currentX: mousePos.x,
          currentY: mousePos.y,
          selectedElements: []
        });
      }
      return;
    }

    // Single element selection/drag
    if (elementId) {
      const element = elements.find(e => e.id === elementId);
      if (element) {
        // Clear other selections
        onElementsChange(elements.map(e => ({ ...e, selected: e.id === elementId })));
        
        // Start drag
        setDragState({
          mode: 'move',
          elementId,
          startX: mousePos.x,
          startY: mousePos.y,
          currentX: mousePos.x,
          currentY: mousePos.y,
          originalElement: { ...element },
          isMultiSelect: false,
          selectedElements: []
        });
        
        // Update rotation handle
        setRotationHandle(calculateRotationHandle({ ...element, selected: true }));
      }
    } else {
      // Clear all selections
      onElementsChange(elements.map(e => ({ ...e, selected: false })));
      setRotationHandle(null);
    }
  }, [elements, onElementsChange, rotationHandle, calculateRotationHandle]);

  // Mouse move handler
  const onMouseMove = useCallback((event: React.MouseEvent) => {
    if (!dragState && !multiSelectState) return;

    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const mousePos: MousePosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      clientX: event.clientX,
      clientY: event.clientY
    };

    // Throttle updates using requestAnimationFrame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const now = Date.now();
      if (now - lastUpdateTime.current < 16) return; // ~60fps
      lastUpdateTime.current = now;

      if (dragState) {
        const deltaX = mousePos.x - dragState.startX;
        const deltaY = mousePos.y - dragState.startY;

        if (dragState.mode === 'move') {
          // Apply snapping
          const snapResult = applySnapping(
            dragState.originalElement.transform.x + deltaX,
            dragState.originalElement.transform.y + deltaY,
            dragState.elementId
          );

          updateElementPosition(dragState.elementId, deltaX, deltaY);
          
          setDragState(prev => prev ? {
            ...prev,
            currentX: mousePos.x,
            currentY: mousePos.y,
            snapTarget: snapResult.snapped ? {
              type: snapResult.snapType!,
              x: snapResult.x,
              y: snapResult.y
            } : undefined
          } : null);
        } else if (dragState.mode === 'rotate') {
          const element = elements.find(e => e.id === dragState.elementId);
          if (element) {
            const bounds = getElementBounds(element);
            const centerX = (bounds.minX + bounds.maxX) / 2;
            const centerY = (bounds.minY + bounds.maxY) / 2;
            
            const angle = Math.atan2(mousePos.y - centerY, mousePos.x - centerX);
            updateElementRotation(dragState.elementId, angle);
            
            setDragState(prev => prev ? {
              ...prev,
              currentX: mousePos.x,
              currentY: mousePos.y
            } : null);
          }
        }
      }

      if (multiSelectState) {
        setMultiSelectState(prev => prev ? {
          ...prev,
          currentX: mousePos.x,
          currentY: mousePos.y
        } : null);
      }
    });
  }, [dragState, multiSelectState, applySnapping, updateElementPosition, updateElementRotation, elements, getElementBounds]);

  // Mouse up handler
  const onMouseUp = useCallback((event: React.MouseEvent) => {
    if (dragState) {
      // Save state for undo/redo
      saveState();
      
      setDragState(null);
    }

    if (multiSelectState) {
      // Select elements within the selection box
      const selectedElements = elements.filter(element => {
        const bounds = getElementBounds(element);
        const elementCenterX = (bounds.minX + bounds.maxX) / 2;
        const elementCenterY = (bounds.minY + bounds.maxY) / 2;
        
        const selectionLeft = Math.min(multiSelectState.startX, multiSelectState.currentX);
        const selectionRight = Math.max(multiSelectState.startX, multiSelectState.currentX);
        const selectionTop = Math.min(multiSelectState.startY, multiSelectState.currentY);
        const selectionBottom = Math.max(multiSelectState.startY, multiSelectState.currentY);
        
        return elementCenterX >= selectionLeft && elementCenterX <= selectionRight &&
               elementCenterY >= selectionTop && elementCenterY <= selectionBottom;
      });

      onElementsChange(elements.map(element => ({
        ...element,
        selected: selectedElements.some(sel => sel.id === element.id)
      })));

      setMultiSelectState(null);
    }

    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
  }, [dragState, multiSelectState, elements, getElementBounds, onElementsChange, saveState]);

  // Keyboard handlers
  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'z':
          if (event.shiftKey) {
            onRedo();
          } else {
            onUndo();
          }
          break;
        case 'y':
          onRedo();
          break;
        case 'a':
          // Select all
          onElementsChange(elements.map(e => ({ ...e, selected: true })));
          break;
        case 'c':
          // Copy selected elements
          const selectedElements = elements.filter(e => e.selected);
          if (selectedElements.length > 0) {
            navigator.clipboard.writeText(JSON.stringify(selectedElements));
          }
          break;
        case 'v':
          // Paste elements
          navigator.clipboard.readText().then(text => {
            try {
              const pastedElements = JSON.parse(text);
              if (Array.isArray(pastedElements)) {
                const newElements = pastedElements.map((element: any) => ({
                  ...element,
                  id: `${element.id}_${Date.now()}`,
                  transform: {
                    ...element.transform,
                    x: element.transform.x + 20,
                    y: element.transform.y + 20
                  }
                }));
                onElementsChange([...elements, ...newElements]);
              }
            } catch (error) {
              console.warn('Failed to paste elements:', error);
            }
          });
          break;
      }
    } else {
      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          // Delete selected elements
          const selectedElements = elements.filter(e => e.selected);
          if (selectedElements.length > 0) {
            onElementsChange(elements.filter(e => !e.selected));
            saveState();
          }
          break;
        case 'Escape':
          // Clear selection
          onElementsChange(elements.map(e => ({ ...e, selected: false })));
          setRotationHandle(null);
          break;
      }
    }
  }, [elements, onElementsChange, onUndo, onRedo, saveState]);

  // Set up keyboard event listeners
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  // Update rotation handle when selection changes
  useEffect(() => {
    const selectedElement = elements.find(e => e.selected);
    if (selectedElement) {
      setRotationHandle(calculateRotationHandle(selectedElement));
    } else {
      setRotationHandle(null);
    }
  }, [elements, calculateRotationHandle]);

  return {
    dragState,
    multiSelectState,
    rotationHandle,
    undoRedoState,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    applySnapping,
    updateElementPosition,
    updateElementRotation,
    updateElementScale
  };
};
