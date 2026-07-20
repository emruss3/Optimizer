import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { SiteMetrics } from '../../../engine/types';
import type { InvestmentAnalysis } from '../../../types/parcel';
import type { MfMoney } from '../api/generateMfPlan';

/** Financial UI parked by directive — computation dormant, not deleted. */
const SHOW_YIELD_CHIP = false;

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
/** Hard-constraint clamps the generators emit: any of these present means the
 *  plan hit a legal/parking wall — the badge must not read green. */
const HARD_CLAMP_FLAGS: Record<string, string> = {
  parking_below_ratio: 'parking short',
  floors_clamped_by_far: 'FAR-clamped',
  density_clamped_units: 'density-clamped',
  coverage_cap_reached: 'coverage-capped',
  unit_cap_reached_min_lot_or_density: 'unit-capped',
  // Pinned best-effort (dynamic edits): softened caps read as constraints…
  parking_caps_units_below_program_min: 'units capped by parking',
  unit_gsf_out_of_band_pinned: 'unit size out of band',
  // …while EXCEEDED caps become red violations via the workspace mapping.
};

const KpiStrip: React.FC<{
  metrics: SiteMetrics | null;
  investment: InvestmentAnalysis | null;
  /** A3: local-sales valuation of the current scheme (server-computed) */
  money?: MfMoney | null;
  /** Generator flags for the active plan — the badge consumes hard clamps */
  planFlags?: string[];
  /** Achieved GSF / max-buildout GSF, 0–100+ (SF-first objective) */
  utilizationPct?: number | null;
}> = ({ metrics, investment, money, planFlags = [], utilizationPct = null }) => {
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
  // The badge consumes the clamp flags the system already emits: a green
  // "Compliant" next to a red stall count or an FAR clamp is a contradiction.
  const clampReasons = [
    ...new Set([
      ...planFlags.filter(f => HARD_CLAMP_FLAGS[f]).map(f => HARD_CLAMP_FLAGS[f]),
      ...(parkingShort ? ['parking short'] : []),
    ]),
  ];
  const constrained = clampReasons.length > 0;

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
      {/* Financial UI is parked by directive: the Yield-on-Cost chip is hidden
          but the computation stays live (SHOW_YIELD_CHIP flips it back on). */}
      {SHOW_YIELD_CHIP && investment && (
        <Stat label="Yield on Cost" value={`${(investment.yieldOnCost * 100).toFixed(2)}%`} />
      )}
      {money?.available && typeof money.margin_on_cost === 'number' && (
        <span title={money.basis ?? 'Local-sales valuation'} className="flex items-center">
          <Stat
            label={`Margin · mkt${money.n_sales != null ? ` (${money.n_sales} sales)` : ''}`}
            value={`${(money.margin_on_cost * 100).toFixed(1)}%`}
            alert={money.margin_on_cost < 0}
          />
        </span>
      )}
      {utilizationPct != null && (
        <Stat
          label="Utilization"
          value={`${utilizationPct.toFixed(0)}%`}
          alert={utilizationPct < 50}
        />
      )}
      {/* Compliance and optimization are SEPARATE verdicts: a code-compliant
          plan at 78% of the theoretical envelope is not "done" — the capture
          chip says so instead of letting the green chip imply optimality. */}
      <div
        title={constrained ? `Constrained: ${clampReasons.join(', ')}` : undefined}
        className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
          !compliant
            ? 'bg-red-50 text-red-700'
            : constrained
              ? 'bg-amber-50 text-amber-700'
              : 'bg-green-50 text-green-700'
        }`}
      >
        {compliant && !constrained ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {!compliant
          ? `${violations.length} issue${violations.length === 1 ? '' : 's'}`
          : constrained
            ? `Code compliant · constrained: ${clampReasons[0]}${clampReasons.length > 1 ? ` +${clampReasons.length - 1}` : ''}`
            : 'Code compliant'}
      </div>
      {utilizationPct != null && utilizationPct < 85 && (
        <div
          title="The constructive solver has not reproduced the theoretical envelope — additional optimization search is warranted."
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap"
        >
          ⚠ {utilizationPct.toFixed(0)}% of theoretical envelope
        </div>
      )}
      {metrics.parkingRegime === 'tuck_under' && (
        <div
          title="This scheme parks under the buildings (ground floor is a parking level). Chosen by comparing two complete solves — receipts in the Flags tab."
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-sky-50 text-sky-700 whitespace-nowrap"
        >
          Tuck-under parking
        </div>
      )}
    </div>
  );
};

export default KpiStrip;
