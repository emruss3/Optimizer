import React from 'react';
import type { FeasibilityViolation, SiteMetrics } from '../../../engine/types';
import type { InvestmentAnalysis } from '../../../types/parcel';

type ResultsPanelProps = {
  metrics: SiteMetrics | null;
  investmentAnalysis: InvestmentAnalysis | null;
  isGenerating: boolean;
  violations: FeasibilityViolation[];
};

const ResultsPanel: React.FC<ResultsPanelProps> = ({ metrics, investmentAnalysis, isGenerating, violations }) => {
  return (
    <div className="w-full xl:w-80 bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Results</h3>

      {isGenerating && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-600">Generating site plan…</span>
          </div>
        </div>
      )}

      {!metrics && !investmentAnalysis && !isGenerating && (
        <div className="text-sm text-gray-600">Generate a plan to see results.</div>
      )}

      {metrics && (
        <div className="space-y-3 text-sm text-gray-700 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-600">FAR</span>
            <span className="font-medium">{metrics.achievedFAR.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Coverage</span>
            <span className="font-medium">{metrics.siteCoveragePct.toFixed(1)}%</span>
          </div>
          {metrics.stallsProvided !== undefined && metrics.stallsRequired !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">Stalls</span>
              <span className="font-medium">
                {metrics.stallsProvided} / {metrics.stallsRequired}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Parking Ratio</span>
            <span className="font-medium">{metrics.parkingRatio.toFixed(2)}</span>
          </div>
          {metrics.parkingAngleDeg !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-600">Parking Angle</span>
              <span className="font-medium">{metrics.parkingAngleDeg}°</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Built SF</span>
            <span className="font-medium">{metrics.totalBuiltSF.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Open Space</span>
            <span className="font-medium">{metrics.openSpacePct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {investmentAnalysis && (
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Investment</span>
            <span className="font-medium">${investmentAnalysis.totalInvestment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Projected Revenue</span>
            <span className="font-medium">${investmentAnalysis.projectedRevenue.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">NOI</span>
            <span className="font-medium">${investmentAnalysis.netOperatingIncome.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Cap Rate</span>
            <span className="font-medium">{(investmentAnalysis.capRate * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">IRR</span>
            <span className="font-medium">{(investmentAnalysis.irr * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}

      {violations.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Violations</h4>
          <ul className="space-y-2 text-xs text-red-600">
            {violations.map((violation, index) => (
              <li key={`${violation.code}-${index}`} className="flex justify-between">
                <span>{violation.message}</span>
                {violation.delta !== undefined && (
                  <span className="text-red-500">{violation.delta.toFixed(2)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ResultsPanel;
