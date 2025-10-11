// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { Vertex } from '../types/element';

// Mock setback snapping logic
function enforceSetbackSnapping(
  vertex: Vertex,
  setbacks: { front: number; side: number; rear: number },
  parcelBounds: { minX: number; minY: number; maxX: number; maxY: number }
): Vertex {
  const { x, y } = vertex;
  const { front, side, rear } = setbacks;
  const { minX, minY, maxX, maxY } = parcelBounds;

  let newX = x;
  let newY = y;

  // Convert setbacks from feet to SVG units (12 SVG units = 1 foot)
  const frontSetbackSVG = front * 12;
  const sideSetbackSVG = side * 12;
  const rearSetbackSVG = rear * 12;

  // Front setback (top edge)
  if (y > maxY - frontSetbackSVG) {
    newY = maxY - frontSetbackSVG;
  }

  // Rear setback (bottom edge)
  if (y < minY + rearSetbackSVG) {
    newY = minY + rearSetbackSVG;
  }

  // Side setbacks (left and right edges)
  if (x < minX + sideSetbackSVG) {
    newX = minX + sideSetbackSVG;
  }
  if (x > maxX - sideSetbackSVG) {
    newX = maxX - sideSetbackSVG;
  }

  return { ...vertex, x: newX, y: newY };
}

describe('Setback Snapping', () => {
  const setbacks = { front: 20, side: 5, rear: 20 }; // feet
  const parcelBounds = { minX: 0, minY: 0, maxX: 1200, maxY: 800 }; // SVG units

  test('should snap vertex beyond front setback to front line', () => {
    const vertex: Vertex = {
      id: 'test',
      x: 600,
      y: 750 // Beyond front setback (20ft = 240 SVG units from top)
    };

    const snapped = enforceSetbackSnapping(vertex, setbacks, parcelBounds);
    
    // Should snap to front setback line (800 - 240 = 560)
    expect(snapped.y).toBe(560);
    expect(snapped.x).toBe(600); // X should remain unchanged
  });

  test('should snap vertex beyond rear setback to rear line', () => {
    const vertex: Vertex = {
      id: 'test',
      x: 600,
      y: 50 // Beyond rear setback (20ft = 240 SVG units from bottom)
    };

    const snapped = enforceSetbackSnapping(vertex, setbacks, parcelBounds);
    
    // Should snap to rear setback line (0 + 240 = 240)
    expect(snapped.y).toBe(240);
    expect(snapped.x).toBe(600); // X should remain unchanged
  });

  test('should snap vertex beyond side setback to side line', () => {
    const vertex: Vertex = {
      id: 'test',
      x: 30, // Beyond side setback (5ft = 60 SVG units from left)
      y: 400
    };

    const snapped = enforceSetbackSnapping(vertex, setbacks, parcelBounds);
    
    // Should snap to side setback line (0 + 60 = 60)
    expect(snapped.x).toBe(60);
    expect(snapped.y).toBe(400); // Y should remain unchanged
  });

  test('should snap vertex beyond right side setback to right side line', () => {
    const vertex: Vertex = {
      id: 'test',
      x: 1170, // Beyond right side setback (5ft = 60 SVG units from right)
      y: 400
    };

    const snapped = enforceSetbackSnapping(vertex, setbacks, parcelBounds);
    
    // Should snap to right side setback line (1200 - 60 = 1140)
    expect(snapped.x).toBe(1140);
    expect(snapped.y).toBe(400); // Y should remain unchanged
  });

  test('should not move vertex within setbacks', () => {
    const vertex: Vertex = {
      id: 'test',
      x: 300, // Within side setbacks
      y: 400  // Within front/rear setbacks
    };

    const snapped = enforceSetbackSnapping(vertex, setbacks, parcelBounds);
    
    // Should remain unchanged
    expect(snapped.x).toBe(300);
    expect(snapped.y).toBe(400);
  });

  test('should handle multiple violations and snap to closest constraint', () => {
    const vertex: Vertex = {
      id: 'test',
      x: 30,  // Beyond left side setback
      y: 750  // Beyond front setback
    };

    const snapped = enforceSetbackSnapping(vertex, setbacks, parcelBounds);
    
    // Should snap to both constraints
    expect(snapped.x).toBe(60);  // Side setback
    expect(snapped.y).toBe(560); // Front setback
  });

  test('should preserve vertex ID and other properties', () => {
    const vertex: Vertex = {
      id: 'test-vertex',
      x: 30,
      y: 750,
      // Add other properties if they exist
    };

    const snapped = enforceSetbackSnapping(vertex, setbacks, parcelBounds);
    
    expect(snapped.id).toBe('test-vertex');
    expect(snapped.x).toBe(60);
    expect(snapped.y).toBe(560);
  });
});
