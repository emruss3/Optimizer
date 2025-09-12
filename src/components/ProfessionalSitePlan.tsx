import React, { useState, useMemo } from 'react';
import { Download, Share, Printer as Print, Maximize, Grid, Layers, Ruler, Building, MapPin, FileText, Settings, CheckCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { SelectedParcel, BuildingMassing, SiteplanConfig } from '../types/project';
import { ZoningCompliance, SpatialFeature } from '../types/zoning';
import ZoningComplianceIndicator from './ZoningComplianceIndicator';

interface ProfessionalSitePlanProps {
  parcels: SelectedParcel[];
  massing: BuildingMassing | null;
  config: SiteplanConfig;
  compliance: ZoningCompliance;
  width?: number;
  height?: number;
  compact?: boolean;
}

export default function ProfessionalSitePlan({ 
  parcels, 
  massing, 
  config, 
  compliance,
  width = 800, 
  height = 600,
  compact = false
}: ProfessionalSitePlanProps) {
  const [showLayers, setShowLayers] = useState({
    buildings: true,
    setbacks: true,
    dimensions: true,
    zoning: true,
    utilities: false,
    parking: true,
    landscaping: true
  });
  const [showCompliance, setShowCompliance] = useState(true);
  const [viewMode, setViewMode] = useState<'plan' | '3d' | 'compliance'>('plan');

  // Calculate site dimensions and features
  const siteAnalysis = useMemo(() => {
    if (parcels.length === 0) return null;

    const totalSqft = parcels.reduce((sum, p) => sum + p.sqft, 0);
    const totalAcreage = totalSqft / 43560;
    
    // Calculate approximate site boundaries (simplified rectangular assumption)
    const avgWidth = Math.sqrt(totalSqft * 1.2); // Slightly rectangular
    const avgHeight = totalSqft / avgWidth;
    
    // Calculate buildable area with setbacks
    const buildableWidth = Math.max(0, avgWidth - (config.buildingSetbacks.side * 2));
    const buildableHeight = Math.max(0, avgHeight - config.buildingSetbacks.front - config.buildingSetbacks.rear);
    const buildableArea = buildableWidth * buildableHeight;

    return {
      totalSqft,
      totalAcreage,
      dimensions: { width: avgWidth, height: avgHeight },
      buildable: { width: buildableWidth, height: buildableHeight, area: buildableArea },
      perimeter: (avgWidth + avgHeight) * 2,
      aspectRatio: avgWidth / avgHeight
    };
  }, [parcels, config]);

  // Generate spatial features
  const spatialFeatures = useMemo((): SpatialFeature[] => {
    if (!siteAnalysis || !massing) return [];

    const features: SpatialFeature[] = [];
    const { dimensions, buildable } = siteAnalysis;

    // Site boundary
    features.push({
      id: 'site-boundary',
      type: 'building',
      coordinates: [[
        [0, 0],
        [dimensions.width, 0],
        [dimensions.width, dimensions.height],
        [0, dimensions.height],
        [0, 0]
      ]],
      properties: {
        name: 'Site Boundary',
        description: 'Property lines',
        dimensions: {
          length: dimensions.width,
          width: dimensions.height,
          area: dimensions.width * dimensions.height,
          perimeter: (dimensions.width + dimensions.height) * 2
        }
      }
    });

    // Setback areas
    const setbacks = config.buildingSetbacks;
    features.push({
      id: 'front-setback',
      type: 'setback',
      coordinates: [[
        [0, 0],
        [dimensions.width, 0],
        [dimensions.width, setbacks.front],
        [0, setbacks.front],
        [0, 0]
      ]],
      properties: {
        name: 'Front Setback',
        description: `${setbacks.front}ft required setback`,
        constraints: ['no building allowed']
      }
    });

    features.push({
      id: 'rear-setback',
      type: 'setback',
      coordinates: [[
        [0, dimensions.height - setbacks.rear],
        [dimensions.width, dimensions.height - setbacks.rear],
        [dimensions.width, dimensions.height],
        [0, dimensions.height],
        [0, dimensions.height - setbacks.rear]
      ]],
      properties: {
        name: 'Rear Setback',
        description: `${setbacks.rear}ft required setback`,
        constraints: ['no building allowed']
      }
    });

    // Side setbacks
    features.push({
      id: 'left-setback',
      type: 'setback',
      coordinates: [[
        [0, setbacks.front],
        [setbacks.side, setbacks.front],
        [setbacks.side, dimensions.height - setbacks.rear],
        [0, dimensions.height - setbacks.rear],
        [0, setbacks.front]
      ]],
      properties: {
        name: 'Side Setback (Left)',
        description: `${setbacks.side}ft required setback`
      }
    });

    features.push({
      id: 'right-setback',
      type: 'setback',
      coordinates: [[
        [dimensions.width - setbacks.side, setbacks.front],
        [dimensions.width, setbacks.front],
        [dimensions.width, dimensions.height - setbacks.rear],
        [dimensions.width - setbacks.side, dimensions.height - setbacks.rear],
        [dimensions.width - setbacks.side, setbacks.front]
      ]],
      properties: {
        name: 'Side Setback (Right)',
        description: `${setbacks.side}ft required setback`
      }
    });

    // Building footprint
    const buildingWidth = Math.sqrt(massing.footprint * (buildable.width / buildable.height));
    const buildingHeight = massing.footprint / buildingWidth;
    const buildingX = setbacks.side + (buildable.width - buildingWidth) / 2;
    const buildingY = setbacks.front + (buildable.height - buildingHeight) / 2;

    features.push({
      id: 'building-footprint',
      type: 'building',
      coordinates: [[
        [buildingX, buildingY],
        [buildingX + buildingWidth, buildingY],
        [buildingX + buildingWidth, buildingY + buildingHeight],
        [buildingX, buildingY + buildingHeight],
        [buildingX, buildingY]
      ]],
      properties: {
        name: 'Building Footprint',
        description: `${massing.stories} story building`,
        dimensions: {
          length: buildingWidth,
          width: buildingHeight,
          area: massing.footprint,
          perimeter: (buildingWidth + buildingHeight) * 2
        }
      }
    });

    // Parking area
    if (massing.parkingSpaces && massing.parkingSpaces > 0) {
      const parkingWidth = Math.min(dimensions.width * 0.3, 150);
      const parkingHeight = (massing.parkingSpaces * 300) / parkingWidth;
      
      features.push({
        id: 'parking-area',
        type: 'parking',
        coordinates: [[
          [buildingX + buildingWidth + 20, buildingY],
          [buildingX + buildingWidth + 20 + parkingWidth, buildingY],
          [buildingX + buildingWidth + 20 + parkingWidth, buildingY + parkingHeight],
          [buildingX + buildingWidth + 20, buildingY + parkingHeight],
          [buildingX + buildingWidth + 20, buildingY]
        ]],
        properties: {
          name: 'Parking Area',
          description: `${massing.parkingSpaces} parking spaces`,
          dimensions: {
            length: parkingWidth,
            width: parkingHeight,
            area: parkingWidth * parkingHeight,
            perimeter: (parkingWidth + parkingHeight) * 2
          }
        }
      });
    }

    // Open space
    if (massing.openSpaceArea && massing.openSpaceArea > 0) {
      const openSpaceWidth = Math.sqrt(massing.openSpaceArea);
      const openSpaceHeight = openSpaceWidth;
      
      features.push({
        id: 'open-space',
        type: 'open-space',
        coordinates: [[
          [setbacks.side + 10, setbacks.front + 10],
          [setbacks.side + 10 + openSpaceWidth, setbacks.front + 10],
          [setbacks.side + 10 + openSpaceWidth, setbacks.front + 10 + openSpaceHeight],
          [setbacks.side + 10, setbacks.front + 10 + openSpaceHeight],
          [setbacks.side + 10, setbacks.front + 10]
        ]],
        properties: {
          name: 'Open Space',
          description: 'Required open space area',
          dimensions: {
            length: openSpaceWidth,
            width: openSpaceHeight,
            area: massing.openSpaceArea,
            perimeter: (openSpaceWidth + openSpaceHeight) * 2
          }
        }
      });
    }

    return features;
  }, [siteAnalysis, massing, config]);

  const scale = useMemo(() => {
    if (!siteAnalysis) return 1;
    const maxDimension = Math.max(siteAnalysis.dimensions.width, siteAnalysis.dimensions.height);
    return Math.min(width * 0.8, height * 0.8) / maxDimension;
  }, [siteAnalysis, width, height]);

  const formatDimension = (feet: number) => {
    return `${feet.toFixed(0)}'`;
  };

  const formatArea = (sqft: number) => {
    if (sqft >= 43560) {
      return `${(sqft / 43560).toFixed(2)} ac`;
    }
    return `${sqft.toLocaleString()} sf`;
  };

  if (!siteAnalysis || !massing) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <Building className="w-12 h-12 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Professional Site Plan</h3>
          <p className="text-sm">Add parcels and configure building parameters to generate site plan</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${compact ? 'text-xs' : ''}`}>
      {/* Header */}
      <div className={`bg-gray-50 border-b border-gray-200 ${compact ? 'p-2' : 'p-4'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-bold text-gray-900`}>
              {compact ? 'Site Plan' : 'Professional Site Plan'}
            </h3>
            <div className={`flex items-center space-x-2 ${compact ? 'text-xs' : 'text-sm'} text-gray-600 mt-1 flex-wrap`}>
              <span>Scale: 1" = {(1 / scale).toFixed(0)}'</span>
              <span>Total Site: {formatArea(siteAnalysis.totalSqft)}</span>
              {!compact && <span>Parcels: {parcels.length}</span>}
              <ZoningComplianceIndicator compliance={compliance} compact />
            </div>
          </div>
          {!compact && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode(viewMode === 'plan' ? '3d' : 'plan')}
                className="p-2 text-gray-600 hover:bg-gray-200 rounded"
                title="Toggle 3D view"
              >
                <Maximize className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowCompliance(!showCompliance)}
                className="p-2 text-gray-600 hover:bg-gray-200 rounded"
                title="Toggle compliance overlay"
              >
                {showCompliance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button className="p-2 text-gray-600 hover:bg-gray-200 rounded" title="Export">
                <Download className="w-4 h-4" />
              </button>
              <button className="p-2 text-gray-600 hover:bg-gray-200 rounded" title="Print">
                <Print className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Main drawing area */}
        <div className={`${compact ? 'w-full' : 'flex-1'} relative bg-white`}>
          <svg 
            width={width} 
            height={height} 
            className={`${compact ? '' : 'border-r border-gray-200'}`}
            viewBox={`0 0 ${width} ${height}`}
          >
            {/* Grid background */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
              </pattern>
              
              {/* Violation pattern */}
              <pattern id="violation-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
                <rect width="8" height="8" fill="#fef2f2"/>
                <path d="M0,8 L8,0 M-2,2 L2,-2 M6,10 L10,6" stroke="#dc2626" strokeWidth="1"/>
              </pattern>
            </defs>
            
            <rect width={width} height={height} fill="url(#grid)" />
            
            {/* Site features */}
            <g transform={`translate(${(width - siteAnalysis.dimensions.width * scale) / 2}, ${(height - siteAnalysis.dimensions.height * scale) / 2})`}>
              {spatialFeatures.map((feature) => {
                const coords = feature.coordinates[0].map(([x, y]) => `${x * scale},${y * scale}`).join(' ');
                
                // Skip rendering if layer is hidden
                if (!showLayers[feature.type as keyof typeof showLayers]) return null;
                
                let fillColor = '#e5e7eb';
                let strokeColor = '#6b7280';
                let fillOpacity = 0.3;
                
                switch (feature.type) {
                  case 'building':
                    if (feature.id === 'site-boundary') {
                      fillColor = 'none';
                      strokeColor = '#374151';
                      fillOpacity = 0;
                    } else {
                      fillColor = '#3b82f6';
                      strokeColor = '#1d4ed8';
                      fillOpacity = 0.7;
                    }
                    break;
                  case 'setback':
                    fillColor = '#fbbf24';
                    strokeColor = '#f59e0b';
                    fillOpacity = 0.2;
                    break;
                  case 'parking':
                    fillColor = '#6b7280';
                    strokeColor = '#4b5563';
                    fillOpacity = 0.5;
                    break;
                  case 'open-space':
                    fillColor = '#22c55e';
                    strokeColor = '#16a34a';
                    fillOpacity = 0.4;
                    break;
                }

                // Check for violations
                const hasViolation = compliance.violations.some(v => 
                  feature.type === 'setback' && v.category === 'setback' ||
                  feature.type === 'building' && (v.category === 'height' || v.category === 'coverage' || v.category === 'far')
                );

                if (hasViolation && showCompliance) {
                  fillColor = 'url(#violation-pattern)';
                  strokeColor = '#dc2626';
                }

                return (
                  <g key={feature.id}>
                    <polygon
                      points={coords}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth="2"
                      fillOpacity={fillOpacity}
                    />
                    
                    {/* Feature label */}
                    {feature.properties.dimensions && showLayers.dimensions && (
                      <text
                        x={(feature.coordinates[0][0][0] + feature.coordinates[0][2][0]) / 2 * scale}
                        y={(feature.coordinates[0][0][1] + feature.coordinates[0][2][1]) / 2 * scale}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="text-xs font-medium fill-gray-700"
                      >
                        {feature.properties.name}
                      </text>
                    )}
                  </g>
                );
              })}
              
              {/* Dimension lines */}
              {showLayers.dimensions && (
                <g className="text-xs font-medium fill-gray-600">
                  {/* Site dimensions */}
                  <line
                    x1={0}
                    y1={-30}
                    x2={siteAnalysis.dimensions.width * scale}
                    y2={-30}
                    stroke="#374151"
                    strokeWidth="1"
                    markerEnd="url(#arrowhead)"
                  />
                  <text
                    x={(siteAnalysis.dimensions.width * scale) / 2}
                    y={-35}
                    textAnchor="middle"
                    className="text-xs font-medium fill-gray-700"
                  >
                    {formatDimension(siteAnalysis.dimensions.width)}
                  </text>
                  
                  <line
                    x1={-30}
                    y1={0}
                    x2={-30}
                    y2={siteAnalysis.dimensions.height * scale}
                    stroke="#374151"
                    strokeWidth="1"
                  />
                  <text
                    x={-35}
                    y={(siteAnalysis.dimensions.height * scale) / 2}
                    textAnchor="middle"
                    transform={`rotate(-90, -35, ${(siteAnalysis.dimensions.height * scale) / 2})`}
                    className="text-xs font-medium fill-gray-700"
                  >
                    {formatDimension(siteAnalysis.dimensions.height)}
                  </text>
                </g>
              )}
            </g>
            
            {/* North arrow */}
            <g transform="translate(50, 50)">
              <polygon points="0,-15 5,0 0,15 -5,0" fill="#374151" />
              <text x="10" y="5" className="text-sm font-bold fill-gray-700">N</text>
            </g>
            
            {/* Scale bar */}
            <g transform={`translate(${width - 150}, ${height - 50})`}>
              <line x1="0" y1="0" x2="100" y2="0" stroke="#374151" strokeWidth="2"/>
              <line x1="0" y1="-5" x2="0" y2="5" stroke="#374151" strokeWidth="1"/>
              <line x1="100" y1="-5" x2="100" y2="5" stroke="#374151" strokeWidth="1"/>
              <text x="50" y="15" textAnchor="middle" className="text-xs font-medium fill-gray-700">
                {formatDimension(100 / scale)}
              </text>
            </g>
          </svg>

          {/* Compliance overlay */}
          {showCompliance && (
            <div className={`absolute ${compact ? 'top-2 left-2 max-w-xs' : 'top-4 left-4 max-w-xs'}`}>
              <ZoningComplianceIndicator compliance={compliance} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        {!compact && (
          <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {/* Layer controls */}
          <div className="p-4 border-b border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <Layers className="w-4 h-4" />
              <span>Display Layers</span>
            </h4>
            <div className="space-y-2">
              {Object.entries(showLayers).map(([layer, visible]) => (
                <label key={layer} className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setShowLayers(prev => ({ ...prev, [layer]: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="capitalize">{layer.replace(/([A-Z])/g, ' $1')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Project information */}
          <div className="p-4 border-b border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>Project Information</span>
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Address:</span>
                <p className="font-medium">{parcels[0]?.address || 'Multiple Parcels'}</p>
              </div>
              <div>
                <span className="text-gray-600">Parcel Numbers:</span>
                <p className="font-medium">{parcels.map(p => p.parcelnumb).join(', ')}</p>
              </div>
              <div>
                <span className="text-gray-600">Zoning:</span>
                <p className="font-medium">{Array.from(new Set(parcels.map(p => p.zoning))).join(', ')}</p>
              </div>
              <div>
                <span className="text-gray-600">Total Area:</span>
                <p className="font-medium">{formatArea(siteAnalysis.totalSqft)}</p>
              </div>
            </div>
          </div>

          {/* Building information */}
          <div className="p-4 border-b border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <Building className="w-4 h-4" />
              <span>Building Data</span>
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Building Height:</span>
                <span className="font-medium">{massing.height}ft ({massing.stories} stories)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Footprint:</span>
                <span className="font-medium">{formatArea(massing.footprint)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total GSF:</span>
                <span className="font-medium">{formatArea(massing.totalGSF)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">FAR:</span>
                <span className="font-medium">{massing.far.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Site Coverage:</span>
                <span className="font-medium">{massing.coverage.toFixed(1)}%</span>
              </div>
              {massing.units && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Units:</span>
                  <span className="font-medium">{massing.units}</span>
                </div>
              )}
              {massing.parkingSpaces && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Parking:</span>
                  <span className="font-medium">{massing.parkingSpaces} spaces</span>
                </div>
              )}
            </div>
          </div>

          {/* Export options */}
          <div className="p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Export Options</h4>
            <div className="space-y-2">
              <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2">
                <Download className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
              <button className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>Compliance Report</span>
              </button>
              <button className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2">
                <Share className="w-4 h-4" />
                <span>Share Plan</span>
              </button>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}