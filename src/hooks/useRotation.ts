// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';
import type { Element } from '../engine/types';

export interface RotationState {
  isRotating: boolean;
  elementId?: string;
  rotationCenter?: { x: number; y: number };
  startAngle?: number;
  originalCoords?: number[][]; // Store original coordinates for rotation
}

export interface UseRotationReturn {
  rotationState: RotationState;
  startRotation: (elementId: string, centerX: number, centerY: number, startAngle: number, originalCoords?: number[][]) => void;
  updateRotation: (currentX: number, currentY: number, snapToDegrees?: number) => number | null;
  endRotation: () => void;
}

export function useRotation(): UseRotationReturn {
  const [rotationState, setRotationState] = useState<RotationState>({
    isRotating: false
  });

  const startRotation = useCallback((elementId: string, centerX: number, centerY: number, startAngle: number, originalCoords?: number[][]) => {
    setRotationState({
      isRotating: true,
      elementId,
      rotationCenter: { x: centerX, y: centerY },
      startAngle,
      originalCoords
    });
  }, []);

  const updateRotation = useCallback((currentX: number, currentY: number, snapToDegrees = 15): number | null => {
    if (!rotationState.isRotating || !rotationState.rotationCenter || rotationState.startAngle === undefined) {
      return null;
    }

    const currentAngle = Math.atan2(
      currentY - rotationState.rotationCenter.y,
      currentX - rotationState.rotationCenter.x
    ) * (180 / Math.PI);

    let angleDeg = currentAngle;
    if (angleDeg < 0) angleDeg += 360;

    // Snap to increments if specified
    if (snapToDegrees > 0) {
      angleDeg = Math.round(angleDeg / snapToDegrees) * snapToDegrees;
    }

    return angleDeg;
  }, [rotationState]);

  const endRotation = useCallback(() => {
    setRotationState({ isRotating: false });
  }, []);

  return {
    rotationState,
    startRotation,
    updateRotation,
    endRotation
  };
}

