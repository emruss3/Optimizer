import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EnterpriseSitePlanner from '../../components/EnterpriseSitePlannerShell';
import { SitePlannerErrorBoundary } from '../../components/ErrorBoundary';
import type { InvestmentAnalysis, SelectedParcel } from '../../types/parcel';
import { createFallbackParcel, isValidParcel } from '../../types/parcel';
import { useBuildableEnvelope } from './api/useBuildableEnvelope';
import { useSitePlanState } from './state/useSitePlanState';
import { workerManager } from '../../workers/workerManager';
import type { Element, FeasibilityViolation } from '../../engine/types';
import { normalizeToPolygon, calculatePolygonCentroid } from '../../engine/geometry';
import { feature4326To3857 } from '../../utils/reproject';
import { feetToMeters } from '../../engine/units';
import type { Polygon, MultiPolygon } from 'geojson';
import ParametersPanel from './ui/ParametersPanel';
import ResultsPanel from './ui/ResultsPanel';

type SiteWorkspaceProps = {
  parcel: SelectedParcel;
};

const SiteWorkspace: React.FC<SiteWorkspaceProps> = ({ parcel }) => {
  const {
    config,
    updateConfig,
    elements,
    metrics,
    setPlanOutput,
    alternatives,
    selectedSolveIndex,
    selectedSolve,
    selectSolve,
    generateAlternativePlans,
    normalizedGeometry,
    isValidParcel: hasValidGeometry
  } = useSitePlanState(parcel);
  const { status, envelope, rpcMetrics, error: envelopeError } = useBuildableEnvelope(parcel);
  const [isGenerating, setIsGenerating] = useState(false);
  const [violations, setViolations] = useState<FeasibilityViolation[]>([]);
  const [investmentAnalysis, setInvestmentAnalysis] = useState<InvestmentAnalysis | null>(null);
  const [solverReady, setSolverReady] = useState(false);
  const [usingFallbackEnvelope, setUsingFallbackEnvelope] = useState(false);
  const generateTimerRef = useRef<number | null>(null);

  // Create fallback envelope from parcel geometry if RPC fails
  const fallbackEnvelopeMeters = useMemo(() => {
    if (!parcel?.geometry || status === 'ready' || status === 'loading') return null;
    
    try {
      // Reproject parcel geometry to 3857
      const geom = parcel.geometry as Polygon | MultiPolygon;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
      const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
      const normalized = normalizeToPolygon(reprojected);
      
      // Get bbox and apply default setbacks (20ft front, 5ft side, 20ft rear)
      const coords3857 = normalized.coordinates[0];
      const bounds = coords3857.reduce(
        (acc, [x, y]) => ({
          minX: Math.min(acc.minX, x),
          minY: Math.min(acc.minY, y),
          maxX: Math.max(acc.maxX, x),
          maxY: Math.max(acc.maxY, y)
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      );
      
      // Convert setbacks to meters (20ft = 6.096m, 5ft = 1.524m)
      const frontSetbackM = feetToMeters(20);
      const sideSetbackM = feetToMeters(5);
      const rearSetbackM = feetToMeters(20);
      
      // Inset bbox by setbacks (assuming front is minY, rear is maxY, sides are minX/maxX)
      const insetBounds = {
        minX: bounds.minX + sideSetbackM,
        minY: bounds.minY + frontSetbackM,
        maxX: bounds.maxX - sideSetbackM,
        maxY: bounds.maxY - rearSetbackM
      };
      
      // Ensure valid bounds
      if (insetBounds.minX >= insetBounds.maxX || insetBounds.minY >= insetBounds.maxY) {
        return null;
      }
      
      // Create rectangle polygon from inset bounds
      const fallbackPoly: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [insetBounds.minX, insetBounds.minY],
          [insetBounds.maxX, insetBounds.minY],
          [insetBounds.maxX, insetBounds.maxY],
          [insetBounds.minX, insetBounds.maxY],
          [insetBounds.minX, insetBounds.minY]
        ]]
      };
      
      return fallbackPoly;
    } catch (err) {
      console.error('Failed to create fallback envelope:', err);
      return null;
    }
  }, [parcel?.geometry, status]);

  const envelopeMeters = useMemo(() => {
    // Use RPC envelope if available
    if (envelope && status === 'ready') {
      if (envelope.type !== 'Polygon' && envelope.type !== 'MultiPolygon') return null;
      const geom = envelope as Polygon | MultiPolygon;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
      const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
      return normalizeToPolygon(reprojected);
    }
    
    // Use fallback if RPC failed
    if (fallbackEnvelopeMeters) {
      return fallbackEnvelopeMeters;
    }
    
    return null;
  }, [envelope, status, fallbackEnvelopeMeters]);

  // Track whether we're using fallback envelope
  useEffect(() => {
    setUsingFallbackEnvelope(envelopeMeters === fallbackEnvelopeMeters && fallbackEnvelopeMeters !== null);
  }, [envelopeMeters, fallbackEnvelopeMeters]);

  // NOTE: All canvas rendering uses EPSG:3857 meters. No feet conversion for geometry.
  // Feet conversion is only used for display labels and measurements.

  const handleGenerate = useCallback(async () => {
    if (!envelopeMeters) return;
    setIsGenerating(true);
    try {
      const result = await workerManager.initSite(envelopeMeters, config.zoning, undefined, {
        stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
        stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
        aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
        anglesDeg: [0, 60, 90]
      });
      setPlanOutput(result.elements || [], result.metrics || null);
      setViolations(result.violations || []);
      setSolverReady(true);
    } catch (error) {
      console.error('Failed to initialize solver:', error);
      setSolverReady(false);
      setViolations([{
        code: 'worker',
        message: `Failed to initialize solver: ${String(error)}`,
        severity: 'error'
      }]);
    } finally {
      setIsGenerating(false);
    }
  }, [config, envelopeMeters, setPlanOutput]);

  const handleBuildingUpdate = useCallback(
    (update: {
      id: string;
      anchor: { x: number; y: number };
      rotationRad: number;
      widthFt: number;
      depthFt: number;
      floors?: number;
    }, options?: { final?: boolean }) => {
      if (!envelopeMeters) return;
      const runUpdate = async () => {
        // Shell passes coordinates in EPSG:3857 meters (canvas world space)
        // and dimensions labeled as "Ft" but actually in meters from the canvas
        const result = await workerManager.updateBuilding(update.id, {
          anchorX: update.anchor.x,
          anchorY: update.anchor.y,
          rotationRad: update.rotationRad,
          widthM: update.widthFt,
          depthM: update.depthFt,
          floors: update.floors
        });
        setPlanOutput(result.elements || [], result.metrics || null);
        setViolations(result.violations || []);
      };

      // No debounce here - Shell already debounces
      runUpdate().catch(err => {
        console.error('Building update failed:', err);
        setViolations([{
          code: 'worker',
          message: String(err),
          severity: 'error'
        }]);
      });
    },
    [envelopeMeters, setPlanOutput]
  );

  const handleAddBuilding = useCallback(async () => {
    if (!envelopeMeters) {
      setViolations([{
        code: 'envelope',
        message: 'Buildable envelope not available. Please wait for envelope to load.',
        severity: 'error'
      }]);
      return;
    }

    // If solver not ready, initialize it first
    if (!solverReady) {
      try {
        const parkingSpec = {
          stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
          stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
          aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
          anglesDeg: [0, 60, 90] as number[]
        };
        const init = await workerManager.initSite(envelopeMeters, config.zoning, undefined, parkingSpec);
        setPlanOutput(init.elements || [], init.metrics || null);
        setViolations(init.violations || []);
        setSolverReady(true);
      } catch (error) {
        console.error('Failed to initialize solver:', error);
        setViolations([{
          code: 'worker',
          message: `Failed to initialize solver: ${String(error)}`,
          severity: 'error'
        }]);
        setSolverReady(false);
        return;
      }
    }

    // Calculate envelope centroid in meters (EPSG:3857)
    const coords = envelopeMeters.coordinates[0];
    const centroid = calculatePolygonCentroid(coords);
    const anchorX = centroid[0];
    const anchorY = centroid[1];

    // Find next available building ID
    const existingIds = elements.filter(e => e.type === 'building').map(e => e.id);
    let buildingNum = 1;
    while (existingIds.includes(`building-${buildingNum}`)) {
      buildingNum++;
    }
    const newId = `building-${buildingNum}`;

    // Default dimensions in meters (~100ft x 50ft)
    const defaultWidthM = feetToMeters(100);
    const defaultDepthM = feetToMeters(50);
    const defaultFloors = 3;

    // Create new building via updateBuilding (worker will create if id not found)
    // Note: widthFt/depthFt labels are legacy — values are in meters for the worker
    handleBuildingUpdate({
      id: newId,
      anchor: { x: anchorX, y: anchorY },
      rotationRad: 0,
      widthFt: defaultWidthM,
      depthFt: defaultDepthM,
      floors: defaultFloors
    }, { final: true });
  }, [envelopeMeters, elements, handleBuildingUpdate, solverReady, config, setPlanOutput]);

  const derivedInvestmentAnalysis = useMemo<InvestmentAnalysis | null>(() => {
    if (!metrics) return null;
    return {
      totalInvestment: metrics.totalBuiltSF * 150,
      projectedRevenue: metrics.totalBuiltSF * 2.5 * 12,
      operatingExpenses: metrics.totalBuiltSF * 1.0 * 12,
      netOperatingIncome: metrics.totalBuiltSF * 1.5 * 12,
      capRate: 0.06,
      irr: 0.12,
      paybackPeriod: 8.3,
      riskAssessment: 'medium'
    };
  }, [metrics]);

  useEffect(() => {
    setInvestmentAnalysis(derivedInvestmentAnalysis);
  }, [derivedInvestmentAnalysis]);

  useEffect(() => {
    if (!hasValidGeometry || status !== 'ready') return;
    if (generateTimerRef.current) {
      window.clearTimeout(generateTimerRef.current);
    }
    generateTimerRef.current = window.setTimeout(() => {
      handleGenerate().catch(() => undefined);
    }, 200);
    return () => {
      if (generateTimerRef.current) {
        window.clearTimeout(generateTimerRef.current);
      }
    };
  }, [config, handleGenerate, hasValidGeometry, status]);

  const plannerParcel = isValidParcel(parcel)
    ? parcel
    : createFallbackParcel(parcel.ogc_fid || parcel.id || 'unknown', parcel.sqft || 4356);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Site Plan</h2>
        <div className="flex flex-col xl:flex-row gap-6 h-[800px]">
          <ParametersPanel
            parcel={parcel}
            config={config}
            onConfigChange={updateConfig}
            rpcMetrics={rpcMetrics}
            status={status}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onGenerateAlternatives={generateAlternativePlans}
            alternatives={alternatives}
            selectedSolveIndex={selectedSolveIndex}
            onSelectSolve={selectSolve}
          />

          <div className="flex-1 min-w-0">
            <div className="h-full">
              <SitePlannerErrorBoundary>
                <EnterpriseSitePlanner
                  parcel={plannerParcel}
                  planElements={elements}
                  metrics={metrics || undefined}
                  selectedSolve={selectedSolve || undefined}
                  parkingViz={{
                    angleDeg: metrics?.parkingAngleDeg ?? 0,
                    stallWidthFt: config.designParameters.parking.stallWidthFt,
                    stallDepthFt: config.designParameters.parking.stallDepthFt
                  }}
                  buildableEnvelope={envelopeMeters || undefined}
                  onBuildingUpdate={handleBuildingUpdate}
                  onAddBuilding={handleAddBuilding}
                  envelopeStatus={status}
                  envelopeError={envelopeError}
                  usingFallbackEnvelope={usingFallbackEnvelope}
                  onRetryEnvelope={() => {
                    // Force re-fetch by clearing the ref and triggering useEffect
                    // The hook will re-fetch when parcel.ogc_fid changes or ref is cleared
                    window.location.reload();
                  }}
                />
              </SitePlannerErrorBoundary>
            </div>
          </div>

          <ResultsPanel
            metrics={metrics}
            investmentAnalysis={investmentAnalysis}
            isGenerating={isGenerating}
            violations={violations}
          />
        </div>
      </div>
    </div>
  );
};

export default SiteWorkspace;
