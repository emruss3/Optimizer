import React from 'react';
import { BuildingMassing, SelectedParcel } from '../types/project';

interface SitePlanVisualizerProps {
  parcels: SelectedParcel[];
  massing: BuildingMassing | null;
  width?: number;
  height?: number;
}

export default function SitePlanVisualizer({ 
  parcels, 
  massing, 
  width = 300, 
  height = 200 
}: SitePlanVisualizerProps) {
  if (!massing || parcels.length === 0) {
    return (
      <div 
        className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center"
        style={{ width, height }}
      >
        <div className="text-center text-gray-500">
          <p className="text-sm">Site Plan Preview</p>
          <p className="text-xs">Add parcels to generate</p>
        </div>
      </div>
    );
  }

  // Calculate total site dimensions for scaling
  const totalSqft = parcels.reduce((sum, p) => sum + p.sqft, 0);
  const siteWidth = Math.sqrt(totalSqft);
  const siteHeight = siteWidth; // Assume square for simplicity
  
  // Scale factors to fit in the visualization
  const scaleX = width / siteWidth;
  const scaleY = height / siteHeight;
  const scale = Math.min(scaleX, scaleY) * 0.8; // Leave some margin

  // Calculate building dimensions
  const buildingWidth = Math.sqrt(massing.footprint);
  const buildingHeight = buildingWidth;
  
  // Center the building
  const buildingX = (width - buildingWidth * scale) / 2;
  const buildingY = (height - buildingHeight * scale) / 2;
  
  // Calculate setbacks for visualization
  const setbackSize = 20 * scale; // Approximate setback visualization

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-900 mb-3">Site Plan Concept</h4>
      
      <svg width={width} height={height} className="border border-gray-200 rounded">
        {/* Site boundary */}
        <rect
          x={10}
          y={10}
          width={width - 20}
          height={height - 20}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray="5,5"
        />
        
        {/* Setback lines */}
        <rect
          x={10 + setbackSize}
          y={10 + setbackSize}
          width={width - 20 - (setbackSize * 2)}
          height={height - 20 - (setbackSize * 2)}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
        
        {/* Building footprint */}
        <rect
          x={buildingX}
          y={buildingY}
          width={buildingWidth * scale}
          height={buildingHeight * scale}
          fill="#3b82f6"
          fillOpacity={0.7}
          stroke="#1d4ed8"
          strokeWidth="2"
        />
        
        {/* Building height indicator (shadow) */}
        <rect
          x={buildingX + 3}
          y={buildingY + 3}
          width={buildingWidth * scale}
          height={buildingHeight * scale}
          fill="#1f2937"
          fillOpacity={0.3}
        />
        
        {/* Parking areas (if applicable) */}
        {massing.parkingSpaces && massing.parkingSpaces > 0 && (
          <rect
            x={buildingX + buildingWidth * scale + 10}
            y={buildingY}
            width={40}
            height={buildingHeight * scale}
            fill="#6b7280"
            fillOpacity={0.5}
            stroke="#4b5563"
            strokeWidth="1"
          />
        )}
        
        {/* Open space areas */}
        {massing.openSpaceArea && massing.openSpaceArea > 0 && (
          <>
            <rect
              x={10 + setbackSize}
              y={10 + setbackSize}
              width={30}
              height={30}
              fill="#22c55e"
              fillOpacity={0.4}
              rx="5"
            />
            <circle
              cx={25 + setbackSize}
              cy={25 + setbackSize}
              r="8"
              fill="#16a34a"
              fillOpacity={0.6}
            />
          </>
        )}
        
        {/* Dimensions and labels */}
        <text x={width - 60} y={height - 30} fontSize="10" fill="#6b7280">
          {Math.round(massing.stories)} stories
        </text>
        <text x={width - 60} y={height - 18} fontSize="10" fill="#6b7280">
          {Math.round(massing.height)} ft
        </text>
        
        {/* North arrow */}
        <g transform="translate(20, 30)">
          <polygon points="0,-8 3,0 0,8 -3,0" fill="#374151" />
          <text x="6" y="2" fontSize="8" fill="#374151">N</text>
        </g>
      </svg>
      
      {/* Legend */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>Building</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-gray-500 rounded"></div>
          <span>Parking</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-green-400 rounded"></div>
          <span>Open Space</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-1 bg-yellow-400"></div>
          <span>Setbacks</span>
        </div>
      </div>
      
      {/* Key metrics */}
      <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Coverage:</span>
          <span className="font-medium">{massing.coverage.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span>FAR:</span>
          <span className="font-medium">{massing.far.toFixed(2)}</span>
        </div>
        {massing.units && massing.units > 0 && (
          <div className="flex justify-between">
            <span>Units:</span>
            <span className="font-medium">{massing.units}</span>
          </div>
        )}
      </div>
    </div>
  );
}