import React from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useUIStore } from '../store/ui';

interface MapControlsProps {
  onReload: () => void;
  parcelStats?: {
    total: number;
    visible: number;
    avgSize: number;
    sizeDistribution: { tiny: number; small: number; medium: number; large: number; };
  } | null;
}

export default function MapControls({ onReload, parcelStats }: MapControlsProps) {
  const { filterMode, colorMode, setFilterMode, setColorMode } = useUIStore();
  const [isExpanded, setIsExpanded] = React.useState(true);

  const changeFilterMode = (mode: 'all' | 'large' | 'huge') => {
    setFilterMode(mode);
    // Trigger reload after mode change
    setTimeout(onReload, 100);
  };

  return (
    <div className="bg-white border-b border-gray-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900">Map Controls</span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-4 space-y-4">
          {/* Color Mode Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color By:</label>
            <div className="space-y-2">
              <button
                onClick={() => setColorMode('size')}
                className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                  colorMode === 'size' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid="color-mode-size"
              >
                📏 Parcel Size
              </button>
              <button
                onClick={() => setColorMode('zoning')}
                className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                  colorMode === 'zoning' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid="color-mode-zoning"
              >
                🏘️ Zoning Type
              </button>
            </div>
          </div>
          
          {/* Filter Mode Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Size:</label>
            <div className="space-y-2">
              <button
                onClick={() => changeFilterMode('all')}
                className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                  filterMode === 'all' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid="filter-mode-all"
              >
                🔍 All Parcels (0+ sqft)
              </button>
              <button
                onClick={() => changeFilterMode('large')}
                className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                  filterMode === 'large' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid="filter-mode-large"
              >
                🏠 Large Only (5k+ sqft)
              </button>
              <button
                onClick={() => changeFilterMode('huge')}
                className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                  filterMode === 'huge' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid="filter-mode-huge"
              >
                🏢 Huge Only (20k+ sqft)
              </button>
            </div>
          </div>

          {/* Statistics */}
          {parcelStats && (
            <div className="p-3 bg-gray-50 rounded">
              <h4 className="font-bold text-sm text-gray-800 mb-2">📊 Current View Stats</h4>
              <div className="space-y-1 text-xs">
                <div>Total Parcels: <span className="font-bold">{parcelStats.total}</span></div>
                <div>Avg Size: <span className="font-bold">{Math.round(parcelStats.avgSize).toLocaleString()} sqft</span></div>
                <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                  <div className="text-red-600">{'Tiny (<2k): '}{parcelStats.sizeDistribution.tiny}</div>
                  <div className="text-orange-600">{'Small (2-5k): '}{parcelStats.sizeDistribution.small}</div>
                  <div className="text-blue-600">{'Medium (5-20k): '}{parcelStats.sizeDistribution.medium}</div>
                  <div className="text-purple-600">{'Large (20k+): '}{parcelStats.sizeDistribution.large}</div>
                </div>
              </div>
            </div>
          )}

          {/* Color Legend */}
          <div>
            <h4 className="font-bold text-sm text-gray-800 mb-2">🎨 Color Legend</h4>
            {colorMode === 'size' ? (
              <div className="space-y-1 text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-400 rounded"></div>
                  <span>{'Tiny (<1k sqft)'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-orange-400 rounded"></div>
                  <span>{'Small (1-2k sqft)'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-400 rounded"></div>
                  <span>{'Medium (2-5k sqft)'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-700 rounded"></div>
                  <span>{'Large (5-20k sqft)'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-900 rounded"></div>
                  <span>{'Huge (20k+ sqft)'}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span>Single-Family (RS)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span>Multi-Family (R)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-indigo-500 rounded"></div>
                  <span>Residential Mixed (RM)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-amber-500 rounded"></div>
                  <span>Commercial (C)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span>Mixed-Use (MU)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-500 rounded"></div>
                  <span>Industrial (I)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-purple-500 rounded"></div>
                  <span>Special Purpose (SP)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                  <span>Agricultural/Open (AG/OS)</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onReload}
            className="w-full bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
            data-testid="reload-parcels"
            title="Reload parcels"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reload Parcels</span>
          </button>
        </div>
      )}
    </div>
  );
}