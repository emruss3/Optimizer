// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { PlannerOutput, PlannerConfig } from '../../engine/types';
import { validateSitePlan } from '../../engine/planner';

interface SolveTableProps {
  solves: PlannerOutput[];
  baseConfig: PlannerConfig;
  selectedIndex: number | null;
  onSelect: (index: number, solve: PlannerOutput) => void;
}

export function SolveTable({ solves, baseConfig, selectedIndex, onSelect }: SolveTableProps) {
  // Compute scores for each solve
  const solvesWithScores = useMemo(() => {
    return solves.map((solve, index) => {
      const validation = validateSitePlan(solve, baseConfig);
      return {
        solve,
        index,
        score: validation.score
      };
    });
  }, [solves, baseConfig]);

  if (solves.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
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
                Parking Ratio
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Built SF
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Earthwork $
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Net CY
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Compliance
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {solvesWithScores.map(({ solve, index, score }) => {
              const isSelected = selectedIndex === index;
              const metrics = solve.metrics;
              
              return (
                <tr
                  key={index}
                  data-testid="solve-row"
                  onClick={() => onSelect(index, solve)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900" data-testid="solve-score">
                    {score.toFixed(0)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {metrics.achievedFAR.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {metrics.siteCoveragePct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {metrics.parkingRatio.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {metrics.totalBuiltSF.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {metrics.earthworkCost ? `$${metrics.earthworkCost.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                    {metrics.earthworkNetCY !== undefined ? `${metrics.earthworkNetCY > 0 ? '+' : ''}${metrics.earthworkNetCY.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {metrics.zoningCompliant ? (
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
