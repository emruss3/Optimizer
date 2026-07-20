import React from 'react';
import type { MaxBuildout } from '../api/maxBuildout';
import { bindingLabel } from '../api/maxBuildout';

const fmt = (n: number | null | undefined, d = 0): string =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: d });

/**
 * SF-first headline, with optimization honesty: the algebraic envelope is a
 * THEORETICAL upper bound until the constructive solver actually reproduces
 * it — "achievable" is reserved for solver-proven numbers. Below 85% capture
 * the gap is stated as an unresolved optimization, never blended into a
 * single number that reads as done.
 */
const MaxBuildoutHeadline: React.FC<{
  buildout: MaxBuildout | null;
  /** Achieved GSF of the current scheme (backend metrics) */
  achievedGsf?: number | null;
  /** Stories of the current scheme, to highlight the active ladder rung */
  currentStories?: number | null;
  /** Solver's own verdict + proof — displayed verbatim when present. */
  optimizationStatus?: string | null;
  optimizationProof?: Record<string, unknown> | null;
}> = ({ buildout, achievedGsf, currentStories, optimizationStatus, optimizationProof }) => {
  if (!buildout || buildout.max_gsf <= 0) return null;

  const capture =
    achievedGsf != null && achievedGsf > 0
      ? Math.min(999, (achievedGsf / buildout.max_gsf) * 100)
      : null;
  const gap = achievedGsf != null && achievedGsf > 0 ? Math.max(0, buildout.max_gsf - achievedGsf) : null;
  // The server's verdict wins; capture-inference is only the fallback for
  // plans generated before the classification contract existed.
  const solved = optimizationStatus
    ? optimizationStatus === 'feasible'
    : capture != null && capture >= 85;
  const proven = optimizationStatus === 'feasible_demonstrably_constrained';
  const proofBasis =
    typeof optimizationProof?.proof_basis === 'string'
      ? (optimizationProof.proof_basis as string).replace(/_/g, ' ')
      : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="text-sm text-gray-900">
        <span className="font-semibold tabular-nums">
          {fmt(buildout.max_gsf)} GSF theoretical upper bound
        </span>
        <span className="text-gray-600">
          {' '}· {fmt(buildout.units_at_max)}u @ {fmt(buildout.at_unit_gsf)} SF · {buildout.at_stories} st ·{' '}
          binding: {bindingLabel(buildout.binding_constraint)}
        </span>
      </div>
      {capture != null && gap != null && (
        <div className="text-[12px] tabular-nums mt-0.5">
          <span className="text-gray-700">
            Best feasible plan found: <span className="font-semibold">{fmt(achievedGsf)} GSF</span>
          </span>
          <span className={`ml-2 font-semibold ${solved ? 'text-green-700' : proven ? 'text-slate-600' : capture >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {capture.toFixed(0)}% capture
          </span>
          {proven && (
            <span className="ml-2 text-slate-600" title="The solver quantified the remaining capacity and proved the gap belongs to the lot, not the search.">
              proven constrained{proofBasis ? ` — ${proofBasis}` : ''}
            </span>
          )}
          {!solved && !proven && (
            <span className="ml-2 text-amber-700">
              gap {fmt(gap)} GSF · optimization incomplete — additional search warranted
            </span>
          )}
        </div>
      )}

      {buildout.stories_ladder.length > 1 && (
        <table className="mt-1.5 text-[11px] tabular-nums text-gray-700">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400">
              <th className="text-left font-medium pr-3">Stories</th>
              {buildout.stories_ladder.map(r => (
                <th
                  key={r.stories}
                  className={`text-right font-semibold px-2 ${r.stories === (currentStories ?? -1) ? 'text-blue-700' : ''}`}
                >
                  {r.stories}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="pr-3 text-gray-500">Units</td>
              {buildout.stories_ladder.map(r => (
                <td key={r.stories} className={`text-right px-2 ${r.stories === (currentStories ?? -1) ? 'font-semibold text-blue-700' : ''}`}>
                  {fmt(r.units)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="pr-3 text-gray-500">GSF</td>
              {buildout.stories_ladder.map(r => (
                <td key={r.stories} className={`text-right px-2 ${r.stories === (currentStories ?? -1) ? 'font-semibold text-blue-700' : ''}`}>
                  {fmt(Math.round(r.max_gsf / 1000))}k
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {buildout.entitlement_capacity?.max_units != null && (
        <div className="mt-1 text-[10px] text-gray-400">
          Entitled: {fmt(buildout.entitlement_capacity.max_units)} units max
          ({buildout.entitlement_capacity.max_units_source ?? 'zoning'})
          {buildout.entitlement_capacity.far_uncapped_for_mf ? ' · FAR uncapped for MF' : ''}
        </div>
      )}
    </div>
  );
};

export default MaxBuildoutHeadline;
