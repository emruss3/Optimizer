import React from 'react';
import type { FeasibilityViolation, SiteMetrics } from '../../../engine/types';
import type { InvestmentAnalysis } from '../../../types/parcel';
import type { EdgeClassification } from '../../../engine/setbacks';
import { metersToFeet } from '../../../engine/units';

type ResultsPanelProps = {
  metrics: SiteMetrics | null;
  investmentAnalysis: InvestmentAnalysis | null;
  isGenerating: boolean;
  violations: FeasibilityViolation[];
  edgeClassifications?: EdgeClassification[];
  setbacks?: { front?: number; side?: number; rear?: number };
};

/** Human-readable label for an edge type with optional road name */
function edgeLabel(edge: EdgeClassification, setbacks?: { front?: number; side?: number; rear?: number }): string {
  const setbackFt =
    edge.type === 'front'
      ? (setbacks?.front ?? 20)
      : edge.type === 'rear'
        ? (setbacks?.rear ?? 20)
        : (setbacks?.side ?? 10);

  const roadSuffix = edge.roadName ? `: ${edge.roadName}` : '';
  return `${capitalize(edge.type)}${roadSuffix} (${setbackFt}ft setback)`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format edge length in feet */
function edgeLengthFt(edge: EdgeClassification): string {
  return `${metersToFeet(edge.length).toFixed(0)}ft`;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({
  metrics,
  investmentAnalysis,
  isGenerating,
  violations,
  edgeClassifications,
  setbacks,
}) => {
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
            <span className="font-medium">{metrics.openSpacePct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Edge Classifications / Setbacks */}
      {edgeClassifications && edgeClassifications.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Edge Setbacks</h4>
          <ul className="space-y-1.5 text-xs">
            {edgeClassifications.map((edge, idx) => {
              const colorClass =
                edge.type === 'front'
                  ? 'text-blue-700 bg-blue-50'
                  : edge.type === 'rear'
                    ? 'text-amber-700 bg-amber-50'
                    : 'text-gray-700 bg-gray-50';
              return (
                <li key={idx} className={`flex justify-between items-center px-2 py-1 rounded ${colorClass}`}>
                  <span className="font-medium">{edgeLabel(edge, setbacks)}</span>
                  <span className="text-[10px] opacity-70">{edgeLengthFt(edge)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {investmentAnalysis && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Pro Forma</h4>

          {/* Revenue */}
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-1">Revenue</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Gross Potential Rent</span>
            <span className="font-medium">${investmentAnalysis.grossPotentialRent?.toLocaleString() ?? '—'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Effective Gross Income</span>
            <span className="font-medium">${investmentAnalysis.effectiveGrossIncome?.toLocaleString() ?? '—'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">NOI</span>
            <span className="font-medium text-green-700">${investmentAnalysis.netOperatingIncome?.toLocaleString() ?? '—'}</span>
          </div>

          {/* Costs */}
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-2">Costs</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Dev Cost</span>
            <span className="font-medium">${investmentAnalysis.totalDevelopmentCost?.toLocaleString() ?? investmentAnalysis.totalInvestment?.toLocaleString() ?? '—'}</span>
          </div>
          {investmentAnalysis.costPerUnit != null && investmentAnalysis.costPerUnit > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cost / Unit</span>
              <span className="font-medium">${Math.round(investmentAnalysis.costPerUnit).toLocaleString()}</span>
            </div>
          )}
          {investmentAnalysis.costPerSF != null && investmentAnalysis.costPerSF > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cost / SF</span>
              <span className="font-medium">${Math.round(investmentAnalysis.costPerSF).toLocaleString()}</span>
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
              <span className="font-medium">${investmentAnalysis.stabilizedValue.toLocaleString()}</span>
            </div>
          )}
          {investmentAnalysis.profit != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Profit</span>
              <span className={`font-medium ${investmentAnalysis.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                ${investmentAnalysis.profit.toLocaleString()}
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
  );
};

export default ResultsPanel;
