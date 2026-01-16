import React from 'react';
import type { PlannerConfig, PlannerOutput } from '../../../engine/types';
import type { SelectedParcel } from '../../../types/parcel';
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
  onSelectSolve
}) => {
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

        {alternatives.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Solves</h3>
            <SolveTable
              solves={alternatives}
              baseConfig={config}
              selectedIndex={selectedSolveIndex}
              onSelect={(index) => onSelectSolve(index)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ParametersPanel;
