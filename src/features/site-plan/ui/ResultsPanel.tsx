import React from 'react';
import type { SiteMetrics } from '../../../engine/types';
import type { InvestmentAnalysis } from '../../../types/parcel';

type ResultsPanelProps = {
  metrics: SiteMetrics | null;
  investmentAnalysis: InvestmentAnalysis | null;
  isGenerating: boolean;
};

const ResultsPanel: React.FC<ResultsPanelProps> = ({ metrics, investmentAnalysis, isGenerating }) => {
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
          <div className="flex justify-between">
            <span className="text-gray-600">Parking Ratio</span>
            <span className="font-medium">{metrics.parkingRatio.toFixed(2)}</span>
          </div>
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
    </div>
  );
};

export default ResultsPanel;
