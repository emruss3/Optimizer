// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { SitePlannerGeometry } from '../services/parcelGeometry';
import { CoordinateTransform } from '../utils/coordinateTransform';

interface SetbackOverlayProps {
  parcelGeometry: SitePlannerGeometry;
  viewBox: string;
  showSetbacks: boolean;
  showEdgeTypes: boolean;
}

export const SetbackOverlay: React.FC<SetbackOverlayProps> = ({
  parcelGeometry,
  viewBox,
  showSetbacks,
  showEdgeTypes
}) => {
  if (!showSetbacks && !showEdgeTypes) {
    return null;
  }

  const { setbacks_applied, edge_types, coordinates } = parcelGeometry;
  
  if (!setbacks_applied || !edge_types || !coordinates) {
    return null;
  }

  // Convert coordinates to SVG units
  const svgCoords = coordinates.map(([x, y]) => [x * 12, y * 12]); // 12 SVG units = 1 foot
  
  // Create setback lines
  const setbackLines = createSetbackLines(svgCoords, setbacks_applied);
  
  // Create edge type indicators
  const edgeIndicators = createEdgeIndicators(svgCoords, edge_types, setbacks_applied);

  return (
    <g className="setback-overlay">
      {/* Setback lines */}
      {showSetbacks && setbackLines.map((line, index) => (
        <g key={`setback-${index}`}>
          <path
            d={line.path}
            stroke="#ff6b6b"
            strokeWidth="2"
            strokeDasharray="5,5"
            fill="none"
            opacity="0.7"
          />
          <text
            x={line.label.x}
            y={line.label.y}
            fontSize="12"
            fill="#ff6b6b"
            fontWeight="bold"
            textAnchor="middle"
          >
            {line.label.text}
          </text>
        </g>
      ))}
      
      {/* Edge type indicators */}
      {showEdgeTypes && edgeIndicators.map((indicator, index) => (
        <g key={`edge-${index}`}>
          <rect
            x={indicator.x - 30}
            y={indicator.y - 15}
            width="60"
            height="30"
            fill={indicator.color}
            fillOpacity="0.3"
            stroke={indicator.color}
            strokeWidth="2"
            rx="4"
          />
          <text
            x={indicator.x}
            y={indicator.y + 4}
            fontSize="10"
            fill={indicator.color}
            fontWeight="bold"
            textAnchor="middle"
          >
            {indicator.label}
          </text>
        </g>
      ))}
    </g>
  );
};

/**
 * Create setback lines from parcel coordinates
 */
function createSetbackLines(
  coords: number[][],
  setbacks: { front: number; side: number; rear: number }
): Array<{ path: string; label: { x: number; y: number; text: string } }> {
  const lines: Array<{ path: string; label: { x: number; y: number; text: string } }> = [];
  
  if (coords.length < 3) return lines;

  // Find the front, side, and rear edges
  const bounds = CoordinateTransform.calculateBounds(coords);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  // Create setback lines for each edge
  const frontSetback = setbacks.front * 12; // Convert to SVG units
  const sideSetback = setbacks.side * 12;
  const rearSetback = setbacks.rear * 12;

  // Front setback line
  if (frontSetback > 0) {
    const frontY = bounds.maxY - frontSetback;
    lines.push({
      path: `M ${bounds.minX} ${frontY} L ${bounds.maxX} ${frontY}`,
      label: {
        x: centerX,
        y: frontY - 10,
        text: `${setbacks.front}' Front`
      }
    });
  }

  // Rear setback line
  if (rearSetback > 0) {
    const rearY = bounds.minY + rearSetback;
    lines.push({
      path: `M ${bounds.minX} ${rearY} L ${bounds.maxX} ${rearY}`,
      label: {
        x: centerX,
        y: rearY + 20,
        text: `${setbacks.rear}' Rear`
      }
    });
  }

  // Side setback lines
  if (sideSetback > 0) {
    const leftX = bounds.minX + sideSetback;
    const rightX = bounds.maxX - sideSetback;
    
    lines.push({
      path: `M ${leftX} ${bounds.minY} L ${leftX} ${bounds.maxY}`,
      label: {
        x: leftX - 10,
        y: centerY,
        text: `${setbacks.side}'`
      }
    });
    
    lines.push({
      path: `M ${rightX} ${bounds.minY} L ${rightX} ${bounds.maxY}`,
      label: {
        x: rightX + 10,
        y: centerY,
        text: `${setbacks.side}'`
      }
    });
  }

  return lines;
}

/**
 * Create edge type indicators
 */
function createEdgeIndicators(
  coords: number[][],
  edgeTypes: { front: boolean; side: boolean; rear: boolean; easement: boolean },
  setbacks: { front: number; side: number; rear: number }
): Array<{ x: number; y: number; label: string; color: string }> {
  const indicators: Array<{ x: number; y: number; label: string; color: string }> = [];
  
  if (coords.length < 3) return indicators;

  const bounds = CoordinateTransform.calculateBounds(coords);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  // Front edge indicator
  if (edgeTypes.front) {
    indicators.push({
      x: centerX,
      y: bounds.maxY - (setbacks.front * 12) / 2,
      label: 'FRONTAGE',
      color: '#22c55e'
    });
  }

  // Side edge indicators
  if (edgeTypes.side) {
    indicators.push({
      x: bounds.minX + (setbacks.side * 12) / 2,
      y: centerY,
      label: 'SIDE',
      color: '#3b82f6'
    });
    
    indicators.push({
      x: bounds.maxX - (setbacks.side * 12) / 2,
      y: centerY,
      label: 'SIDE',
      color: '#3b82f6'
    });
  }

  // Rear edge indicator
  if (edgeTypes.rear) {
    indicators.push({
      x: centerX,
      y: bounds.minY + (setbacks.rear * 12) / 2,
      label: 'REAR',
      color: '#f59e0b'
    });
  }

  // Easement indicator
  if (edgeTypes.easement) {
    indicators.push({
      x: centerX,
      y: centerY,
      label: 'EASEMENT',
      color: '#ef4444'
    });
  }

  return indicators;
}
