// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';

interface GridProps {
  width: number;
  height: number;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  className?: string;
}

export function Grid({ 
  width, 
  height, 
  gridSize, 
  showGrid, 
  snapToGrid,
  className = '' 
}: GridProps) {
  if (!showGrid) return null;

  const gridLines = [];
  const majorGridSize = gridSize * 5; // Major grid every 5 units
  const minorGridSize = gridSize; // Minor grid every unit

  // Generate vertical lines
  for (let x = 0; x <= width; x += minorGridSize) {
    const isMajor = x % majorGridSize === 0;
    gridLines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={isMajor ? "#d1d5db" : "#e5e7eb"}
        strokeWidth={isMajor ? 1 : 0.5}
        opacity={isMajor ? 0.8 : 0.4}
      />
    );
  }

  // Generate horizontal lines
  for (let y = 0; y <= height; y += minorGridSize) {
    const isMajor = y % majorGridSize === 0;
    gridLines.push(
      <line
        key={`h-${y}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke={isMajor ? "#d1d5db" : "#e5e7eb"}
        strokeWidth={isMajor ? 1 : 0.5}
        opacity={isMajor ? 0.8 : 0.4}
      />
    );
  }

  // Generate grid labels for major lines
  const gridLabels = [];
  for (let x = 0; x <= width; x += majorGridSize) {
    gridLabels.push(
      <text
        key={`label-x-${x}`}
        x={x + 2}
        y={12}
        className="text-xs fill-gray-500"
        style={{ fontSize: '10px' }}
      >
        {Math.round(x / gridSize)}ft
      </text>
    );
  }

  for (let y = 0; y <= height; y += majorGridSize) {
    gridLabels.push(
      <text
        key={`label-y-${y}`}
        x={2}
        y={y - 2}
        className="text-xs fill-gray-500"
        style={{ fontSize: '10px' }}
      >
        {Math.round(y / gridSize)}ft
      </text>
    );
  }

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <svg className="w-full h-full">
        <defs>
          <pattern
            id="grid"
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="0.5"
              opacity="0.3"
            />
          </pattern>
        </defs>
        
        {/* Grid pattern background */}
        <rect
          width={width}
          height={height}
          fill="url(#grid)"
        />
        
        {/* Grid lines */}
        {gridLines}
        
        {/* Grid labels */}
        {gridLabels}
        
        {/* Snap indicators */}
        {snapToGrid && (
          <g>
            {/* Snap point indicators */}
            {Array.from({ length: Math.floor(width / gridSize) + 1 }, (_, i) => 
              Array.from({ length: Math.floor(height / gridSize) + 1 }, (_, j) => (
                <circle
                  key={`snap-${i}-${j}`}
                  cx={i * gridSize}
                  cy={j * gridSize}
                  r="1"
                  fill="#3b82f6"
                  opacity="0.3"
                />
              ))
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
