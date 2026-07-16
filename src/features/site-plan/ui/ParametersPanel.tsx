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
  /** Brief Phase 2: market-grounded SF lot fit */
  onGenerateLots?: () => void;
  isGeneratingLots?: boolean;
  lotFitSummary?: string | null;
  alternatives: PlannerOutput[];
  /** Optimizer scores (0–1), aligned with `alternatives` */
  alternativeScores?: number[];
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

  /** Server/SF-generated plan: parameters come from the compiled context */
  staticPlan?: boolean;
  /** Compiled-context typology — gates which generator buttons make sense */
  resolvedTypology?: string | null;
  /** Product within the multifamily basis (apartments vs attached townhomes) */
  product?: 'apartments' | 'townhomes';
  /** Present only when the compiled context supports a product choice */
  onProductChange?: (product: 'apartments' | 'townhomes') => void;

  // Current plan data for snapshot (used by save)
  currentElements: Element[];
  currentMetrics: SiteMetrics | null;
  currentViolations: FeasibilityViolation[];
  currentInvestment: InvestmentAnalysis | null;
};

/** Compact slider row: label + live value on one line, thin track, no
 *  min/max legend row (the range lives in the tooltip). */
const SliderRow: React.FC<{
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}> = ({ label, value, display, min, max, step, onChange }) => (
  <div>
    <div className="flex items-baseline justify-between mb-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <span className="text-xs font-semibold text-gray-900 tabular-nums">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      title={`${min}–${max}`}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
    />
  </div>
);

const ParametersPanel: React.FC<ParametersPanelProps> = ({
  parcel,
  config,
  onConfigChange,
  rpcMetrics,
  status,
  isGenerating,
  onGenerate,
  onGenerateAlternatives,
  onGenerateLots,
  isGeneratingLots,
  lotFitSummary,
  alternatives,
  alternativeScores,
  selectedSolveIndex,
  onSelectSolve,
  savedPlans,
  savedPlansLoading,
  savedPlansError,
  onSavePlan,
  onLoadPlan,
  onDeletePlan,
  onToggleFavorite,
  staticPlan = false,
  resolvedTypology,
  product = 'apartments',
  onProductChange,
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
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Parameters</h3>
        <span className="text-xs text-gray-500">
          {(parcel.deeded_acres || 0).toFixed(2)} ac · {parcel.zoning || 'no zoning'}
        </span>
      </div>
      <div className="text-xs text-gray-600 truncate mb-3" title={parcel.address}>
        {parcel.address}
      </div>

      {onProductChange && (
        <div className="mb-3">
          <div className="text-[11px] font-medium text-gray-500 mb-1">Product</div>
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-gray-100 rounded-md" role="radiogroup" aria-label="Product type">
            <button
              type="button"
              role="radio"
              aria-checked={product === 'apartments'}
              onClick={() => onProductChange('apartments')}
              className={`px-2 py-1.5 text-xs rounded ${product === 'apartments' ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Apartments
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={product === 'townhomes'}
              onClick={() => onProductChange('townhomes')}
              className={`px-2 py-1.5 text-xs rounded ${product === 'townhomes' ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Townhomes
            </button>
          </div>
          {product === 'townhomes' && (
            <p className="mt-1 text-[10px] leading-snug text-gray-500">
              Attached-dwelling standards (party-wall setbacks, min lot/unit,
              stories cap) from the ordinance; unit form from local townhome
              comps.
            </p>
          )}
        </div>
      )}

      {staticPlan && (
        <p className="mb-3 text-[11px] leading-snug text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
          This plan is generated from the compiled context — setbacks, FAR,
          height, density and parking come from ordinance + precedent. Use
          Generate for a new variation; sliders apply to the local engine only.
        </p>
      )}
      <div className="space-y-4">
        <fieldset disabled={staticPlan} className={`m-0 p-0 border-0 space-y-3 ${staticPlan ? 'opacity-50' : ''}`}>
          <SliderRow
            label="Target FAR"
            value={config.designParameters.targetFAR}
            display={config.designParameters.targetFAR.toFixed(1)}
            min={0.5}
            max={3}
            step={0.1}
            onChange={v =>
              onConfigChange({
                designParameters: { ...config.designParameters, targetFAR: v }
              })
            }
          />
          <SliderRow
            label="Coverage"
            value={config.designParameters.targetCoveragePct ?? 50}
            display={`${config.designParameters.targetCoveragePct ?? 50}%`}
            min={20}
            max={80}
            step={5}
            onChange={v =>
              onConfigChange({
                designParameters: { ...config.designParameters, targetCoveragePct: v }
              })
            }
          />
          <SliderRow
            label="Parking ratio"
            value={config.designParameters.parking.targetRatio}
            display={`${config.designParameters.parking.targetRatio.toFixed(1)} /unit`}
            min={0.5}
            max={3}
            step={0.1}
            onChange={v =>
              onConfigChange({
                designParameters: {
                  ...config.designParameters,
                  parking: { ...config.designParameters.parking, targetRatio: v }
                }
              })
            }
          />

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Typology</label>
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
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Buildings</label>
            <div className="grid grid-cols-6 gap-1" role="group" aria-label="Number of buildings">
              {/* Auto = coverage/precedent-driven count (numBuildings unset) */}
              {[undefined, 1, 2, 3, 4, 5].map(n => {
                const active = config.designParameters.numBuildings === n;
                return (
                  <button
                    key={n ?? 'auto'}
                    onClick={() =>
                      onConfigChange({
                        designParameters: { ...config.designParameters, numBuildings: n }
                      })
                    }
                    title={n == null ? 'Let coverage and local precedent decide the count' : `${n} building${n === 1 ? '' : 's'}`}
                    className={`px-0 py-1.5 text-xs rounded border tabular-nums ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {n ?? 'Auto'}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>

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
          onGenerateLots={onGenerateLots}
          isGeneratingLots={isGeneratingLots}
          lotFitSummary={lotFitSummary}
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
              scores={alternativeScores}
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
