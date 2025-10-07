// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { Ruler } from 'lucide-react';

interface MeasureOverlayProps {
  elements: Array<{
    id: string;
    type: string;
    vertices: Array<{ x: number; y: number }>;
    properties?: {
      area?: number;
      perimeter?: number;
    };
  }>;
  selectedElements: string[];
  gridSize: number;
  showMeasurements: boolean;
  className?: string;
}

export function MeasureOverlay({ 
  elements, 
  selectedElements, 
  gridSize, 
  showMeasurements,
  className = '' 
}: MeasureOverlayProps) {
  if (!showMeasurements) return null;

  const svgToFeet = (svgCoord: number) => svgCoord / gridSize;
  const feetToSVG = (feet: number) => feet * gridSize;

  const getElementBounds = (vertices: Array<{ x: number; y: number }>) => {
    if (vertices.length === 0) return null;
    
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
      centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
      centerY: (Math.min(...ys) + Math.max(...ys)) / 2
    };
  };

  const getEdgeLengths = (vertices: Array<{ x: number; y: number }>) => {
    if (vertices.length < 2) return [];
    
    const lengths = [];
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      const length = Math.sqrt(
        Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)
      );
      lengths.push({
        start: current,
        end: next,
        length: svgToFeet(length),
        midX: (current.x + next.x) / 2,
        midY: (current.y + next.y) / 2
      });
    }
    return lengths;
  };

  const getArea = (vertices: Array<{ x: number; y: number }>) => {
    if (vertices.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2 / (gridSize * gridSize); // Convert to square feet
  };

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <svg className="w-full h-full">
        {elements
          .filter(element => selectedElements.includes(element.id))
          .map(element => {
            const bounds = getElementBounds(element.vertices);
            if (!bounds) return null;

            const edgeLengths = getEdgeLengths(element.vertices);
            const area = getArea(element.vertices);

            return (
              <g key={element.id}>
                {/* Edge length labels */}
                {edgeLengths.map((edge, index) => (
                  <g key={index}>
                    <line
                      x1={edge.start.x}
                      y1={edge.start.y}
                      x2={edge.end.x}
                      y2={edge.end.y}
                      stroke="#3b82f6"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={edge.midX}
                      y={edge.midY - 5}
                      textAnchor="middle"
                      className="text-xs fill-blue-600 font-medium"
                      style={{ fontSize: '10px' }}
                    >
                      {edge.length.toFixed(0)} ft
                    </text>
                  </g>
                ))}

                {/* Area label */}
                <text
                  x={bounds.centerX}
                  y={bounds.centerY}
                  textAnchor="middle"
                  className="text-sm fill-green-600 font-bold"
                  style={{ fontSize: '12px' }}
                >
                  {area.toFixed(0)} SF
                </text>

                {/* Snap indicators for vertices */}
                {element.vertices.map((vertex, index) => (
                  <circle
                    key={index}
                    cx={vertex.x}
                    cy={vertex.y}
                    r="3"
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth="1"
                  />
                ))}
              </g>
            );
          })}
      </svg>
    </div>
  );
}
