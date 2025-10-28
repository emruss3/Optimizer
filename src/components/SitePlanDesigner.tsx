import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Slider } from 'lucide-react';
import type { Element, PlannerConfig, SiteMetrics } from '../engine/types';
import { workerManager } from '../workers/workerManager';
import { toPolygon } from '../engine/geometry/normalize';
import { computeParcelMetrics } from '../engine/metrics/parcelMetrics';
import { fetchEnvelopeSafe } from '@/lib/fetchEnvelope';
import { CoordinateTransform } from '@/utils/coordinateTransform';

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
    // Safety: handle missing zoning gracefully with sensible defaults
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
  const [envelope, setEnvelope] = useState<any>(null);
  const [rpcMetrics, setRpcMetrics] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading');

  // New worker for reliable generation
  const worker = useMemo(() => new Worker(new URL("../engine/workers/sitegenie", import.meta.url), { type: "module" }), []);

  // Debounced generation with metrics
  const requestGenerate = useMemo(() => {
    let currentReqId: string | null = null;
    let timer: any = null;

    return (rawParcel: any, config: any) => {
      if (!rawParcel?.geometry) return;

      const poly = toPolygon(rawParcel.geometry);
      const metrics = computeParcelMetrics(poly);

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        currentReqId = crypto.randomUUID();
        worker.postMessage({ type: "generate", reqId: currentReqId, parcel: poly, config, metrics });
      }, 150); // debounce UI sliders
    };
  }, [worker]);

  // Generate site plan when config changes (with debouncing)
  const generatePlan = useCallback(async (currentRequestId: number) => {
    if (!isValidParcel) {
      console.warn('Cannot generate site plan: Invalid parcel data');
      return;
    }
    
    // Quick diagnostics to keep (helps catch this forever)
    console.debug('Planner input:', { 
      parcelId: validId, 
      ringLen: normalizedGeometry?.coordinates[0]?.length, 
      type: normalizedGeometry?.type 
    });
    
    setIsGenerating(true);
    
    try {
      // Use new worker with metrics
      requestGenerate(parcel, config);
      
      // Set up worker message handler
      const handleMessage = (event: MessageEvent) => {
        const { type, reqId, elements, metrics, error } = event.data;
        if (type === 'generated' && reqId === currentRequestId) {
          if (error) {
            console.error('Worker error:', error);
          } else {
            setCurrentElements(elements || []);
            setCurrentMetrics(metrics || null);
            
            if (onPlanGenerated) {
              onPlanGenerated(elements || [], metrics || null);
            }
          }
          setIsGenerating(false);
          worker.removeEventListener('message', handleMessage);
        }
      };
      
      worker.addEventListener('message', handleMessage);
      
    } catch (error) {
      console.error('Error generating site plan:', error);
      setIsGenerating(false);
    }
  }, [parcel, config, onPlanGenerated, requestGenerate, worker]);

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

  // Fetch buildable envelope when parcel changes
  useEffect(() => {
    if (!parcel) return;
    setStatus("loading");

    const fetchEnvelope = async () => {
      try {
        const env = await fetchEnvelopeSafe(parcel.ogc_fid);
        if (!env) {
          console.warn("No buildable envelope; drawing raw parcel geometry");
          // optionally fall back to parcel.geometry from Regrid
          setEnvelope(parcel.geometry);
          setStatus("no-envelope");
          return;
        }

        console.log('Normalized envelope:', env);

        // Build the same transform path the Enterprise planner used
        const localPolygon = env.srid === 3857 
          ? CoordinateTransform.toFeet(env.geometry)
          : env.geometry;

        // Continue exactly as before:
        setEnvelope(localPolygon);
        // Safety: handle missing zoning gracefully (no SQL change needed)
        const hasZoning = Boolean(env.setbacks_applied || env.far_max || env.max_height);
        setRpcMetrics({ 
          areaSqft: env.area_sqft, 
          setbacks: env.setbacks_applied, 
          edges: env.edge_types,
          hasZoning: hasZoning
        });

        // Prefer RPC area; still compute local metrics for geometry ops
        const polyForGen = parcel.geometry;            // normalized Polygon in 4326
        const metrics = computeParcelMetrics(polyForGen); // your worker helper

        requestGenerate({ parcel: polyForGen, metrics, config: config }); // your worker call
        setStatus("ready");
      } catch (error) {
        console.error('Error fetching envelope:', error);
        setStatus("invalid");
      }
    };

    fetchEnvelope();
  }, [parcel, config, requestGenerate]);

  // Auto-generate on config change
  useEffect(() => {
    if (status !== 'ready') return;
    
    const timeoutId = setTimeout(() => {
      const newRequestId = requestId + 1;
      setRequestId(newRequestId);
      generatePlan(newRequestId);
    }, 200); // Debounce config changes

    return () => clearTimeout(timeoutId);
  }, [generatePlan, requestId, status]);

  const updateConfig = (updates: Partial<PlannerConfig>) => {
    handleConfigChange(updates);
  };

  // Gate UI + worker call for invalid parcels
  if (!isValidParcel) {
    return (
      <div className="flex h-full">
        <div className="w-80 bg-white border-r p-4 overflow-y-auto">
          <div className="text-center p-8">
            <div className="text-2xl mb-4">⚠️</div>
            <div className="text-lg font-medium mb-2 text-gray-700">Invalid Parcel Data</div>
            <div className="text-sm text-gray-500">
              The selected parcel couldn't be read (missing/unsupported geometry). Go back and reselect, or reload.
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <div className="text-4xl mb-4">📍</div>
            <div className="text-xl font-medium mb-2 text-gray-700">No Valid Geometry</div>
            <div className="text-sm text-gray-500">
              If you just clicked from the map, this usually means the geometry was a MultiPolygon. It's safe to try again.
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
            
        {/* Zoning Information */}
        {rpcMetrics && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700 mb-2">Zoning Information</div>
            <div className="space-y-1 text-xs text-gray-600">
              <div>Area: {rpcMetrics.areaSqft?.toLocaleString()} sq ft</div>
              {rpcMetrics.setbacks && (
                <div>
                  Setbacks: Front {rpcMetrics.setbacks.front || 20}', Side {rpcMetrics.setbacks.side || 5}', Rear {rpcMetrics.setbacks.rear || 20}'
                </div>
              )}
              {!rpcMetrics.hasZoning && (
                <div className="text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-xs">
                  Source: Default (no zoning record)
                </div>
              )}
            </div>
          </div>
        )}

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
              {parcel && parcel.ogc_fid ? (
                <>
                  <div className="text-2xl mb-4">🏗️</div>
                  <div className="text-lg font-medium mb-2 text-gray-700">Generating site plan…</div>
                  <div className="text-sm text-gray-500">Parcel {parcel.ogc_fid}</div>
                  {isGenerating && (
                    <div className="mt-4">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              )}
                </>
              ) : (
                <>
                  <div className="text-2xl mb-4">📍</div>
                  <div className="text-lg font-medium mb-2 text-gray-700">No Parcel Selected</div>
                  <div className="text-sm text-gray-500">Choose a parcel on the map</div>
                </>
              )}
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default SitePlanDesigner;