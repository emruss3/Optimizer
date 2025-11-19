// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { MousePointer, Ruler, Grid3x3, Magnet, Building, Car, TreePine } from 'lucide-react';
import type { DrawingTool } from '../../hooks/useDrawingTools';
import type { SiteMetrics } from '../../engine/types';

interface StatusBarProps {
  activeTool: DrawingTool;
  selectedCount: number;
  elementCount: number;
  zoomLevel: number;
  gridEnabled: boolean;
  snapToGridEnabled: boolean;
  measurementDistance?: number | null;
  metrics?: SiteMetrics | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeTool,
  selectedCount,
  elementCount,
  zoomLevel,
  gridEnabled,
  snapToGridEnabled,
  measurementDistance,
  metrics
}) => {
  const getToolName = (tool: DrawingTool): string => {
    switch (tool) {
      case 'select':
        return 'Select';
      case 'draw-building':
        return 'Building';
      case 'draw-parking':
        return 'Parking';
      case 'draw-greenspace':
        return 'Greenspace';
      case 'measure':
        return 'Measure';
      case 'edit':
        return 'Edit';
      default:
        return 'Unknown';
    }
  };

  const getToolIcon = (tool: DrawingTool) => {
    switch (tool) {
      case 'select':
        return <MousePointer className="w-4 h-4" />;
      case 'draw-building':
        return <Building className="w-4 h-4" />;
      case 'draw-parking':
        return <Car className="w-4 h-4" />;
      case 'draw-greenspace':
        return <TreePine className="w-4 h-4" />;
      case 'measure':
        return <Ruler className="w-4 h-4" />;
      default:
        return <MousePointer className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-8 bg-gray-800 text-white text-xs flex items-center px-4 border-t border-gray-700">
      <div className="flex items-center space-x-6">
        {/* Current Tool */}
        <div className="flex items-center space-x-2">
          {getToolIcon(activeTool)}
          <span className="font-medium">{getToolName(activeTool)}</span>
        </div>

        {/* Selection Count */}
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">Selected:</span>
          <span className="font-medium">{selectedCount}</span>
        </div>

        {/* Element Count */}
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">Elements:</span>
          <span className="font-medium">{elementCount}</span>
        </div>

        {/* Zoom Level */}
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">Zoom:</span>
          <span className="font-medium">{(zoomLevel * 100).toFixed(0)}%</span>
        </div>

        {/* Grid Status */}
        <div className="flex items-center space-x-2">
          <Grid3x3 className={`w-4 h-4 ${gridEnabled ? 'text-blue-400' : 'text-gray-500'}`} />
          <span className={gridEnabled ? 'text-blue-400' : 'text-gray-500'}>
            Grid {gridEnabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {/* Snap to Grid Status */}
        {gridEnabled && (
          <div className="flex items-center space-x-2">
            <Magnet className={`w-4 h-4 ${snapToGridEnabled ? 'text-blue-400' : 'text-gray-500'}`} />
            <span className={snapToGridEnabled ? 'text-blue-400' : 'text-gray-500'}>
              Snap {snapToGridEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        )}

        {/* Measurement Distance */}
        {measurementDistance !== null && measurementDistance !== undefined && (
          <div className="flex items-center space-x-2">
            <Ruler className="w-4 h-4 text-red-400" />
            <span className="text-red-400 font-medium">
              {measurementDistance.toFixed(1)} ft
            </span>
          </div>
        )}

        {/* Earthwork Summary */}
        {metrics && metrics.earthworkCutCY !== undefined && metrics.earthworkFillCY !== undefined && metrics.earthworkCost !== undefined && (
          <div className="flex items-center space-x-2 bg-gray-700 px-2 py-1 rounded">
            <span className="text-gray-400">Earthwork:</span>
            <span className="font-medium">
              Cut {Math.round(metrics.earthworkCutCY / 1000)}k CY / Fill {Math.round(metrics.earthworkFillCY / 1000)}k CY / ${Math.round(metrics.earthworkCost / 1000)}k
            </span>
          </div>
        )}
      </div>
    </div>
  );
};


