import React from 'react';
import type { FeasibilityViolation, SiteMetrics } from '../../../engine/types';
import type { InvestmentAnalysis } from '../../../types/parcel';

type ResultsPanelProps = {
  metrics: SiteMetrics | null;
  investmentAnalysis: InvestmentAnalysis | null;
  isGenerating: boolean;
  violations: FeasibilityViolation[];
  /** The scheme and revision these figures are for. */
  schemeLabel?: string | null;
};

/** Format a number as USD with no decimal places */
const fmtUSD = (value: number | null | undefined): string => {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
};

/** A figure the plan reports, or "not reported": the engine's zero is a missing value, not a measurement. */
const reported = (v: number | null | undefined, show: (v: number) => string): string =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? show(v) : 'not reported';

const ResultsPanel: React.FC<ResultsPanelProps> = ({
  metrics,
  investmentAnalysis,
  isGenerating,
  violations,
  schemeLabel,
}) => {
  return (
    <div className="w-full xl:w-80 bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Results</h3>

      {isGenerating && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-600" data-testid="results-updating">Updating the plan. The figures below are the previous plan's until this finishes.</span>
          </div>
        </div>
      )}
      <div className={isGenerating ? 'opacity-40' : ''} aria-busy={isGenerating}>

      {!metrics && !investmentAnalysis && !isGenerating && (
        <div className="text-sm text-gray-600">Generate a plan to see results.</div>
      )}

      {metrics && (
        <div className="space-y-3 text-sm text-gray-700 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-600">FAR</span>
            <span className="font-medium" data-testid="results-far">{reported(metrics.achievedFAR, v => v.toFixed(2))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Coverage</span>
            <span className="font-medium" data-testid="results-coverage">{reported(metrics.siteCoveragePct, v => `${v.toFixed(1)}%`)}</span>
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
          {(metrics.adaStalls != null || metrics.evStalls != null) && (
            <div className="flex justify-between">
              <span className="text-gray-600">ADA / EV stalls</span>
              <span className="font-medium">{metrics.adaStalls ?? 0} / {metrics.evStalls ?? 0}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Built SF</span>
            <span className="font-medium">{metrics.totalBuiltSF.toLocaleString()}</span>
          </div>
          {metrics.totalUnits != null && metrics.totalUnits > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Units</span>
              <span className="font-medium">{metrics.totalUnits}</span>
            </div>
          )}
          {metrics.unitMixSummary && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
              {metrics.unitMixSummary}
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Open Space</span>
            <span className="font-medium">{reported(metrics.openSpacePct, v => `${v.toFixed(1)}%`)}</span>
          </div>
        </div>
      )}

      {investmentAnalysis && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900">Scheme pro forma</h4>
          <p className="text-xs text-gray-500 mb-2" data-testid="results-basis">
            {schemeLabel ? `${schemeLabel}. ` : ''}A rental pro forma on this app's default rents, costs and rates.
            The sale margin in the header is a different measure: local sale prices against cost. The two can disagree.
          </p>

          {/* Revenue */}
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-1">Revenue</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Gross Potential Rent</span>
            <span className="font-medium">{fmtUSD(investmentAnalysis.grossPotentialRent)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Effective Gross Income</span>
            <span className="font-medium">{fmtUSD(investmentAnalysis.effectiveGrossIncome)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">NOI</span>
            <span className="font-medium text-green-700">{fmtUSD(investmentAnalysis.netOperatingIncome)}</span>
          </div>

          {/* Costs */}
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-2">Costs</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Dev Cost</span>
            <span className="font-medium">{fmtUSD(investmentAnalysis.totalDevelopmentCost ?? investmentAnalysis.totalInvestment)}</span>
          </div>
          {investmentAnalysis.costPerUnit != null && investmentAnalysis.costPerUnit > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cost / Unit</span>
              <span className="font-medium">{fmtUSD(investmentAnalysis.costPerUnit)}</span>
            </div>
          )}
          {investmentAnalysis.costPerSF != null && investmentAnalysis.costPerSF > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cost / SF</span>
              <span className="font-medium">{fmtUSD(investmentAnalysis.costPerSF)}</span>
            </div>
          )}

          {/* Returns */}
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-2">Returns</div>
          {investmentAnalysis.yieldOnCost != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Yield on Cost</span>
              <span className="font-medium">{(investmentAnalysis.yieldOnCost * 100).toFixed(2)}%</span>
            </div>
          )}
          {investmentAnalysis.stabilizedValue != null && investmentAnalysis.stabilizedValue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Stabilized Value</span>
              <span className="font-medium">{fmtUSD(investmentAnalysis.stabilizedValue)}</span>
            </div>
          )}
          {investmentAnalysis.profit != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Profit</span>
              <span className={`font-medium ${investmentAnalysis.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmtUSD(investmentAnalysis.profit)}
              </span>
            </div>
          )}
          {investmentAnalysis.equityMultiple != null && investmentAnalysis.equityMultiple > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Equity Multiple</span>
              <span className="font-medium">{investmentAnalysis.equityMultiple.toFixed(2)}x</span>
            </div>
          )}
          {investmentAnalysis.cashOnCash != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cash-on-Cash</span>
              <span className="font-medium">{(investmentAnalysis.cashOnCash * 100).toFixed(2)}%</span>
            </div>
          )}
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
    </div>
  );
};

export default ResultsPanel;
