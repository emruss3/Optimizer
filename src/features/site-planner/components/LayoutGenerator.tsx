// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React, { useState, useCallback } from 'react';
import { Play, RotateCcw, TrendingUp, BarChart3, Target, RefreshCw } from 'lucide-react';
import { generateSeedPads, scoreAndRankSeedPads, SeedPad } from '../engine/seedPads';
import { mutatePads, scoreMutatedPads, MutatedPad } from '../engine/mutatePads';
import { CompliancePanel } from './CompliancePanel';
import { checkCompliance } from '../engine/compliance';

interface LayoutGeneratorProps {
  parcel_id: string;
  parcel_area_sqft: number;
  onLayoutSelected?: (layout: SeedPad | MutatedPad) => void;
  className?: string;
}

export function LayoutGenerator({ 
  parcel_id, 
  parcel_area_sqft,
  onLayoutSelected,
  className = '' 
}: LayoutGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [layouts, setLayouts] = useState<Array<SeedPad & { score: number; coverage: number; far: number }>>([]);
  const [mutatedLayouts, setMutatedLayouts] = useState<Array<MutatedPad & { score: number; coverage: number; far: number }>>([]);
  const [selectedLayout, setSelectedLayout] = useState<SeedPad | MutatedPad | null>(null);
  const [compliance, setCompliance] = useState<any>(null);

  const handleGenerateLayouts = useCallback(async () => {
    setIsGenerating(true);
    try {
      const seedPads = await generateSeedPads({
        parcel_id,
        count: 20,
        front_setback_ft: 20,
        side_setback_ft: 10,
        rear_setback_ft: 20,
        min_building_width_ft: 30,
        max_building_width_ft: 100,
        min_building_depth_ft: 30,
        max_building_depth_ft: 100,
        parking_ratio: 0.3
      });

      const scoredLayouts = await scoreAndRankSeedPads(parcel_id, seedPads, {
        max_far: 0.6,
        max_coverage: 0.8,
        min_parking_ratio: 0.3
      });

      setLayouts(scoredLayouts);
      setMutatedLayouts([]);
    } catch (error) {
      console.error('Error generating layouts:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [parcel_id]);

  const handleMutateLayouts = useCallback(async () => {
    if (layouts.length === 0) return;
    
    setIsMutating(true);
    try {
      const topPads = layouts.slice(0, 5); // Top 5 layouts
      const mutatedPads = await mutatePads({
        parcel_id,
        topPads,
        mutationCount: 20,
        jitterAmount: 20,
        rotationRange: 15,
        scaleRange: 0.2,
        positionRange: 30
      });

      const scoredMutatedPads = await scoreMutatedPads(parcel_id, mutatedPads, {
        max_far: 0.6,
        max_coverage: 0.8,
        min_parking_ratio: 0.3
      });

      setMutatedLayouts(scoredMutatedPads);
    } catch (error) {
      console.error('Error mutating layouts:', error);
    } finally {
      setIsMutating(false);
    }
  }, [parcel_id, layouts]);

  const handleSelectLayout = useCallback((layout: SeedPad | MutatedPad) => {
    setSelectedLayout(layout);
    
    // Calculate compliance for selected layout
    const complianceResult = checkCompliance({
      parcel_area_sqft,
      building_area_sqft: layout.bounds.maxX - layout.bounds.minX * (layout.bounds.maxY - layout.bounds.minY) / (12 * 12), // Convert SVG to sqft
      parking_area_sqft: 0, // Simplified
      total_building_area_sqft: 0, // Simplified
      zoning_requirements: {
        max_far: 0.6,
        max_coverage: 0.8,
        min_parking_ratio: 0.3
      }
    });
    
    setCompliance(complianceResult);
    onLayoutSelected?.(layout);
  }, [parcel_area_sqft, onLayoutSelected]);

  const allLayouts = [...layouts, ...mutatedLayouts].sort((a, b) => b.score - a.score);

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Layout Generator</h3>
        <p className="text-sm text-gray-600 mt-1">
          Generate and optimize site plan layouts using AI
        </p>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex space-x-3">
          <button
            onClick={handleGenerateLayouts}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>Generate 20 Layouts</span>
          </button>

          <button
            onClick={handleMutateLayouts}
            disabled={isMutating || layouts.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMutating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span>Mutate Top Layouts</span>
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="p-4">
        {allLayouts.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">
                Ranked Layouts ({allLayouts.length})
              </h4>
              <div className="text-sm text-gray-500">
                Sorted by score
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {allLayouts.map((layout, index) => (
                <div
                  key={layout.id}
                  onClick={() => handleSelectLayout(layout)}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedLayout?.id === layout.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-600">
                          #{index + 1}
                        </span>
                        <div className="flex items-center space-x-1">
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-medium text-green-600">
                            {layout.score.toFixed(0)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <BarChart3 className="w-3 h-3" />
                          <span>FAR: {(layout.far * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Target className="w-3 h-3" />
                          <span>Coverage: {(layout.coverage * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-gray-400">
                      {layout.mutation_type ? `Mutated (${layout.mutation_type})` : 'Seed'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <Play className="w-8 h-8 mx-auto" />
            </div>
            <p className="text-gray-500">Click "Generate 20 Layouts" to start</p>
          </div>
        )}
      </div>

      {/* Compliance Panel */}
      {compliance && (
        <div className="border-t border-gray-200 p-4">
          <CompliancePanel compliance={compliance} />
        </div>
      )}
    </div>
  );
}
