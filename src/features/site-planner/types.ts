// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

export interface DragState {
  mode: 'move' | 'resize' | 'rotate' | 'vertex';
  elementId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  originalElement: any;
  snapTarget?: {
    type: 'grid' | 'vertex' | 'edge';
    x: number;
    y: number;
  };
  isMultiSelect: boolean;
  selectedElements: string[];
}

export interface MousePosition {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

export interface SnapResult {
  x: number;
  y: number;
  snapped: boolean;
  snapType?: 'grid' | 'vertex' | 'edge';
  snapTarget?: {
    x: number;
    y: number;
  };
}

export interface RotationHandle {
  x: number;
  y: number;
  visible: boolean;
  angle: number;
}

export interface MultiSelectState {
  isActive: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  selectedElements: string[];
}

export interface UndoRedoState {
  history: any[];
  currentIndex: number;
  maxHistorySize: number;
}

export interface SitePlannerElement {
  id: string;
  type: 'building' | 'parking' | 'landscape' | 'road';
  vertices: Array<{ id: string; x: number; y: number }>;
  properties: {
    name: string;
    area: number;
    [key: string]: any;
  };
  transform: {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
  };
  selected: boolean;
  locked: boolean;
}

export interface GridSettings {
  enabled: boolean;
  size: number; // in feet
  snapToGrid: boolean;
  visible: boolean;
}

export interface SnapSettings {
  gridSnap: boolean;
  objectSnap: boolean;
  snapDistance: number; // in pixels
  vertexSnap: boolean;
  edgeSnap: boolean;
}
