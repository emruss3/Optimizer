import React, { useState, useCallback, useEffect } from 'react';
import { Slider } from 'lucide-react';
import type { Element, PlannerConfig, SiteMetrics } from '../engine/types';
import { workerManager } from '../workers/workerManager';

interface SitePlanDesignerProps {
  parcel: any; // SelectedParcel
  children?: React.ReactNode;
  onPlanGenerated?: (elements: Element[], metrics: SiteMetrics) => void;
}

const SitePlanDesigner: React.FC<SitePlanDesignerProps> = ({
  parcel,
  children,
  onPlanGenerated
}) => {
  // Robust validation functions
  function isNonEmptyPolygon(g: any): g is GeoJSON.Polygon {
    return g?.type === 'Polygon' && Array.isArray(g.coordinates) &&
           g.coordinates.length > 0 && Array.isArray(g.coordinates[0]) &&
           g.coordinates[0].length >= 4;
  }

  function coerceParcelId(ogc_fid: unknown): string | null {
    if (typeof ogc_fid === 'number') return String(ogc_fid);
    if (typeof ogc_fid === 'string' && ogc_fid !== 'unknown' && ogc_fid.trim() !== '') return ogc_fid;
    return null;
  }

  // Validate parcel data with robust checks
  const validId = coerceParcelId(parcel?.ogc_fid);
  const validGeom = isNonEmptyPolygon(parcel?.geometry);
  const isValidParcel = Boolean(validId && validGeom);
  
  // Normalize parcel ID and geometry
  const normalizedParcelId = validId || 'unknown';
  const normalizedGeometry = validGeom ? parcel.geometry : null;
  
  // Debug logging
  useEffect(() => {
    console.log('SitePlanDesigner received parcel:', parcel);
    console.log('isValidParcel:', isValidParcel);
    console.log('SitePlanDesigner received children:', children);
    console.log('children type:', typeof children);
    console.log('isValidElement:', React.isValidElement(children));
    if (parcel) {
      console.log('parcel.ogc_fid:', parcel.ogc_fid);
      console.log('parcel.geometry:', parcel.geometry);
    }
  }, [parcel, isValidParcel, children]);
  
  const [config, setConfig] = useState<PlannerConfig>({
    parcelId: normalizedParcelId,
    buildableArea: normalizedGeometry || { type: 'Polygon', coordinates: [] },
    zoning: {
      frontSetbackFt: 20,
      sideSetbackFt: 10,
      rearSetbackFt: 20,
      maxFar: 2.0,
      maxCoveragePct: 60,
      minParkingRatio: 1.0
    },
    designParameters: {
      targetFAR: 1.5,
      targetCoveragePct: 50,
      parking: {
        targetRatio: 1.5,
        stallWidthFt: 9,
        stallDepthFt: 18,
        aisleWidthFt: 12,
        adaPct: 5,
        evPct: 10,
        layoutAngle: 0
      },
      buildingTypology: 'bar',
      numBuildings: 2
    }
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentElements, setCurrentElements] = useState<Element[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<SiteMetrics | null>(null);
  const [requestId, setRequestId] = useState(0);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Generate site plan when config changes (with debouncing)
  const generatePlan = useCallback(async (currentRequestId: number) => {
    if (!isValidParcel) {
      console.warn('Cannot generate site plan: Invalid parcel data');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const result = await workerManager.generateSitePlan(normalizedGeometry, config);
      
      // Only update if this is still the latest request
      if (currentRequestId === requestId) {
        setCurrentElements(result.elements);
        setCurrentMetrics(result.metrics);
        
        if (onPlanGenerated) {
          onPlanGenerated(result.elements, result.metrics);
        }
      } else {
        console.log('Ignoring stale worker response');
      }
    } catch (error) {
      console.error('Error generating site plan:', error);
    } finally {
      if (currentRequestId === requestId) {
        setIsGenerating(false);
      }
    }
  }, [normalizedGeometry, config, onPlanGenerated, requestId]);

  // Debounced config change handler
  const handleConfigChange = useCallback((updates: Partial<PlannerConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Set new timer
    const newTimer = setTimeout(() => {
      const newRequestId = requestId + 1;
      setRequestId(newRequestId);
      generatePlan(newRequestId);
    }, 200); // 200ms debounce
    
    setDebounceTimer(newTimer);
  }, [debounceTimer, requestId, generatePlan]);

  // Auto-generate on config change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const newRequestId = requestId + 1;
      setRequestId(newRequestId);
      generatePlan(newRequestId);
    }, 200); // Debounce config changes

    return () => clearTimeout(timeoutId);
  }, [generatePlan, requestId]);

  const updateConfig = (updates: Partial<PlannerConfig>) => {
    handleConfigChange(updates);
  };

  // Gate UI + worker call for invalid parcels
  if (!isValidParcel) {
    return (
      <div className="flex h-full">
        <div className="w-80 bg-white border-r p-4 overflow-y-auto">
          <div className="text-center p-8">
            <div className="text-2xl mb-4">🏗️</div>
            <div className="text-lg font-medium mb-2 text-gray-700">Select a Parcel</div>
            <div className="text-sm text-gray-500">
              Click a parcel on the map to begin planning.
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <div className="text-4xl mb-4">📍</div>
            <div className="text-xl font-medium mb-2 text-gray-700">No Parcel Selected</div>
            <div className="text-sm text-gray-500">
              Please select a valid parcel on the map to start designing your site plan.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Design Controls Panel */}
      <div className="w-80 bg-white border-r p-4 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Design Parameters</h3>
        
        {/* Parcel Validation Warning */}
        {!isValidParcel && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 text-yellow-600">⚠️</div>
              <span className="text-sm text-yellow-800">
                Invalid parcel data. Please select a valid parcel to continue.
              </span>
            </div>
          </div>
        )}
        
        {/* FAR Control */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target FAR: {config.designParameters.targetFAR}
          </label>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={config.designParameters.targetFAR}
            onChange={(e) => updateConfig({
              designParameters: {
                ...config.designParameters,
                targetFAR: parseFloat(e.target.value)
              }
            })}
            disabled={!isValidParcel}
            className={`w-full h-2 bg-gray-200 rounded-lg appearance-none ${
              isValidParcel ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.5</span>
            <span>3.0</span>
          </div>
        </div>

        {/* Coverage Control */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Coverage: {config.designParameters.targetCoveragePct}%
          </label>
          <input
            type="range"
            min="20"
            max="80"
            step="5"
            value={config.designParameters.targetCoveragePct}
            onChange={(e) => updateConfig({
              designParameters: {
                ...config.designParameters,
                targetCoveragePct: parseInt(e.target.value)
              }
            })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>20%</span>
            <span>80%</span>
          </div>
        </div>

        {/* Parking Ratio Control */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Parking Ratio: {config.designParameters.parking.targetRatio}
          </label>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={config.designParameters.parking.targetRatio}
            onChange={(e) => updateConfig({
              designParameters: {
                ...config.designParameters,
                parking: {
                  ...config.designParameters.parking,
                  targetRatio: parseFloat(e.target.value)
                }
              }
            })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.5</span>
            <span>3.0</span>
          </div>
        </div>

        {/* Building Typology */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Building Typology
          </label>
          <select
            value={config.designParameters.buildingTypology}
            onChange={(e) => updateConfig({
              designParameters: {
                ...config.designParameters,
                buildingTypology: e.target.value
              }
            })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="bar">Bar Building</option>
            <option value="L-shape">L-Shaped</option>
            <option value="podium">Podium</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {/* Number of Buildings */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Buildings: {config.designParameters.numBuildings}
          </label>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={config.designParameters.numBuildings}
            onChange={(e) => updateConfig({
              designParameters: {
                ...config.designParameters,
                numBuildings: parseInt(e.target.value)
              }
            })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        {/* Generation Status */}
        {isGenerating && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-blue-600">Generating site plan...</span>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-2">
          <button
            onClick={generatePlan}
            disabled={isGenerating}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Regenerate Plan
          </button>
          <button
            onClick={() => {
              // Save current plan
              console.log('Saving plan:', { elements: currentElements, metrics: currentMetrics });
            }}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Save Plan
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        {children && React.isValidElement(children) ? (
          React.cloneElement(children, {
            planElements: currentElements,
            metrics: currentMetrics
          })
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50 border border-gray-200 rounded-lg">
            <div className="text-center p-8">
              <div className="text-2xl mb-4">🏗️</div>
              <div className="text-lg font-medium mb-2 text-gray-700">Site Plan Designer</div>
              <div className="text-sm text-gray-500 mb-4">
                Configure your design parameters using the controls on the left
              </div>
              {!isValidParcel && (
                <div className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  ⚠️ Please select a valid parcel to begin designing
                </div>
              )}
              {isValidParcel && (
                <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                  ✅ Ready to generate site plan for parcel {parcel.ogc_fid}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SitePlanDesigner;