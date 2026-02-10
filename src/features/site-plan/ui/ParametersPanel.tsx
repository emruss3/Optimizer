import React, { useState } from 'react';
import { Save, Star, Trash2, ChevronDown } from 'lucide-react';
import type { PlannerConfig, PlannerOutput, Element, SiteMetrics, FeasibilityViolation } from '../../../engine/types';
import type { SelectedParcel } from '../../../types/parcel';
import type { InvestmentAnalysis } from '../../../types/parcel';
import type { SavedSitePlan } from '../../../lib/sitePlanStorage';
import { SolveTable } from '../../../components/site-planner/SolveTable';
import GenerateControls from './GenerateControls';

type ParametersPanelProps = {
  parcel: SelectedParcel;
  config: PlannerConfig;
  onConfigChange: (updates: Partial<PlannerConfig>) => void;
  rpcMetrics: {
    areaSqft?: number;
    setbacks?: { front?: number; side?: number; rear?: number };
    hasZoning?: boolean;
  } | null;
  status: 'loading' | 'ready' | 'invalid';
  isGenerating: boolean;
  onGenerate: () => void;
  onGenerateAlternatives: () => void;
  alternatives: PlannerOutput[];
  selectedSolveIndex: number | null;
  onSelectSolve: (index: number) => void;

  // Saved plans
  savedPlans: SavedSitePlan[];
  savedPlansLoading: boolean;
  savedPlansError: string | null;
  onSavePlan: (name: string) => void;
  onLoadPlan: (plan: SavedSitePlan) => void;
  onDeletePlan: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;

  // Current plan data for snapshot (used by save)
  currentElements: Element[];
  currentMetrics: SiteMetrics | null;
  currentViolations: FeasibilityViolation[];
  currentInvestment: InvestmentAnalysis | null;
};

const ParametersPanel: React.FC<ParametersPanelProps> = ({
  parcel,
  config,
  onConfigChange,
  rpcMetrics,
  status,
  isGenerating,
  onGenerate,
  onGenerateAlternatives,
  alternatives,
  selectedSolveIndex,
  onSelectSolve,
  savedPlans,
  savedPlansLoading,
  savedPlansError,
  onSavePlan,
  onLoadPlan,
  onDeletePlan,
  onToggleFavorite,
}) => {
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [showSavedPlans, setShowSavedPlans] = useState(false);

  const handleSave = () => {
    const name = saveName.trim() || `Plan ${new Date().toLocaleString()}`;
    onSavePlan(name);
    setSaveName('');
    setShowSaveInput(false);
  };

  return (
    <div className="w-full xl:w-80 bg-white border border-gray-200 rounded-lg p-4 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4">Parameters</h3>

      <div className="space-y-4 text-sm text-gray-700">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-gray-500">Parcel</div>
          <div className="font-medium">{parcel.address}</div>
          <div className="text-gray-600">{(parcel.deeded_acres || 0).toFixed(2)} acres</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-gray-500">Zoning</div>
          <div className="font-medium">{parcel.zoning || 'N/A'}</div>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target FAR: {config.designParameters.targetFAR}
          </label>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={config.designParameters.targetFAR}
            onChange={(e) =>
              onConfigChange({
                designParameters: {
                  ...config.designParameters,
                  targetFAR: parseFloat(e.target.value)
                }
              })
            }
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.5</span>
            <span>3.0</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Coverage: {config.designParameters.targetCoveragePct}%
          </label>
          <input
            type="range"
            min="20"
            max="80"
            step="5"
            value={config.designParameters.targetCoveragePct}
            onChange={(e) =>
              onConfigChange({
                designParameters: {
                  ...config.designParameters,
                  targetCoveragePct: parseInt(e.target.value, 10)
                }
              })
            }
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>20%</span>
            <span>80%</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Parking Ratio: {config.designParameters.parking.targetRatio}
          </label>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={config.designParameters.parking.targetRatio}
            onChange={(e) =>
              onConfigChange({
                designParameters: {
                  ...config.designParameters,
                  parking: {
                    ...config.designParameters.parking,
                    targetRatio: parseFloat(e.target.value)
                  }
                }
              })
            }
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.5</span>
            <span>3.0</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Building Typology</label>
          <select
            value={config.designParameters.buildingTypology}
            onChange={(e) =>
              onConfigChange({
                designParameters: {
                  ...config.designParameters,
                  buildingTypology: e.target.value
                }
              })
            }
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="bar">Bar Building</option>
            <option value="L-shape">L-Shaped</option>
            <option value="podium">Podium</option>
            <option value="u-shape">U-Shape</option>
            <option value="courtyard-wrap">Courtyard Wrap</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Buildings: {config.designParameters.numBuildings}
          </label>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={config.designParameters.numBuildings}
            onChange={(e) =>
              onConfigChange({
                designParameters: {
                  ...config.designParameters,
                  numBuildings: parseInt(e.target.value, 10)
                }
              })
            }
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        {rpcMetrics && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700 mb-2">Zoning Information</div>
            <div className="space-y-1 text-xs text-gray-600">
              <div>Area: {rpcMetrics.areaSqft?.toLocaleString()} sq ft</div>
              {rpcMetrics.setbacks && (
                <div>
                  Setbacks: Front {rpcMetrics.setbacks.front || 20}', Side {rpcMetrics.setbacks.side || 5}',
                  Rear {rpcMetrics.setbacks.rear || 20}'
                </div>
              )}
              {!rpcMetrics.hasZoning && (
                <div className="text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-xs">
                  Source: Default (no zoning record)
                </div>
              )}
            </div>
          </div>
        )}

        <GenerateControls
          status={status}
          isGenerating={isGenerating}
          onGenerate={onGenerate}
          onGenerateAlternatives={onGenerateAlternatives}
        />

        {/* ── Save Plan ───────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-4 space-y-2">
          {!showSaveInput ? (
            <button
              onClick={() => setShowSaveInput(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
              disabled={isGenerating}
            >
              <Save className="w-4 h-4" />
              Save Plan
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Plan name…"
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                autoFocus
              />
              <button
                onClick={handleSave}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                Save
              </button>
              <button
                onClick={() => setShowSaveInput(false)}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── Saved Plans Dropdown ──────────────────────────────────── */}
          <button
            onClick={() => setShowSavedPlans(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
          >
            <span>Saved Plans ({savedPlansLoading ? '…' : savedPlans.length})</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showSavedPlans ? 'rotate-180' : ''}`} />
          </button>

          {showSavedPlans && (
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {savedPlansError && (
                <div className="px-3 py-2 text-xs text-red-600 bg-red-50">{savedPlansError}</div>
              )}
              {savedPlans.length === 0 && !savedPlansLoading && (
                <div className="px-3 py-3 text-xs text-gray-500 text-center">No saved plans yet</div>
              )}
              {savedPlans.map(plan => (
                <div
                  key={plan.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer group"
                  onClick={() => onLoadPlan(plan)}
                >
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onToggleFavorite(plan.id, !plan.is_favorite);
                    }}
                    className="flex-shrink-0"
                    title={plan.is_favorite ? 'Unfavorite' : 'Favorite'}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        plan.is_favorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'
                      }`}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{plan.name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(plan.created_at).toLocaleDateString()} &middot;{' '}
                      FAR {plan.metrics?.achievedFAR?.toFixed(2) ?? '—'}
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onDeletePlan(plan.id);
                    }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700"
                    title="Delete plan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {alternatives.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Solves</h3>
            <SolveTable
              solves={alternatives}
              baseConfig={config}
              selectedIndex={selectedSolveIndex}
              onSelect={(index) => onSelectSolve(index)}
              savedPlans={savedPlans}
              onLoadSavedPlan={onLoadPlan}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ParametersPanel;
