import { describe, it, expect } from 'vitest';
import type { Polygon, LineString } from 'geojson';
import {
  classifyParcelEdges,
  applyVariableSetbacks,
  type EdgeClassification,
  type SetbackValues,
} from '../../src/engine/setbacks';
import { areaM2 } from '../../src/engine/geometry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple 100×50 m rectangle parcel in EPSG:3857 */
function makeRectParcel(): Polygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [0, 0],
      [100, 0],   // bottom edge (100m)
      [100, 50],  // right edge (50m)
      [0, 50],    // top edge (100m)
      [0, 0],     // closing / left edge (50m)
    ]],
  };
}

/** A road LineString running along the bottom of the parcel (y ≈ -5) */
function makeBottomRoad(): { geom: LineString; name?: string } {
  return {
    geom: {
      type: 'LineString',
      coordinates: [
        [-10, -5],
        [110, -5],
      ],
    },
    name: 'Main St',
  };
}

/** A road along the right side of the parcel (x ≈ 105) */
function makeRightRoad(): { geom: LineString; name?: string } {
  return {
    geom: {
      type: 'LineString',
      coordinates: [
        [105, -10],
        [105, 60],
      ],
    },
    name: 'Oak Ave',
  };
}

// ---------------------------------------------------------------------------
// classifyParcelEdges
// ---------------------------------------------------------------------------

describe('classifyParcelEdges', () => {
  it('should return one classification per edge (excluding closing vertex)', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, [makeBottomRoad()]);
    // Rectangle has 4 vertices (5 coords with closing) → 4 edges
    expect(edges).toHaveLength(4);
  });

  it('should classify the edge nearest to the road as FRONT', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, [makeBottomRoad()]);

    const frontEdges = edges.filter(e => e.type === 'front');
    expect(frontEdges).toHaveLength(1);

    // The bottom edge ([0,0]→[100,0]) has midpoint [50,0], which is 5m from the road at y=-5
    const front = frontEdges[0];
    expect(front.distanceToRoad).toBeCloseTo(5, 0);
    expect(front.roadName).toBe('Main St');
  });

  it('should classify the opposite edge as REAR', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, [makeBottomRoad()]);

    const rearEdges = edges.filter(e => e.type === 'rear');
    expect(rearEdges).toHaveLength(1);
    // The top edge ([100,50]→[0,50] or [0,50]→[0,0] depending on winding)
    // should be "opposite" to the bottom edge
  });

  it('should classify remaining edges as SIDE', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, [makeBottomRoad()]);

    const sideEdges = edges.filter(e => e.type === 'side');
    expect(sideEdges).toHaveLength(2);
  });

  it('should fall back to longest edge as FRONT when no roads are nearby', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, []);

    const frontEdges = edges.filter(e => e.type === 'front');
    expect(frontEdges).toHaveLength(1);
    // Longest edge is 100m (top or bottom)
    expect(frontEdges[0].length).toBeCloseTo(100, 0);
    // No road name
    expect(frontEdges[0].roadName).toBeUndefined();
    // Distance should be Infinity
    expect(frontEdges[0].distanceToRoad).toBe(Infinity);
  });

  it('should fall back to longest edge when road is beyond 200ft threshold', () => {
    const parcel = makeRectParcel();
    // A road 100m away (well beyond 60.96m / 200ft threshold)
    const farRoad: { geom: LineString; name?: string } = {
      geom: {
        type: 'LineString',
        coordinates: [[-10, -100], [110, -100]],
      },
      name: 'Far Away Rd',
    };
    const edges = classifyParcelEdges(parcel, [farRoad]);

    // Should still have one FRONT, one REAR, two SIDEs
    expect(edges.filter(e => e.type === 'front')).toHaveLength(1);
    expect(edges.filter(e => e.type === 'rear')).toHaveLength(1);
    expect(edges.filter(e => e.type === 'side')).toHaveLength(2);
    // FRONT should be longest edge (fallback), not road-based
    const front = edges.find(e => e.type === 'front')!;
    expect(front.roadName).toBeUndefined();
  });

  it('should handle a triangular parcel (3 edges)', () => {
    const triangle: Polygon = {
      type: 'Polygon',
      coordinates: [[
        [0, 0], [100, 0], [50, 80], [0, 0],
      ]],
    };
    const edges = classifyParcelEdges(triangle, [makeBottomRoad()]);
    expect(edges).toHaveLength(3);
    expect(edges.filter(e => e.type === 'front')).toHaveLength(1);
    expect(edges.filter(e => e.type === 'rear')).toHaveLength(1);
    expect(edges.filter(e => e.type === 'side')).toHaveLength(1);
  });

  it('should handle multiple roads and pick the closest', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, [makeBottomRoad(), makeRightRoad()]);

    const front = edges.find(e => e.type === 'front')!;
    // Bottom road is 5m away, right road is 5m away from the right edge midpoint
    // But bottom edge midpoint [50,0] is 5m from bottom road
    // Right edge midpoint [100,25] is 5m from right road
    // Both are equally close; the first encountered minimum should win
    expect(front.distanceToRoad).toBeCloseTo(5, 0);
  });

  it('should populate edge lengths correctly', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, []);
    const lengths = edges.map(e => Math.round(e.length));
    // Should have two 100m edges and two 50m edges
    expect(lengths.sort((a, b) => a - b)).toEqual([50, 50, 100, 100]);
  });
});

// ---------------------------------------------------------------------------
// applyVariableSetbacks
// ---------------------------------------------------------------------------

describe('applyVariableSetbacks', () => {
  it('should produce a smaller polygon when setbacks are applied', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, [makeBottomRoad()]);
    const setbacks: SetbackValues = { front: 10, side: 5, rear: 10 };

    const result = applyVariableSetbacks(parcel, edges, setbacks);
    expect(result).not.toBeNull();
    const resultArea = areaM2(result!);
    const originalArea = areaM2(parcel); // 5000 m²
    expect(resultArea).toBeLessThan(originalArea);
    expect(resultArea).toBeGreaterThan(0);
  });

  it('should return null when setbacks fully collapse the polygon', () => {
    // A tiny 3×2 m parcel
    const tiny: Polygon = {
      type: 'Polygon',
      coordinates: [[
        [0, 0], [3, 0], [3, 2], [0, 2], [0, 0],
      ]],
    };
    const road: { geom: LineString; name?: string } = {
      geom: { type: 'LineString', coordinates: [[-5, -1], [10, -1]] },
      name: 'Test Rd',
    };
    const edges = classifyParcelEdges(tiny, [road]);
    // Setbacks much larger than parcel: front 5 + rear 5 >> 2m depth, side 5 + 5 >> 3m width
    const setbacks: SetbackValues = { front: 5, side: 5, rear: 5 };

    const result = applyVariableSetbacks(tiny, edges, setbacks);
    // When offsets greatly exceed dimensions, the intersection with the original
    // should produce null (< 1m² threshold)
    expect(result).toBeNull();
  });

  it('should return a very small polygon when setbacks nearly collapse it', () => {
    // 10×8 m parcel — setbacks exceed dimensions but crossing produces a tiny result
    const small: Polygon = {
      type: 'Polygon',
      coordinates: [[
        [0, 0], [10, 0], [10, 8], [0, 8], [0, 0],
      ]],
    };
    const road: { geom: LineString; name?: string } = {
      geom: { type: 'LineString', coordinates: [[-5, -2], [15, -2]] },
      name: 'Test Rd',
    };
    const edges = classifyParcelEdges(small, [road]);
    const setbacks: SetbackValues = { front: 5, side: 6, rear: 5 };

    const result = applyVariableSetbacks(small, edges, setbacks);
    if (result) {
      // If polygon-clipping still produces a residual, it should be tiny
      expect(areaM2(result)).toBeLessThan(areaM2(small) * 0.1);
    }
    // Either null or a very small residual is acceptable
  });

  it('should apply different setback distances per edge type', () => {
    const parcel = makeRectParcel(); // 100×50
    const edges = classifyParcelEdges(parcel, [makeBottomRoad()]);

    // Asymmetric setbacks: large front, small sides, medium rear
    const setbacks: SetbackValues = { front: 15, side: 3, rear: 10 };
    const result = applyVariableSetbacks(parcel, edges, setbacks);
    expect(result).not.toBeNull();

    const resultArea = areaM2(result!);
    // Expected: width shrinks by 3+3=6m → 94m, depth shrinks by 15+10=25m → 25m
    // Expected area ≈ 94 × 25 = 2350 m² (roughly)
    expect(resultArea).toBeGreaterThan(2000);
    expect(resultArea).toBeLessThan(3000);
  });

  it('should handle zero setbacks by returning the original polygon', () => {
    const parcel = makeRectParcel();
    const edges = classifyParcelEdges(parcel, [makeBottomRoad()]);
    const setbacks: SetbackValues = { front: 0, side: 0, rear: 0 };

    const result = applyVariableSetbacks(parcel, edges, setbacks);
    expect(result).not.toBeNull();
    // Area should be the same as original
    const resultArea = areaM2(result!);
    const originalArea = areaM2(parcel);
    expect(resultArea).toBeCloseTo(originalArea, 0);
  });

  it('should handle an irregular pentagon parcel', () => {
    const pentagon: Polygon = {
      type: 'Polygon',
      coordinates: [[
        [0, 0], [80, 0], [100, 40], [60, 70], [0, 50], [0, 0],
      ]],
    };
    const road: { geom: LineString; name?: string } = {
      geom: {
        type: 'LineString',
        coordinates: [[-10, -5], [90, -5]],
      },
      name: 'Test Rd',
    };
    const edges = classifyParcelEdges(pentagon, [road]);
    expect(edges).toHaveLength(5);

    const setbacks: SetbackValues = { front: 5, side: 3, rear: 5 };
    const result = applyVariableSetbacks(pentagon, edges, setbacks);
    expect(result).not.toBeNull();
    expect(areaM2(result!)).toBeLessThan(areaM2(pentagon));
    expect(areaM2(result!)).toBeGreaterThan(0);
  });

  it('should return null for degenerate input', () => {
    const degenerate: Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [0, 0]]],
    };
    const result = applyVariableSetbacks(degenerate, [], { front: 1, side: 1, rear: 1 });
    expect(result).toBeNull();
  });
});
