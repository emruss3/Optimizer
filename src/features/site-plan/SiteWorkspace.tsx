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
import { feetToMeters, metersToFeet } from '../../engine/units';
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
  const { status, envelope, rpcMetrics } = useBuildableEnvelope(parcel);
  const [isGenerating, setIsGenerating] = useState(false);
  const [violations, setViolations] = useState<FeasibilityViolation[]>([]);
  const [investmentAnalysis, setInvestmentAnalysis] = useState<InvestmentAnalysis | null>(null);
  const [solverReady, setSolverReady] = useState(false);
  const generateTimerRef = useRef<number | null>(null);

  const envelopeMeters = useMemo(() => {
    if (!envelope) return null;
    if (envelope.type !== 'Polygon' && envelope.type !== 'MultiPolygon') return null;
    const geom = envelope as Polygon | MultiPolygon;
    const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
    const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
    const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
    return normalizeToPolygon(reprojected);
  }, [envelope]);

  const envelopeFeet = useMemo(() => {
    if (!envelopeMeters) return null;
    return {
      ...envelopeMeters,
      coordinates: [
        envelopeMeters.coordinates[0].map(([x, y]) => [metersToFeet(x), metersToFeet(y)])
      ]
    };
  }, [envelopeMeters]);

  const convertElementsToFeet = useCallback((elements: Element[]) => {
    return elements.map(element => ({
      ...element,
      geometry: {
        ...element.geometry,
        coordinates: [
          element.geometry.coordinates[0].map(([x, y]) => [metersToFeet(x), metersToFeet(y)])
        ]
      }
    }));
  }, []);

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
      setPlanOutput(convertElementsToFeet(result.elements || []), result.metrics || null);
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
  }, [config, convertElementsToFeet, envelopeMeters, setPlanOutput]);

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
        const result = await workerManager.updateBuilding(update.id, {
          anchorX: feetToMeters(update.anchor.x),
          anchorY: feetToMeters(update.anchor.y),
          rotationRad: update.rotationRad,
          widthM: feetToMeters(update.widthFt),
          depthM: feetToMeters(update.depthFt),
          floors: update.floors
        });
        setPlanOutput(convertElementsToFeet(result.elements || []), result.metrics || null);
        setViolations(result.violations || []);
      };

      // No debounce here - Shell already debounces
      // Don't swallow errors - surface them to user
      runUpdate().catch(err => {
        console.error('Building update failed:', err);
        setViolations([{
          code: 'worker',
          message: String(err),
          severity: 'error'
        }]);
      });
    },
    [convertElementsToFeet, envelopeMeters, setPlanOutput]
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

    if (!envelopeFeet) {
      setViolations([{
        code: 'envelope',
        message: 'Failed to convert envelope to feet. Please try again.',
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
        setPlanOutput(convertElementsToFeet(init.elements || []), init.metrics || null);
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
    
    // Calculate envelope centroid (not just bounds center)
    const coords = envelopeFeet.coordinates[0];
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
    
    // Default dimensions from config or sensible defaults
    // TODO: Add building defaults to config.designParameters
    const defaultWidthFt = 100;
    const defaultDepthFt = 50;
    const defaultFloors = 3;
    
    // Create new building via updateBuilding (worker will create if id not found)
    handleBuildingUpdate({
      id: newId,
      anchor: { x: anchorX, y: anchorY },
      rotationRad: 0,
      widthFt: defaultWidthFt,
      depthFt: defaultDepthFt,
      floors: defaultFloors
    }, { final: true });
  }, [envelopeFeet, envelopeMeters, elements, handleBuildingUpdate, solverReady, config, convertElementsToFeet, setPlanOutput]);

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
                  buildableEnvelope={envelopeFeet || undefined}
                  onBuildingUpdate={handleBuildingUpdate}
                  onAddBuilding={status === 'ready' && envelopeMeters ? handleAddBuilding : undefined}
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
