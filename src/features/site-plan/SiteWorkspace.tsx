import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EnterpriseSitePlanner from '../../components/EnterpriseSitePlannerShell';
import { SitePlannerErrorBoundary } from '../../components/ErrorBoundary';
import type { InvestmentAnalysis, SelectedParcel } from '../../types/parcel';
import { createFallbackParcel, isValidParcel } from '../../types/parcel';
import { useBuildableEnvelope } from './api/useBuildableEnvelope';
import { useSitePlanState } from './state/useSitePlanState';
import { usePlanGenerator } from './worker/usePlanGenerator';
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
  const { status, rpcMetrics } = useBuildableEnvelope(parcel);
  const { generatePlan, isGenerating } = usePlanGenerator();
  const [investmentAnalysis, setInvestmentAnalysis] = useState<InvestmentAnalysis | null>(null);
  const generateTimerRef = useRef<number | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!normalizedGeometry) return;
    const result = await generatePlan(normalizedGeometry, config);
    setPlanOutput(result.elements || [], result.metrics || null);
  }, [config, generatePlan, normalizedGeometry, setPlanOutput]);

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
                />
              </SitePlannerErrorBoundary>
            </div>
          </div>

          <ResultsPanel metrics={metrics} investmentAnalysis={investmentAnalysis} isGenerating={isGenerating} />
        </div>
      </div>
    </div>
  );
};

export default SiteWorkspace;
