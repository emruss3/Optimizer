import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { SiteMetrics } from '../../../engine/types';
import type { InvestmentAnalysis } from '../../../types/parcel';

const Stat: React.FC<{ label: string; value: string; alert?: boolean }> = ({ label, value, alert }) => (
  <div className="flex flex-col items-start min-w-[64px]">
    <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${alert ? 'text-red-600' : 'text-gray-900'}`}>
      {value}
    </span>
  </div>
);

/**
 * Always-visible KPI strip over the canvas. These values come straight from
 * the deterministic engine and update live during drags/slider moves — the
 * TestFit-style "numbers tick while you design" readout.
 */
const KpiStrip: React.FC<{
  metrics: SiteMetrics | null;
  investment: InvestmentAnalysis | null;
}> = ({ metrics, investment }) => {
  if (!metrics) {
    return (
      <div className="text-sm text-gray-500">Generating plan…</div>
    );
  }

  const stallsProvided = metrics.stallsProvided ?? 0;
  const stallsRequired = metrics.stallsRequired ?? 0;
  const parkingShort = stallsRequired > 0 && stallsProvided < stallsRequired;
  // Metrics arrive from more than one engine (client solver, server
  // generator) — tolerate missing fields instead of crashing the planner.
  const violations = metrics.violations ?? [];
  const compliant = metrics.zoningCompliant ?? violations.length === 0;

  return (
    <div className="flex items-center gap-5 overflow-x-auto">
      <Stat label="Units" value={`${metrics.totalUnits ?? 0}`} />
      <Stat label="FAR" value={(metrics.achievedFAR ?? 0).toFixed(2)} />
      <Stat label="Coverage" value={`${(metrics.siteCoveragePct ?? 0).toFixed(0)}%`} />
      <Stat
        label="Stalls"
        value={`${stallsProvided} / ${stallsRequired}`}
        alert={parkingShort}
      />
      <Stat label="Open" value={`${(metrics.openSpacePct ?? 0).toFixed(0)}%`} />
      {investment && (
        <Stat label="Yield on Cost" value={`${(investment.yieldOnCost * 100).toFixed(2)}%`} />
      )}
      <div
        className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
          compliant ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}
      >
        {compliant ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {compliant ? 'Compliant' : `${violations.length} issue${violations.length === 1 ? '' : 's'}`}
      </div>
    </div>
  );
};

export default KpiStrip;
