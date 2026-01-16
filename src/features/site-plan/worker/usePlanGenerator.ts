import { useCallback, useState } from 'react';
import type { PlannerConfig, PlannerOutput } from '../../../engine/types';
import type { Polygon, MultiPolygon } from 'geojson';
import { workerManager } from '../../../workers/workerManager';

export const usePlanGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generatePlan = useCallback(async (geometry: Polygon | MultiPolygon, config: PlannerConfig) => {
    setIsGenerating(true);
    setError(null);
    try {
      return await workerManager.generateSitePlan(geometry, config);
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error('Failed to generate site plan');
      setError(nextError);
      throw nextError;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    generatePlan,
    isGenerating,
    error
  };
};
