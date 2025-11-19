// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';

export interface MeasurementState {
  isMeasuring: boolean;
  startPoint: { x: number; y: number } | null;
  endPoint: { x: number; y: number } | null;
}

export interface UseMeasurementReturn {
  measurementState: MeasurementState;
  startMeasurement: (x: number, y: number) => void;
  updateMeasurement: (x: number, y: number) => void;
  endMeasurement: () => void;
  getDistance: () => number | null;
}

export function useMeasurement(): UseMeasurementReturn {
  const [measurementState, setMeasurementState] = useState<MeasurementState>({
    isMeasuring: false,
    startPoint: null,
    endPoint: null
  });

  const startMeasurement = useCallback((x: number, y: number) => {
    setMeasurementState({
      isMeasuring: true,
      startPoint: { x, y },
      endPoint: null
    });
  }, []);

  const updateMeasurement = useCallback((x: number, y: number) => {
    setMeasurementState(prev => ({
      ...prev,
      endPoint: { x, y }
    }));
  }, []);

  const endMeasurement = useCallback(() => {
    setMeasurementState({
      isMeasuring: false,
      startPoint: null,
      endPoint: null
    });
  }, []);

  const getDistance = useCallback((): number | null => {
    if (!measurementState.startPoint || !measurementState.endPoint) return null;
    
    const dx = measurementState.endPoint.x - measurementState.startPoint.x;
    const dy = measurementState.endPoint.y - measurementState.startPoint.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, [measurementState]);

  return {
    measurementState,
    startMeasurement,
    updateMeasurement,
    endMeasurement,
    getDistance
  };
}


