// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import {
  Building, Car, TreePine, MousePointer, Copy, Square, Trash2,
  Maximize, ZoomIn, ZoomOut, AlignLeft, AlignCenter, AlignRight,
  AlignVerticalCenter, AlignTop, AlignBottom, Edit, Ruler,
  Grid3x3, Magnet
} from 'lucide-react';
import type { DrawingTool } from '../../hooks/useDrawingTools';

interface SitePlanToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onFitToParcel: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAlign?: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onToggleVertexEdit?: () => void;
  onToggleGrid?: () => void;
  onToggleSnapToGrid?: () => void;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  canAlign?: boolean;
  isVertexEditing?: boolean;
  gridEnabled?: boolean;
  snapToGridEnabled?: boolean;
}

export const SitePlanToolbar: React.FC<SitePlanToolbarProps> = ({
  activeTool,
  onToolChange,
  onCopy,
  onPaste,
  onDelete,
  onFitToParcel,
  onZoomIn,
  onZoomOut,
  onAlign,
  onToggleVertexEdit,
  onToggleGrid,
  onToggleSnapToGrid,
  canCopy,
  canPaste,
  canDelete,
  canAlign = false,
  isVertexEditing = false,
  gridEnabled = false,
  snapToGridEnabled = false
}) => {
  return (
    <div className="w-16 bg-white border-r flex flex-col items-center py-4 space-y-2">
      {/* Selection Tools */}
      <button
        onClick={() => onToolChange('select')}
        className={`p-2 rounded ${activeTool === 'select' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
        title="Select Tool"
      >
        <MousePointer className="w-5 h-5" />
      </button>

      {/* Drawing Tools */}
      <button
        onClick={() => onToolChange('draw-building')}
        className={`p-2 rounded ${activeTool === 'draw-building' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
        title="Add Building"
      >
        <Building className="w-5 h-5" />
      </button>
      <button
        onClick={() => onToolChange('draw-parking')}
        className={`p-2 rounded ${activeTool === 'draw-parking' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
        title="Add Parking"
      >
        <Car className="w-5 h-5" />
      </button>
      <button
        onClick={() => onToolChange('draw-greenspace')}
        className={`p-2 rounded ${activeTool === 'draw-greenspace' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
        title="Add Greenspace"
      >
        <TreePine className="w-5 h-5" />
      </button>
      <button
        onClick={() => onToolChange('measure')}
        className={`p-2 rounded ${activeTool === 'measure' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
        title="Measure Distance"
      >
        <Ruler className="w-5 h-5" />
      </button>

      {/* Separator */}
      <div className="border-t my-2 w-full" />

      {/* Edit Tools */}
      <button
        onClick={onCopy}
        disabled={!canCopy}
        className="p-2 rounded text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Copy (Ctrl+C)"
      >
        <Copy className="w-5 h-5" />
      </button>
      <button
        onClick={onPaste}
        disabled={!canPaste}
        className="p-2 rounded text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Paste (Ctrl+V)"
      >
        <Square className="w-5 h-5" />
      </button>
      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="p-2 rounded text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Delete (Del)"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Separator */}
      <div className="border-t my-2 w-full" />

      {/* Vertex Editing */}
      {onToggleVertexEdit && (
        <>
          <button
            onClick={onToggleVertexEdit}
            className={`p-2 rounded ${isVertexEditing ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            title="Edit Vertices"
          >
            <Edit className="w-5 h-5" />
          </button>
          <div className="border-t my-2 w-full" />
        </>
      )}

      {/* Alignment Tools */}
      {onAlign && canAlign && (
        <>
          <button
            onClick={() => onAlign('left')}
            className="p-2 rounded text-gray-600 hover:text-gray-900"
            title="Align Left"
          >
            <AlignLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => onAlign('center')}
            className="p-2 rounded text-gray-600 hover:text-gray-900"
            title="Align Center"
          >
            <AlignCenter className="w-5 h-5" />
          </button>
          <button
            onClick={() => onAlign('right')}
            className="p-2 rounded text-gray-600 hover:text-gray-900"
            title="Align Right"
          >
            <AlignRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => onAlign('top')}
            className="p-2 rounded text-gray-600 hover:text-gray-900"
            title="Align Top"
          >
            <AlignTop className="w-5 h-5" />
          </button>
          <button
            onClick={() => onAlign('middle')}
            className="p-2 rounded text-gray-600 hover:text-gray-900"
            title="Align Middle"
          >
            <AlignVerticalCenter className="w-5 h-5" />
          </button>
          <button
            onClick={() => onAlign('bottom')}
            className="p-2 rounded text-gray-600 hover:text-gray-900"
            title="Align Bottom"
          >
            <AlignBottom className="w-5 h-5" />
          </button>
          <div className="border-t my-2 w-full" />
        </>
      )}

      {/* Separator */}
      <div className="border-t my-2 w-full" />

      {/* Grid Controls */}
      {onToggleGrid && (
        <>
          <button
            onClick={onToggleGrid}
            className={`p-2 rounded ${gridEnabled ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            title="Toggle Grid"
          >
            <Grid3x3 className="w-5 h-5" />
          </button>
          {onToggleSnapToGrid && (
            <button
              onClick={onToggleSnapToGrid}
              className={`p-2 rounded ${snapToGridEnabled ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              title="Snap to Grid"
            >
              <Magnet className="w-5 h-5" />
            </button>
          )}
          <div className="border-t my-2 w-full" />
        </>
      )}

      {/* Viewport Controls */}
      <button
        onClick={onFitToParcel}
        className="p-2 rounded text-gray-600 hover:text-gray-900"
        title="Fit to Parcel (0)"
      >
        <Maximize className="w-5 h-5" />
      </button>
      <button
        onClick={onZoomIn}
        className="p-2 rounded text-gray-600 hover:text-gray-900"
        title="Zoom In (+)"
      >
        <ZoomIn className="w-5 h-5" />
      </button>
      <button
        onClick={onZoomOut}
        className="p-2 rounded text-gray-600 hover:text-gray-900"
        title="Zoom Out (-)"
      >
        <ZoomOut className="w-5 h-5" />
      </button>
    </div>
  );
};

