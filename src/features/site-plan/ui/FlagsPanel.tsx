import React from 'react';
import type { FeasibilityViolation } from '../../../engine/types';
import { describeContextFlag } from '../api/plannerContext';

const SEVERITY_STYLE: Record<string, string> = {
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-slate-50 border-slate-200 text-slate-600',
};

/**
 * The docked Flags tab: every reason the current plan is constrained or
 * refused, in one place — solver violations, the generator's own clamp flags
 * (each explained via the context contract's flag descriptions, which cite
 * the governing constraint), and candidates the zero-overlap gate rejected.
 * An empty state is a statement, not an absence: the plan is clean.
 */
const PROOF_LABELS: Record<string, string> = {
  proof_basis: 'Proof basis',
  binding_constraint: 'Binding constraint',
  required_additional_gsf: 'GSF to reach envelope',
  additional_units_at_selected_program: 'Additional units implied',
  additional_stalls_required: 'Additional stalls required',
  remaining_stall_capacity: 'Stall headroom remaining',
  remaining_impervious_sqft: 'Impervious budget remaining (sqft)',
  remaining_building_coverage_sqft: 'Coverage headroom remaining (sqft)',
  remaining_footprint_eligible_sqft: 'Footprint-eligible land remaining (sqft)',
  remaining_stories: 'Stories remaining',
  minimum_land_needed_sqft: 'Minimum land the gap needs (sqft)',
  constraint_proven: 'Constraint proven',
  units_placed: 'Units placed',
  entitlement_unit_cap: 'Entitlement unit cap',
};

const REGIME_LABELS: Record<string, string> = {
  chosen: 'Regime chosen',
  surface_gsf: 'Surface regime GSF',
  surface_error: 'Surface regime refusal',
  tuck_under_gsf: 'Tuck-under regime GSF',
  tuck_under_error: 'Tuck-under regime refusal',
  basis: 'Comparison basis',
};

const FlagsPanel: React.FC<{
  violations: FeasibilityViolation[];
  /** Clamp/derivation flags reported by the generator for THIS plan */
  lineageFlags: string[];
  rejected?: { count: number; reasons: string[] } | null;
  /** Solver's quantified residual-capacity proof — rendered verbatim. */
  proof?: Record<string, unknown> | null;
  /** Dispatcher's regime-comparison receipts (both complete solves). */
  regimeComparison?: Record<string, unknown> | null;
}> = ({ violations, lineageFlags, rejected, proof, regimeComparison }) => {
  const empty =
    violations.length === 0 && lineageFlags.length === 0 && !rejected && !proof && !regimeComparison;
  if (empty) {
    return (
      <div className="p-4 text-sm text-gray-500">
        No active flags — the plan satisfies every compiled constraint it was checked against.
      </div>
    );
  }
  return (
    <div className="p-3 space-y-2">
      {violations.map((v, i) => (
        <div
          key={`v-${i}`}
          className={`border rounded px-2.5 py-1.5 text-xs ${SEVERITY_STYLE[v.severity] ?? SEVERITY_STYLE.info}`}
        >
          <span className="font-mono font-semibold uppercase tracking-wide mr-2">{v.code}</span>
          {v.message}
        </div>
      ))}
      {lineageFlags.map(flag => (
        <div key={`f-${flag}`} className="border border-slate-200 bg-slate-50 rounded px-2.5 py-1.5 text-xs text-slate-700">
          <span className="font-mono font-semibold uppercase tracking-wide mr-2 text-slate-500">{flag}</span>
          {describeContextFlag(flag)}
        </div>
      ))}
      {rejected && rejected.count > 0 && (
        <div className="border border-red-200 bg-red-50 rounded px-2.5 py-1.5 text-xs text-red-800">
          <span className="font-semibold mr-1">
            {rejected.count} candidate{rejected.count === 1 ? '' : 's'} rejected by the zero-overlap gate
          </span>
          — {rejected.reasons.join('; ')}. Rejected candidates never rendered.
        </div>
      )}
      {proof && (
        <div className="border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-700">
          <div className="font-semibold text-slate-800 mb-1">Optimization proof (solver receipts)</div>
          <table className="tabular-nums">
            <tbody>
              {Object.entries(PROOF_LABELS)
                .filter(([k]) => proof[k] !== undefined && proof[k] !== null)
                .map(([k, label]) => (
                  <tr key={k}>
                    <td className="pr-3 text-slate-500">{label}</td>
                    <td className="font-medium">{String(proof[k]).replace(/_/g, ' ')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {regimeComparison && (
        <div className="border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-700">
          <div className="font-semibold text-slate-800 mb-1">
            Parking-regime comparison (two complete solves)
          </div>
          <table className="tabular-nums">
            <tbody>
              {Object.entries(REGIME_LABELS)
                .filter(([k]) => regimeComparison[k] !== undefined && regimeComparison[k] !== null)
                .map(([k, label]) => (
                  <tr key={k}>
                    <td className="pr-3 text-slate-500">{label}</td>
                    <td className="font-medium">
                      {typeof regimeComparison[k] === 'number'
                        ? Number(regimeComparison[k]).toLocaleString()
                        : String(regimeComparison[k]).replace(/_/g, ' ')}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FlagsPanel;
