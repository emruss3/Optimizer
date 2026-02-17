// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useMemo } from 'react';
import { CheckCircle, XCircle, Star } from 'lucide-react';
import type { PlannerOutput, PlannerConfig, SiteMetrics } from '../../engine/types';
import type { SavedSitePlan } from '../../lib/sitePlanStorage';
import { validateSitePlan } from '../../engine/planner';

interface SolveTableProps {
  solves: PlannerOutput[];
  baseConfig: PlannerConfig;
  selectedIndex: number | null;
  onSelect: (index: number, solve: PlannerOutput) => void;
  /** Saved plans to show alongside generated alternatives */
  savedPlans?: SavedSitePlan[];
  /** Callback when user clicks a saved plan row */
  onLoadSavedPlan?: (plan: SavedSitePlan) => void;
}

interface RowData {
  key: string;
  label: string;
  isSaved: boolean;
  isFavorite: boolean;
  metrics: SiteMetrics;
  score: number;
  zoningCompliant: boolean;
  onClick: () => void;
  isSelected: boolean;
}

export function SolveTable({
  solves,
  baseConfig,
  selectedIndex,
  onSelect,
  savedPlans = [],
  onLoadSavedPlan,
}: SolveTableProps) {
  // Build unified row data: saved plans first (sorted by favorite then date), then generated solves
  const rows = useMemo<RowData[]>(() => {
    const result: RowData[] = [];

    // Saved plans
    const sorted = [...savedPlans].sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    for (const plan of sorted) {
      if (!plan.metrics) continue;
      result.push({
        key: `saved-${plan.id}`,
        label: plan.name,
        isSaved: true,
        isFavorite: plan.is_favorite,
        metrics: plan.metrics,
        score: 0, // saved plans don't have a live score
        zoningCompliant: plan.metrics.zoningCompliant ?? false,
        onClick: () => onLoadSavedPlan?.(plan),
        isSelected: false,
      });
    }

    // Generated alternatives
    for (let i = 0; i < solves.length; i++) {
      const solve = solves[i];
      const validation = validateSitePlan(solve, baseConfig);
      result.push({
        key: `gen-${i}`,
        label: `Solve ${i + 1}`,
        isSaved: false,
        isFavorite: false,
        metrics: solve.metrics,
        score: validation.score,
        zoningCompliant: solve.metrics.zoningCompliant ?? false,
        onClick: () => onSelect(i, solve),
        isSelected: selectedIndex === i,
      });
    }

    return result;
  }, [solves, baseConfig, selectedIndex, onSelect, savedPlans, onLoadSavedPlan]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Score
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                FAR
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Coverage %
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Parking
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Built SF
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Open %
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Comply
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((row) => {
              const m = row.metrics;

              return (
                <tr
                  key={row.key}
                  data-testid="solve-row"
                  onClick={row.onClick}
                  className={`cursor-pointer transition-colors ${
                    row.isSelected
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : row.isSaved
                        ? 'bg-amber-50/50 hover:bg-amber-50'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center gap-1">
                      {row.isFavorite && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                      <span className="truncate max-w-[100px]" title={row.label}>{row.label}</span>
                      {row.isSaved && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded flex-shrink-0">
                          saved
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900" data-testid="solve-score">
                    {row.isSaved ? '—' : row.score.toFixed(0)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {m.achievedFAR.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {m.siteCoveragePct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {m.parkingRatio.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {m.totalBuiltSF.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {(m.openSpacePct ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.zoningCompliant ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
