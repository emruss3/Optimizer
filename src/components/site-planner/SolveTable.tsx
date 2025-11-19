// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import type { PlannerOutput, PlannerConfig } from '../../engine/types';
import { validateSitePlan } from '../../engine/planner';

interface SolveTableProps {
  solves: Array<{ plan: PlannerOutput; config: PlannerConfig; id: string }>;
  activeSolveId?: string;
  onSelectSolve: (plan: PlannerOutput) => void;
}

type SortField = 'far' | 'coverage' | 'parking' | 'builtSF' | 'openSpace' | 'score';
type SortDirection = 'asc' | 'desc';

interface FilterState {
  minFAR?: number | undefined;
  maxFAR?: number | undefined;
  minCoverage?: number | undefined;
  maxCoverage?: number | undefined;
  minParking?: number | undefined;
  maxParking?: number | undefined;
  compliantOnly: boolean;
}

export function SolveTable({ solves, activeSolveId, onSelectSolve }: SolveTableProps) {
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    compliantOnly: false
  });

  // Validate and score each solve
  const solvesWithScores = useMemo(() => {
    return solves.map(({ plan, config, id }) => {
      const validation = validateSitePlan(plan, config);
      return {
        id,
        plan,
        config,
        score: validation.score,
        isValid: validation.isValid,
        violations: validation.violations,
        warnings: validation.warnings
      };
    });
  }, [solves]);

  // Apply filters
  const filteredSolves = useMemo(() => {
    return solvesWithScores.filter(({ plan, isValid }) => {
      if (filters.compliantOnly && !isValid) return false;
      
      const metrics = plan.metrics;
      
      if (filters.minFAR !== undefined && metrics.achievedFAR < filters.minFAR) return false;
      if (filters.maxFAR !== undefined && metrics.achievedFAR > filters.maxFAR) return false;
      if (filters.minCoverage !== undefined && metrics.siteCoveragePct < filters.minCoverage) return false;
      if (filters.maxCoverage !== undefined && metrics.siteCoveragePct > filters.maxCoverage) return false;
      if (filters.minParking !== undefined && metrics.parkingRatio < filters.minParking) return false;
      if (filters.maxParking !== undefined && metrics.parkingRatio > filters.maxParking) return false;
      
      return true;
    });
  }, [solvesWithScores, filters]);

  // Apply sorting
  const sortedSolves = useMemo(() => {
    const sorted = [...filteredSolves];
    
    sorted.sort((a, b) => {
      let aValue: number;
      let bValue: number;
      
      switch (sortField) {
        case 'far':
          aValue = a.plan.metrics.achievedFAR;
          bValue = b.plan.metrics.achievedFAR;
          break;
        case 'coverage':
          aValue = a.plan.metrics.siteCoveragePct;
          bValue = b.plan.metrics.siteCoveragePct;
          break;
        case 'parking':
          aValue = a.plan.metrics.parkingRatio;
          bValue = b.plan.metrics.parkingRatio;
          break;
        case 'builtSF':
          aValue = a.plan.metrics.totalBuiltSF;
          bValue = b.plan.metrics.totalBuiltSF;
          break;
        case 'openSpace':
          aValue = a.plan.metrics.openSpacePct;
          bValue = b.plan.metrics.openSpacePct;
          break;
        case 'score':
        default:
          aValue = a.score;
          bValue = b.score;
          break;
      }
      
      if (sortDirection === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
    
    return sorted;
  }, [filteredSolves, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => {
    const isActive = sortField === field;
    return (
      <th
        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50"
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center space-x-1">
          <span>{label}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-400" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="text-sm font-semibold text-gray-900">Solves</h3>
          <span className="text-xs text-gray-500">({sortedSolves.length} of {solves.length})</span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center space-x-1 text-xs text-gray-600 hover:text-gray-900"
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">FAR</label>
              <div className="flex space-x-1">
                <input
                  type="number"
                  placeholder="Min"
                  step="0.1"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={filters.minFAR || ''}
                  onChange={(e) => setFilters({ ...filters, minFAR: e.target.value ? Number(e.target.value) : undefined })}
                />
                <input
                  type="number"
                  placeholder="Max"
                  step="0.1"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={filters.maxFAR || ''}
                  onChange={(e) => setFilters({ ...filters, maxFAR: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Coverage %</label>
              <div className="flex space-x-1">
                <input
                  type="number"
                  placeholder="Min"
                  step="1"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={filters.minCoverage || ''}
                  onChange={(e) => setFilters({ ...filters, minCoverage: e.target.value ? Number(e.target.value) : undefined })}
                />
                <input
                  type="number"
                  placeholder="Max"
                  step="1"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={filters.maxCoverage || ''}
                  onChange={(e) => setFilters({ ...filters, maxCoverage: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Parking Ratio</label>
              <div className="flex space-x-1">
                <input
                  type="number"
                  placeholder="Min"
                  step="0.1"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={filters.minParking || ''}
                  onChange={(e) => setFilters({ ...filters, minParking: e.target.value ? Number(e.target.value) : undefined })}
                />
                <input
                  type="number"
                  placeholder="Max"
                  step="0.1"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  value={filters.maxParking || ''}
                  onChange={(e) => setFilters({ ...filters, maxParking: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.compliantOnly}
                  onChange={(e) => setFilters({ ...filters, compliantOnly: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700">Compliant only</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader field="score" label="Score" />
              <SortHeader field="far" label="FAR" />
              <SortHeader field="coverage" label="Coverage %" />
              <SortHeader field="parking" label="Parking" />
              <SortHeader field="builtSF" label="Built SF" />
              <SortHeader field="openSpace" label="Open Space %" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedSolves.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No solves match the current filters
                </td>
              </tr>
            ) : (
              sortedSolves.map(({ id, plan, score, isValid }) => {
                const isActive = id === activeSolveId;
                const metrics = plan.metrics;
                
                return (
                  <tr
                    key={id}
                    onClick={() => onSelectSolve(plan)}
                    className={`cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-blue-50 hover:bg-blue-100'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
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
                      {metrics.openSpacePct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isValid ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


