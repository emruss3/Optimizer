import React from 'react';
import type { MaxBuildout } from '../api/maxBuildout';
import { bindingLabel } from '../api/maxBuildout';

const fmt = (n: number | null | undefined, d = 0): string =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: d });

/**
 * SF-first headline: the developer's objective is maximizing GSF on the lot.
 * "82,400 / 137,700 GSF achievable (60%) · 88u @ 1,550 SF · 4 st · binding:
 * impervious coverage" — the scheme's yield against the legal envelope, with
 * the stories ladder showing the yield response to height.
 */
const MaxBuildoutHeadline: React.FC<{
  buildout: MaxBuildout | null;
  /** Achieved GSF of the current scheme (backend metrics) */
  achievedGsf?: number | null;
  /** Stories of the current scheme, to highlight the active ladder rung */
  currentStories?: number | null;
}> = ({ buildout, achievedGsf, currentStories }) => {
  if (!buildout || buildout.max_gsf <= 0) return null;

  const utilization =
    achievedGsf != null && achievedGsf > 0
      ? Math.min(999, (achievedGsf / buildout.max_gsf) * 100)
      : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="text-sm text-gray-900">
        <span className="font-semibold tabular-nums">
          {achievedGsf != null && achievedGsf > 0 ? `${fmt(achievedGsf)} / ` : ''}
          {fmt(buildout.max_gsf)} GSF achievable
        </span>
        {utilization != null && (
          <span className={`ml-1 font-semibold tabular-nums ${utilization >= 85 ? 'text-green-700' : utilization >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            ({utilization.toFixed(0)}%)
          </span>
        )}
        <span className="text-gray-600">
          {' '}· {fmt(buildout.units_at_max)}u @ {fmt(buildout.at_unit_gsf)} SF · {buildout.at_stories} st ·{' '}
          binding: {bindingLabel(buildout.binding_constraint)}
        </span>
      </div>

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
