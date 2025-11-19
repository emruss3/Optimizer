import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Slider, Sparkles } from 'lucide-react';
import type { Element, PlannerConfig, SiteMetrics, PlannerOutput } from '../engine/types';
import { workerManager } from '../workers/workerManager';
import { toPolygon } from '../engine/geometry/normalize';
import { computeParcelMetrics } from '../engine/metrics/parcelMetrics';
import { getEnvelope } from '../api/fetchEnvelope';
import { generateAlternatives, validateSitePlan } from '../engine/planner';
import { SolveTable } from './site-planner/SolveTable';

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
  
  // Comprehensive debug logging
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] Component rendered/updated:', {
        hasParcel: !!parcel,
        parcelId: parcel?.ogc_fid,
        isValidParcel,
        validId,
        validGeom,
        normalizedParcelId,
        hasNormalizedGeometry: !!normalizedGeometry,
        geometryType: normalizedGeometry?.type,
        coordinatesLength: normalizedGeometry?.coordinates?.[0]?.length,
        hasChildren: !!children,
        childrenType: typeof children,
        isValidElement: React.isValidElement(children)
      });
      
      if (parcel) {
        console.log('🔍 [SitePlanDesigner] Parcel details:', {
          ogc_fid: parcel.ogc_fid,
          address: parcel.address,
          zoning: parcel.zoning,
          sqft: parcel.sqft,
          geometry: parcel.geometry,
          geometryType: parcel.geometry?.type
        });
      }
    }
  }, [parcel, isValidParcel, validId, validGeom, normalizedParcelId, normalizedGeometry, children]);
  
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
  const [envelope, setEnvelope] = useState<any>(null);
  const [rpcMetrics, setRpcMetrics] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading');
  
  // Alternatives state
  const [alternatives, setAlternatives] = useState<PlannerOutput[]>([]);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState<number | null>(null);
  const [solveScores, setSolveScores] = useState<number[]>([]);

  // New worker for reliable generation
  const worker = useMemo(() => new Worker(new URL("../engine/workers/sitegenie", import.meta.url), { type: "module" }), []);

  // Debounced generation with metrics
  // Returns the reqId immediately so generatePlan can track it
  const requestGenerate = useMemo(() => {
    let currentReqId: string | null = null;
    let timer: any = null;

    return (rawParcel: any, config: any): string | null => {
      if (import.meta.env.DEV) {
        console.log('🔍 [SitePlanDesigner] requestGenerate called:', {
          hasRawParcel: !!rawParcel,
          hasGeometry: !!rawParcel?.geometry,
          geometryType: rawParcel?.geometry?.type,
          hasConfig: !!config
        });
      }

      if (!rawParcel?.geometry) {
        if (import.meta.env.DEV) {
          console.warn('❌ [SitePlanDesigner] requestGenerate: No geometry in parcel');
        }
        return null;
      }

      const poly = toPolygon(rawParcel.geometry);
      if (import.meta.env.DEV) {
        console.log('🔍 [SitePlanDesigner] Normalized polygon:', {
          type: poly.type,
          coordinatesLength: poly.coordinates?.[0]?.length,
          firstCoord: poly.coordinates?.[0]?.[0]
        });
      }

      const metrics = computeParcelMetrics(poly);
      if (import.meta.env.DEV) {
        console.log('🔍 [SitePlanDesigner] Computed metrics for worker:', {
          areaSqft: metrics.areaSqft,
          perimeterFt: metrics.perimeterFt,
          centroid: metrics.centroid
        });
      }

      if (timer) {
        if (import.meta.env.DEV) {
          console.log('🧹 [SitePlanDesigner] Clearing previous debounce timer');
        }
        clearTimeout(timer);
      }
      
      // Generate UUID immediately so we can return it
      currentReqId = crypto.randomUUID();
      
      timer = setTimeout(() => {
        const message = { 
          type: "generate", 
          reqId: currentReqId, 
          parcel: poly, 
          config, 
          metrics 
        };
        
        if (import.meta.env.DEV) {
          console.log('📤 [SitePlanDesigner] Posting message to worker:', {
            reqId: currentReqId,
            type: message.type,
            hasParcel: !!message.parcel,
            parcelType: message.parcel?.type,
            hasConfig: !!message.config,
            hasMetrics: !!message.metrics,
            metricsArea: message.metrics?.areaSqft
          });
        }
        
        worker.postMessage(message);
        if (import.meta.env.DEV) {
          console.log('✅ [SitePlanDesigner] Message posted to worker');
        }
      }, 150); // debounce UI sliders
      
      if (import.meta.env.DEV) {
        console.log('⏰ [SitePlanDesigner] Debounce timer set (150ms), reqId:', currentReqId);
      }
      
      return currentReqId; // Return the reqId that will be used
    };
  }, [worker]);

  // Generate site plan when config changes (with debouncing)
  const generatePlan = useCallback(async (currentRequestId: number) => {
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] generatePlan called:', {
        currentRequestId,
        isValidParcel,
        validId,
        hasConfig: !!config
      });
    }

    if (!isValidParcel) {
      if (import.meta.env.DEV) {
        console.warn('❌ [SitePlanDesigner] Cannot generate site plan: Invalid parcel data');
      }
      return;
    }
    
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] Planner input:', { 
        parcelId: validId, 
        ringLen: normalizedGeometry?.coordinates[0]?.length, 
        type: normalizedGeometry?.type,
        config: {
          parcelId: config.parcelId,
          hasBuildableArea: !!config.buildableArea,
          zoning: config.zoning,
          designParams: config.designParameters
        }
      });
    }
    
    setIsGenerating(true);
    if (import.meta.env.DEV) {
      console.log('⏳ [SitePlanDesigner] Generation started, isGenerating = true');
    }
    
    try {
      // Use new worker with metrics - get the reqId that will be used
      if (import.meta.env.DEV) {
        console.log('📤 [SitePlanDesigner] Calling requestGenerate...');
      }
      const expectedReqId = requestGenerate(parcel, config);
      
      if (!expectedReqId) {
        if (import.meta.env.DEV) {
          console.warn('❌ [SitePlanDesigner] requestGenerate returned no reqId');
        }
        setIsGenerating(false);
        return;
      }
      
      // Set up worker message handler
      // Wait for the debounced message to be posted, then track the actual reqId
      const handleMessage = (event: MessageEvent) => {
        const { type, reqId, elements, metrics, error } = event.data;
        
        if (import.meta.env.DEV) {
          console.log('📥 [SitePlanDesigner] Worker message received:', {
            type,
            reqId,
            expectedReqId,
            matches: reqId === expectedReqId,
            hasElements: !!elements,
            elementsCount: elements?.length,
            hasMetrics: !!metrics,
            hasError: !!error
          });
        }

        if (type === 'generated' && reqId === expectedReqId) {
          if (error) {
            console.error('❌ [SitePlanDesigner] Worker error:', error);
            setIsGenerating(false);
          } else {
            if (import.meta.env.DEV) {
              console.log('✅ [SitePlanDesigner] Worker generation complete:', {
                elementsCount: elements?.length,
                hasMetrics: !!metrics,
                metrics: metrics ? {
                  achievedFAR: metrics.achievedFAR,
                  siteCoveragePct: metrics.siteCoveragePct,
                  parkingRatio: metrics.parkingRatio,
                  totalBuiltSF: metrics.totalBuiltSF
                } : null
              });
            }

            setCurrentElements(elements || []);
            setCurrentMetrics(metrics || null);
            
            if (onPlanGenerated) {
              if (import.meta.env.DEV) {
                console.log('📤 [SitePlanDesigner] Calling onPlanGenerated callback');
              }
              onPlanGenerated(elements || [], metrics || null);
            }
            setIsGenerating(false);
            if (import.meta.env.DEV) {
              console.log('✅ [SitePlanDesigner] Generation complete, isGenerating = false');
            }
          }
          worker.removeEventListener('message', handleMessage);
          clearTimeout(timeout);
        } else if (import.meta.env.DEV) {
          console.log('⏭️ [SitePlanDesigner] Ignoring message (reqId mismatch or wrong type)');
        }
      };
      
      if (import.meta.env.DEV) {
        console.log('👂 [SitePlanDesigner] Adding worker message listener');
      }
      worker.addEventListener('message', handleMessage);
      
      // Set timeout to detect if worker hangs
      const timeout = setTimeout(() => {
        console.error('❌ [SitePlanDesigner] Worker timeout after 30s, removing listener');
        worker.removeEventListener('message', handleMessage);
        setIsGenerating(false);
      }, 30000);
      
    } catch (error) {
      console.error('❌ [SitePlanDesigner] Error generating site plan:', error);
      setIsGenerating(false);
    }
  }, [parcel, config, onPlanGenerated, requestGenerate, worker, isValidParcel, validId, normalizedGeometry]);

  // Debounced config change handler
  const handleConfigChange = useCallback((updates: Partial<PlannerConfig>) => {
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] Config change requested:', updates);
    }
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      if (import.meta.env.DEV) {
        console.log('🔍 [SitePlanDesigner] Config updated:', {
          parcelId: newConfig.parcelId,
          hasBuildableArea: !!newConfig.buildableArea,
          zoning: newConfig.zoning,
          designParams: newConfig.designParameters
        });
      }
      return newConfig;
    });
    
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      if (import.meta.env.DEV) {
        console.log('🧹 [SitePlanDesigner] Cleared previous debounce timer');
      }
    }
    
    // Set new timer
    const newTimer = setTimeout(() => {
      const newRequestId = requestId + 1;
      if (import.meta.env.DEV) {
        console.log('⏰ [SitePlanDesigner] Debounce timer fired, generating plan with reqId:', newRequestId);
      }
      setRequestId(newRequestId);
      generatePlan(newRequestId);
    }, 200); // 200ms debounce
    
    setDebounceTimer(newTimer);
    if (import.meta.env.DEV) {
      console.log('⏰ [SitePlanDesigner] New debounce timer set (200ms)');
    }
  }, [debounceTimer, requestId, generatePlan]);

  // Fetch buildable envelope when parcel changes (with React 18 StrictMode guard)
  const ogc_fidRef = React.useRef<number | null>(null);
  const didRunRef = React.useRef(false);

  useEffect(() => {
    if (!parcel) {
      if (import.meta.env.DEV) {
        console.log('🔍 [SitePlanDesigner] No parcel, skipping envelope fetch');
      }
      return;
    }

    const parcelId = Number(parcel.ogc_fid);
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] Envelope fetch effect triggered:', {
        parcelId,
        previousId: ogc_fidRef.current,
        didRun: didRunRef.current
      });
    }

    // Prevent duplicate calls in React 18 dev (StrictMode)
    if (import.meta.env.DEV) {
      if (didRunRef.current && ogc_fidRef.current === parcelId) {
        console.log('⏭️ [SitePlanDesigner] Skipping duplicate envelope fetch (React StrictMode)');
        return;
      }
      didRunRef.current = true;
    }

    // Dedupe by id
    if (ogc_fidRef.current === parcelId) {
      if (import.meta.env.DEV) {
        console.log('⏭️ [SitePlanDesigner] Already fetched envelope for this parcel');
      }
      return;
    }
    ogc_fidRef.current = parcelId;

    let cancelled = false;
    setStatus("loading");

    if (import.meta.env.DEV) {
      console.log('🏗️ [SitePlanDesigner] Fetching get_parcel_buildable_envelope(', parcelId, ')');
    }
    const startTime = Date.now();
    
    getEnvelope(parcelId)
      .then(env => {
        const duration = Date.now() - startTime;
        if (import.meta.env.DEV) {
          console.log(`✅ [SitePlanDesigner] Envelope RPC completed in ${duration}ms:`, {
            hasEnv: !!env,
            hasBuildableGeom: !!env?.buildable_geom,
            area: env?.area_sqft,
            setbacks: env?.setbacks_applied,
            edges: env?.edge_types,
            farMax: env?.far_max,
            cancelled
          });
        }

        // Check cancellation AFTER the promise resolves, but before state updates
        if (cancelled) {
          if (import.meta.env.DEV) {
            console.log('⏭️ [SitePlanDesigner] Envelope fetch cancelled (component unmounted)');
          }
          return;
        }

        if (!env?.buildable_geom) {
          console.error('❌ [SitePlanDesigner] No buildable geometry in envelope response');
          setStatus("invalid");
          return;
        }

        // Prefer RPC area; still compute local metrics for geometry ops
        const polyForGen = parcel.geometry;            // normalized Polygon in 4326
        const metrics = computeParcelMetrics(polyForGen); // your worker helper

        if (import.meta.env.DEV) {
          console.log('🔍 [SitePlanDesigner] Computed metrics:', {
            areaSqft: metrics.areaSqft,
            perimeterFt: metrics.perimeterFt,
            centroid: metrics.centroid
          });
        }

        setEnvelope(env.buildable_geom);               // keep as 3857 for generation, or convert if your renderer needs 4326
        setRpcMetrics({ 
          areaSqft: env.area_sqft, 
          setbacks: env.setbacks_applied, 
          edges: env.edge_types,
          hasZoning: env.far_max !== null && env.far_max > 0
        });

        if (import.meta.env.DEV) {
          console.log('🚀 [SitePlanDesigner] Calling requestGenerate with:', {
            hasParcel: !!polyForGen,
            hasMetrics: !!metrics,
            metricsArea: metrics.areaSqft,
            rpcArea: env.area_sqft,
            hasConfig: !!config
          });
        }

        // Call requestGenerate with parcel object (not wrapped)
        requestGenerate(parcel, config); // your worker call
        setStatus("ready");
        if (import.meta.env.DEV) {
          console.log('✅ [SitePlanDesigner] Status set to ready');
        }
      })
      .catch((error) => {
        console.error('❌ [SitePlanDesigner] Envelope fetch error:', error);
        if (!cancelled) {
          setStatus("invalid");
        }
      });

    return () => { 
      cancelled = true;
      if (import.meta.env.DEV) {
        console.log('🧹 [SitePlanDesigner] Cleaning up envelope fetch effect');
      }
    };
  }, [parcel?.ogc_fid]); // Only depend on the id

  // Auto-generate on config change
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] Auto-generate effect triggered:', {
        status,
        requestId,
        isGenerating
      });
    }

    if (status !== 'ready') {
      if (import.meta.env.DEV) {
        console.log('⏭️ [SitePlanDesigner] Status not ready, skipping auto-generate');
      }
      return;
    }
    
    const timeoutId = setTimeout(() => {
      const newRequestId = requestId + 1;
      if (import.meta.env.DEV) {
        console.log('⏰ [SitePlanDesigner] Auto-generate timeout fired, generating plan with reqId:', newRequestId);
      }
      setRequestId(newRequestId);
      generatePlan(newRequestId);
    }, 200); // Debounce config changes

    return () => {
      if (import.meta.env.DEV) {
        console.log('🧹 [SitePlanDesigner] Cleaning up auto-generate timeout');
      }
      clearTimeout(timeoutId);
    };
  }, [generatePlan, requestId, status, isGenerating]);

  const updateConfig = (updates: Partial<PlannerConfig>) => {
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] Config change requested:', { designParameters: updates.designParameters });
    }
    handleConfigChange(updates);
    if (import.meta.env.DEV) {
      console.log('🔍 [SitePlanDesigner] Config updated:', {
        parcelId: config.parcelId,
        hasBuildableArea: !!config.buildableArea,
        zoning: config.zoning,
        designParams: config.designParameters
      });
    }
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

        {/* Generate Alternatives Button */}
        <div className="mb-4">
          <button
            onClick={() => {
              if (!parcel?.geometry || !config || !normalizedGeometry) return;
              
              const poly = toPolygon(normalizedGeometry);
              
              // Build simple variations array (6-10 configs)
              const variations: Partial<PlannerConfig>[] = [];
              const baseFAR = config.designParameters.targetFAR;
              const baseCoverage = config.designParameters.targetCoveragePct || 50;
              const baseParking = config.designParameters.parking.targetRatio;
              
              // Generate variations: FAR ±20%, Coverage ±10%, Parking ±0.25
              const farVariations = [
                baseFAR * 0.8,
                baseFAR * 0.9,
                baseFAR,
                baseFAR * 1.1,
                baseFAR * 1.2
              ];
              
              const coverageVariations = [
                baseCoverage * 0.9,
                baseCoverage,
                baseCoverage * 1.1
              ];
              
              const parkingVariations = [
                baseParking - 0.25,
                baseParking,
                baseParking + 0.25
              ];
              
              // Generate combinations (up to 9 solves)
              for (const far of farVariations.slice(0, 3)) {
                for (const coverage of coverageVariations) {
                  for (const parking of parkingVariations.slice(0, 1)) {
                    if (variations.length >= 9) break;
                    variations.push({
                      designParameters: {
                        ...config.designParameters,
                        targetFAR: far,
                        targetCoveragePct: coverage,
                        parking: {
                          ...config.designParameters.parking,
                          targetRatio: parking
                        }
                      }
                    });
                  }
                  if (variations.length >= 9) break;
                }
                if (variations.length >= 9) break;
              }
              
              // Generate alternatives synchronously
              const altPlans = generateAlternatives(poly, config, variations);
              
              // Compute scores
              const scores = altPlans.map(plan => 
                validateSitePlan(plan, config).score
              );
              
              setSolveScores(scores);
              setAlternatives(altPlans);
              setSelectedSolveIndex(0);
            }}
            disabled={!parcel?.geometry || !config || !normalizedGeometry}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate Alternatives</span>
          </button>
        </div>

        {/* Solves Table */}
        {alternatives.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Solves</h3>
            <SolveTable
              solves={alternatives}
              baseConfig={config}
              selectedIndex={selectedSolveIndex}
              onSelect={(index, solve) => {
                setSelectedSolveIndex(index);
                // Update the main planner view to this solve
                setCurrentElements(solve.elements);
                setCurrentMetrics(solve.metrics);
                if (onPlanGenerated) {
                  onPlanGenerated(solve.elements, solve.metrics);
                }
              }}
            />
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