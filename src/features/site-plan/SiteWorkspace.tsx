import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EnterpriseSitePlanner from '../../components/EnterpriseSitePlannerShell';
import { SitePlannerErrorBoundary } from '../../components/ErrorBoundary';
import type { InvestmentAnalysis, SelectedParcel } from '../../types/parcel';
import { createFallbackParcel, isValidParcel } from '../../types/parcel';
import { useBuildableEnvelope } from './api/useBuildableEnvelope';
import { useSitePlanState } from './state/useSitePlanState';
import { workerManager } from '../../workers/workerManager';
import type { Element, FeasibilityViolation } from '../../engine/types';
import { normalizeToPolygon } from '../../engine/geometry';
import { feature4326To3857 } from '../../utils/reproject';
import { FEET_PER_METER } from '../../utils/coordinateTransform';
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
  const generateTimerRef = useRef<number | null>(null);
  const updateTimerRef = useRef<number | null>(null);

  const envelopeMeters = useMemo(() => {
    if (!envelope) return null;
    if (envelope.type !== 'Polygon' && envelope.type !== 'MultiPolygon') return null;
    const geom = envelope as Polygon | MultiPolygon;
    const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
    const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
    const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
    return normalizeToPolygon(reprojected);
  }, [envelope]);

  const convertElementsToFeet = useCallback((elements: Element[]) => {
    return elements.map(element => ({
      ...element,
      geometry: {
        ...element.geometry,
        coordinates: [
          element.geometry.coordinates[0].map(([x, y]) => [x * FEET_PER_METER, y * FEET_PER_METER])
        ]
      }
    }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!envelopeMeters) return;
    setIsGenerating(true);
    try {
      const result = await workerManager.initSite(envelopeMeters, config.zoning, undefined, {
        stallW: config.designParameters.parking.stallWidthFt / FEET_PER_METER,
        stallD: config.designParameters.parking.stallDepthFt / FEET_PER_METER,
        aisleW: config.designParameters.parking.aisleWidthFt / FEET_PER_METER,
        anglesDeg: [0, 60, 90]
      });
      setPlanOutput(convertElementsToFeet(result.elements || []), result.metrics || null);
      setViolations(result.violations || []);
    } finally {
      setIsGenerating(false);
    }
  }, [config, convertElementsToFeet, envelopeMeters, setPlanOutput]);

  const handleBuildingUpdate = useCallback(
    (update: {
      id: string;
      anchor: { x: number; y: number };
      rotationRad: number;
      widthM: number;
      depthM: number;
      floors?: number;
    }, options?: { final?: boolean }) => {
      if (!envelopeMeters) return;
      const runUpdate = async () => {
        const result = await workerManager.updateBuilding(update.id, {
          anchorX: update.anchor.x / FEET_PER_METER,
          anchorY: update.anchor.y / FEET_PER_METER,
          rotationRad: update.rotationRad,
          widthM: update.widthM / FEET_PER_METER,
          depthM: update.depthM / FEET_PER_METER,
          floors: update.floors
        });
        setPlanOutput(convertElementsToFeet(result.elements || []), result.metrics || null);
        setViolations(result.violations || []);
      };

      if (options?.final) {
        runUpdate().catch(() => undefined);
        return;
      }

      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
      }
      updateTimerRef.current = window.setTimeout(() => {
        runUpdate().catch(() => undefined);
      }, 80);
    },
    [convertElementsToFeet, envelopeMeters, setPlanOutput]
  );

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
                  marketData={{
                    avgPricePerSqFt: 300,
                    avgRentPerSqFt: 2.5,
                    capRate: 0.06,
                    constructionCostPerSqFt: 200
                  }}
                  onBuildingUpdate={handleBuildingUpdate}
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
