// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { MousePointer, Ruler, Grid3X3, Target } from 'lucide-react';

interface StatusBarProps {
  cursorPosition: { x: number; y: number };
  selectedElements: Array<{
    id: string;
    type: string;
    area?: number;
    perimeter?: number;
  }>;
  totalCoverage: number;
  gridSize: number;
  snapToGrid: boolean;
  showGrid: boolean;
  className?: string;
}

export function StatusBar({
  cursorPosition,
  selectedElements,
  totalCoverage,
  gridSize,
  snapToGrid,
  showGrid,
  className = ''
}: StatusBarProps) {
  const svgToFeet = (svgCoord: number) => svgCoord / gridSize;
  const feetToSVG = (feet: number) => feet * gridSize;

  const selectedArea = selectedElements.reduce((sum, element) => {
    return sum + (element.area || 0);
  }, 0);

  const selectedPerimeter = selectedElements.reduce((sum, element) => {
    return sum + (element.perimeter || 0);
  }, 0);

  return (
    <div className={`bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm ${className}`}>
      {/* Left side - Cursor position and selection info */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <MousePointer className="w-4 h-4 text-gray-500" />
          <span className="text-gray-600">
            X: {svgToFeet(cursorPosition.x).toFixed(0)}ft, Y: {svgToFeet(cursorPosition.y).toFixed(0)}ft
          </span>
        </div>

        {selectedElements.length > 0 && (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600">
                {selectedElements.length} selected
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <Ruler className="w-4 h-4 text-green-500" />
              <span className="text-gray-600">
                Area: {selectedArea.toFixed(0)} SF
              </span>
            </div>
            
            {selectedPerimeter > 0 && (
              <div className="flex items-center space-x-2">
                <Ruler className="w-4 h-4 text-orange-500" />
                <span className="text-gray-600">
                  Perimeter: {selectedPerimeter.toFixed(0)} ft
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center - Coverage info */}
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <span className="text-gray-600">
          Coverage: {(totalCoverage * 100).toFixed(1)}%
        </span>
      </div>

      {/* Right side - Grid and snap status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Grid3X3 className={`w-4 h-4 ${showGrid ? 'text-blue-500' : 'text-gray-400'}`} />
          <span className={`text-sm ${showGrid ? 'text-blue-600' : 'text-gray-500'}`}>
            Grid: {gridSize}ft
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${snapToGrid ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          <span className={`text-sm ${snapToGrid ? 'text-green-600' : 'text-gray-500'}`}>
            {snapToGrid ? 'Snap On' : 'Snap Off'}
          </span>
        </div>

        {/* Grid size indicator */}
        <div className="text-xs text-gray-500">
          {gridSize}ft units
        </div>
      </div>
    </div>
  );
}
