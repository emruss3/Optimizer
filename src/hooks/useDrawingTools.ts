// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback } from 'react';
import type { Element } from '../engine/types';

export type DrawingTool = 'select' | 'draw-building' | 'draw-parking' | 'draw-greenspace' | 'edit' | 'measure';

export interface UseDrawingToolsReturn {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  createElement: (x: number, y: number, type: 'building' | 'parking' | 'greenspace') => Element;
}

export function useDrawingTools(): UseDrawingToolsReturn {
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const createElement = useCallback((x: number, y: number, type: 'building' | 'parking' | 'greenspace'): Element => {
    let width: number, height: number;
    let color: string;
    
    switch (type) {
      case 'building':
        width = 60; // 60 feet
        height = 40; // 40 feet
        color = '#3B82F6';
        break;
      case 'parking':
        width = 120; // 120 feet
        height = 80; // 80 feet
        color = '#10B981';
        break;
      case 'greenspace':
        width = 60;
        height = 60;
        color = '#059669';
        break;
    }

    const coords: number[][] = [
      [x - width / 2, y - height / 2],
      [x + width / 2, y - height / 2],
      [x + width / 2, y + height / 2],
      [x - width / 2, y + height / 2],
      [x - width / 2, y - height / 2] // Close polygon
    ];

    return {
      id: generateId(),
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${Date.now()}`,
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      },
      properties: {
        areaSqFt: width * height,
        color
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'user-drawn'
      }
    };
  }, []);

  return {
    activeTool,
    setActiveTool,
    createElement
  };
}

